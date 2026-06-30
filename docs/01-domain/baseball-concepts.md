# Conceitos de Beisebol — Aplicados ao InPlay

Este documento explica os conceitos fundamentais de beisebol implementados no app. Foca em **como** cada conceito se traduz em código, não em regras teóricas.

---

## Estrutura de um Jogo

Um jogo de beisebol é dividido em **innings**. Cada inning tem duas metades:

- **Top (▲)**: Time visitante/adversário bate. No InPlay = `isAttacking: false`.
- **Bottom (▼)**: Time da casa/nosso time bate. No InPlay = `isAttacking: true`.

O InPlay trata **nosso time sempre como home** (casa) na exibição. O inning avança quando a equipe que bate acumula 3 outs no half-inning atual.

```
Início do jogo: inning=1, inningHalf='top', isAttacking=true*
  *Configurado no PreGame: se começamos atacando = top com isAttacking=true
```

### Avanço de Inning

```
3 outs atingidos →
  • outs = 0
  • isAttacking = !isAttacking
  • se inningHalf === 'bottom': inning += 1
  • inningHalf = (top → bottom) | (bottom → top)
  • runners = { first: false, second: false, third: false }
```

---

## Bases e Corredores

O diamante tem 4 bases: Home, 1ª (first), 2ª (second), 3ª (third).

No gameState:
```js
runners: {
  first: false | true | "playerId",
  second: false | true | "playerId",
  third: false | true | "playerId"
}
```
- `false` = base vazia
- `true` = corredor (genérico, sem identificação)
- `"playerId"` = corredor identificado (permite creditar stolen base)

### Forçar Avanço (Walk / HBP)

Quando um rebatedor vai para 1ª base forçado (walk ou HBP), todos os corredores em bases forçadas avançam:

```
Lógica de forceAdvanceToFirst:
  • Se 1ª livre: bater na 1ª. Fim.
  • Se 1ª e 2ª ocupadas e 3ª também: corredor de 3ª marca (runs += 1)
  • 3ª = 2ª, 2ª = 1ª, 1ª = bater
```

### Avanço por Arremesso (Wild Pitch / Runner Advance)

`applyRunnerAdvance(runners, basesToAdvance)` move cada corredor N bases para frente:
- Corredor que ultrapassa a 3ª: marca ponto (`runs += 1`)

### Progressão em Hits

```
single   → bater na 1ª, outros avançam 1 base
double   → bater na 2ª, outros avançam 2 bases
triple   → bater na 3ª, outros avançam 3 bases
homerun  → todos marcam, bases ficam vazias, bater marca também
```

---

## Count (Contagem)

| Campo | Alcance | Reset quando |
|-------|---------|-------------|
| `strikes` | 0–2 | strikeout, walk, fim de at-bat |
| `balls` | 0–3 | walk, strikeout, fim de at-bat |

Regras de count:
- **Strike**: `strikes += 1`. Se strikes ≥ 3 → **strikeout** (rebatedor elimina-se).
- **Ball**: `balls += 1`. Se balls ≥ 4 → **walk** (rebatedor vai para 1ª base).
- **Foul**: trata como strike apenas se `strikes < 2` (foul nunca causa strikeout).
- Após strikeout ou walk: `strikes = 0`, `balls = 0`, próximo rebatedor.

---

## Placar por Inning (Box Score)

```js
inningScores: {
  home: [0, 1, 3, 0, 2, ...],  // nosso time, índice = inning - 1
  away: [1, 0, 0, 2, 0, ...],  // adversário, índice = inning - 1
}
```

Atualizado pela função `addInningRuns(inningScores, inning, ourRuns, theirRuns)`.

---

## Ordem de Rebatida

```js
battingOrder: ["id1", "id2", ..., "id9"]  // array de playerIds
currentBatterIndex: 2  // índice atual (0-based, cíclico)
```

Após cada at-bat completo, `currentBatterIndex = (current + 1) % battingOrder.length`. O índice é cíclico — após o 9º rebatedor, volta ao 1º.

---

## Substituições

Substituição registra:
```js
{
  id: "sub_1234567890",
  ts: 1234567890,       // timestamp
  inning: 3,
  half: "bottom",
  playerInId: "...",
  playerInName: "...",
  position: "LF",
  playerOutId: "...",
  playerOutName: "..."
}
```

Comportamentos especiais:
- Se o arremessador titular é substituído, `currentPitcherId` é atualizado automaticamente.
- Substituição do pitcher pelo painel de pitcher-select cria um `subRecord` no log.

---

## Tipos de Out

| Tipo | Código | Descrição |
|------|--------|-----------|
| Strikeout | `strikeout` | 3 strikes |
| Fly Out | `flyout` | Bola no ar pega |
| Ground Out | `groundout` | Bola no chão, jogada na 1ª |
| Line Out | `lineout` | Linha drive pega |
| Generic Out | `out` | Out sem tipo específico |

Apenas `strikeout` credita SO ao arremessador. Os demais creditam FO/GO/LO ao defensor.

---

## Earned vs Unearned Runs

- **Earned Run (ER)**: Ponto que contabiliza para ERA. Ocorre em jogadas normais (hit, walk, HBP, wild pitch).
- **Unearned Run**: Ponto decorrente de erro defensivo. **Não** incrementa `earnedRuns` do arremessador.

No código:
```js
// Wild Pitch → earnedRunsDelta = runs scored
syncDefensivePitcherEvent({ pitchCountDelta: 1, earnedRunsDelta: preRunsScored, wildPitchesDelta: 1 })

// Erro → runs scored são unearned, earnedRunsDelta = 0
syncDefensivePitcherEvent({ pitchCountDelta: 1 })  // sem earnedRunsDelta!
```

---

## Sacrifice Fly

- Bola de fly com corredor em 3ª base.
- Resultado: corredor marca (run+1), rebatedor é eliminado (out+1).
- **Não** conta como AB para o rebatedor, mas conta **SF** e **RBI**.
- O ponto marcado conta como earned run para o arremessador.

---

## Double Play

- 2 outs na mesma jogada.
- Exige pelo menos 1 corredor em base.
- Implementado em `applyDoublePlayWithRunner(runnerBase, defenderIds[])`.
- Créditos: `defense.doublePlays` para cada defensor listado.

---

## Walk-off

Vitória imediata quando:
- É o `bottom` do último inning (`inning >= maxInnings`)
- Nosso time está atacando (`isAttacking = true`)
- Nosso placar > placar adversário

O app detecta automaticamente e exibe prompt de encerramento.

---

## Contagem de Adversários

O InPlay mantém um sistema simplificado de estatísticas do adversário:

```js
// Rebatedor atual
currentOpponentBatter: { number: "23", name: "Silva" }

// Histórico desta partida
opposingBatters: {
  "23": { number: "23", name: "Silva", atBats: 2, hits: 1, outs: 1, walks: 0, strikeouts: 0, homeRuns: 0 }
}

// Ordem de rebatida (descoberta ao longo do jogo)
opponentLineup: [null, {number: "7", name: "A"}, null, ..., null]  // 9 slots
opponentLineupIndex: 2  // slot atual (0-8)
```

A cada at-bat concluído do adversário, `advanceOpponentLineup` grava o bater atual no slot e avança para o próximo.
