# Feature: Analytics e Relatórios

---

## Objetivo

Exibir análises e relatórios de desempenho para treinadores tomarem decisões baseadas em dados.

---

## Visões Disponíveis

### 1. Stats por Jogo (GameDetailPage)

Estatísticas de cada jogador em um jogo específico:

- **Box Score**: Placar por inning (`inningScores`).
- **Rebatedores**: Tabela com AB, H, R, RBI, HR, etc.
- **Arremessadores**: Tabela com IP, PC, ER, K, BB, WHIP, ERA.
- **Defesa**: Erros, double plays por posição.
- **Substituições**: Lista de trocas registradas.
- **Play-by-Play**: `gameLog` com cada evento da partida.

### 2. Stats da Temporada (StatsPage)

Agregação de todos os jogos finalizados:

| Tab | O que exibe |
|-----|-------------|
| Hitters | Todas as stats de rebatidas acumuladas |
| Pitchers | Stats de arremesso acumuladas + ERA da temporada |
| Defesa | Erros acumulados + double plays |

### 3. HUD ao Vivo (FieldPage)

Durante o jogo defensivo, o HUD exibe:

```
[Arremessador] #N  |  PC: 45  |  IP: 3.1  |  ERA: 2.25
```

Atualizado a cada pitch via `statsRefreshKey`.

---

## Cálculos de Stats Avançadas

### Hitting

| Stat | Cálculo | Significado |
|------|---------|-------------|
| AVG | H / AB | Média de rebatidas |
| OBP | (H + BB + HBP) / (AB + BB + HBP + SAC) | On-base percentage |
| SLG | (1B + 2×2B + 3×3B + 4×HR) / AB | Slugging percentage |
| OPS | OBP + SLG | On-base plus slugging |

### Pitching

| Stat | Cálculo | Significado |
|------|---------|-------------|
| IP | outsPitched / 3 | Innings arremessados |
| ERA | (ER × 27) / outsPitched | Earned run average |
| WHIP | (BB + H) / (outsPitched / 3) | Walks + hits per inning |
| K/9 | (K × 27) / outsPitched | Strikeouts por 9 innings |

---

## Agregação da Temporada

`seasonStatsApi.list()` computa localmente no frontend:

```js
// Para cada jogador único em gameStats:
// 1. Filtra todas as GameStat do jogador
// 2. Soma todos os campos numéricos
// 3. Calcula stats derivadas (AVG, ERA, etc.) sobre o total

// ERA da temporada = (totalER × 27) / totalOutsPitched
// (não soma ERAs por jogo)
```

**Por que localmente?** O backend tem `/season-stats` mas o frontend migrou para cálculo local-first para funcionar offline.

---

## Filtros e Ordenação

Em StatsPage:

- **Filtro por jogador**: dropdown filtra uma linha específica.
- **Ordenação por coluna**: clique no header da coluna alterna `asc`/`desc`.

```js
const [colSort, setColSort] = useState({ col: 'AB', dir: 'desc' })

const sorted = [...stats].sort((a, b) => {
  const va = a[colSort.col] ?? 0
  const vb = b[colSort.col] ?? 0
  return colSort.dir === 'desc' ? vb - va : va - vb
})
```

---

## Exportação

`GET /export` no backend oferece exportação de dados. O formato exato (CSV/JSON) está implementado em `backend/src/routes/export.js`.

A exportação é escopada por `teamId` — cada time exporta apenas seus próprios dados.

---

## Análise de Tipos de Pitch

O `pitchTypes` do arremessador registra contagens por tipo:

```js
pitchTypes: {
  FB: 28,   // Fastball
  CV: 12,   // Curveball
  SL: 8,    // Slider
  CH: 5,    // Changeup
  SI: 3,    // Sinker
  CT: 4,    // Cutter
  other: 2,
}
```

Permite análise de mix de arremessos por pitcher. Exibido no detalhamento do jogo.

---

## Pitch Count por Arremessador

`gameState.pitchCounts` é um mapa de `pitcherId → count`:

```js
pitchCounts: {
  "player_abc": 45,
  "player_def": 23,
}
```

Permite visualizar total de pitches de cada arremessador que entrou no jogo, mesmo após substituições.

`opponentPitchCount` rastreia o total de pitches do pitcher adversário (não identificado individualmente).

---

## Limitações Atuais

1. **Sem gráficos**: Não há visualizações gráficas — apenas tabelas.
2. **Sem comparação histórica**: Não é possível comparar desempenho entre temporadas.
3. **Sem exportação de CSV no frontend**: Exportação é apenas via endpoint do backend.
4. **Sem análise de adversários**: Não há tracking de stats do time adversário além do placar.
5. **Stats calculadas no frontend**: A agregação de temporada pode divergir do backend em casos de sync parcial.
