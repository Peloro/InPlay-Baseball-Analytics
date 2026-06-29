const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')
const { body } = require('express-validator')
const Team = require('../models/Team')
const User = require('../models/User')
const validate = require('../middleware/validate')

const router = express.Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Muitas tentativas. Tente novamente em 15 minutos.' },
})

const registerRules = [
  body('teamName').trim().isLength({ min: 1 }).withMessage('teamName obrigatorio.'),
  body('email').isEmail().withMessage('Email invalido.').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Senha deve ter no minimo 8 caracteres.'),
]

const loginRules = [
  body('email').isEmail().withMessage('Email invalido.').normalizeEmail(),
  body('password').notEmpty().withMessage('password obrigatorio.'),
]

router.post('/register', authLimiter, registerRules, validate, async (req, res) => {
  try {
    const { email, password, teamName } = req.body

    const existing = await User.findOne({ email })
    if (existing) return res.status(409).json({ message: 'Email ja cadastrado.' })

    const team = await Team.create({ name: teamName })
    const passwordHash = await bcrypt.hash(password, 12)
    await User.create({ email, passwordHash, teamId: team._id, role: 'coach', status: 'pending' })

    res.status(201).json({ message: 'Conta criada! Aguardando aprovação do administrador.' })
  } catch (error) {
    res.status(500).json({ message: 'Erro ao registrar.' })
  }
})

router.post('/login', authLimiter, loginRules, validate, async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ email })
    if (!user) return res.status(401).json({ message: 'Credenciais invalidas.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ message: 'Credenciais invalidas.' })

    if (user.status === 'pending') {
      return res.status(403).json({ message: 'Conta aguardando aprovação do administrador.' })
    }

    if (user.role === 'admin') {
      const token = jwt.sign(
        { userId: user._id, teamId: null, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      )
      return res.json({ token, teamId: null, teamName: '', email: user.email })
    }

    const team = await Team.findById(user.teamId).select('name status')
    if (!team || team.status === 'blocked') {
      return res.status(403).json({ message: 'Equipe bloqueada. Contate o administrador.' })
    }

    const token = jwt.sign(
      { userId: user._id, teamId: user.teamId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )

    res.json({ token, teamId: user.teamId, teamName: team?.name || '', email: user.email })
  } catch (error) {
    res.status(500).json({ message: 'Erro ao fazer login.' })
  }
})

router.post('/refresh', async (req, res) => {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token ausente.' })
  }
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)

    if (payload.role === 'admin') {
      const newToken = jwt.sign(
        { userId: payload.userId, teamId: null, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      )
      return res.json({ token: newToken })
    }

    const team = await Team.findById(payload.teamId).select('name status')
    if (!team || team.status === 'blocked') {
      return res.status(403).json({ message: 'Equipe bloqueada. Contate o administrador.' })
    }

    const newToken = jwt.sign(
      { userId: payload.userId, teamId: payload.teamId, role: payload.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )
    res.json({ token: newToken, teamId: payload.teamId, teamName: team.name })
  } catch {
    return res.status(401).json({ message: 'Token invalido.' })
  }
})

module.exports = router
