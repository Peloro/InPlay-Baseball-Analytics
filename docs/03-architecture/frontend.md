# Frontend — Arquitetura

Documentação completa da estrutura frontend do InPlay.

---

## Stack Tecnológico

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| React | 18+ | UI declarativa, state management |
| Vite | 5+ | Build tool, dev server |
| Capacitor | 6+ | Wrapper Android APK |
| Axios | 1+ | HTTP client (sync com backend) |
| CSS Modules | — | Arquivo único `App.css` |

---

## Estrutura de Arquivos

```
frontend/src/
├── App.jsx                     # Raiz: routing, gameState global, handlers
├── App.css                     # Todos os estilos (arquivo único)
├── index.css                   # Reset + fonte Inter
├── main.jsx                    # Ponto de entrada React
│
├── pages/
│   ├── FieldPage.jsx           # Tab Jogo: campo + ações (2 sub-views)
│   ├── StatsPage.jsx           # Tab Stats: temporada + histórico
│   ├── JogadoresPage.jsx       # Tab Jogadores: CRUD + lineup
│   ├── TrainingField.jsx       # Tab Treino: desenho + posicionamento
│   ├── GameDetailPage.jsx      # Detalhes de um jogo específico
│   ├── LoginPage.jsx           # Tela de login/cadastro
│   ├── SettingsPage.jsx        # Configurações do app
│   └── AdminPage.jsx           # Painel do administrador
│
├── components/
│   ├── CountDots.jsx           # Indicador visual de B/S/O
│   ├── ErrorBoundary.jsx       # Captura de erros React
│   ├── PlayerStatsModal.jsx    # Modal de stats de um jogador
│   ├── game/
│   │   ├── Field/Field.jsx     # Campo visual com players + bases
│   │   ├── Bench/Bench.jsx     # Banco de jogadores
│   │   ├── Player/Player.jsx   # Marcador de jogador no campo
│   │   ├── Runner/Runner.jsx   # Ícone de corredor na base
│   │   ├── Scoreboard/         # Scoreboard flutuante
│   │   ├── GameSummaryModal.jsx # Resumo pós-jogo
│   │   └── PreGameSetupModal.jsx # Setup de lineup antes do jogo
│   └── ui/
│       ├── Button.jsx
│       ├── ConfirmModal.jsx
│       ├── Input.jsx
│       ├── Modal.jsx
│       ├── Select.jsx
│       ├── StatLabel.jsx
│       └── Textarea.jsx
│
├── hooks/
│   ├── useGameState.js         # Lê livePitching do localStorage
│   ├── useGameActions.js       # Todas as ações de jogo
│   ├── usePlayers.js           # Filtragem/lookup de jogadores
│   ├── useDragPosition.js      # Drag & drop genérico
│   └── useFieldZoom.js         # Pinch-to-zoom no campo
│
├── services/
│   └── api.js                  # Local-first store + sync layer
│
├── utils/
│   ├── gameState.js            # INITIAL_STATE, computeInningTransition, etc.
│   ├── fieldGame.js            # applyHitToBases, makeLogEntry, etc.
│   ├── stats.js                # AVG, ERA, OBP, SLG, etc.
│   ├── player.js               # normalizePlayer, getPlayerId, etc.
│   └── number.js               # safeNumber, toFixed3
│
├── constants/
│   ├── stats.js                # EMPTY_HITTING, EMPTY_PITCHING, EMPTY_DEFENSE
│   ├── statColumns.js          # HITTER_COLS, DEFENSE_COLS
│   └── fieldGame.js            # DEFENSIVE_POSITIONS, PITCH_NAMES, HIT_LABELS
│
└── data/
    ├── positions.js            # VALID_POSITIONS
    └── defaultFieldPositions.js # Coordenadas padrão de cada posição
```

---

## App.jsx — Raiz da Aplicação

### Responsabilidades

1. **Roteamento**: Controla `page` state (`game | training | jogadores | stats | settings | admin`).
2. **gameState global**: Único source of truth do estado da partida.
3. **Player CRUD**: `handleAddPlayer`, `handleUpdatePlayer`, `handleDeletePlayer`.
4. **Jogo CRUD**: `handleDeleteGame`, `handleEndGame`, `openGameFromStats`.
5. **Pitch tracking**: `syncPitchToPitcher`, `handlePitchAction`.
6. **Stats refresh**: `statsRefreshKey` + `notifyStatsUpdated`.
7. **Auth**: Login, logout, role-based rendering.
8. **Sync**: `syncWithServer()` no mount, polling de ping a cada 30s.

### Estado Mantido em App.jsx

