# Melhorias Futuras

Oportunidades de melhoria identificadas a partir do código e das limitações conhecidas. Ordenadas aproximadamente por impacto/viabilidade.

---

## Alta Prioridade

### 1. Adicionar Campos de Stats ao Schema do Backend

Sincronizar os campos que existem apenas no frontend:

```js
// backend/src/models/GameStat.js — adicionar:
hitting: {
  // campos existentes...
  doubles: { type: Number, default: 0 },
  triples: { type: Number, default: 0 },
  stolenBases: { type: Number, default: 0 },
  hitByPitch: { type: Number, default: 0 },
  sacrificeFlies: { type: Number, default: 0 },
  caughtStealing: { type: Number, default: 0 },
},
pitching: {
  // campos existentes...
  wildPitches: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  saves: { type: Number, default: 0 },
}
```

```js
// backend/src/models/Player.js — adicionar:
pitchCountLimit: { type: Number, default: null },
pitchRepertoire: { type: [String], default: [] },
```

**Impacto**: Preservação completa de dados após reinstalação do app.

---

### 2. Testes Automatizados

Adicionar Vitest para funções puras:
- `utils/stats.js` (cálculos estatísticos)
- `utils/gameState.js` (computeInningTransition)
- `utils/fieldGame.js` (applyHitToBases, advanceOnWalk)
- `services/api.js` (gameStatsApi.upsert)

Ver [testing.md](testing.md) para setup detalhado.

---

### 3. Aviso de Quota Excedida no localStorage

```js
// Melhorar o catch de QuotaExceededError:
try {
  localStorage.setItem(key, JSON.stringify(data))
} catch (e) {
  if (e.name === 'QuotaExceededError') {
    // Exibir toast: "Armazenamento local cheio — dados não salvos"
    showToast('Armazenamento cheio. Considere exportar e limpar jogos antigos.')
  }
}
```

---

### 4. Detecção Automática de W/L/S

Ao encerrar o jogo, detectar automaticamente qual pitcher ganhou/perdeu baseado nas regras oficiais do beisebol:

- **Win**: Pitcher que estava arremessando quando o time passou a liderar (e manteve).
- **Loss**: Pitcher que cedeu a vantagem decisiva.
- **Save**: Pitcher que entrou em vantagem e terminou o jogo em certas condições.

---

## Média Prioridade

### 5. Múltiplos Usuários por Time

Adicionar suporte a múltiplos logins por `teamId`:

```js
// backend/src/models/User.js
// Remover unicidade de email global → unicidade por teamId
```

Permitiria assistente técnico + técnico principal acessar o mesmo time.

---

### 6. Exportação CSV no Frontend

Botão "Exportar CSV" em StatsPage que gera e baixa um arquivo CSV dos stats atuais sem precisar acessar o backend.

```js
function exportCSV(stats, columns) {
  const rows = stats.map(s => columns.map(c => s[c.key] ?? '')).join('\n')
  const blob = new Blob([header + '\n' + rows], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  // trigger download...
}
```

---

### 7. Gráficos de Tendência

Adicionar visualizações gráficas simples (ex: Chart.js ou Recharts):

- AVG ao longo da temporada por jogador.
- ERA por jogo para arremessadores.
- Distribuição de tipos de pitch.

---

### 8. Validação de "Jogador não Pode Voltar"

Manter lista de `ejectedPlayers` no `gameState` e bloquear reentrada:

```js
gameState.ejectedPlayerIds: string[]

// Em executeSubstitution:
if (gameState.ejectedPlayerIds.includes(incomingId)) {
  showInvalidAction("Jogador não pode retornar ao jogo")
  return
}
```

---

### 9. Jogadores do Adversário

Permitir cadastrar o lineup do adversário antes do jogo para tracking mais detalhado de stats do time oposto.

---

### 10. TypeScript

Migrar o frontend para TypeScript. As interfaces TypeScript já estão documentadas neste `/docs`. A migração seria incremental — Vite suporta TypeScript nativo.

---

## Baixa Prioridade

### 11. CSS Modules por Componente

Migrar de `App.css` único para CSS Modules em cada componente. Prevenção de colisões de classe e melhor manutenibilidade.

---

### 12. Integração com Gateway de Pagamento

Integrar Stripe ou similar para automatizar o billing:
- Webhook de pagamento → atualiza `billingStatus`.
- Email automático de cobrança.
- Trial com prazo definido.

---

### 13. Notificações Push (Android)

Usar `@capacitor/push-notifications` para:
- Lembrar de continuar um jogo não finalizado.
- Notificar sobre aprovação de conta.

---

### 14. Sync em Tempo Real (Multi-Dispositivo)

Substituir o modelo de sync por requisição por WebSocket para sincronização em tempo real entre dois dispositivos no mesmo jogo. Relevante para cenários com tablet de acompanhamento + celular do treinador.

---

### 15. Offline Support para iOS (PWA)

Capacitor suporta iOS, mas o projeto só tem `@capacitor/android`. Adicionar suporte iOS ou publicar como PWA instalável.

---

### 16. Histórico Retroativo de Innings

Interface para editar manualmente o placar de innings anteriores, útil quando há erro de registro durante o jogo.

---

### 17. Relatórios PDF

Gerar PDF de relatório do jogo para impressão ou compartilhamento, usando bibliotecas como `jspdf` ou `html2canvas`.
