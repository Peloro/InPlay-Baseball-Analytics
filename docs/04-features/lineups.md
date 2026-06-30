# Feature: Lineups e Escalação

---

## Objetivo

Configurar quais jogadores estão em campo, suas posições defensivas, e a ordem de rebatidas (batting order) antes e durante uma partida.

---

## Estrutura de Dados

```ts
// Dentro do GameState:
{
  lineup: Array<{ playerId: string; position: string }>
  onFieldPlayerIds: string[]    // subset de lineup.map(l => l.playerId)
  battingOrder: string[]        // ordem de rebatidas (pode diferir do lineup)
  bench: string[]               // jogadores disponíveis mas não em campo
  currentBatterIndex: number    // índice atual em battingOrder
  currentPitcherId: string|null // arremessador atual
}
```

---

## Configuração Inicial (PreGameSetupModal)

Antes de iniciar um jogo, o treinador configura:

1. **Lineup defensivo**: Quais jogadores jogam qual posição.
2. **Batting order**: Ordem que nosso time bate (pode ser diferente do lineup defensivo).
3. **Bench**: Jogadores no banco (reservas).

O `PreGameSetupModal` faz drag-and-drop dos jogadores nas posições.

---

## Posições Defensivas

As posições são definidas em `constants/fieldGame.js`:

```js
export const DEFENSIVE_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
// DH não tem posição defensiva — ocupa apenas o batting order
```

### Regra de Posição Única

Cada posição defensiva pode ser ocupada por apenas 1 jogador. Se dois jogadores têm a mesma posição (bug de consistência), o sistema resolve automaticamente via `useEffect` no FieldPage:

```js
// Percorre onFieldPlayerIds de trás para frente
// Mantém apenas a ocorrência mais recente de cada posição
// DH é excluído dessa verificação (não tem posição defensiva)
```

---

## Batting Order (Ordem de Rebatidas)

- Array de `playerId` indicando quem bate em qual posição.
- `currentBatterIndex` aponta para o bater atual.
- Ao terminar um at-bat (out, hit, walk, etc.): `currentBatterIndex = (currentBatterIndex + 1) % battingOrder.length`.

### Proteção de Out-of-Bounds

```js
currentBatterIndex = battingOrder.length
  ? Math.min(current.currentBatterIndex || 0, battingOrder.length - 1)
  : 0
```

Aplicada ao deletar jogadores, ao carregar do localStorage, e ao ajustar batting order durante o jogo.

---

## Campo Visual e Banco

### Campo (`Field.jsx`)

- Renderiza `fieldPlayers` (jogadores em `onFieldPlayerIds`) como marcadores posicionados por `(player.x, player.y)`.
- Em modo defensivo: não exibe DHs.
- Drag de campo para banco: inicia substituição.
- Drag de campo para campo: troca posições entre jogadores.

### Banco (`Bench.jsx`)

- Lista `benchPlayers` (jogadores fora de `onFieldPlayerIds`).
- Drag de banco para campo: substitui jogador ou preenche posição vaga.
- Filtro de busca por nome/número.

---

## Detecção de Arremessador Atual

`currentPitcherId` é automaticamente definido ao entrar em modo defensivo:

```js
// useEffect em App.jsx:
if (!gameState.currentPitcherId && !gameState.isAttacking) {
  const pitcher = fieldPlayers.find(p =>
    getMainPosition(p) === 'P' || p.positions?.includes('P')
  )
  if (pitcher) {
    setGameState(prev => ({ ...prev, currentPitcherId: getPlayerId(pitcher) }))
  }
}
```

Se nenhum pitcher for encontrado no campo, `currentPitcherId` permanece `null` e ações defensivas são bloqueadas.

---

## Jogador DH

O Designated Hitter (`'DH'`) tem características especiais:

- **Sem posição defensiva**: Não aparece nos marcadores do campo.
- **Pode bater**: Aparece no batting order normalmente.
- **Exclusão do conflito de posição**: A verificação de posição única ignora DHs.

```js
// Em FieldPage, para computar defensivePlayers:
const dhIds = new Set(
  gameState.lineup
    .filter(item => item.position === 'DH')
    .map(item => item.playerId)
)
const defensivePlayers = fieldPlayers.filter(p => !dhIds.has(getPlayerId(p)))
```

---

## Lineup do Adversário (Tracking)

O app rastreia os rebatedores adversários automaticamente:

```js
// gameState.opposingBatters: { [playerKey]: { label, ab, hits, k, bb } }
// gameState.currentOppBatterIdx: índice atual no lineup adversário (simulado)
// gameState.oppBatterAb: at-bat atual do rebatedor adversário
```

- `advanceOpponentLineup(current)` — avança para o próximo "rebatedor" adversário.
- `updateOppBatter(current, result)` — atualiza stats do rebatedor adversário atual.
- O label do adversário é gerado como `"ADV #1"`, `"ADV #2"`, etc.

Isso não rastreia jogadores reais do adversário — é apenas para manter o contexto de "quem está rebatendo agora" no display.

---

## Edição de Lineup Durante o Jogo

O lineup pode ser modificado durante o jogo via drag-and-drop no campo. Isso aciona `handlePitcherSelect` se um pitcher for substituído, ou substitui um fielder se outro jogador entrar.

Toda substituição é registrada em `gameState.substitutions`:

```js
{
  inId: 'player_in_id',
  outId: 'player_out_id',
  inning: 3,
  inningHalf: 'bottom',
  timestamp: '2026-07-01T20:30:00Z',
}
```
