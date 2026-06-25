const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const mongoose = require('mongoose')

dotenv.config()

const playersRouter = require('../src/routes/players')
const statsRouter = require('../src/routes/stats')
const gamesRouter = require('../src/routes/games')
const gameStatsRouter = require('../src/routes/gameStats')
const seasonStatsRouter = require('../src/routes/seasonStats')

const app = express()

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json())

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'baseball-api' })
})

app.use('/players', playersRouter)
app.use('/stats', statsRouter)
app.use('/games', gamesRouter)
app.use('/game-stats', gameStatsRouter)
app.use('/season-stats', seasonStatsRouter)

async function connectDB() {
  if (mongoose.connection.readyState === 1) return
  await mongoose.connect(process.env.MONGODB_URI)
}

module.exports = async (req, res) => {
  await connectDB()
  return app(req, res)
}
