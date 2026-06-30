# Feature: Estatísticas

---

## Objetivo

Registrar, armazenar, calcular e exibir estatísticas de rebatedores, arremessadores e defensores — por jogo e por temporada.

---

## Estrutura de Dados

### GameStat — Stat por Jogo

```ts
interface GameStat {
  _id: string
  gameId: string
  playerId: string
  teamId?: string
  type: 'hitter' | 'pitcher'
  hitting: HittingStats
  pitching: PitchingStats
  defense: DefenseStats
}
```

### HittingStats

```ts
interface HittingStats {
  atBats: number
  hits: number
  runs: number
  rbi: number
  homeRuns: number
  doubles: number
  triples: number
  walks: number
  strikeouts: number
  outs: number
  hitByPitch: number
  sacrificeFlies: number
  stolenBases: number
  caughtStealing: number
}
```

### PitchingStats

```ts
interface PitchingStats {
  outsPitched: number      // ← SOURCE OF TRUTH para IP e ERA
  inningsPitched: number   // legado — não usar para cálculos
  earnedRuns: number
  strikeouts: number
  walks: number
  hitsAllowed: number
  pitchCount: number
  strikes: number
  balls: number
  wildPitches: number
  wins: number
  losses: number
  saves: number
  pitchTypes: {
    FB: number; CV: number; SL: number
    CH: number; SI: number; CT: number; other: number
  }
}
```

### DefenseStats

```ts
interface DefenseStats {
  errors: number
  doublePlays: number
  flyOuts: number
  groundOuts: number
  lineOuts: number
}
```

---

## Como Stats São Registradas

**Toda escrita usa `gameStatsApi.upsert(gameId, playerId, payload)`** — nunca por `_id`. Ver [feedback_game_stats_storage.md](../../memory/feedback_game_stats_storage.md).

### Fluxo de Upsert

```js
// gameStatsApi.upsert(gameId, playerId, payload):
const all = lfGet(LS.gameStats)
const idx = all.findIndex(s =>
  s.gameId === gameId &&
  String(s.playerId?._id || s.playerId) === playerId
)
if (idx === -1) {
  // Cria novo registro
  all.push({ _id: uid(), gameId, playerId, ...EMPTY_GAME_STAT, ...payload })
} else {
  // Atualiza existente com merge profundo de campos numéricos
  all[idx] = mergeStats(all[idx], payload)
}
lfSet(LS.gameStats, all)
```

### Merge de Stats

Campos numéricos são **somados**, não substituídos:

```js
// hitting.atBats no patch não sobrescreve — incrementa
// Exceto campos de override explícito (passados como 'set')
```

O `upsertGameStat` em `useGameActions` constrói o patch como delta:

```js
// Exemplo: batter faz single
{
  hitting: {
    atBats: 1,    // += 1
    hits: 1,      // += 1
  }
}
```

---

## Cálculo de IP (Innings Pitched)

**Regra crítica**: IP sempre deriva de `outsPitched`, nunca de `inningsPitched`.

```js
// utils/stats.js
export function formatIpFromOuts(outsPitched) {
  const fullInnings = Math.floor(outsPitched / 3)
  const remainder = outsPitched % 3
  return remainder === 0 ? `${fullInnings}` : `${fullInnings}.${remainder}`
}

// Exemplos:
// outsPitched=9  → "3"    (3 innings completos)
// outsPitched=10 → "3.1"  (3 innings + 1 out)
// outsPitched=11 → "3.2"  (3 innings + 2 outs)
```

**Por que não `inningsPitched`?** Ao somar `1.1 + 0.2` em decimal → `1.3` (errado). O campo `inningsPitched` existe por legado mas **nunca** deve ser usado como source of truth.

---

## Cálculo de ERA

```js
export function formatEraFromOuts(outsPitched, earnedRuns) {
  if (!outsPitched) return '0.00'
  const era = (earnedRuns * 27) / outsPitched   // 27 outs = 9 innings
  return era.toFixed(2)
}
```

---

## Fórmulas Completas

Ver [02-specifications/statistics.md](../02-specifications/statistics.md) para todas as fórmulas.

| Stat | Fórmula |
|------|---------|
| AVG | hits / atBats |
| OBP | (hits + walks + hbp) / (atBats + walks + hbp + sacrificeFlies) |
| SLG | (1B + 2×2B + 3×3B + 4×HR) / atBats |
| OPS | OBP + SLG |
| IP | formatIpFromOuts(outsPitched) |
| ERA | (earnedRuns × 27) / outsPitched |
| WHIP | (walks + hitsAllowed) / (outsPitched / 3) |
| K/9 | (strikeouts × 27) / outsPitched |

---

## Stats de Temporada (Agregação)

`seasonStatsApi.list()` agrega **localmente** todos os GameStat da temporada por jogador:

```js
// Para cada jogador:
const allStats = gameStats.filter(s => String(s.playerId?._id || s.playerId) === playerId)
const season = allStats.reduce((acc, s) => ({
  hitting: {
    atBats: acc.hitting.atBats + s.hitting.atBats,
    hits: acc.hitting.hits + s.hitting.hits,
    // ...todos os campos
  },
  pitching: {
    outsPitched: acc.pitching.outsPitched + s.pitching.outsPitched,
    earnedRuns: acc.pitching.earnedRuns + s.pitching.earnedRuns,
    // ...
  }
}), EMPTY_GAME_STAT)
```

---

## Exibição em StatsPage

### Colunas de Rebatedores (HITTER_COLS)

20 colunas configuradas em `constants/statColumns.js`:

`PA`, `AB`, `H`, `R`, `RBI`, `HR`, `2B`, `3B`, `BB`, `K`, `HBP`, `SAC`, `SB`, `CS`, `AVG`, `OBP`, `SLG`, `OPS`, `OUTS`

### Colunas de Defensores (DEFENSE_COLS)

5 colunas: `E`, `DP`, `FO`, `GO`, `LO`

### Tabs de Stats

- **Hitters**: Stats de rebatidas por jogador.
- **Pitchers**: Stats de arremesso por arremessador (`type === 'pitcher'`).
- **Defesa**: Stats defensivas (erros, double plays, etc.).

---

## Edição Manual de Stats

Em `GameDetailPage`, o treinador pode editar manualmente:

- `wins`, `losses`, `saves` de um pitcher.
- `pitchCount` total.

Isso é necessário para registrar resultado (W/L/S) que não é automaticamente detectado pelo app.

---

## Earned vs Unearned Runs

| Evento | Run? | Earned? |
|--------|------|---------|
| Wild Pitch com corredor em 3ª | Sim | Sim → `earnedRuns++` |
| Erro com corredor em 3ª | Sim | Não → `earnedRuns` inalterado |
| Hit permitido com corredor marcando | Sim | Sim → `earnedRuns++` |
| Walk com bases cheias | Sim | Sim → `earnedRuns++` |
