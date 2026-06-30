# Feature: Substituições

---

## Objetivo

Trocar jogadores durante uma partida — campo para banco, banco para campo, ou troca entre posições.

---

## Tipos de Substituição

| Tipo | Mecânica |
|------|---------|
| Campo → Banco | Jogador sai do jogo |
| Banco → Campo (com substituto) | Jogador entra, outro sai |
| Banco → Campo (campo não cheio) | Jogador entra sem substituir |
| Campo ↔ Campo | Dois jogadores trocam posições |
| Troca de Pitcher | Tipo especial com tracking de `currentPitcherId` |

---

## Fluxo de Substituição (Drag & Drop)

### Campo → Campo (Swap)

```
Usuário arrasta player A para a posição de player B

→ handleFieldSwap(playerA, playerB)
→ gameState.lineup: troca posições de A e B
→ gameState.onFieldPlayerIds: mantido (ambos permanecem)
→ coordenadas x/y de A e B são trocadas
→ Substituição registrada em gameState.substitutions
```

### Banco → Campo (Substituição)

```
Usuário arrasta player B do banco para cima de player A no campo

→ handleBenchToField(incoming: B, outgoing: A)
→ gameState.onFieldPlayerIds: remove A, adiciona B
→ gameState.bench: adiciona A
→ gameState.lineup: substitui A→B na mesma posição
→ B.x e B.y = coordenadas de A (posição no campo)
→ substitutions.push({ inId: B, outId: A, inning, inningHalf })
→ Se A era currentPitcherId → handlePitcherSelect(B._id)
```

### Campo → Banco (Remoção)

```
Usuário arrasta player A do campo para o banco

→ gameState.onFieldPlayerIds: remove A
→ gameState.bench: adiciona A
→ gameState.lineup: remove A (posição fica vaga)
→ substitutions.push({ inId: null, outId: A, ... })
→ Se A era currentPitcherId → currentPitcherId = null
```

---

## Troca de Pitcher (`handlePitcherSelect`)

Caso especial que além de substituir no campo, também atualiza o tracking de arremessadores:

```js
async function handlePitcherSelect(nextPitcherId) {
  const prevId = gameState.currentPitcherId

  // 1. Inicializa pitch count do novo pitcher se não existe
  const newPitchCounts = {
    ...gameState.pitchCounts,
    [nextPitcherId]: gameState.pitchCounts?.[nextPitcherId] ?? 0,
  }

  // 2. Atualiza gameState
  onUpdateGameState(current => ({
    ...current,
    currentPitcherId: nextPitcherId,
    pitchCounts: newPitchCounts,
    gameLog: [...current.gameLog, makeLogEntry(current, 'pitcher-change',
      `${playerName} entrou como arremessador`
    )],
  }))

  // 3. Registra substituição formal (se havia pitcher anterior)
  if (prevId && prevId !== nextPitcherId) {
    const subEntry = {
      inId: nextPitcherId,
      outId: prevId,
      inning: gameState.inning,
      inningHalf: gameState.inningHalf,
      timestamp: new Date().toISOString(),
    }
    onUpdateGameState(prev => ({
      ...prev,
      substitutions: [...(prev.substitutions || []), subEntry],
    }))
  }
}
```

---

## Registro de Substituições

Todas as substituições são persistidas em `gameState.substitutions`:

```ts
interface Substitution {
  inId: string | null      // jogador que entrou (null se saída sem entrada)
  outId: string | null     // jogador que saiu (null se entrada sem saída)
  inning: number
  inningHalf: 'top' | 'bottom'
  timestamp: string        // ISO date
}
```

Exibidas no `GameDetailPage` como histórico de movimentações.

---

## Limitações

- Não há validação de "jogador que saiu não pode voltar" (regra real do beisebol).
- Não há restrição de número máximo de substituições por inning.
- A troca de pitcher adversário (`opponentPitchCount = 0`) não registra em `substitutions`.

---

## Substituição de Pitcher Adversário

O adversário não tem jogadores rastreados individualmente. Existe apenas um botão "Trocar Pitcher Adversário":

```js
onUpdateGameState(current => ({
  ...current,
  opponentPitchCount: 0,
  gameLog: [...current.gameLog, makeLogEntry(current, 'pitcher-change',
    `Pitcher adversário trocado`
  )],
}))
```

Apenas o `opponentPitchCount` é zerado — nenhuma estatística adicional é rastreada para pitchers adversários.
