const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const mongoose = require('mongoose')

const playersRouter = require('./routes/players')
const statsRouter = require('./routes/stats')
const gamesRouter = require('./routes/games')
const gameStatsRouter = require('./routes/gameStats')
const seasonStatsRouter = require('./routes/seasonStats')

dotenv.config()

const app = express()
const port = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'baseball-api' })
})

app.use('/players', playersRouter)
app.use('/stats', statsRouter)
app.use('/games', gamesRouter)
app.use('/game-stats', gameStatsRouter)
app.use('/season-stats', seasonStatsRouter)

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log("ENV NO RENDER:", process.env.MONGODB_URI);
    app.listen(port, () => {
      console.log(`API running on http://localhost:${port}`)
    })
  } catch (error) {
    console.error('Erro ao conectar no MongoDB:', error.message)
    process.exit(1)
  }
}

startServer()
