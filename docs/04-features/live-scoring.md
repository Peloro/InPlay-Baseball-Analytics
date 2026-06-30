# Feature: Pontuação ao Vivo

A funcionalidade central do InPlay — registrar o progresso de uma partida em tempo real.

---

## Modos de Jogo

| `isAttacking` | Quem bate | Modo |
|--------------|-----------|------|
| `true` | Nosso time | Ataque (Bottom) |
| `false` | Adversário bate | Defesa (Top) |

O `inningHalf` determina:
- `'top'`: adversário bate (nosso time defende)
- `'bottom'`: nosso time bate (estamos atacando)

---

## Modo Ataque — Nosso Time Bate

### Ações Disponíveis

| Ação | Função | Efeito Principal |
|------|--------|-----------------|
| Strike | `applyAttackCountAction('strike')` | strikes++ |
| Ball | `applyAttackCountAction('ball')` | balls++ |
| Foul | `applyAttackCountAction('foul')` | strikes++ (máx 2) |
| Single | `applyPlateAppearance('single')` | Corredor em 1ª, at-bat++ |
| Double | `applyPlateAppearance('double')` | Corredor em 2ª |
| Triple | `applyPlateAppearance('triple')` | Corredor em 3ª |
| Home Run | `applyPlateAppearance('homerun')` | Todos marcam, homeRuns++ |
| Strikeout | `applyPlateAppearance('strikeout')` | outs++, strikeouts++ |
| Out (bola em jogo) | `applyPlateAppearance('out')` | outs++, outs++ |
| Walk | `applyDefensiveWalk()` | Batter avança para 1ª (força avanço) |
| HBP | `applyHBP()` | Igual a walk + hitByPitch++ |
| Sac Fly | `applySacFly()` | Corredor de 3ª marca, outs++, sacFly++ |

### Contagem

```
balls: 0→3 (4 balls = walk)
strikes: 0→2 (3 strikes = strikeout, exceto foul com 2 strikes)
outs: 0→2 (3 outs = side switch)
```

### Avanço de Corredores

Toda hit segue `applyHitToBases(runners, hitType, batterId)`:

```js
// Single: batter em 1ª, corredores avançam 1 base
// Double: batter em 2ª, corredores avançam 2 bases
// Triple: batter em 3ª, corredores avançam 3 bases
// HR: todos marcam, bases vazias

// Runners que passam pela home → runs++, homeScore++
```

---

## Modo Defesa — Adversário Bate

### Ações Disponíveis

| Ação | Função | Efeito Principal |
|------|--------|-----------------|
| Strike | `handleDefensivePitch('strike')` | pitchCount++, strikes++ |
| Ball | `handleDefensivePitch('ball')` | pitchCount++, balls++ |
| Foul | `handleDefensivePitch('foul')` | pitchCount++, strikes++ (máx 2) |
| Out (qualquer) | `applyDefensiveOutEvent('out', fielderId)` | outs++, outsPitched++ |
| Strikeout | `applyDefensiveOutEvent('strikeout', fielderId)` | strikeouts++, outsPitched++ |
| Fly out | `applyDefensiveOutEvent('flyout', fielderId)` | flyOuts++, outsPitched++ |
| Ground out | `applyDefensiveOutEvent('groundout', fielderId)` | groundOuts++, outsPitched++ |
| Line out | `applyDefensiveOutEvent('lineout', fielderId)` | lineOuts++, outsPitched++ |
| Double Play | `applyDoublePlayWithRunner(runnerBase, defenderIds[])` | 2× outs, 2× outsPitched |
| Hit permitido | `applyDefensiveHit('single'/'double'/'triple'/'homerun')` | hitsAllowed++, runs adversário |
| Walk dado | `applyDefensiveWalk()` | walks++, corredor adversário avança |
| Wild Pitch | `applyWildPitch()` | wildPitches++, earned run |
| Error | `applyErrorEvent(defenderId)` | errors++, unearned run |
| HBP (dado) | `applyHBP()` | hitByPitch (adversário) avança |

### HUD do Arremessador

Exibido durante defesa:

```
[Nome] #23  |  PC: 45  |  IP: 3.1  |  ERA: 2.25
```

- **PC** = `pitchCounts[currentPitcherId]` (de `gameState` — síncrono).
- **IP** = `formatIpFromOuts(outsPitched)` (de `livePitching` — assíncrono, via `useGameState`).
- **ERA** = `formatEraFromOuts(outsPitched, earnedRuns)` (de `livePitching`).

---

## Side Switch (Troca de Meia Entrada)

Ocorre quando `outs >= 3`:

```js
// computeInningTransition(current, outsDelta)
const { nextOuts, sideSwitch, nextHalf, nextInning } = computeInningTransition(current, 1)

if (sideSwitch) {
  // Limpa bases + contagem
  // Troca inningHalf: 'top' ↔ 'bottom'
  // Se era 'bottom': inning++
  // Reseta isAttacking = !isAttacking
}
```

### Banner de Troca

FieldPage detecta mudança de `isAttacking` e exibe um banner animado:

```
⚾ DEFENDENDO  (se isAttacking passou de true → false)
⚾ ATACANDO    (se isAttacking passou de false → true)
```

---

## Box Score

`gameState.inningScores` armazena runs por inning:

```js
// Estrutura:
inningScores: {
  "1": { home: 2, away: 0 },
  "2": { home: 0, away: 1 },
  ...
}

// Atualizado via addInningRuns():
function addInningRuns(inningScores, inning, ourRuns, theirRuns)
```

O Box Score é exibido na sub-view Ações e no `GameDetailPage`.

---

## Gamestate Atualizado por Ação

### Exemplo: Single com corredor em 2ª

```
Antes: runners = { first:false, second:'pid123', third:false }, homeScore: 2
Ação: applyPlateAppearance('single')

1. captureUndoSnapshot()
2. applyHitToBases(runners, 'single', batterId)
   → runners.third = 'pid123'   (avançou de 2ª para 3ª)
   → runners.first = batterId
   → runners.second = false
   → runs = 0
3. upsertGameStat(batterId, { hitting: { hits:+1, atBats:+1 } })
4. nextBatterIndex++
5. balls=0, strikes=0
6. makeLogEntry('single', 'João bateu single')

Depois: runners = { first:'batter', second:false, third:'pid123' }, homeScore: 2
```

---

## Log de Jogo

`gameState.gameLog` é um array de entradas:

```js
{
  type: 'single' | 'strikeout' | 'out' | 'homerun' | 'walk' | 'error' | 'wild-pitch' | ...,
  description: 'João bateu single. Corredor avançou.',
  inning: 3,
  inningHalf: 'bottom',
  timestamp: '2026-07-01T20:15:30Z',
}
```

Exibido na aba de detalhes do jogo como play-by-play.

---

## Validações em Tempo Real

- **Sem pitcher selecionado**: bloqueia qualquer ação de defesa.
- **Menos de 9 em campo**: bloqueia pitches defensivos.
- **Sac fly sem runner em 3ª**: bloqueado.
- **Double play sem runners**: bloqueado.
- **Wild pitch em modo ataque**: retorna sem efeito.

Veja [02-specifications/validations.md](../02-specifications/validations.md) para a lista completa.
