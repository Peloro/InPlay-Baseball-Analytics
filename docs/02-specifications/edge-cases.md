# Casos Especiais e Comportamentos de Borda

Situações não-óbvias que foram identificadas e tratadas no código.

---

## 1. Foul Ball com 2 Strikes

**Regra**: Foul nunca causa strikeout.

**Implementação**:
```js
const nextStrikesRaw = kind === 'foul'
  ? Math.min(2, beforeStrikes + 1)  // ← nunca ultrapassa 2
  : kind === 'strike' ? beforeStrikes + 1 : beforeStrikes

const didStrikeout = nextStrikesRaw >= 3  // ← sempre false para foul
```

**Consequência**: Um at-bat pode ter infinitos fouls sem terminar.

---

## 2. Walk com Bases Cheias (Grand Slam Walk)

**Situação**: `first=true, second=true, third=true` + walk.

**Implementação** (`advanceOnWalk` / `forceAdvanceToFirst`):
```js
if (next.second && next.third) {
  runs += 1  ← corredor de 3ª é forçado para casa
}
next.third = next.second
next.second = next.first
next.first = true
```

**Resultado**: 1 earned run para o pitcher, 1 RBI para o rebatedor.

---

## 3. Double Play com 3 Outs (Side Switch Imediato)

**Situação**: `outs = 1`, double play → `outs = 3`.

**Implementação**:
```js
const { nextOuts, sideSwitch } = computeInningTransition(current, 2)
// nextOuts = min(1+2, 3) = 3 → sideSwitch = true
```

**Resultado**: Side switch ocorre mesmo que o segundo out do DP tivesse causado fim de inning. O runner que teria sido o terceiro out também é tratado.

---

## 4. Wild Pitch com Corredor na 3ª

**Regra**: Runs em wild pitch são earned runs (diferente de erros).

```js
// applyWildPitch
const preRunsScored = applyRunnerAdvance(preRunners, 1).runs
// ...
syncDefensivePitcherEvent({ pitchCountDelta: 1, earnedRunsDelta: preRunsScored, wildPitchesDelta: 1 })
```

**Contraste com erro**: `applyErrorEvent` não passa `earnedRunsDelta` ao pitcher.

---

## 5. Erro com Corredor em 3ª

**Situação**: Corredor marca via `applyRunnerAdvance(runners, 1)` durante um erro.

**Regra**: Esse run é **unearned** — não incrementa `earnedRuns` do pitcher.

```js
// Em applyErrorEvent (defesa):
await syncDefensivePitcherEvent({ pitchCountDelta: 1 })  // sem earnedRunsDelta
```

---

## 6. Substituição do Arremessador

**Cenário**: Pitcher sai, novo pitcher entra.

**Comportamento**:
- Se o arremessador saindo era `currentPitcherId`: `currentPitcherId` é atualizado.
- Se o entrante tem 'P' em `positions`: vira o novo `currentPitcherId`.
- Se o entrante não é pitcher: `currentPitcherId = null`.
- `pitchCounts[newPitcherId]` é inicializado com 0 se não existia.

```js
let nextCurrentPitcherId = current.currentPitcherId
if (replacedId && replacedId === current.currentPitcherId) {
  const inPositions = Array.isArray(incomingPlayer?.positions) ? incomingPlayer.positions : []
  nextCurrentPitcherId = inPositions.includes('P') ? drag.playerId : null
}
```

---

## 7. Conflito de Posição na Escalação

**Situação**: Dois jogadores têm a mesma posição no `lineup` (bug de consistência).

**Resolução automática** (FieldPage, useEffect):
```
Percorre onFieldPlayerIds de trás para frente:
  Mantém apenas o primeiro ocorrente de cada posição
  (mais recente prevalece — menor índice no array invertido)
  DH não entra no conflito (sem posição defensiva)
```

---

## 8. Sync de ID após Criação Offline

**Situação**: Jogo criado offline com ID local `"abc123-xyz"`. Ao sincronizar, servidor retorna `_id: "64abc..."` (ObjectId).

**Problema**: React state e gameStats ainda referenciam o ID local.

**Solução** (`replaceIdInStores`):
```
players: substitui registro + atualiza playerId em gameStats
games: substitui registro + atualiza gameId em gameStats
gameStats: substitui registro
```

**Por isso**: `gameStatsApi.upsert` usa `(gameId, playerId)` como chave — nunca `_id`.

---

## 9. Estado Stale Após Logout

**Situação**: Usuário do time A faz logout; time B faz login no mesmo dispositivo.

**Comportamento**:
1. `logout()` remove todas as chaves `baseball_lf_{teamId}_*` do time A.
2. `localStorage.removeItem(AUTH_KEY)` remove autenticação.
3. `handleLogout` reseta `gameState` para `INITIAL_GAME_STATE`.
4. Dados do time B são carregados via `syncWithServer()` ao fazer login.

**Isolamento**: As chaves são prefixadas com `teamId`, então dados de times diferentes coexistem sem conflito (mas o logout limpa tudo do time anterior).

