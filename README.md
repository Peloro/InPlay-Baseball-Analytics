# Baseball App (React + Node + MongoDB Atlas)

Projeto full-stack com:
- Campo interativo (drag + long press)
- Sistema de estatisticas
- API Express integrada com MongoDB Atlas

## Estrutura

- `frontend/` React com Vite
- `backend/` Node.js + Express + Mongoose

## 1) Rodar o backend

```bash
cd backend
cp .env.example .env
# preencha MONGODB_URI no arquivo .env
npm install
npm run dev
```

API sobe em `http://localhost:4000`.

Rotas:
- `GET /players`
- `POST /players`
- `GET /stats`
- `PUT /stats`

## 2) Rodar o frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend sobe em `http://localhost:5173`.

## 3) Como conectar MongoDB Atlas

1. Crie um cluster no Atlas.
2. Em **Database Access**, crie usuario/senha.
3. Em **Network Access**, libere seu IP (ou `0.0.0.0/0` para teste).
4. Copie a connection string e cole em `backend/.env` no `MONGODB_URI`.

Exemplo:

```env
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/baseball_app?retryWrites=true&w=majority
```

## 4) Como funciona drag + long press

- Drag: os marcadores usam `Pointer Events` (`onPointerDown`, `onPointerMove`, `onPointerUp`) para funcionar com mouse e touch.
- Posicao: durante o arrasto, a posicao é convertida para percentual (`x`,`y`) dentro do campo.
- Long press: ao segurar por ~450ms, um timer abre tooltip com `nome` e `numero`; ao soltar, ela fecha.

## 5) Destaque e sincronizacao

- Jogador selecionado recebe estilo de destaque no campo.
- Estado de jogadores e stats fica em `App` e alimenta `FieldPage` e `StatsPage`.
- Atualizacao de stats reflete na tela imediatamente e tenta persistir no backend.
