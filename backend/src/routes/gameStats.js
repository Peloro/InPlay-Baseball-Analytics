const express = require('express')
const mongoose = require('mongoose')
const { body } = require('express-validator')
const GameStat = require('../models/GameStat')
const Player = require('../models/Player')
const validate = require('../middleware/validate')

const router = express.Router()

const gameStatRules = [
  body('gameId').isMongoId().withMessage('gameId invalido.'),
  body('playerId').isMongoId().withMessage('playerId invalido.'),
]

const EMPTY_STATS = {
  hitting: { atBats: 0, hits: 0, strikeouts: 0, outs: 0, walks: 0, runs: 0, rbi: 0, homeRuns: 0 },
  pitching: {
    inningsPitched: 0,
    outsPitched: 0,
    earnedRuns: 0,
    strikeouts: 0,
    walks: 0,
    strikes: 0,
    balls: 0,
    pitchCount: 0,
    hitsAllowed: 0,
    pitchTypes: { FB: 0, CV: 0, SL: 0, CH: 0, SI: 0, CT: 0, other: 0 },
  },
  defense: { errors: 0, doublePlays: 0, flyOuts: 0, groundOuts: 0, lineOuts: 0 },
}

function toSafeStatValue(value) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function mergeStatPayload(body = {}, current = EMPTY_STATS) {
  const hitting = {
    atBats:     toSafeStatValue(body.hitting?.atBats     ?? body.atBats     ?? current.hitting.atBats),
    hits:       toSafeStatValue(body.hitting?.hits       ?? body.hits       ?? current.hitting.hits),
    strikeouts: toSafeStatValue(body.hitting?.strikeouts ?? body.strikeouts ?? current.hitting.strikeouts),
    outs:       toSafeStatValue(body.hitting?.outs       ?? body.outs       ?? current.hitting.outs),
    walks:      toSafeStatValue(body.hitting?.walks      ?? current.hitting.walks),
    runs:       toSafeStatValue(body.hitting?.runs       ?? current.hitting.runs),
    rbi:        toSafeStatValue(body.hitting?.rbi        ?? current.hitting.rbi),
    homeRuns:   toSafeStatValue(body.hitting?.homeRuns   ?? current.hitting.homeRuns),
  }

  const curPitchTypes = current.pitching?.pitchTypes || {}
  const bodyPitchTypes = body.pitching?.pitchTypes || {}
  const pitchTypes = {
    FB:    toSafeStatValue(bodyPitchTypes.FB    ?? curPitchTypes.FB),
    CV:    toSafeStatValue(bodyPitchTypes.CV    ?? curPitchTypes.CV),
    SL:    toSafeStatValue(bodyPitchTypes.SL    ?? curPitchTypes.SL),
    CH:    toSafeStatValue(bodyPitchTypes.CH    ?? curPitchTypes.CH),
    SI:    toSafeStatValue(bodyPitchTypes.SI    ?? curPitchTypes.SI),
    CT:    toSafeStatValue(bodyPitchTypes.CT    ?? curPitchTypes.CT),
    other: toSafeStatValue(bodyPitchTypes.other ?? curPitchTypes.other),
  }

  const pitching = {
    inningsPitched: toSafeStatValue(body.pitching?.inningsPitched ?? current.pitching.inningsPitched),
    outsPitched:    toSafeStatValue(body.pitching?.outsPitched    ?? current.pitching.outsPitched),
    earnedRuns:     toSafeStatValue(body.pitching?.earnedRuns     ?? current.pitching.earnedRuns),
    strikeouts:     toSafeStatValue(body.pitching?.strikeouts     ?? current.pitching.strikeouts),
    walks:          toSafeStatValue(body.pitching?.walks          ?? current.pitching.walks),
    strikes:        toSafeStatValue(body.pitching?.strikes        ?? current.pitching.strikes),
    balls:          toSafeStatValue(body.pitching?.balls          ?? current.pitching.balls),
    pitchCount:     toSafeStatValue(body.pitching?.pitchCount     ?? current.pitching.pitchCount),
    hitsAllowed:    toSafeStatValue(body.pitching?.hitsAllowed    ?? current.pitching.hitsAllowed),
    pitchTypes,
  }

  // Keep pitchCount coherent with pitch-by-pitch counters.
  pitching.pitchCount = Math.max(pitching.pitchCount, pitching.strikes + pitching.balls)

  const defense = {
    errors: toSafeStatValue(body.defense?.errors ?? current.defense.errors),
    doublePlays: toSafeStatValue(body.defense?.doublePlays ?? current.defense.doublePlays),
    flyOuts: toSafeStatValue(body.defense?.flyOuts ?? current.defense.flyOuts),
    groundOuts: toSafeStatValue(body.defense?.groundOuts ?? current.defense.groundOuts),
    lineOuts: toSafeStatValue(body.defense?.lineOuts ?? current.defense.lineOuts),
  }

  return { hitting, pitching, defense }
}

