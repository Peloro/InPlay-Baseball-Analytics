# API — Backend REST

Documentação de todos os endpoints do backend. Base URL: `VITE_API_URL` (ex: `https://api.inplay.com`).

---

## Autenticação

Todos os endpoints (exceto `/auth/*`) exigem `Authorization: Bearer {token}`.

O token JWT contém: `{ userId, teamId, role }`.

---

## Auth (`/auth`)

### `POST /auth/register`

Cria um novo time + usuário (coach).

**Body**:
```json
{
  "teamName": "CAASO Baseball",
  "email": "coach@email.com",
  "password": "minimo8chars"
}
```

**Resposta 201**:
```json
{ "message": "Conta criada! Aguardando aprovação do administrador." }
```

**Erros**:
- `409`: Email já cadastrado
- `400`: Campos inválidos (rate limit: 10/15min por IP)

---

### `POST /auth/login`

**Body**:
```json
{ "email": "coach@email.com", "password": "senha" }
```

**Resposta 200**:
```json
{
  "token": "eyJhbGc...",
  "teamId": "64abc123...",
  "teamName": "CAASO Baseball",
  "email": "coach@email.com"
}
```

**Erros**:
- `401`: Credenciais inválidas
- `403`: Conta pendente ou time bloqueado

---

### `POST /auth/refresh`

Renova o JWT sem re-autenticar.

**Header**: `Authorization: Bearer {token_atual}`

**Resposta 200**:
```json
{ "token": "eyJhbGc...", "teamId": "...", "teamName": "..." }
```

---

### `GET /auth/ping`

Verifica se o usuário ainda é válido (status do time não bloqueado).

**Resposta 200**: `{ "ok": true }`  
**Resposta 403**: Time bloqueado → interceptor força logout.

---

## Players (`/players`)

> Todos os endpoints escopados por `teamId` do token JWT.

### `GET /players`

Lista todos os jogadores do time.

**Resposta 200**: `Player[]`

---

### `POST /players`

Cria jogador.

**Body**:
```json
{
  "name": "João Silva",
  "number": 23,
  "positions": ["P", "1B"],
  "activePosition": "P",
  "x": 50,
  "y": 50
}
```

**Resposta 201**: `Player`

---

### `PUT /players/:id`

Atualiza jogador.

**Body**: Campos a atualizar (partial).

**Resposta 200**: `Player` atualizado.

---

### `DELETE /players/:id`

Remove jogador.

**Resposta 204**: No content.

---

## Games (`/games`)

### `GET /games`

Lista jogos ordenados por `date desc`.

**Resposta 200**: `Game[]`

---

### `POST /games`

Cria jogo.

**Body**:
```json
{
  "date": "2026-07-01T20:00:00Z",
  "opponent": "Time Adversário",
  "opponentName": "Time Adversário",
  "competition": "Campeonato Paulista",
  "location": "Campo Central",
  "isAttacking": true,
  "battingOrder": ["id1", "id2", ...],
  "lineup": [{"playerId": "id1", "position": "P"}, ...],
  "bench": ["id10", "id11"],
  "maxInnings": 7
}
```

**Resposta 201**: `Game`

---

### `GET /games/:id`

Busca jogo por ID.

**Resposta 200**: `Game`  
**Resposta 404**: Não encontrado

---

### `PUT /games/:id`

Atualiza jogo (inclui `gameState`).

**Body**: Qualquer subconjunto de campos do Game.

Campos aceitos via `sanitizeSetupPayload`:
- `isAttacking`, `battingOrder`, `lineup`, `bench`
- `gameState` (Mixed — aceita qualquer JSON)
- `isFinished`, `finishedAt`
- `date`, `opponent`/`opponentName`, `competition`, `location`

**Resposta 200**: `Game`

---

### `DELETE /games/:id`

Remove jogo **e** todos os GameStat relacionados.

**Resposta 204**: No content.

---

## Game Stats (`/game-stats`)

