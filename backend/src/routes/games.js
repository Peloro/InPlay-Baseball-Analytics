const express = require('express')
const mongoose = require('mongoose')
const Game = require('../models/Game')
const GameStat = require('../models/GameStat')

const router = express.Router()

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

  if (body.gameState && typeof body.gameState === 'object') {
    const state = body.gameState
    payload.gameState = {
      inning: Number(state.inning || 1),
      inningHalf: state.inningHalf === 'bottom' ? 'bottom' : 'top',
      outs: Number(state.outs || 0),
      balls: Number(state.balls || 0),
      strikes: Number(state.strikes || 0),
      pitchCount: Number(state.pitchCount || 0),
      homeScore: Number(state.homeScore || 0),
      awayScore: Number(state.awayScore || 0),
      isAttacking: typeof state.isAttacking === 'boolean' ? state.isAttacking : true,
      onFieldPlayerIds: Array.isArray(state.onFieldPlayerIds)
        ? state.onFieldPlayerIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [],
      participantPlayerIds: Array.isArray(state.participantPlayerIds)
        ? state.participantPlayerIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [],
      currentBatterIndex: Number(state.currentBatterIndex || 0),
      currentPitcherId: String(state.currentPitcherId || '').trim(),
      runners: {
        first: Boolean(state.runners?.first),
        second: Boolean(state.runners?.second),
        third: Boolean(state.runners?.third),
      },
      preGameConfigured: Boolean(state.preGameConfigured),
    }
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

router.post('/', async (req, res) => {
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
    const games = await Game.find().sort({ date: -1, competition: 1 })
    res.json(games)
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar jogos.' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const game = await Game.findById(req.params.id)
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

    const game = await Game.findByIdAndUpdate(req.params.id, update, {
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

    const deleted = await Game.findByIdAndDelete(id)
    if (!deleted) return res.status(404).json({ message: 'Jogo nao encontrado.' })

    await GameStat.deleteMany({ gameId: id })

    return res.status(204).send()
  } catch (error) {
    return res.status(500).json({ message: 'Erro ao apagar jogo.' })
  }
})

module.exports = router
