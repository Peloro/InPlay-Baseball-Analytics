# Baseball App

Aplicação full-stack para acompanhar jogos de beisebol: campo interativo, gerenciamento de escalação e registro de estatísticas.

Principais recursos:
- Campo interativo com suporte a mouse e toque (drag + long-press)
- Cadastro e edição de jogadores
- Registro de estatísticas de jogo (batedores e arremessadores)
- Sincronização com API Express + MongoDB

Tecnologias
- Frontend: React + Vite
- Backend: Node.js + Express
- Banco: MongoDB (Atlas ou local)

Estrutura do repositório
- `frontend/` — código React (Vite)
- `backend/` — API Express + modelos Mongoose

Pré-requisitos
- Node.js v16+ (recomendado)
- npm ou yarn
- MongoDB Atlas ou instância local do MongoDB

Configuração rápida

1) Backend

```bash
cd backend
cp .env.example .env
# Edite backend/.env e defina MONGODB_URI
npm install
npm run dev
```

A API padrão roda em `http://localhost:4000`.

2) Frontend

```bash
cd frontend
cp .env.example .env
# (opcional) ajuste variáveis no frontend/.env
npm install
npm run dev
```

O frontend roda em `http://localhost:5173` (Vite).

Variáveis de ambiente
- `backend/.env`: `MONGODB_URI` — string de conexão do MongoDB.
- `frontend/.env`: variáveis de configuração do Vite (opcional).

Principais rotas da API (resumo)
- `GET /players` — lista jogadores
- `POST /players` — cria jogador
- `PUT /players/:id` — atualiza jogador
- `DELETE /players/:id` — remove jogador
- `GET /games`, `POST /games`, `PUT /games/:id` — endpoints de jogo
- `game-stats` — endpoints para criar/atualizar estatísticas por jogo

Observações de desenvolvimento
- O estado principal do jogo é mantido em `frontend/src/App.jsx` e sincronizado com a API quando um `game` está aberto.
- Posições, escalação e ordenação estão em `frontend/src/data` e `frontend/src/hooks`.

Contribuindo
- Abra uma issue para reportar bugs ou sugerir melhorias.
- Envie PRs com mudanças pequenas e documentadas.

Licença
- Projeto fornecido sem licença explícita — adicione uma licença se desejar compartilhar publicamente.