router.get('/', async (req, res) => {
  try {
    const stats = await GameStat.find({ teamId: req.user.teamId }).sort({ updatedAt: -1 })
    res.json(stats)
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar estatisticas.' })
  }
})

router.post('/', gameStatRules, validate, async (req, res) => {
  try {
    const { gameId, playerId } = req.body

    if (!mongoose.Types.ObjectId.isValid(gameId) || !mongoose.Types.ObjectId.isValid(playerId)) {
      return res.status(400).json({ message: 'gameId e playerId validos sao obrigatorios.' })
    }

    const player = await Player.findOne({ _id: playerId, teamId: req.user.teamId }).select('positions position')
    if (!player) {
      return res.status(404).json({ message: 'Jogador nao encontrado.' })
    }
    const playerPositions = Array.isArray(player.positions)
      ? player.positions
      : player.position
        ? [player.position]
        : []
    const detectedType = playerPositions.includes('P') ? 'pitcher' : 'hitter'

    const merged = mergeStatPayload(req.body, EMPTY_STATS)

    const update = {
      $set: {
        teamId: req.user.teamId,
        gameId,
        playerId,
        type: detectedType,
        hitting: merged.hitting,
        pitching: merged.pitching,
        defense: merged.defense,
      },
    }

    const stat = await GameStat.findOneAndUpdate(
      { gameId, playerId, teamId: req.user.teamId },
      update,
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    )

    res.status(201).json(stat)
  } catch (error) {
    res.status(500).json({ message: 'Erro ao criar estatistica do jogo.' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id invalido.' })
    }

    const existing = await GameStat.findOne({ _id: id, teamId: req.user.teamId })
    if (!existing) {
      return res.status(404).json({ message: 'Estatistica nao encontrada.' })
    }

    const player = await Player.findOne({ _id: existing.playerId, teamId: req.user.teamId }).select('positions position')
    const playerPositions = Array.isArray(player?.positions)
      ? player.positions
      : player?.position
        ? [player.position]
        : []
    const detectedType = playerPositions.includes('P') ? 'pitcher' : 'hitter'

    const merged = mergeStatPayload(req.body, {
      hitting: { ...EMPTY_STATS.hitting, ...(existing.hitting?.toObject?.() || existing.hitting || {}) },
      pitching: { ...EMPTY_STATS.pitching, ...(existing.pitching?.toObject?.() || existing.pitching || {}) },
      defense: { ...EMPTY_STATS.defense, ...(existing.defense?.toObject?.() || existing.defense || {}) },
    })

    const update = { $set: {} }

    update.$set.type = detectedType

    update.$set.hitting = merged.hitting
    update.$set.pitching = merged.pitching
    update.$set.defense = merged.defense

    if (!Object.keys(update.$set).length) {
      delete update.$set
    }

    const stat = await GameStat.findOneAndUpdate({ _id: id, teamId: req.user.teamId }, update, { returnDocument: 'after' })

    res.json(stat)
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar estatistica do jogo.' })
  }
})

router.get('/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params

    if (!mongoose.Types.ObjectId.isValid(gameId)) {
      return res.status(400).json({ message: 'gameId invalido.' })
    }

    const playerId = req.query.playerId
    const filter = { gameId, teamId: req.user.teamId }

    if (playerId && mongoose.Types.ObjectId.isValid(playerId)) {
      filter.playerId = playerId
    }

    const stats = await GameStat.find(filter)
      .populate('playerId', 'name number positions activePosition')
      .sort({ updatedAt: -1 })

    res.json(stats)
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar estatisticas do jogo.' })
  }
})

module.exports = router
