# Resumo de Pontuação e Estatísticas

Como pontos são marcados, como estatísticas são atualizadas e quais fórmulas são usadas.

---

## Quando Pontos São Marcados

| Evento | Quem Marca | Código |
|--------|-----------|--------|
| Hit (single/double/triple) | Corredores empurrados para além da 3ª | `applyHitToBases` → `runs` |
| Home Run | Bater + todos os corredores em base | `applyHitToBases(runners, 'homerun')` |
| Walk com bases cheias | Corredor de 3ª é forçado para casa | `forceAdvanceToFirst` → `runs` |
| HBP com bases cheias | Corredor de 3ª é forçado para casa | `forceAdvanceToFirst` → `runs` |
| Stolen Base da 3ª | Corredor avança de 3ª para home | `advanceRunner('third')` |
| Sac Fly | Corredor da 3ª marca | `applySacFly` → `runScored = 1` |
| Wild Pitch | Corredor(es) avançam, podem marcar | `applyRunnerAdvance` → `runs` |
| Erro defensivo | Corredor(es) avançam | `applyRunnerAdvance` → `runs` |

### Atribuição de Placar

```js
// Nosso time
homeScore += runs   // quando isAttacking = true

// Adversário
awayScore += runs   // quando isAttacking = false
```

---

## Estatísticas de Rebatida (Hitting)

### Campos Armazenados

| Campo | Tipo | Quando Incrementa |
|-------|------|-------------------|
| `atBats` | int | Em qualquer resultado de at-bat (single, double, triple, HR, strikeout, out, error). **Não** inclui BB, HBP, SF. |
| `hits` | int | Single, double, triple, home run. |
| `doubles` | int | Double apenas. |
| `triples` | int | Triple apenas. |
| `homeRuns` | int | Home run apenas. |
| `strikeouts` | int | Strikeout por count (3 strikes). |
| `outs` | int | Strikeout + ground out + fly out + line out. |
| `walks` | int | Walk (4 balls). |
| `runs` | int | Quando o próprio jogador marca um ponto. |
| `rbi` | int | Runs impulsionados: runs scored pela jogada do bater (incluindo HR e SF). |
| `stolenBases` | int | Stolen base confirmada via `advanceRunner`. |
| `hitByPitch` | int | HBP (hit by pitch). |
| `sacrificeFlies` | int | Sac fly. |
| `caughtStealing` | int | Registrado manualmente no GameDetailPage. |

### Fórmulas Derivadas

| Stat | Fórmula | Função |
|------|---------|--------|
| AVG | H / AB | `avgFromEntry(entry)` |
| OBP | (H + BB + HBP) / (AB + BB + HBP + SF) | `obpFromHitting(hitting)` |
| SLG | (H + 2B + 2×3B + 3×HR) / AB | `slgFromHitting(hitting)` |
| OPS | OBP + SLG | `opsFromHitting(hitting)` |
| K% | SO / PA × 100 (%) | `kPctFromHitting(hitting)` |
| BB% | BB / PA × 100 (%) | `bbPctFromHitting(hitting)` |
| PA | AB + BB + HBP + SF | (calculado internamente) |

> Nota de SLG: `H + 2B + 2×3B + 3×HR`. Singles contam 1x (já incluídos em H). Doubles somam 1x extra, triples 2x extra, HRs 3x extra.

---

## Estatísticas de Arremesso (Pitching)

### Campos Armazenados

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `outsPitched` | int | **Source of truth** para IP/ERA. Incrementado a cada out obtido. |
| `inningsPitched` | float | Valor de exibição: `floor(outs/3) + (outs%3)/10`. Ex: 7 → 2.1 |
| `earnedRuns` | int | Pontos "ganhos" (sem erros na jogada). |
| `strikeouts` | int | Strikeouts como arremessador. |
| `walks` | int | Walks concedidos. |
| `strikes` | int | Strikes arremessados (contagem acumulada). |
| `balls` | int | Balls arremessados. |
| `pitchCount` | int | Total de arremessos. |
| `hitsAllowed` | int | Hits concedidos ao adversário. |
| `wildPitches` | int | Wild pitches. |
| `wins` | int | Vitórias (atribuídas manualmente no GameDetailPage). |
| `losses` | int | Derrotas (atribuídas manualmente). |
| `saves` | int | Saves (atribuídos manualmente). |
| `pitchTypes` | object | Contagem por tipo: `{FB, CV, SL, CH, SI, CT, other}`. |