```js
const [auth, setAuth]                     // { token, teamId, teamName, email }
const [page, setPage]                     // aba atual
const [players, setPlayers]              // Player[] do time
const [gameState, setGameState]          // GameState completo
const [activeGame, setActiveGame]        // Game object atual
const [statsRefreshKey, setStatsRefreshKey]  // trigger de re-fetch de HUD
const [syncStatus, setSyncStatus]        // 'synced'|'syncing'|'offline'|'error'|'no-backend'
// + estados de UI: navCollapsed, activeTool, etc.
```

### Fluxo de Persistência de gameState

```
setGameState(updater)
  → React re-render
  → useEffect [gameState] → setTimeout(350ms) → localStorage.setItem
  → useEffect [activeGame, gameState] → setTimeout(250ms) → gamesApi.update(gameId, { gameState })
```

---

## FieldPage.jsx — Tela Principal do Jogo

### Sub-Views

| `gameSubView` | Exibe |
|---------------|-------|
| `'campo'` | Campo visual + Bench + Scoreboard flutuante |
| `'acoes'` | Painel de ações (botões de jogada, contagem, placar, lineups) |

Alternado pelo botão flutuante `game-subview-bar`.

### Responsabilidades

- Renderiza o campo (`Field.jsx`) e o banco (`Bench.jsx`).
- Delega todas as ações de jogo para `useGameActions`.
- Controla drag-and-drop de jogadores (field ↔ bench ↔ swap).
- Exibe `PreGameSetupModal` quando jogo não está configurado.
- Detecta e exibe side-switch banner (ATACANDO / DEFENDENDO).
- Mantém screen wake lock (`KeepAwake`) durante jogo ativo.
- Detecta walkoff e limite de innings → prompt de encerramento.

### Props Recebidas de App.jsx

| Prop | Tipo | Uso |
|------|------|-----|
| `players` | `Player[]` | Lista completa de jogadores |
| `gameState` | `GameState` | Estado atual da partida |
| `onUpdateGameState` | `fn` | Atualiza gameState |
| `onPitchAction` | `fn` | Strike/ball/foul (App.jsx gerencia sync pitcher) |
| `onDefensiveOut` | `fn` | Out defensivo → outsPitched +1 |
| `onDefensiveEarnedRun` | `fn` | Earned run → earnedRuns +1 |
| `statsRefreshKey` | `number` | Trigger de re-fetch do HUD |
| `onStatsUpdated` | `fn` | Dispara depois de qualquer write de stat |
| `activeGame` | `Game` | Objeto do jogo atual |
| `onEndGame` | `fn` | Encerrar partida |

---

## StatsPage.jsx — Estatísticas

### Responsabilidades

- Lista todos os jogos da temporada.
- Exibe stats acumuladas da temporada por jogador.
- Suporta navegação para `GameDetailPage` de um jogo específico.
- Permite deletar jogos (com confirmação).
- Tabs: **Hitters** / **Pitchers** / **Defesa**.
- Ordenação de colunas clicável.
- Filtro por jogador (dropdown).

### Estado Local

```js
const [games, setGames]           // Game[]
const [gameStats, setGameStats]   // GameStat[] do jogo sendo visualizado
const [seasonStats, setSeasonStats]  // Agregado de temporada
const [viewingGameId, setViewingGameId]  // Jogo sendo visualizado no detail
const [showGameDetail, setShowGameDetail]  // Toggle detail panel
const [statsTab, setStatsTab]     // 'hitters' | 'pitchers' (| 'defense')
const [colSort, setColSort]       // { col, dir: 'asc'|'desc' }
```

---

## JogadoresPage.jsx — Jogadores

### Responsabilidades

- CRUD de jogadores (adicionar, editar, deletar).
- Picker de lineup para configurar batting order e posições.
- Exibição de lista de jogadores com posições.

---

## TrainingField.jsx — Treino

### Responsabilidades

- Campo visual idêntico ao jogo mas sem lógica de pontuação.
- Ferramentas: mouse, caneta (desenho livre), pointer (laser).
- Posicionamento manual de corredores para visualização tática.
- Botão de limpar desenhos.

### Ferramentas

| Tool | Ação |
|------|------|
| `mouse` | Drag & drop de jogadores |
| `pen` | Desenho livre no canvas (vermelho) |
| `pointer` | Cursor laser (ponto vermelho animado) |

---

## GameDetailPage.jsx — Detalhe de Jogo

- Exibição detalhada de um jogo específico.
- Edição manual de stats (wins, losses, saves, pitching steps).
- Box score do jogo.
- Play-by-play (`gameLog`).
- Substituições registradas.
- Stats de rebatedores e arremessadores do jogo.

---

## Hooks

### `useGameActions.js`

Hook central de lógica de jogo. Recebe `gameState`, `onUpdateGameState`, `players`, etc.

