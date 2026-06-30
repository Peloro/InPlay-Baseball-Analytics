# Validações

Todas as validações implementadas no frontend e backend.

---

## Validações de Frontend (Tempo Real)

### Antes de Arremessar (Modo Defensivo)

| Condição | Mensagem | Ação |
|----------|----------|------|
| `currentPitcherId` é null | "Selecione o arremessador antes de registrar pitches" | Bloqueia |
| `onFieldPlayerIds.length < 9` | "É necessário ter 9 jogadores em campo para arremessar" | Bloqueia |

### Antes de Registrar Evento Defensivo

| Condição | Mensagem | Ação |
|----------|----------|------|
| `currentPitcherId` é null | "Selecione o arremessador antes de registrar o evento" | Bloqueia |
| `isProcessingRef.current = true` | (silencioso) | Bloqueia 700ms após ação anterior |

### Antes de Sac Fly

| Condição | Mensagem | Ação |
|----------|----------|------|
| `!runners.third` | "Nenhum corredor na terceira base para sac fly" | Bloqueia |

### Antes de Double Play

| Condição | Mensagem | Ação |
|----------|----------|------|
| Nenhum corredor em nenhuma base | "Double play exige corredor em base" | Bloqueia |

### Antes de Wild Pitch

| Condição | Mensagem | Ação |
|----------|----------|------|
| `!currentPitcherId` | "Selecione o arremessador antes de registrar o evento" | Bloqueia |
| `isAttacking = true` | (silencioso) | Retorna imediatamente |

### Undo

| Condição | Mensagem | Ação |
|----------|----------|------|
| `undoStack` vazio | "Nada para desfazer" | Bloqueia |
| Falha ao restaurar stats | "Falha ao restaurar stats" | Aviso (não desfaz) |

### Debounce Anti-Duplo-Clique

Todos os handlers de ação usam `isProcessingRef.current`:
```js
if (isProcessingRef.current) return
isProcessingRef.current = true
window.setTimeout(() => { isProcessingRef.current = false }, 700)
```

Previne duplo-acionamento acidental em dispositivos touch.

---

## Validações de Edição de Jogador

### No formulário de edição (FieldPage/JogadoresPage)

| Campo | Regra |
|-------|-------|
| `name` | Obrigatório, não pode ser vazio após trim |
| `number` | Obrigatório, deve ser fornecido |
| `positions` | Deve ter ao menos 1 posição válida |
| `activePosition` | Deve estar em `positions` (auto-corrigido) |

```js
if (!editForm.name.trim() || !editForm.number || !editForm.positions.length) return
```

### Normalização de Posições (`normalizePlayer`)

```js
// Filtra posições inválidas
const positions = rawPositions
  .map(s => s.trim().toUpperCase())
  .filter(s => VALID_POSITIONS.includes(s))

const safePositions = positions.length ? positions : ['DH']  // fallback
const activePosition = safePositions.includes(player.activePosition)
  ? player.activePosition
  : safePositions[0]
```

---

## Validações de Backend

### Auth — Registro (`POST /auth/register`)

| Campo | Regra |
|-------|-------|
| `teamName` | Obrigatório, mínimo 1 char |
| `email` | Email válido (express-validator), normalizado |
| `password` | Mínimo 8 caracteres |
| Email duplicado | 409 Conflict: "Email já cadastrado." |

Rate limit: 10 tentativas por 15 minutos por IP.

### Auth — Login (`POST /auth/login`)

| Campo | Regra |
|-------|-------|
| `email` | Email válido |
| `password` | Obrigatório |
| Credenciais | 401 se usuário não existe ou senha errada |
| Status pending | 403: "Conta aguardando aprovação." |
| Time bloqueado | 403: "Equipe bloqueada." |

### Jogos (`POST /games`)

| Campo | Regra |
|-------|-------|
| `date` | Obrigatório |
| `competition` | Obrigatório, mínimo 1 char |
| `opponent`/`opponentName` | Obrigatório |

### Game Stats (`POST /game-stats`)

| Campo | Regra |
|-------|-------|
| `gameId` | Deve ser MongoDB ObjectId válido |
| `playerId` | Deve ser MongoDB ObjectId válido |
| `playerId` existe no time | 404 se não encontrado |

Todos os valores numéricos: `toSafeStatValue(v)` → `max(0, parseFloat(v))` ou 0.

### Sanitização de Setup de Jogo (`sanitizeSetupPayload`)

- `isAttacking`: só aceita boolean
- `battingOrder`: array de strings
- `lineup`: array de `{playerId, position}` — filtra inválidos
- `bench`: array de strings
- `gameState`: objeto (não array)
- `isFinished`: boolean
- `finishedAt`: data válida

### IDs de MongoDB

Todos os endpoints que recebem `:id` como parâmetro validam:
```js
if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
  return res.status(400).json({ message: 'id invalido.' })
}
```

---

## Validações de Dados em Memória

### `safeNumber(v)` — `utils/number.js`

```js
function safeNumber(v) {
  const x = parseFloat(v)
  return Number.isFinite(x) ? x : 0
}
```

Usado em todos os cálculos de estatísticas para evitar `NaN`.

### `getSavedGameState()` — Hidratação do Estado

| Campo | Validação |
|-------|-----------|
| `onFieldPlayerIds` | `Array.isArray` ? keep : `[]` |
| `battingOrder` | `Array.isArray` ? keep : `[]` |
| `lineup` | `Array.isArray` ? keep : `[]` |
| `bench` | `Array.isArray` ? keep : `[]` |
| `gameLog` | `Array.isArray` ? keep : `[]` |
| `substitutions` | `Array.isArray` ? keep : `[]` |
| `opponentLineup` | `Array.isArray` ? keep : `[]` |
| `runners` | merge com INITIAL (garante first/second/third) |
| `inningHalf` | `=== 'bottom'` ? 'bottom' : 'top' |
| `isAttacking` | `typeof === 'boolean'` ? keep : `true` |
| `ourPitchCount` | migração de `pitchCount` legado |
| `homeScore` | migração de `score.home` legado |
| `opposingBatters` | deve ser objeto não-array |

---

## Validações de Sincronização

### Queue de Sync

- PUT/DELETE na fila: substitui entry existente com mesma URL (evita bloat).
- POST na fila: sempre adiciona (sem deduplicação de criação).
- Se resposta 4xx (400-499): descarta da fila (erro permanente do cliente).
- Se resposta null (network failure): mantém na fila para retry.

### ID Remapping Seguro

Antes de reescrever o localStorage após sync:
- Verifica que há pending writes antes de sobrescrever (evita perder writes locais recentes).
```js
const hasPending = lfGet(LS.syncQueue).some(
  item => item.localId === id || item.url.includes(`/${id}`)
)
if (hasPending) return  // não sobrescreve
```
