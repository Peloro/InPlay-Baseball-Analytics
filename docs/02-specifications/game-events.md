# Eventos do Jogo

Todos os eventos que podem ser registrados durante uma partida no InPlay, com efeitos completos sobre o estado e as estatísticas.

---

## Visão Geral

Os eventos se dividem em dois modos:

| Modo | `isAttacking` | Quem bate |
|------|---------------|-----------|
| **Ataque** | `true` | Nosso time |
| **Defesa** | `false` | Adversário |

---

## Eventos de Ataque (Nosso time bate)

### `applyPlateAppearance(kind)` — Resultado de At-Bat

Handles: `single`, `double`, `triple`, `homerun`, `strikeout`, `out`

#### Parâmetros
| Param | Tipo | Descrição |
|-------|------|-----------|
| `kind` | string | Tipo do resultado |

#### Efeitos no GameState

| Campo | Mudança |
|-------|---------|
| `opponentPitchCount` | +1 |
| `balls` | Reset para 0 |
| `strikes` | Reset para 0 |
| `currentBatterIndex` | Avança para próximo |
| `runners` | Atualizado pelo `applyHitToBases` ou mantido (out/strikeout) |
| `homeScore` | +runs se isAttacking |
| `inningScores` | +runs no inning atual |
| `outs` | +1 se out/strikeout (side switch se outs >= 3) |
| `isAttacking` | Vira `false` se side switch |
| `inningHalf` | Alterna se side switch |
| `inning` | +1 se side switch e era bottom |
| `gameLog` | Nova entrada `hit-{kind}` ou `out` |

#### Efeitos nas Estatísticas (rebatedor atual)
| Stat | Mudança |
|------|---------|
| `atBats` | +1 (todos os tipos) |
| `hits` | +1 se single/double/triple/homerun |
| `doubles` | +1 se double |
| `triples` | +1 se triple |
| `homeRuns` | +1 se homerun |
| `strikeouts` | +1 se strikeout |
| `outs` | +1 se strikeout ou out |
| `rbi` | +runs scored pela jogada |
| `runs` | +1 se homerun (bater marca) |

---

### `applyAttackCountAction(kind)` — Count no Ataque

Handles: `strike`, `ball`, `foul`

Gerencia a contagem quando **nosso time está rebatendo** e registramos arremessos do adversário.

#### Comportamento
- **strike**: `strikes += 1`. Se `strikes >= 3`: strikeout.
- **foul**: `strikes = min(2, strikes + 1)`.
- **ball**: `balls += 1`. Se `balls >= 4`: walk (forçar avanço para 1ª).

#### Efeitos no GameState (ao completar at-bat)
| Campo | Mudança |
|-------|---------|
| `opponentPitchCount` | +1 |
| `strikes` | Atualizado ou reset |
| `balls` | Atualizado ou reset |
| `currentBatterIndex` | Avança se strikeout/walk |
| `runners` | Atualizado por `forceAdvanceToFirst` se walk |
| `homeScore` | + forced runs se walk com bases cheias |
| `outs` | +1 se strikeout |
| `gameLog` | Entrada `out` (K) ou `walk` (BB) |

#### Efeitos nas Estatísticas (rebatedor)
- Strikeout: `atBats+1`, `strikeouts+1`, `outs+1`
- Walk: `walks+1`, `rbi+forced_runs`

---

### `applySacFly()` — Sacrifice Fly (Ataque)

Pré-condição: `runners.third` deve ser truthy.

#### Efeitos no GameState
| Campo | Mudança |
|-------|---------|
| `opponentPitchCount` | +1 |
| `outs` | +1 (side switch se outs >= 3) |
| `runners.third` | `false` |
| `homeScore` | +1 |
| `currentBatterIndex` | Avança |
| `gameLog` | `sac-fly` |

#### Efeitos nas Estatísticas (rebatedor)
| Stat | Mudança |
|------|---------|
| `sacrificeFlies` | +1 |
| `rbi` | +1 |
| **atBats** | **Não muda** (SF não conta como AB) |

---

### `applyHBP()` — Hit By Pitch (Ataque)

#### Efeitos no GameState
| Campo | Mudança |
|-------|---------|
| `opponentPitchCount` | +1 |
| `balls` | Reset 0 |
| `strikes` | Reset 0 |
| `currentBatterIndex` | Avança |
| `runners` | `forceAdvanceToFirst` |
| `homeScore` | +forced runs |
| `gameLog` | `hbp` |

#### Efeitos nas Estatísticas (rebatedor)
| Stat | Mudança |
|------|---------|
| `hitByPitch` | +1 |

---

### `applyErrorEvent(defenderId)` — Erro Adversário (Ataque)

Bater chega à 1ª por erro; corredores avançam 1 base.

#### Efeitos no GameState
| Campo | Mudança |
|-------|---------|
| `opponentPitchCount` | +1 |
| `balls` | Reset 0 |
| `strikes` | Reset 0 |
| `currentBatterIndex` | Avança |
| `runners` | `applyRunnerAdvance(runners, 1)` + `first = true` |
| `homeScore` | +advanced runs |
| `gameLog` | `error` |

