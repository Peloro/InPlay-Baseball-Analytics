const express = require('express')
const Player = require('../models/Player')
const Game = require('../models/Game')
const GameStat = require('../models/GameStat')

const router = express.Router()

router.get('/team', async (req, res) => {
  try {
    const { teamId } = req.user
    const [players, games, gameStats] = await Promise.all([
      Player.find({ teamId }).sort({ number: 1 }),
      Game.find({ teamId }).sort({ date: -1 }),
      GameStat.find({ teamId }),
    ])
    res.json({ exportedAt: new Date().toISOString(), teamId, players, games, gameStats })
  } catch (error) {
    res.status(500).json({ message: 'Erro ao exportar dados.' })
  }
})

module.exports = router
