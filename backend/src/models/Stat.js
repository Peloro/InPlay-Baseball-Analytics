const mongoose = require('mongoose')

const statSchema = new mongoose.Schema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
    },
    atBats: { type: Number, default: 0 },
    hits: { type: Number, default: 0 },
    strikeouts: { type: Number, default: 0 },
  },
  { timestamps: true },
)

statSchema.index({ teamId: 1, playerId: 1 }, { unique: true })

module.exports = mongoose.model('Stat', statSchema)
