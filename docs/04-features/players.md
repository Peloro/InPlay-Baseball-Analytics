# Feature: Jogadores

---

## Objetivo

Gerenciar o roster (elenco) do time — criar, editar, e remover jogadores.

---

## Modelo de Dados

```ts
interface Player {
  _id: string                   // MongoDB ObjectId ou ID local
  teamId?: string               // definido após sync com backend
  name: string                  // nome completo
  number: number                // número da camisa
  positions: string[]           // posições que pode jogar: ['P', '1B', 'SS', ...]
  activePosition: string        // posição padrão (deve estar em positions[])
  x: number                     // coordenada X no campo (0-100), default 50
  y: number                     // coordenada Y no campo (0-100), default 50
  pitchCountLimit?: number|null // limite de pitches (só frontend)
  pitchRepertoire?: string[]    // tipos de pitch: ['FB', 'CV', 'SL', ...]
}
```

**Posições válidas** (de `data/positions.js`):
`'P'`, `'C'`, `'1B'`, `'2B'`, `'3B'`, `'SS'`, `'LF'`, `'CF'`, `'RF'`, `'DH'`

---

## CRUD

### Criar Jogador

```js
// playersApi.create(data):
const player = {
  _id: uid(),                    // ID local temporário
  name: data.name.trim(),
  number: data.number,
  positions: normalizePositions(data.positions),
  activePosition: data.activePosition,
  x: 50, y: 50,
}
lfSet(LS.players, [...current, player])  // salva em localStorage
syncQueue.push({ method: 'post', url: '/players', data: player, localId: player._id })
```

### Editar Jogador

```js
// playersApi.update(id, patch):
const updated = { ...existing, ...patch }
lfSet(LS.players, players.map(p => p._id === id ? updated : p))
syncQueue.push({ method: 'put', url: `/players/${id}`, data: patch })
```

### Deletar Jogador

```js
// playersApi.delete(id):
// Remove o jogador
lfSet(LS.players, players.filter(p => p._id !== id))
// Remove todas as GameStats do jogador (cascata)
lfSet(LS.gameStats, gameStats.filter(s =>
  String(s.playerId?._id || s.playerId) !== id
))
syncQueue.push({ method: 'delete', url: `/players/${id}` })
```

---

## Normalização (`normalizePlayer`)

Aplicada ao ler e criar jogadores:

```js
function normalizePlayer(raw) {
  const positions = (raw.positions || [])
    .map(s => s.trim().toUpperCase())
    .filter(s => VALID_POSITIONS.includes(s))

  const safePositions = positions.length ? positions : ['DH']
  const activePosition = safePositions.includes(raw.activePosition)
    ? raw.activePosition
    : safePositions[0]

  return {
    ...raw,
    _id: String(raw._id || raw.id || ''),
    name: String(raw.name || '').trim(),
    number: Number(raw.number) || 0,
    positions: safePositions,
    activePosition,
    x: Number(raw.x) ?? 50,
    y: Number(raw.y) ?? 50,
  }
}
```

---

## Helpers de Player

| Função | Uso |
|--------|-----|
| `getPlayerId(player)` | Retorna `String(player._id \|\| player.id)` — normaliza ID |
| `getMainPosition(player)` | Retorna `player.activePosition \|\| player.positions[0]` |
| `detectPlayerType(player)` | `'pitcher'` se posição principal é `'P'`, senão `'hitter'` |
| `normalizePlayer(raw)` | Normaliza, valida posições, fallback para `DH` |

---

## Posição no Campo

As coordenadas `x` e `y` são em porcentagem (0-100) relativas ao container do campo.

Posições padrão por posição defensiva (`data/defaultFieldPositions.js`):

| Posição | x | y |
|---------|---|---|
| P | 50 | 50 |
| C | 50 | 88 |
| 1B | 70 | 68 |
| 2B | 63 | 42 |
| 3B | 30 | 68 |
| SS | 37 | 42 |
| LF | 22 | 22 |
| CF | 50 | 12 |
| RF | 78 | 22 |

Quando um jogador entra no campo (`executeSubstitution`), se não tem coordenadas definidas, recebe as coordenadas padrão da posição que está ocupando.

---

## Detecção de Tipo de Jogador (Stat)

`detectPlayerType(player)` determina se o registro de GameStat é `'pitcher'` ou `'hitter'`. Isso afeta a exibição na tab de Stats:

- `'P'` como activePosition → `'pitcher'`
- Qualquer outra posição → `'hitter'`

Um pitcher pode também ter stats de hitting (se bater em modo de ataque). Nesse caso, o `type` do registro reflete sua posição primária, mas os campos `hitting` também são preenchidos.

---

## PitchCountLimit

Campo opcional exclusivamente local (`pitchCountLimit`). Quando definido:

- O HUD exibe `PC: 45 / 70` (atual / limite).
- Quando o pitcher ultrapassa o limite, um aviso visual é exibido.
- Não bloqueia o jogo — apenas alerta o técnico.

---

## Pitch Repertoire

`pitchRepertoire: string[]` — lista de tipos de pitch que o arremessador usa. Usado para filtrar os botões de tipo de pitch no HUD de defesa.

Tipos disponíveis (de `PITCH_NAMES` em `constants/fieldGame.js`):
`FB`, `CV`, `SL`, `CH`, `SI`, `CT`, `other`
