const express = require('express')
const mongoose = require('mongoose')
const Stat = require('../models/Stat')

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const stats = await Stat.find().sort({ updatedAt: -1 })
    res.json(stats)
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar estatisticas.' })
  }
})

router.put('/', async (req, res) => {
  try {
    const { playerId, atBats = 0, hits = 0, strikeouts = 0 } = req.body

    if (!playerId || !mongoose.Types.ObjectId.isValid(playerId)) {
      return res.status(400).json({ message: 'playerId invalido.' })
    }

    const stat = await Stat.findOneAndUpdate(
      { playerId },
      {
        playerId,
        atBats: Number(atBats),
        hits: Number(hits),
        strikeouts: Number(strikeouts),
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    )

    res.json(stat)
  } catch (error) {
    res.status(500).json({ message: 'Erro ao salvar estatisticas.' })
  }
})

module.exports = router
