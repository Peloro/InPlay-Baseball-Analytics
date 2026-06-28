const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const Team = require('../models/Team')
const User = require('../models/User')

const router = express.Router()

router.post('/register', async (req, res) => {
  try {
    const { email, password, teamName } = req.body
    if (!email || !password || !teamName) {
      return res.status(400).json({ message: 'email, password e teamName sao obrigatorios.' })
    }

    const existing = await User.findOne({ email })
    if (existing) return res.status(409).json({ message: 'Email ja cadastrado.' })

    const team = await Team.create({ name: teamName })
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await User.create({ email, passwordHash, teamId: team._id, role: 'coach' })

    const token = jwt.sign(
      { userId: user._id, teamId: team._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )

    res.status(201).json({ token, teamId: team._id })
  } catch (error) {
    res.status(500).json({ message: 'Erro ao registrar.' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ message: 'email e password sao obrigatorios.' })
    }

    const user = await User.findOne({ email })
    if (!user) return res.status(401).json({ message: 'Credenciais invalidas.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ message: 'Credenciais invalidas.' })

    const token = jwt.sign(
      { userId: user._id, teamId: user.teamId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )

    res.json({ token, teamId: user.teamId })
  } catch (error) {
    res.status(500).json({ message: 'Erro ao fazer login.' })
  }
})

module.exports = router
