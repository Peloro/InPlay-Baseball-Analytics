# Decisões de Arquitetura

Registro das decisões técnicas significativas do projeto.

---

## ADR-001: Local-First com Sync Opcional

**Decisão**: Todos os dados vivem em `localStorage`. O backend é opcional e funciona como camada de sync.

**Contexto**: O app é usado em campos de beisebol onde a conectividade é irregular. Exigir internet para usar o app tornaria a experiência instável.

**Consequência**: 
- O app funciona do primeiro acesso sem criar conta.
- Dados sobrevivem a quedas de conexão.
- Sync é assíncrono e silencioso.
- Trade-off: maior complexidade na camada de dados (syncQueue, ID remapping).

---

## ADR-002: `outsPitched` como Source of Truth para IP

**Decisão**: IP (Innings Pitched) é sempre calculado a partir de `outsPitched`, nunca somando `inningsPitched` de múltiplos arremessadores.

**Contexto**: `inningsPitched` é representado como decimal fracionário (ex: `1.1`, `1.2`). Somar esses valores em JavaScript resulta em erros de ponto flutuante (ex: `1.1 + 0.2 = 1.2999...`). A representação correta seria `2.0`.

**Implementação**: `outsPitched` é um inteiro que conta outs individuais. `formatIpFromOuts(n)` converte: `outsPitched=10 → "3.1"` (3 innings + 1 out).

**Consequência**: `inningsPitched` existe nos modelos por compatibilidade mas **nunca deve ser somado** para calcular ERA ou IP total.

---

## ADR-003: Composite-Key Upsert para GameStat

**Decisão**: Writes de GameStat usam sempre `(gameId, playerId)` como chave, nunca `_id`.

**Contexto**: Ao criar um registro offline, ele recebe um ID local (`"abc123-xyz"`). Quando o servidor sincroniza, o ID é remapeado para um ObjectId MongoDB. Se código mantiver referência ao ID local e tentar fazer `PUT /game-stats/{localId}`, o servidor não encontrará o registro.

**Implementação**: `gameStatsApi.upsert(gameId, playerId, payload)` busca pelo par composite key tanto no localStorage quanto no backend.

**Consequência**: Mais robusto ao ciclo de vida offline→online. Nunca há risco de criar estatísticas duplicadas.

---

## ADR-004: Prop Drilling vs Context

**Decisão**: Usar prop drilling a partir de `App.jsx` em vez de React Context.

**Contexto**: O estado global do jogo (`gameState`, `players`, `statsRefreshKey`) é consumido principalmente por `FieldPage`, que é um componente de segundo nível. Context API adicionaria complexidade sem benefício claro.

**Consequência**: O componente `FieldPage` recebe muitas props (~15-20). Isso é explícito e rastreável. Qualquer mudança de prop é visível na assinatura da função.

---

## ADR-005: Capacitor para Android

**Decisão**: Usar Capacitor (Ionic) para empacotar o app React como APK Android.

**Contexto**: O time já conhecia React. Capacitor permite reutilizar o mesmo código com acesso a APIs nativas (Haptics, KeepAwake). Alternativas (React Native, Flutter) exigiriam reescrita.

**Consequência**:
- `capacitor://localhost` no CORS do backend.
- Plugins: `@capacitor/haptics`, `@capacitor-community/keep-awake`.
- Build: `npm run build && npx cap sync android`.

---

## ADR-006: Arquivo CSS Único (`App.css`)

**Decisão**: Todos os estilos em um único arquivo `App.css`.

**Contexto**: O projeto iniciou pequeno. CSS Modules por componente adicionaria overhead de configuração. Tailwind não foi adotado.

**Consequência**: `App.css` é grande. Novas classes devem seguir a convenção de nomenclatura `kebab-case` e ser adicionadas ao arquivo existente. CSS Modules podem ser adotados futuramente sem quebrar a arquitetura.

---

## ADR-007: Undo System com Snapshots Completos

**Decisão**: O sistema de undo salva snapshots completos de `gameState` + todos os `GameStat` do jogo.

**Contexto**: Ações de jogo modificam tanto o `gameState` (outs, placar, corredores) quanto as estatísticas em `localStorage`. Um undo parcial que só desfizesse o `gameState` deixaria as stats inconsistentes.

**Implementação**: `captureUndoSnapshot()` antes de cada ação salva `{ gameState: {...}, stats: GameStat[] }`. `handleUndo()` restaura ambos.

**Consequência**: Máximo de 80 snapshots. Cada snapshot é uma cópia completa (~5-50KB). Isso é aceitável para localStorage.

---

## ADR-008: `inningHalf` Convention

**Decisão**: `top` = adversário bate (`isAttacking = false`); `bottom` = nosso time bate (`isAttacking = true`).

**Contexto**: Convenção real do beisebol: a equipe visitante bate no `top` (começo), a equipe da casa no `bottom`. O app sempre trata nosso time como "casa".

**Consequência**: `homeScore` = nosso placar; `awayScore` = placar adversário. Exibido no box score com NÓS / ADV.

---

## ADR-009: `homeScore`/`awayScore` — Nosso Time é Sempre "Home"

**Decisão**: `homeScore` = nosso time, `awayScore` = adversário, independente de onde o jogo é disputado.

**Contexto**: O app não rastreia se somos o time mandante ou visitante. Para simplificar a lógica, nosso time é sempre "home" na representação interna.

**Consequência**: O box score exibe NÓS (home) e ADV (away). Se o time jogar como visitante real, a convenção visual ainda mostrará NÓS como "home". Isso é intencional — o usuário sempre vê o seu time primeiro.

---

## ADR-010: Polling de 30s para Status do Time

**Decisão**: Verificar a cada 30 segundos se o time continua ativo no backend.

**Contexto**: O admin pode bloquear um time que está usando o app ativamente. Sem polling, o usuário continuaria usando até a próxima ação que requer auth.

**Consequência**: Em ~30s após o bloqueio, o usuário é forçado a logout. O polling só roda quando `navigator.onLine` é `true`.
