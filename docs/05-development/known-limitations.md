# Limitações Conhecidas

Problemas, restrições e comportamentos intencionalmente não resolvidos.

---

## Dados

### 1. Campos de Stats Não Sincronizados com Backend

Os seguintes campos existem no frontend (localStorage) mas **não estão no schema do backend**:

| Campo | Tipo |
|-------|------|
| `hitting.doubles` | Hitting |
| `hitting.triples` | Hitting |
| `hitting.stolenBases` | Hitting |
| `hitting.hitByPitch` | Hitting |
| `hitting.sacrificeFlies` | Hitting |
| `hitting.caughtStealing` | Hitting |
| `pitching.wildPitches` | Pitching |
| `pitching.wins` | Pitching |
| `pitching.losses` | Pitching |
| `pitching.saves` | Pitching |
| `player.pitchCountLimit` | Player |
| `player.pitchRepertoire` | Player |

**Impacto**: Esses dados existem localmente mas são silenciosamente ignorados ao sincronizar com o backend. Se o backend for a fonte autoritativa (ex: após reinstalar o app), esses campos podem ser perdidos.

### 2. GameLog Não Persiste no Backend

`gameState.gameLog` (play-by-play) é salvo como parte de `gameState` no campo `Mixed` do banco. Mas se o `gameState` for muito grande, pode causar problemas no MongoDB (limite de documento de 16MB — improvável mas possível em jogos muito longos).

### 3. Sync Não Resolve Conflitos

Se o mesmo jogo for modificado em dois dispositivos offline simultaneamente, o último sync vence. Não há merge inteligente de conflitos.

---

## Funcionalidade

### 4. Sem Validação de "Jogador que Saiu Não Pode Voltar"

No beisebol real, um jogador que sai do jogo não pode voltar. O app **não implementa** essa regra. Qualquer jogador do banco pode entrar a qualquer momento.

### 5. Sem Limite de Substituições por Inning

Não há restrição de quantas substituições podem ocorrer em um único inning ou jogo.

### 6. Adversário Sem Jogadores Individuais

O tracking do adversário é limitado a:
- Placar por inning.
- Pitch count do pitcher adversário (apenas 1 número — não por pitcher individual).
- "Rebatedores adversários" genéricos (`ADV #1`, `ADV #2`, etc.) sem identidade real.

Não há como registrar o nome ou número dos jogadores adversários.

### 7. Sem Detecção Automática de W/L/S

O resultado do pitcher (Win/Loss/Save) **não é detectado automaticamente**. O treinador deve editar manualmente em `GameDetailPage`. O app sabe o placar final mas não implementa as regras de qual pitcher ganhou/perdeu.

### 8. Sem Stolen Base Automático

`stolenBases` só é incrementado se o corredor tem um `playerId` identificável em `gameState.runners` (ex: `runners.first = "player123"`). Se o corredor está como `true` (genérico), o SB não é creditado.

### 9. Sem Retroação de Inning

Não é possível voltar a um inning anterior para corrigir o placar. O undo pode desfazer ações recentes, mas não permite navegar para innings passados.

---

## Técnico

### 10. `App.css` Grande e Sem Módulos

Todos os estilos em um único arquivo. Sem CSS Modules, sem Tailwind. Risco de colisões de classe ao crescer.

### 11. Sem Testes Automatizados

Nenhum teste unitário, de integração, ou e2e. Regressões são detectadas manualmente.

### 12. localStorage Cheio

Se o localStorage atingir o limite (~5MB), escritas silenciosamente falham (erro capturado mas ignorado). Não há aviso ao usuário. Com muitos jogos e stats, isso pode acontecer em dispositivos com pouco armazenamento.

### 13. Sem Lazy Loading Completo

`FieldPage`, `TrainingField`, e `JogadoresPage` são lazy-loaded. Mas componentes dentro de `FieldPage` (que tem 2370 linhas) são todos carregados juntos.

### 14. Drag & Drop apenas Pointer Events

O sistema de drag usa `pointerdown/move/up`. Em navegadores/dispositivos que não suportam Pointer Events (raros hoje), o drag não funciona. `mouse` e `touch` events não são fallback.

### 15. Undo Stack Limitado a 80

Máximo 80 snapshots. Em jogos longos, o histórico de undo pode não cobrir ações de innings anteriores.

---

## Negócio/Produto

### 16. Billing Manual

O status de billing (`trial`/`paid`/`unpaid`) não está integrado com nenhum gateway de pagamento. O admin precisa atualizar manualmente após receber pagamento.

### 17. Sem Multi-Usuário por Time

Apenas um login por time. Não é possível ter múltiplos usuários (ex: assistente técnico + técnico principal) acessando o mesmo time.

### 18. Sem Notificações Push

Sem notificações para lembrar de continuar jogos ou avisar sobre atualizações.
