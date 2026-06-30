# Resumo das Regras Implementadas

Todas as regras de beisebol efetivamente implementadas no InPlay, organizadas por categoria.

---

## Regras de Count (Contagem)

### Strike
- Incrementa `strikes`.
- Se `strikes >= 3`: **strikeout** (eliminação). Incrementa `outs`. Reset count.
- Foul nunca causa strikeout: `strikes = min(2, strikes + 1)`.
- Foul só conta como strike se `strikes < 2`.

### Ball
- Incrementa `balls`.
- Se `balls >= 4`: **walk** (base por bolas). Reset count. Rebatedor vai para 1ª.

### Reset de Count
- Após qualquer at-bat completo (strikeout, walk, hit, out, HBP, sac fly, erro).

---

## Regras de Outs

- Cada half-inning começa com `outs = 0`.
- 3 outs → side switch (mudança de lado).
- Formas de out: strikeout, ground out, fly out, line out, runner eliminado em base.
- Double play: 2 outs simultâneos.

---

## Regras de Corredores

### Força em Walk/HBP
Quando bases 1ª e 2ª estão ocupadas e bater vai para 1ª:
- Corredor de 1ª força para 2ª.
- Corredor de 2ª força para 3ª.
- Se 3ª também estava ocupada: corredor de 3ª **marca** (earned run).

### Avanço em Hit
- Single: todos os corredores avançam 1 base; bater na 1ª.
- Double: todos avançam 2 bases; bater na 2ª.
- Triple: todos avançam 3 bases; bater na 3ª.
- Home Run: todos marcam; bater também marca.

### Stolen Base
- Implementado via `advanceRunner(base)`.
- Credita `stolenBases` ao corredor identificado pelo `playerId` no slot da base.
- Se corredor avança da 3ª para home: marca ponto e credita `earnedRun` ao arremessador adversário.

### Wild Pitch
- Todos os corredores avançam 1 base.
- Pontos marcados **são earned runs**.

### Erro Defensivo
- Bater vai para 1ª base.
- Outros corredores avançam 1 base.
- Pontos marcados **não são earned runs** (não incrementa `earnedRuns` do pitcher).

---

## Regras de Sacrifice Fly

Pré-condição: corredor na 3ª base (`runners.third = true/truthy`).

1. Bater é eliminado (out + 1).
2. Corredor da 3ª marca (run + 1).
3. **Não** conta como AB para o rebatedor.
4. Credita `sacrificeFlies + 1` e `rbi + 1` ao rebatedor.
5. Earned run para o arremessador adversário.

---

## Regras de Double Play

Pré-condição: pelo menos 1 corredor em base.

1. 2 outs são adicionados simultaneamente.
2. Corredor especificado é eliminado (base fica vazia).
3. `computeInningTransition(state, 2)` trata o caso de outs ≥ 3.
4. Credita `doublePlays` aos defensores identificados.

---

## Regras de Avanço de Inning

```
Se outs >= 3:
  outs = 0
  isAttacking = !isAttacking
  se inningHalf === 'bottom': inning += 1
  inningHalf = (top → bottom) | (bottom → top)
  runners = { first: false, second: false, third: false }
```

---

## Regras de Fim de Jogo

### Manual
- Treinador pressiona "Encerrar Jogo" no painel de ações.

### Automático — Limite de Innings
- Se `maxInnings > 0` e `inning > maxInnings`.
- Exibe prompt "Limite de X innings atingido. Encerrar?"

### Automático — Walkoff
- Se `inning >= maxInnings` e `inningHalf === 'bottom'` e `isAttacking = true` e `homeScore > awayScore`.
- Exibe prompt "Walk-off! Nosso time venceu! Encerrar?"

---

## Regras de Arremessador

### Seleção Automática
- Quando `isAttacking = false`, o app busca o jogador com `activePosition = 'P'` no campo.
- Se o arremessador atual não está mais em campo, seleciona o próximo pitcher disponível.
- Se `isAttacking = true`, limpa `currentPitcherId`.

### Troca de Arremessador
- Via seletor no painel de ações (modo defensivo).
- Se o pitcher novo não está em campo: cria substituição, atualiza lineup e bench.
- `pitchCounts[newPitcherId]` é inicializado com 0 se ainda não existe.

### Limite de Arremessos
- Campo `pitchCountLimit` no player.
- **Exibido** no painel, mas **não bloqueia** automaticamente o uso.

---

## Regras de Validação em Tempo Real

| Situação | Comportamento |
|----------|---------------|
| Arremessar sem pitcher selecionado | Mensagem `invalidFeedback`, ação bloqueada |
| Arremessar com menos de 9 em campo | Mensagem de feedback, ação bloqueada |
| Double play sem corredor em base | Mensagem `"Double play exige corredor em base"` |
| Sac Fly sem corredor na 3ª | Mensagem `"Nenhum corredor na terceira base para sac fly"` |
| Clique rápido duplo (debounce) | `isProcessingRef.current` bloqueia 700ms entre ações |

---

## Regras de Escalação

- Titular: exatamente 9 jogadores com posição (`lineup: [{playerId, position}]`).
- Banco: todos os outros jogadores participantes.
- Um jogador só pode ocupar uma posição por vez (conflito de posição é resolvido automaticamente).
- DH (Designated Hitter) não aparece como marcador no campo.

---

## Regras de Substituição

- Qualquer jogador do banco pode entrar por qualquer jogador em campo.
- Posição é inferida automaticamente (evita duplicatas de posição).
- Se o pitcher saiu: `currentPitcherId` é atualizado para o novo pitcher (se o entrante for P) ou anulado.
- Registro imutável: cada substituição fica no array `substitutions` e no `gameLog`.