#### Efeitos nas Estatísticas (rebatedor)
| Stat | Mudança |
|------|---------|
| `atBats` | +1 |
| (nenhum hit, out, walk) | — |

---

### `applyDoublePlayWithRunner(runnerBase, defenderIds[])` — Double Play (Ataque)

#### Efeitos no GameState
| Campo | Mudança |
|-------|---------|
| `opponentPitchCount` | +1 |
| `outs` | +2 (side switch se outs >= 3) |
| `runners[runnerBase]` | `false` |
| `currentBatterIndex` | Avança |
| `gameLog` | `double-play` |

#### Efeitos nas Estatísticas
- Nenhum stat de bateria (sem hit, out, ou AB específico creditado).

---

## Eventos de Defesa (Adversário bate)

### `handleDefensivePitch(kind)` — Pitch no Modo Defensivo

Handles: `strike`, `ball`, `foul`

Registra arremessos lançados pelo nosso pitcher ao rebatedor adversário.

#### Efeitos no GameState
| Campo | Mudança |
|-------|---------|
| `ourPitchCount` | +1 |
| `pitchCounts[currentPitcherId]` | +1 |
| `strikes` | Atualizado ou reset |
| `balls` | Atualizado ou reset |
| `currentBatterIndex` | Avança se strikeout/walk (oponente) |
| `runners` | `advanceOnWalk` se walk |
| `awayScore` | +forced runs se walk |
| `gameLog` | — (não adiciona log no count parcial) |

#### Efeitos nas Estatísticas (nosso pitcher)
| Stat | Mudança |
|------|---------|
| `strikes` | +1 se strike/foul-conta |
| `balls` | +1 se ball |
| `pitchCount` | +1 |
| `pitchTypes[tipo]` | +1 (baseado em `selectedPitchType`) |
| `strikeouts` | +1 se strikeout resultante |
| `walks` | +1 se walk resultante |
| `outsPitched` | +1 se strikeout |
| `inningsPitched` | recalculado |
| `earnedRuns` | + forced runs se walk |

> **Nota**: `syncPitchToPitcher` em App.jsx escreve estas stats, não `syncDefensivePitcherEvent`.

---

### `applyDefensiveOutEvent(outType, fielderId)` — Out Defensivo

Handles: `out`, `strikeout`, `flyout`, `groundout`, `lineout`

#### Efeitos no GameState
| Campo | Mudança |
|-------|---------|
| `ourPitchCount` | +1 |
| `pitchCounts[pitcherId]` | +1 |
| `outs` | +1 (side switch se >= 3) |
| `balls` | Reset 0 |
| `strikes` | Reset 0 |
| `isAttacking` | Vira `true` se side switch |
| `inningHalf` / `inning` | Atualizado se side switch |
| `opposingBatters` | `updateOppBatter(current, tipo)` |
| `opponentLineupIndex` | Avança |
| `gameLog` | `def-out` |

#### Efeitos nas Estatísticas

**Pitcher:**
| Stat | Mudança |
|------|---------|
| `outsPitched` | +1 |
| `inningsPitched` | recalculado |
| `pitchCount` | +1 |
| `strikeouts` | +1 se strikeout |

**Defensor (fielderId):**
| Stat | Mudança |
|------|---------|
| `flyOuts` | +1 se flyout |
| `groundOuts` | +1 se groundout |
| `lineOuts` | +1 se lineout |

---

### `applyDefensiveHit(kind)` — Hit Concedido ao Adversário

Handles: `single`, `double`, `triple`, `homerun`

#### Efeitos no GameState
| Campo | Mudança |
|-------|---------|
| `ourPitchCount` | +1 |
| `pitchCounts[pitcherId]` | +1 |
| `balls` | Reset 0 |
| `strikes` | Reset 0 |
| `runners` | `applyHitToBases` |
| `awayScore` | +runs |
| `inningScores.away` | +runs |
| `opposingBatters` | `updateOppBatter(current, 'hit')` |
| `opponentLineupIndex` | Avança |
| `gameLog` | `def-hit-{kind}` |

#### Efeitos nas Estatísticas (pitcher)
| Stat | Mudança |
|------|---------|
| `hitsAllowed` | +1 |
| `earnedRuns` | +runs scored |
| `pitchCount` | +1 |

---

### `applyDefensiveWalk()` — Walk Concedido

#### Efeitos no GameState
| Campo | Mudança |
|-------|---------|
| `ourPitchCount` | +1 |
| `pitchCounts[pitcherId]` | +1 |
| `balls` | Reset 0 |
| `strikes` | Reset 0 |
| `runners` | `forceAdvanceToFirst` |
| `awayScore` | +forced runs |
| `opposingBatters` | `updateOppBatter(current, 'walk')` |
| `opponentLineupIndex` | Avança |
| `gameLog` | `def-walk` |

