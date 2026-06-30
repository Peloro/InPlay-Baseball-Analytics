# Testes

---

## Status Atual

O projeto **não possui testes automatizados**. Não há arquivos de teste, configuração de Jest, Vitest, ou qualquer framework de testes.

---

## O que Testar (Prioritário)

Se/quando testes forem adicionados, as áreas mais críticas são:

### 1. `utils/stats.js` — Cálculos Estatísticos

Funções puras sem dependências externas. Mais fáceis de testar:

```js
// Exemplos de casos a cobrir:
formatIpFromOuts(9)   // → "3"
formatIpFromOuts(10)  // → "3.1"
formatIpFromOuts(11)  // → "3.2"
formatIpFromOuts(0)   // → "0"

formatEraFromOuts(9, 3)   // → "9.00" (3 ER em 3 IP)
formatEraFromOuts(27, 3)  // → "1.00" (3 ER em 9 IP)
formatEraFromOuts(0, 0)   // → "0.00" (sem lançamentos)

obpFromHitting({ hits:2, walks:1, hitByPitch:0, atBats:8, sacrificeFlies:1 })
// → (2+1+0)/(8+1+0+1) = 3/10 = 0.300
```

### 2. `utils/gameState.js` — Lógica de Inning

```js
computeInningTransition({ inning:3, inningHalf:'top', outs:2 }, 1)
// → { nextOuts:3, sideSwitch:true, nextHalf:'bottom', nextInning:3 }

computeInningTransition({ inning:3, inningHalf:'bottom', outs:2 }, 1)
// → { nextOuts:3, sideSwitch:true, nextHalf:'top', nextInning:4 }

computeInningTransition({ inning:3, inningHalf:'top', outs:1 }, 2)
// Double play: 2 outs → total 3 → side switch
```

### 3. `utils/fieldGame.js` — Mecânicas de Corredores

```js
// Single com corredor em 2ª:
applyHitToBases({ first:false, second:'p1', third:false }, 'single', 'batter')
// → { runners: { first:'batter', second:false, third:'p1' }, runs:0 }

// HR com bases cheias:
applyHitToBases({ first:'p1', second:'p2', third:'p3' }, 'homerun', 'batter')
// → { runners: { first:false, second:false, third:false }, runs:4 }

// Walk com bases cheias:
advanceOnWalk({ first:true, second:true, third:true })
// → { runners: { first:true, second:true, third:true }, runs:1 }
```

### 4. `services/api.js` — gameStatsApi.upsert

Requer mock de localStorage. Casos:
- Cria registro novo se não existe `(gameId, playerId)`.
- Atualiza registro existente pelo composite key.
- Não cria duplicata se chamar duas vezes com mesmo par.

### 5. Edge Cases Documentados

Os 20 casos em [02-specifications/edge-cases.md](../02-specifications/edge-cases.md) são candidatos diretos a testes de regressão.

---

## Setup Recomendado

Se adicionar testes, usar **Vitest** (já integra com Vite):

```bash
cd frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

```js
// vite.config.js — adicionar:
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
})
```

```js
// Exemplo de teste:
import { describe, it, expect } from 'vitest'
import { formatIpFromOuts } from '../utils/stats'

describe('formatIpFromOuts', () => {
  it('retorna innings completos sem decimal', () => {
    expect(formatIpFromOuts(9)).toBe('3')
  })
  it('retorna innings com out fracional', () => {
    expect(formatIpFromOuts(10)).toBe('3.1')
  })
})
```

---

## Testes de Integração

Para `api.js` com localStorage, usar `localStorage` mock do jsdom:

```js
import { gameStatsApi } from '../services/api'

beforeEach(() => localStorage.clear())

it('upsert cria registro novo', () => {
  gameStatsApi.upsert('game1', 'player1', { hitting: { hits: 1 } })
  const stats = gameStatsApi.listByGame('game1', 'player1').data
  expect(stats[0].hitting.hits).toBe(1)
})
```

---

## Testes de Snapshot UI

Para componentes como `CountDots`, `Scoreboard`:

```jsx
import { render } from '@testing-library/react'

it('CountDots renderiza 2 bolas', () => {
  const { container } = render(<CountDots balls={2} strikes={1} outs={0} />)
  // assertions
})
```

---

## Teste Manual (Processo Atual)

Na ausência de testes automatizados, o fluxo de validação manual é:

1. **Jogo completo**: Criar jogo, configurar lineup, jogar alguns innings, encerrar.
2. **Undo**: Verificar que desfazer restaura estado + stats.
3. **Offline**: Desligar conexão, fazer ações, reconectar, verificar sync.
4. **Substituição de pitcher**: Verificar que outsPitched acumula corretamente entre pitchers.
5. **Edge cases**: Foul com 2 strikes, grand slam walk, double play.