---

## 10. Undo com Stats Criadas Após Snapshot

**Situação**: Undo volta ao snapshot, mas uma stat foi criada para um novo jogador depois do snapshot.

**Solução**:
```js
// Após restaurar o snapshot:
for (const currentEntry of currentStats) {
  if (!snapshotMap[currentEntry.playerId]) {
    gameStatsApi.upsert(gameId, currentEntry.playerId, {
      type: currentEntry.type,
      ...EMPTY_GAME_STAT,  // zera a stat "nova"
    })
  }
}
```

---

## 11. currentBatterIndex Out-of-Bounds

**Situação**: Um jogador é removido do battingOrder, encolhendo o array.

**Proteção em múltiplos lugares**:
```js
const currentBatterIndex = battingOrder.length
  ? Math.min(current.currentBatterIndex || 0, battingOrder.length - 1)
  : 0
```

Aplicado em: `loadPlayers`, `handleDeletePlayer`, `getSavedGameState`.

---

## 12. Pitch Count Sincronizado vs Assíncrono

**Situação**: HUD mostra "PC: 34" mas o stat stored diz 33 (async).

**Design intencional**:
- `gameState.pitchCounts[pitcherId]` é atualizado sincronicamente (React state) → exibição imediata.
- `livePitching.pitchCount` (via `useGameState`) é assíncrono (lê localStorage após I/O).
- Esses dois campos podem divergir brevemente mas convergem após o próximo `statsRefreshKey` increment.

---

## 13. Jogador DH em Campo Defensivo

**Regra**: DH não ocupa posição defensiva.

**Implementação** (`defensivePlayers` em FieldPage):
```js
const dhIds = new Set(
  (gameState.lineup || [])
    .filter(item => item.position === 'DH')
    .map(item => item.playerId)
)
return fieldPlayers.filter(p => !dhIds.has(getPlayerId(p)))
```

DHs não aparecem nos marcadores do campo quando em modo defensivo.

---

## 14. Jogo sem `maxInnings` (Ilimitado)

**Comportamento**: Quando `maxInnings = 0`, nenhuma verificação de fim automático é feita.

```js
const maxInn = Number(gameState.maxInnings) || 0
if (!maxInn || !gameState.currentGameId || !gameState.preGameConfigured) return
```

---

## 15. QuotaExceededError no localStorage

**Situação**: localStorage cheio — `setItem` lança exceção.

**Tratamento**:
```js
try {
  window.localStorage.setItem(GAME_STATE_STORAGE_KEY, JSON.stringify(gameState))
} catch {
  // QuotaExceededError — state remains in memory; localStorage full
}
```

O estado continua em memória e funciona até o app ser fechado. Não há aviso ao usuário atualmente.

---

## 16. App Abre sem Jogo Ativo

**Comportamento de `getSavedGameState()`**:
```js
if (!parsed?.currentGameId) return INITIAL_GAME_STATE
```

Se não há jogo ativo salvo, o estado é resetado completamente. Evita "lixo" de estado de jogos anteriores.

---

## 17. Ping de Status do Time (Detecção de Bloqueio)

**Situação**: Admin bloqueia um time enquanto o usuário está usando o app.

**Mecanismo**: Polling a cada 30 segundos:
```js
const id = window.setInterval(() => {
  if (navigator.onLine) checkStatus().catch(() => {})
}, 30_000)
```

`checkStatus()` faz GET `/auth/ping`. Se retornar 403 com "bloqueada", o interceptor do axios dispara `baseball:logout` event, que força logout imediato.

---

## 18. Corredor Identificado vs Genérico

**Situação**: `runners.first = true` (genérico) vs `runners.first = "player_id"` (identificado).

**Impacto**:
- Stolen base credita `stolenBases` apenas se o corredor tem playerId identificável.
- Home run scores incluem todos os runners independentemente (boolean ou string são truthy).
- Avanço via `advanceRunner(base)` só credita SB se `typeof gameState.runners[base] === 'string'`.

---

## 19. Troca de Pitcher Adversário (Reset de PC)

**Situação**: Adversário troca pitcher; queremos resetar o opponentPitchCount.

**Implementação**: Botão "Trocar Pitcher Adv." com confirmação:
```js
onUpdateGameState((current) => ({
  ...current,
  opponentPitchCount: 0,
  gameLog: [...(current.gameLog || []), makeLogEntry(current, 'pitcher-change', `Pitcher Adv: ${label} entrou`)],
}))
```

Não há tracking de stats do pitcher adversário (apenas pitch count global).

---

## 20. Banco Vazando para o Campo (Field < 9 players)

**Situação**: Banco → Campo com menos de 9 em campo + sem jogador a substituir.

```js
if (currentOnField.length < 9) {
  executeSubstitution(player, null, currentOnField)  // null = sem substituído
}
```

O jogador entra no campo sem substituir ninguém, mas sem garantir posição única (pode haver conflito → regra #7 resolve na próxima render).
