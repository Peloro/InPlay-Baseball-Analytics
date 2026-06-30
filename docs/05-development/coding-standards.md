# Padrões de Código

---

## Geral

- **Linguagem**: JavaScript (sem TypeScript no código-fonte; TypeScript usado apenas na documentação para interfaces).
- **Componentes React**: Apenas functional components. Nenhuma class component.
- **State management**: `useState` + props drilling. Sem Redux, Zustand, ou Context.
- **Hooks**: Toda lógica reutilizável vai em hooks customizados em `hooks/`.
- **Formatação**: Sem configuração de linter/prettier no repositório — seguir o estilo existente.

---

## Frontend

### Estrutura de Componentes

```jsx
// Padrão de componente funcional:
export default function ComponentName({ prop1, prop2, onAction }) {
  const [localState, setLocalState] = useState(initialValue)

  const handleSomething = useCallback(() => {
    // lógica
    onAction(result)
  }, [onAction])

  return (
    <div className="component-name">
      {/* JSX */}
    </div>
  )
}
```

### Props de Callback

- Nomeadas com prefixo `on`: `onUpdate`, `onDelete`, `onAction`.
- Nunca passar `setGameState` diretamente — sempre wrapper (`onUpdateGameState`).

### Atualização de Estado

```js
// CORRETO — padrão updater funcional:
onUpdateGameState((current) => ({
  ...current,
  outs: current.outs + 1,
}))

// ERRADO — mutação direta:
gameState.outs += 1  // ← NUNCA fazer isso
setGameState(gameState)  // ← NUNCA passar o mesmo objeto
```

### Operações Assíncronas em Handlers

```js
// Handlers que escrevem stats são async/await:
const handleAction = useCallback(async () => {
  captureUndoSnapshot()
  onUpdateGameState(/* ... */)
  await upsertGameStat(playerId, patch)
  onStatsUpdated()
}, [deps])
```

---

## Nomenclatura

| Contexto | Convenção | Exemplo |
|----------|-----------|---------|
| Componentes React | PascalCase | `FieldPage`, `GameSummaryModal` |
| Hooks | camelCase prefixado `use` | `useGameActions`, `usePlayers` |
| Funções utilitárias | camelCase | `formatIpFromOuts`, `applyHitToBases` |
| Constantes | UPPER_SNAKE_CASE | `EMPTY_HITTING`, `LONG_PRESS_MS` |
| Arquivos de componentes | PascalCase.jsx | `Field.jsx`, `CountDots.jsx` |
| Arquivos de hooks | camelCase.js | `useGameState.js` |
| Arquivos de utils | camelCase.js | `stats.js`, `fieldGame.js` |
| Classes CSS | kebab-case | `game-subview-bar`, `field-container` |

---

## Imports

```js
// Ordem recomendada (baseada no código existente):
import { useState, useEffect, useCallback, useRef } from 'react'
import { someLib } from 'some-library'

import { functionA } from '../utils/someUtil'
import { CONSTANT } from '../constants/someConst'
import ComponentName from './ComponentName'
```

---

## Persistência

### Regra Crítica: gameStatsApi.upsert

**Sempre usar `gameStatsApi.upsert(gameId, playerId, payload)`**. Nunca `gameStatsApi.update(id, data)` para writes de jogo.

Motivo: O ID local (`"abc-xyz"`) pode ser remapeado para um ObjectId MongoDB após sync. Usar `_id` resulta em "not found" ou criar registro duplicado.

### Padrão de Write de Stat

```js
// Em useGameActions:
await upsertGameStat(playerId, {
  hitting: { atBats: 1, hits: 1 },
})

// upsertGameStat internamente:
await gameStatsApi.upsert(gameState.currentGameId, playerId, payload)
onStatsUpdated()  // incrementa statsRefreshKey
```

---

## Backend

### Estrutura de Route Handler

```js
router.get('/', async (req, res) => {
  try {
    const items = await Model.find({ teamId: req.user.teamId })
    res.json(items)
  } catch (error) {
    res.status(500).json({ message: 'Erro interno.' })
  }
})
```

**Sempre**:
1. `teamId: req.user.teamId` em toda query.
2. Try/catch com 500 no catch.
3. Validar `mongoose.Types.ObjectId.isValid(id)` antes de usar `id` em query.

### Sanitização de Input

```js
function toSafeStatValue(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}
```

Aplicada a todos os campos numéricos de stats antes de salvar.

---

## Comentários

- Comentários **raramente necessários**. O código deve ser auto-explicativo.
- Quando necessário: documenta o **porquê**, não o **o quê**.
- Comentários aceitáveis:
  - Workarounds para bugs conhecidos.
  - Invariantes não-óbvias (ex: "outsPitched é sempre a source of truth para IP").
  - Decisões contra-intuitivas.

---

## Testes

Ver [testing.md](testing.md).

---

## Git

- Commits em inglês ou português — seguir estilo do histórico existente.
- Mensagens descritivas: `FIX: BoxScore not showing in reports`.
- Prefixos usados: `FIX:`, `FEAT:`, `REFACTOR:`, `DOCS:`.
- Não commitar `.env` ou credenciais.
