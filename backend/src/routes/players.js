const express = require('express')
const mongoose = require('mongoose')
const Player = require('../models/Player')
const GameStat = require('../models/GameStat')
const { VALID_POSITIONS } = require('../constants/positions')

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const players = await Player.find({ teamId: req.user.teamId }).sort({ number: 1 })
    const normalized = players.map((player) => {
      const source = player.toObject()
      const positions = Array.isArray(source.positions)
        ? source.positions.filter((item) => VALID_POSITIONS.includes(item))
        : source.position && VALID_POSITIONS.includes(String(source.position).toUpperCase())
          ? [String(source.position).toUpperCase()]
          : ['DH']

      return {
        ...source,
        positions,
        activePosition: positions.includes(source.activePosition) ? source.activePosition : positions[0],
      }
    })

    res.json(normalized)
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar jogadores.' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { name, number, positions, activePosition, position, x, y } = req.body

    const normalizedPositions = Array.isArray(positions)
      ? positions.map((item) => String(item).trim().toUpperCase()).filter(Boolean)
      : position
        ? [String(position).trim().toUpperCase()]
        : []

    if (!name || number === undefined || normalizedPositions.length === 0) {
      return res.status(400).json({ message: 'name, number e positions sao obrigatorios.' })
    }

    if (!normalizedPositions.every((item) => VALID_POSITIONS.includes(item))) {
      return res.status(400).json({ message: 'positions contem itens invalidos.' })
    }

    const normalizedActivePosition = String(activePosition || normalizedPositions[0])
      .trim()
      .toUpperCase()

    if (!normalizedPositions.includes(normalizedActivePosition)) {
      return res.status(400).json({ message: 'activePosition deve estar dentro de positions.' })
    }

    const player = await Player.create({
      teamId: req.user.teamId,
      name,
      number,
      positions: normalizedPositions,
      activePosition: normalizedActivePosition,
      x: Number.isFinite(x) ? x : 50,
      y: Number.isFinite(y) ? y : 50,
    })

    res.status(201).json(player)
  } catch (error) {
    res.status(500).json({ message: 'Erro ao criar jogador.' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const { name, number, positions, activePosition } = req.body

    const normalizedPositions = Array.isArray(positions)
      ? positions.map((item) => String(item).trim().toUpperCase()).filter(Boolean)
      : []

    if (!name || number === undefined || normalizedPositions.length === 0) {
      return res.status(400).json({ message: 'name, number e positions sao obrigatorios.' })
    }

    if (!normalizedPositions.every((item) => VALID_POSITIONS.includes(item))) {
      return res.status(400).json({ message: 'positions contem itens invalidos.' })
    }

    const normalizedActivePosition = String(activePosition || normalizedPositions[0])
      .trim()
      .toUpperCase()

    if (!normalizedPositions.includes(normalizedActivePosition)) {
      return res.status(400).json({ message: 'activePosition deve estar dentro de positions.' })
    }

    const updated = await Player.findOneAndUpdate(
      { _id: req.params.id, teamId: req.user.teamId },
      {
        name,
        number,
        positions: normalizedPositions,
        activePosition: normalizedActivePosition,
      },
      { returnDocument: 'after' },
    )

    if (!updated) {
      return res.status(404).json({ message: 'Jogador nao encontrado.' })
    }

    return res.json(updated)
  } catch (error) {
    return res.status(500).json({ message: 'Erro ao atualizar jogador.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id invalido.' })
    }

    const deleted = await Player.findOneAndDelete({ _id: id, teamId: req.user.teamId })

    if (!deleted) {
      return res.status(404).json({ message: 'Jogador nao encontrado.' })
    }

    await GameStat.deleteMany({ playerId: id, teamId: req.user.teamId })

    return res.status(204).send()
  } catch (error) {
    return res.status(500).json({ message: 'Erro ao apagar jogador.' })
  }
})

module.exports = router