### `GET /game-stats`

Lista todos os GameStat do time.

**Resposta 200**: `GameStat[]`

---

### `POST /game-stats`

Cria ou atualiza stat (upsert interno por `gameId + playerId`).

**Body**:
```json
{
  "gameId": "64abc...",
  "playerId": "64def...",
  "type": "pitcher",
  "hitting": { "atBats": 3, "hits": 1, ... },
  "pitching": { "outsPitched": 9, "earnedRuns": 2, ... },
  "defense": { "errors": 0, ... }
}
```

**Resposta 201**: `GameStat` (criado ou atualizado)

---

### `GET /game-stats/:gameId`

Lista GameStats de um jogo específico. Popula `playerId` com name/number/positions.

**Query param**: `?playerId=64...` (opcional — filtra por jogador)

**Resposta 200**: `GameStat[]` (com `playerId` populado)

---

### `PUT /game-stats/:id`

Atualiza GameStat por `_id`.

**Body**: Campos de hitting/pitching/defense.

**Resposta 200**: `GameStat` atualizado.

---

## Season Stats (`/season-stats`)

### `GET /season-stats`

Retorna estatísticas agregadas da temporada (calculadas do MongoDB).

**Resposta 200**: Array de stats agregadas por jogador.

> **Nota**: No frontend, `seasonStatsApi.list()` agrega **localmente** do localStorage. O endpoint backend existia mas o frontend migrou para cálculo local-first.

---

## Admin (`/admin`)

> Requer role `admin`. Sem acesso de times normais.

### `GET /admin/pending`

Lista usuários com `status: 'pending'`.

### `GET /admin/teams`

Lista todos os times com usuários.

### `PATCH /admin/users/:id/approve`

Aprova usuário (muda status para `active`).

### `DELETE /admin/users/:id`

Rejeita/remove usuário.

### `PATCH /admin/teams/:teamId/status`

**Body**: `{ "status": "active" | "blocked" }`

Bloqueia ou desbloqueia um time inteiro.

### `PATCH /admin/teams/:teamId/billing`

**Body**: `{ "billingStatus": "trial"|"paid"|"unpaid", "billingNotes": "..." }`

### `DELETE /admin/teams/:teamId`

Remove time e todos os dados relacionados.

---

## Export (`/export`)

Endpoint para exportação de dados (CSV/JSON). Detalhes no código `backend/src/routes/export.js`.

---

## Tabela de Erros

| Código | Significado |
|--------|-------------|
| `400` | Dados inválidos (campo faltando, formato errado) |
| `401` | Token ausente, inválido ou expirado |
| `403` | Sem permissão: conta pendente, time bloqueado, ou role insuficiente |
| `404` | Recurso não encontrado no time do usuário |
| `409` | Conflito: ex. email duplicado |
| `500` | Erro interno do servidor |

---

## Middleware

### `auth.js`

```js
// Verifica JWT em Authorization: Bearer {token}
// Injeta req.user = { userId, teamId, role }
// Em 401: retorna { message: 'Token inválido ou expirado.' }
```

### `adminOnly.js`

```js
// Verifica req.user.role === 'admin'
// Em 403: retorna { message: 'Acesso restrito.' }
```

### `validate.js`

Executa resultado de `express-validator`. Em erro: `400` com `{ errors: [...] }`.

---

## Isolamento de Dados por Time

**Toda** query ao MongoDB usa `teamId: req.user.teamId` como filtro:

```js
// Exemplo:
await Game.find({ teamId: req.user.teamId })
await GameStat.findOne({ _id: id, teamId: req.user.teamId })
```

Garante que um time nunca vê dados de outro, mesmo conhecendo o `_id`.

---

## Configuração de CORS

```js
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'https://localhost', 'capacitor://localhost', 'http://localhost']
  : true  // permite qualquer origem se FRONTEND_URL não configurado
```

`capacitor://localhost` é necessário para o APK Android funcionar com o backend.