### Fórmulas Derivadas

| Stat | Fórmula | Função |
|------|---------|--------|
| ERA | (ER × 27) / outsPitched | `formatEraFromOuts(outsPitched, er)` |
| IP (display) | `floor(outs/3)`.`outs%3` | `formatIpFromOuts(outsPitched)` |
| WHIP | (BB + H) / (outsPitched / 3) | `whipFromPitching(pitching)` |
| K/9 | (SO × 9) / (outsPitched / 3) | `k9FromPitching(pitching)` |

> **Regra crítica**: Nunca somar `inningsPitched` entre arremessadores. Somar sempre `outsPitched` e calcular IP ao final. Exemplo: 1.2 + 2.2 = 3.4 (errado), mas 5 + 8 outs = 13 outs = 4.1 IP (correto).

### Fontes de Escrita de Pitching

| Evento | Função | Campos Afetados |
|--------|--------|-----------------|
| Strike arremessado | `syncPitchToPitcher` (App.jsx) | `strikes`, `pitchCount`, `pitchTypes[tipo]` |
| Ball arremessado | `syncPitchToPitcher` | `balls`, `pitchCount` |
| Foul | `syncPitchToPitcher` | `strikes` (se <2), `pitchCount` |
| Strikeout (por count) | `syncPitchToPitcher` | `strikeouts`, `outsPitched`, `inningsPitched` |
| Walk (por count) | `syncPitchToPitcher` | `walks`, `earnedRuns` (se run scored) |
| Out defensivo | `syncDefensivePitcherEvent` | `outsPitched`, `inningsPitched`, `pitchCount` |
| Hit concedido | `syncDefensivePitcherEvent` | `hitsAllowed`, `earnedRuns`, `pitchCount` |
| Walk direto | `syncDefensivePitcherEvent` | `walks`, `earnedRuns`, `pitchCount` |
| Wild Pitch | `syncDefensivePitcherEvent` | `wildPitches`, `earnedRuns`, `pitchCount` |
| HBP | `syncDefensivePitcherEvent` | `pitchCount` |
| Erro defensivo | `syncDefensivePitcherEvent` | `pitchCount` (sem earnedRuns!) |

---

## Estatísticas Defensivas (Defense)

| Campo | Quando Incrementa |
|-------|------------------|
| `errors` | Evento de erro defensivo com defensor identificado. |
| `doublePlays` | Double play com defensor(es) listados. |
| `flyOuts` | Out do tipo `flyout` com defensor identificado. |
| `groundOuts` | Out do tipo `groundout` com defensor identificado. |
| `lineOuts` | Out do tipo `lineout` com defensor identificado. |

---

## Agregação de Temporada (Season Stats)

`seasonStatsApi.list(playerId?)` soma todos os `GameStat` de todos os jogos da temporada:

```js
// Para cada stat de jogo:
agg.hitting.atBats += safeN(h.atBats)
agg.hitting.hits   += safeN(h.hits)
// etc.

// Para pitching: sempre somar outsPitched, não inningsPitched
agg.pitching.outsPitched += safeN(p.outsPitched)

// Após somar tudo:
const outs = agg.pitching.outsPitched
agg.pitching.inningsPitched = floor(outs/3) + (outs%3)/10
const ipDecimal = floor(outs/3) + (outs%3)/3
agg.era = ipDecimal ? (agg.pitching.earnedRuns / ipDecimal) * 9 : 0
```

---

## RBI — Regras Detalhadas

| Situação | RBI Creditados |
|----------|---------------|
| Single com corredor em 3ª (corre) | 1 RBI |
| Home Run solo | 1 RBI (o próprio bater) |
| Home Run com 2 on base | 3 RBI |
| Grand Slam (bases cheias) | 4 RBI |
| Sac Fly com corredor em 3ª | 1 RBI |
| Walk com bases cheias (run forced) | 1 RBI |
| Erro (corredor marca) | 0 RBI (não creditado) |

No código: `rbiCredit = runsOnHit` calculado pelo `applyHitToBases` antes da atualização de estado.