#### Efeitos nas Estatísticas (pitcher)
| Stat | Mudança |
|------|---------|
| `walks` | +1 |
| `earnedRuns` | +forced runs |
| `pitchCount` | +1 |

---

### `applySacFly()` — Sacrifice Fly Adversário

Pré-condição: `runners.third` truthy. Mesmo lógico que ataque, mas os pontos vão para `awayScore`.

#### Efeitos nas Estatísticas (pitcher)
| Stat | Mudança |
|------|---------|
| `outsPitched` | +1 |
| `earnedRuns` | +1 |
| `pitchCount` | +1 |

---

### `applyHBP()` — HBP Adversário (Modo Defensivo)

#### Efeitos nas Estatísticas (pitcher)
| Stat | Mudança |
|------|---------|
| `pitchCount` | +1 |
| (sem earnedRuns — não é standard como ER) | — |

---

### `applyErrorEvent(defenderId)` — Erro Defensivo

#### Efeitos nas Estatísticas

**Defensor:**
| Stat | Mudança |
|------|---------|
| `errors` | +1 |

**Pitcher:** Apenas `pitchCount +1`. **Sem `earnedRuns`** — runs em erros são unearned.

---

### `applyWildPitch()` — Wild Pitch (Modo Defensivo)

#### Efeitos no GameState
| Campo | Mudança |
|-------|---------|
| `ourPitchCount` | +1 |
| `pitchCounts[pitcherId]` | +1 |
| `runners` | `applyRunnerAdvance(runners, 1)` |
| `awayScore` | +runs scored |
| `gameLog` | `wild-pitch` |

#### Efeitos nas Estatísticas (pitcher)
| Stat | Mudança |
|------|---------|
| `wildPitches` | +1 |
| `earnedRuns` | +runs scored (WP = earned!) |
| `pitchCount` | +1 |

---

### `applyDoublePlayWithRunner(runnerBase, defenderIds[])` — Double Play (Defesa)

#### Efeitos nas Estatísticas

**Pitcher:**
| Stat | Mudança |
|------|---------|
| `outsPitched` | +2 |
| `pitchCount` | +1 |

**Defensores:**
| Stat | Mudança |
|------|---------|
| `doublePlays` | +1 cada |

---

## Eventos de Corredor

### `advanceRunner(base)` — Avançar Corredor

Disponível via interface de campo (drag/tap no corredor).

| Campo | Mudança |
|-------|---------|
| `runners[base]` | `false` |
| `runners[nextBase]` | Corredor (ou score se era 3ª) |
| `homeScore`/`awayScore` | +1 se marcou |
| `gameLog` | `stolen-base` (ataque) ou `runner-advance` (defesa) |

**Estatística**: Se ataque + corredor identificado: `stolenBases +1`.
**Pitcher**: Se defesa + era 3ª → `onDefensiveEarnedRun(1)` → `earnedRuns +1`.

---

### `removeRunner(base)` — Remover Corredor (Out em Base)

Disponível via interface de campo (confirmar remoção).

| Campo | Mudança |
|-------|---------|
| `runners[base]` | `false` |
| `outs` | +1 |
| Side switch | Se outs >= 3 |
| `gameLog` | `out` |

**Pitcher**: Se defesa → `onDefensiveOut(1)` → `outsPitched +1`.

---

## Evento de Desfazer

### `handleUndo()` — Desfazer Última Ação

Restaura o estado completo (gameState + todas as stats do jogo) ao snapshot anterior.

- Pilha máxima: 80 entradas.
- Restaura: `onUpdateGameState(snapshot.stateSnapshot)`.
- Restaura stats: `gameStatsApi.upsert(gameId, playerId, snap)` para cada entrada.
- Zera stats de jogadores criados após o snapshot.

---

## Tipos de Log de Eventos (`gameLog.type`)

| Tipo | Descrição |
|------|-----------|
| `game-start` | Início da partida |
| `hit-single` | Single (ataque) |
| `hit-double` | Double (ataque) |
| `hit-triple` | Triple (ataque) |
| `hit-homerun` | Home run (ataque) |
| `out` | Out genérico ou strikeout (ataque) |
| `walk` | Walk (ataque — BB por count) |
| `hbp` | Hit by pitch |
| `sac-fly` | Sacrifice fly |
| `error` | Erro (em ambos os modos) |
| `double-play` | Double play |
| `stolen-base` | Stolen base (ataque) |
| `runner-advance` | Avanço de corredor adversário |
| `sub` | Substituição de jogador |
| `swap` | Troca de posição entre dois jogadores |
| `pitcher-change` | Troca de pitcher adversário |
| `def-out` | Out defensivo (adversário eliminado) |
| `def-walk` | Walk concedido ao adversário |
| `def-hit-single` | Single concedido |
| `def-hit-double` | Double concedido |
| `def-hit-triple` | Triple concedido |
| `def-hit-homerun` | Home run concedido |
| `wild-pitch` | Wild pitch |
| `inning-end` | Fim de half-inning |
