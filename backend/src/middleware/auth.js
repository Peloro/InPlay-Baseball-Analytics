const jwt = require('jsonwebtoken')
const Team = require('../models/Team')

module.exports = async function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)

    const team = await Team.findById(payload.teamId).select('status')
    if (!team || team.status === 'blocked') {
      return res.status(403).json({ message: 'Equipe bloqueada. Contate o administrador.' })
    }

    req.user = { userId: payload.userId, teamId: payload.teamId, role: payload.role }
    next()
  } catch {
    return res.status(401).json({ message: 'Unauthorized' })
  }
}
