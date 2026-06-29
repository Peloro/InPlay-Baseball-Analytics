const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const mongoose = require('mongoose')

const authRouter = require('./routes/auth')
const playersRouter = require('./routes/players')
const statsRouter = require('./routes/stats')
const gamesRouter = require('./routes/games')
const gameStatsRouter = require('./routes/gameStats')
const seasonStatsRouter = require('./routes/seasonStats')
const exportRouter = require('./routes/export')
const adminRouter = require('./routes/admin')
const authMiddleware = require('./middleware/auth')
const adminOnly = require('./middleware/adminOnly')

dotenv.config()

const app = express()
const port = process.env.PORT || 4000

app.set('trust proxy', 1)

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'https://localhost', 'capacitor://localhost', 'http://localhost']
  : true

app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '100kb' }))

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'baseball-api' })
})

app.use('/auth', authRouter)
app.get('/auth/ping', authMiddleware, (req, res) => res.json({ ok: true }))

app.use('/players', authMiddleware, playersRouter)
app.use('/stats', authMiddleware, statsRouter)
app.use('/games', authMiddleware, gamesRouter)
app.use('/game-stats', authMiddleware, gameStatsRouter)
app.use('/season-stats', authMiddleware, seasonStatsRouter)
app.use('/export', authMiddleware, exportRouter)
app.use('/admin', authMiddleware, adminOnly, adminRouter)

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    app.listen(port, () => {
      console.log(`API running on http://localhost:${port}`)
    })
  } catch (error) {
    console.error('Erro ao conectar no MongoDB:', error.message)
    process.exit(1)
  }
}

startServer()