**Expõe**:
```js
{
  undoStack, invalidFeedback,
  showInvalidAction, captureUndoSnapshot, upsertPlayerStat,
  handleUndo,
  handleDefensivePitch, handlePitcherSelect,
  applyPlateAppearance, applyDefensiveHit,
  applyAttackCountAction, applyDefensiveOutEvent,
  applyDoublePlayWithRunner, applySacFly, applyHBP,
  applyErrorEvent, applyWildPitch, applyDefensiveWalk,
}
```

### `useGameState.js`

Lê `livePitching` do localStorage para o HUD em tempo real.

```js
// Re-executa quando:
// - currentGameId muda
// - currentPitcherId muda
// - isAttacking muda
// - refreshKey incrementa (após write de stat)
const { livePitching, opponentName } = useGameState({ gameState, activeGame, refreshKey })
```

### `usePlayers.js`

Filtragem e lookup de jogadores.

```js
const {
  playersById,    // Map<id, Player> — lookup O(1)
  fieldPlayers,   // players em onFieldPlayerIds
  benchPlayers,   // players fora do campo (com search filter)
  setupAvailablePlayers,   // para o PreGameSetup
  playerPrefersPosition,   // verifica se player tem a posição em positions[]
  pitchersOnField,
} = usePlayers({ players, setPlayers, gameState })
```

### `useDragPosition.js`

Gerencia eventos `pointerdown/move/up` para drag & drop unificado.

```js
useDragPosition({
  dragRef,      // ref com descriptor do drag atual
  toFieldPoint, // fn: (clientX, clientY) → {x, y} em coordenadas do campo (0-100)
  activeTool,
  onMove: (drag, point, ev) => { ... },
  onEnd: (drag, point, ev) => { ... },
})
```

### `useFieldZoom.js`

Pinch-to-zoom e pan do campo em dispositivos móveis.

---

## Fluxo de Navegação

```mermaid
graph TD
    Login --> Stats[Stats (default)]
    Login --> Admin[Admin (role=admin)]
    Stats --> Game[Jogo]
    Stats --> Training[Treino]
    Stats --> Players[Jogadores]
    Stats --> Settings[Ajustes]
    Game --> PreGameSetup{preGameConfigured?}
    PreGameSetup -->|Não| Modal[PreGameSetupModal]
    PreGameSetup -->|Sim| Campo[Sub-view: Campo]
    PreGameSetup -->|Sim| Acoes[Sub-view: Ações]
    Stats --> GameDetail[GameDetailPage]
```

---

## Gerenciamento de Estado

### Hierarquia de Estado

```
App.jsx
├── auth (login state)
├── page (navegação)
├── players (Player[]) ← carregado do localStorage + sync
├── gameState (GameState) ← persistido em localStorage
├── activeGame (Game) ← carregado quando currentGameId muda
├── statsRefreshKey (trigger)
└── syncStatus

  FieldPage.jsx (recebe tudo via props)
  ├── gameSubView ('campo' | 'acoes')
  ├── strokes (canvas pen)
  ├── selectedId (jogador selecionado)
  ├── focusedPlayerId (modal de stats)
  ├── showPreGameSetup
  ├── runnerBasePopover
  ├── pendingSubstitution
  ├── pendingDoublePlaySelect
  └── [outros estados de UI]
```

### Padrão de Atualização

Toda atualização de `gameState` usa o padrão updater:
```js
onUpdateGameState((current) => ({
  ...current,
  field: newValue,
}))
```

Nunca mutação direta. O `updateGameState` em App.jsx é um wrapper de `setGameState`.

---

## Build e Deploy

### Desenvolvimento

```bash
cd frontend
npm run dev   # Vite dev server em http://localhost:5173
```

### Produção

```bash
npm run build   # Gera dist/
```

### Android (Capacitor)

```bash
npm run build
npx cap sync android
npx cap open android  # Abre Android Studio
```

### Configuração do Capacitor

```json
// capacitor.config.json
{
  "appId": "com.caaso.baseball",
  "appName": "InPlay",
  "webDir": "dist",
  "backgroundColor": "#09090f"
}
```

### Variáveis de Ambiente

```env
# frontend/.env
VITE_API_URL=https://api.inplay.com   # opcional — sem isso, funciona 100% offline
```

Se `VITE_API_URL` não está definido ou contém "YOUR_BACKEND", o `http` client é `null` e o app funciona completamente offline.

---

## Branding

| Elemento | Valor |
|----------|-------|
| Nome | InPlay |
| Tagline | Baseball Analytics |
| Cor primária | `#6366f1` (indigo) |
| Cor fundo | `#09090f` |
| Fonte | Inter (Google Fonts) |
| Logo | `/public/IP_Square.png` |
| App ID Android | `com.caaso.baseball` |
