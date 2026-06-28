const express = require('express')
const mongoose = require('mongoose')
const { body } = require('express-validator')
const Game = require('../models/Game')
const GameStat = require('../models/GameStat')
const validate = require('../middleware/validate')

const router = express.Router()

const gameCreateRules = [
  body('date').notEmpty().withMessage('date obrigatorio.'),
  body('competition').trim().isLength({ min: 1 }).withMessage('competition obrigatorio.'),
]

function sanitizeSetupPayload(body = {}) {
  const payload = {}

  if (typeof body.isAttacking === 'boolean') {
    payload.isAttacking = body.isAttacking
  }

  if (Array.isArray(body.battingOrder)) {
    payload.battingOrder = body.battingOrder.map((id) => String(id || '').trim()).filter(Boolean)
  }

  if (Array.isArray(body.lineup)) {
    payload.lineup = body.lineup
      .map((item) => ({
        playerId: String(item?.playerId || '').trim(),
        position: String(item?.position || '').trim().toUpperCase(),
      }))
      .filter((item) => item.playerId && item.position)
  }

  if (Array.isArray(body.bench)) {
    payload.bench = body.bench.map((id) => String(id || '').trim()).filter(Boolean)
  }

  if (body.gameState && typeof body.gameState === 'object' && !Array.isArray(body.gameState)) {
    payload.gameState = body.gameState
  }

  if (typeof body.isFinished === 'boolean') {
    payload.isFinished = body.isFinished
  }

  if (body.finishedAt) {
    const date = new Date(body.finishedAt)
    if (!Number.isNaN(date.getTime())) payload.finishedAt = date
  }

  return payload
}

router.post('/', gameCreateRules, validate, async (req, res) => {
  try {
    const { date, opponent, opponentName, competition, location = '' } = req.body
    const setup = sanitizeSetupPayload(req.body)
    const safeOpponentName = String(opponentName || opponent || '').trim()

    if (!date || !safeOpponentName || !competition) {
      return res
        .status(400)
        .json({ message: 'date, opponent e competition sao obrigatorios.' })
    }

    const game = await Game.create({
      teamId: req.user.teamId,
      gameId: undefined,
      date: new Date(date),
      opponent: safeOpponentName,
      opponentName: safeOpponentName,
      competition: String(competition).trim(),
      location: String(location || '').trim(),
      ...setup,
    })

    res.status(201).json(game)
  } catch (error) {
    res.status(500).json({ message: 'Erro ao criar jogo.' })
  }
})

router.get('/', async (req, res) => {
  try {
    const games = await Game.find({ teamId: req.user.teamId }).sort({ date: -1, competition: 1 })
    res.json(games)
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar jogos.' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const game = await Game.findOne({ _id: req.params.id, teamId: req.user.teamId })
    if (!game) return res.status(404).json({ message: 'Jogo nao encontrado.' })
    res.json(game)
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar jogo.' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const setup = sanitizeSetupPayload(req.body)
    const update = {}

    if (req.body.date) update.date = new Date(req.body.date)
    const nextOpponent = String(req.body.opponentName || req.body.opponent || '').trim()
    if (nextOpponent) {
      update.opponent = nextOpponent
      update.opponentName = nextOpponent
    }
    if (req.body.competition) update.competition = String(req.body.competition).trim()
    if (typeof req.body.location !== 'undefined') update.location = String(req.body.location || '').trim()
    if (typeof req.body.gameId !== 'undefined') update.gameId = String(req.body.gameId || '').trim()

    Object.assign(update, setup)

    const game = await Game.findOneAndUpdate({ _id: req.params.id, teamId: req.user.teamId }, update, {
      returnDocument: 'after',
      runValidators: true,
    })

    if (!game) return res.status(404).json({ message: 'Jogo nao encontrado.' })
    res.json(game)
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar jogo.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id invalido.' })
    }

    const deleted = await Game.findOneAndDelete({ _id: id, teamId: req.user.teamId })
    if (!deleted) return res.status(404).json({ message: 'Jogo nao encontrado.' })

    await GameStat.deleteMany({ gameId: id, teamId: req.user.teamId })

    return res.status(204).send()
  } catch (error) {
    return res.status(500).json({ message: 'Erro ao apagar jogo.' })
  }
})

module.exports = router
