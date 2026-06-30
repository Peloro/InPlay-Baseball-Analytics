# InPlay — Documentação Técnica

**Single Source of Truth** para desenvolvimento, manutenção e expansão do InPlay Baseball Analytics.

> Todo desenvolvedor (humano ou IA) deve conseguir entender, manter e expandir o projeto lendo apenas esta pasta `/docs`, sem precisar descobrir regras no código-fonte.

---

## O que é o InPlay?

InPlay é um app de analytics de beisebol para técnicos. Permite:

- Registrar partidas em tempo real (placar, contagem, corredores, eventos).
- Rastrear estatísticas individuais de rebatedores e arremessadores.
- Visualizar stats da temporada.
- Treinar táticas no campo visual.
- Exportar dados.

**Tecnologia**: React + Vite (frontend) / Express + MongoDB (backend) / Capacitor (APK Android).

**Design**: Local-first — funciona 100% offline. Backend é sync opcional.

**Branding**: InPlay, paleta indigo `#6366f1`, fundo `#09090f`.

---

## Estrutura da Documentação

```
docs/
├── README.md                          ← Este arquivo
│
├── 01-domain/                         ← Domínio e regras do beisebol
│   ├── glossary.md                    ← Termos, posições, tipos de pitch
│   ├── baseball-concepts.md           ← Como o jogo funciona
│   ├── rules-summary.md               ← Regras implementadas no app
│   └── scoring-summary.md             ← Quando e como pontos/stats são contados
│
├── 02-specifications/                 ← Especificações técnicas completas
│   ├── game-state.md                  ← Objeto GameState (todos os campos)
│   ├── game-events.md                 ← Todos os eventos e seus efeitos
│   ├── rules-engine.md                ← Motor de regras do jogo
│   ├── statistics.md                  ← Todas as fórmulas estatísticas
│   ├── validations.md                 ← Validações frontend + backend
│   └── edge-cases.md                  ← 20 casos de borda documentados
│
├── 03-architecture/                   ← Arquitetura técnica
│   ├── database.md                    ← localStorage + MongoDB schemas + ER diagram
│   ├── api.md                         ← Todos os endpoints REST
│   ├── frontend.md                    ← Pages, components, hooks, estrutura
│   ├── backend.md                     ← Express, modelos, middleware
│   ├── authentication.md              ← JWT, roles, ciclo de vida
│   ├── realtime.md                    ← statsRefreshKey, debounce, polling
│   └── state-management.md            ← gameState, undo, syncQueue
│
├── 04-features/                       ← Features do produto
│   ├── game-creation.md               ← Criar e retomar jogos
│   ├── live-scoring.md                ← Pontuação ao vivo (ações de jogo)
│   ├── teams.md                       ← Multi-tenant, billing, admin
│   ├── players.md                     ← CRUD de jogadores
│   ├── lineups.md                     ← Escalação, batting order, campo
│   ├── substitutions.md               ← Substituições durante o jogo
│   ├── statistics.md                  ← Registro e exibição de stats
│   └── analytics.md                   ← Relatórios e análises
│
└── 05-development/                    ← Guias para desenvolvedores
    ├── coding-standards.md            ← Padrões de código e convenções
    ├── architecture-decisions.md      ← ADRs — por que as decisões foram tomadas
    ├── testing.md                     ← Estratégia de testes
    ├── known-limitations.md           ← Limitações e bugs conhecidos
    └── future-improvements.md         ← Roadmap de melhorias
```

---

## Por Onde Começar

### Se você não conhece beisebol
→ Comece em [01-domain/baseball-concepts.md](01-domain/baseball-concepts.md) e [01-domain/glossary.md](01-domain/glossary.md).

### Se você quer entender o estado do jogo
→ Leia [02-specifications/game-state.md](02-specifications/game-state.md).

### Se você quer entender uma feature específica
→ Navegue por [04-features/](04-features/).

### Se você vai fazer uma mudança no código
→ Leia [05-development/coding-standards.md](05-development/coding-standards.md) e o ADR relevante em [05-development/architecture-decisions.md](05-development/architecture-decisions.md).

### Se você vai adicionar uma nova ação de jogo
→ Leia [02-specifications/game-events.md](02-specifications/game-events.md) e [04-features/live-scoring.md](04-features/live-scoring.md).

### Se você vai mexer em estatísticas
→ Leia [02-specifications/statistics.md](02-specifications/statistics.md) e [04-features/statistics.md](04-features/statistics.md).

### Se você vai mexer no backend ou sincronização
→ Leia [03-architecture/database.md](03-architecture/database.md), [03-architecture/api.md](03-architecture/api.md), e [03-architecture/state-management.md](03-architecture/state-management.md).

---

## Regras Críticas (Nunca Esquecer)

### 1. Upsert de GameStat

```js
// SEMPRE:
gameStatsApi.upsert(gameId, playerId, payload)

// NUNCA:
gameStatsApi.update(stat._id, payload)  // ← ID pode ser stale após sync
```

Ver [03-architecture/state-management.md](03-architecture/state-management.md#adrcm003) e [02-specifications/validations.md](02-specifications/validations.md).

### 2. IP Sempre de `outsPitched`

```js
// SEMPRE:
formatIpFromOuts(stat.pitching.outsPitched)

// NUNCA:
pitcher1.pitching.inningsPitched + pitcher2.pitching.inningsPitched  // ← float bug
```

Ver [05-development/architecture-decisions.md](05-development/architecture-decisions.md#adr-002).

### 3. Isolamento por Time

Toda query ao backend deve incluir `teamId: req.user.teamId`. Toda leitura de localStorage usa `lsKey(name)` que prefixe automaticamente com o `teamId`.

---

## Setup Rápido

### Desenvolvimento Frontend

```bash
cd frontend
npm install
cp .env.example .env   # configurar VITE_API_URL (opcional)
npm run dev            # http://localhost:5173
```

### Desenvolvimento Backend

```bash
cd backend
npm install
cp .env.example .env   # configurar MONGODB_URI e JWT_SECRET
npm run dev            # http://localhost:4000
```

### Build Android

```bash
cd frontend
npm run build
npx cap sync android
npx cap open android   # Abre Android Studio
```

---

## Estrutura do Repositório

```
baseball_app/
├── frontend/               # React + Vite + Capacitor
│   ├── src/
│   ├── android/            # Projeto Capacitor Android
│   ├── capacitor.config.json
│   └── package.json
├── backend/                # Express + MongoDB
│   ├── src/
│   └── package.json
└── docs/                   ← Você está aqui
```
