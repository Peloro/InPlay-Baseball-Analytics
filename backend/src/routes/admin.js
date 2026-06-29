const express = require('express')
const mongoose = require('mongoose')
const Team = require('../models/Team')
const User = require('../models/User')
const Player = require('../models/Player')
const Game = require('../models/Game')
const GameStat = require('../models/GameStat')

const router = express.Router()

function validId(id, res) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'id invalido.' })
    return false
  }
  return true
}

router.get('/pending', async (req, res) => {
  try {
    const pending = await User.find({ status: 'pending', role: 'coach' }).sort({ createdAt: -1 }).lean()
    const teamIds = pending.map(u => u.teamId)
    const teams = await Team.find({ _id: { $in: teamIds } }).select('name').lean()
    const teamMap = {}
    for (const t of teams) teamMap[String(t._id)] = t.name

    res.json(pending.map(u => ({
      _id: u._id,
      email: u.email,
      teamId: u.teamId,
      teamName: teamMap[String(u.teamId)] || '—',
      createdAt: u.createdAt,
    })))
  } catch {
    res.status(500).json({ message: 'Erro ao listar pendências.' })
  }
})

router.patch('/users/:id/approve', async (req, res) => {
  if (!validId(req.params.id, res)) return
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: 'active' },
      { returnDocument: 'after' }
    )
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' })
    res.json({ _id: user._id, status: user.status })
  } catch {
    res.status(500).json({ message: 'Erro ao aprovar usuário.' })
  }
})

router.delete('/users/:id', async (req, res) => {
  if (!validId(req.params.id, res)) return
  try {
    const user = await User.findByIdAndDelete(req.params.id)
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' })

    const remaining = await User.countDocuments({ teamId: user.teamId })
    if (remaining === 0) {
      await Team.findByIdAndDelete(user.teamId)
    }

    res.status(204).send()
  } catch {
    res.status(500).json({ message: 'Erro ao rejeitar usuário.' })
  }
})

router.get('/teams', async (req, res) => {
  try {
    const teams = await Team.find().sort({ createdAt: -1 }).lean()
    const users = await User.find().select('email teamId').lean()
    const emailByTeam = {}
    for (const u of users) emailByTeam[String(u.teamId)] = u.email

    res.json(teams.map(t => ({
      _id: t._id,
      name: t.name || '—',
      status: t.status || 'active',
      billingStatus: t.billingStatus || 'trial',
      billingNotes: t.billingNotes || '',
      createdAt: t.createdAt || null,
      coachEmail: emailByTeam[String(t._id)] || '—',
    })))
  } catch {
    res.status(500).json({ message: 'Erro ao listar equipes.' })
  }
})

router.patch('/teams/:id/status', async (req, res) => {
  if (!validId(req.params.id, res)) return
  try {
    const { status } = req.body
    if (!['active', 'blocked'].includes(status)) {
      return res.status(400).json({ message: 'status deve ser active ou blocked.' })
    }
    const team = await Team.findByIdAndUpdate(req.params.id, { status }, { returnDocument: 'after' })
    if (!team) return res.status(404).json({ message: 'Equipe nao encontrada.' })
    res.json({ _id: team._id, status: team.status })
  } catch {
    res.status(500).json({ message: 'Erro ao atualizar status.' })
  }
})

router.patch('/teams/:id/billing', async (req, res) => {
  if (!validId(req.params.id, res)) return
  try {
    const update = {}
    if (req.body.billingStatus !== undefined) {
      if (!['trial', 'paid', 'unpaid'].includes(req.body.billingStatus)) {
        return res.status(400).json({ message: 'billingStatus invalido.' })
      }
      update.billingStatus = req.body.billingStatus
    }
    if (req.body.billingNotes !== undefined) {
      update.billingNotes = String(req.body.billingNotes)
    }

    const team = await Team.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' })
    if (!team) return res.status(404).json({ message: 'Equipe nao encontrada.' })
    res.json({ _id: team._id, billingStatus: team.billingStatus, billingNotes: team.billingNotes })
  } catch {
    res.status(500).json({ message: 'Erro ao atualizar cobranca.' })
  }
})

router.delete('/teams/:id', async (req, res) => {
  if (!validId(req.params.id, res)) return
  try {
    const { id } = req.params
    const team = await Team.findByIdAndDelete(id)
    if (!team) return res.status(404).json({ message: 'Equipe nao encontrada.' })

    await Promise.all([
      User.deleteMany({ teamId: id }),
      Player.deleteMany({ teamId: id }),
      Game.deleteMany({ teamId: id }),
      GameStat.deleteMany({ teamId: id }),
    ])

    res.status(204).send()
  } catch {
    res.status(500).json({ message: 'Erro ao deletar equipe.' })
  }
})

module.exports = router
