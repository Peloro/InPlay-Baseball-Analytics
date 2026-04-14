const mongoose = require('mongoose')

const statSchema = new mongoose.Schema(
  {
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
      unique: true,
    },
    atBats: { type: Number, default: 0 },
    hits: { type: Number, default: 0 },
    strikeouts: { type: Number, default: 0 },
  },
  { timestamps: true },
)

module.exports = mongoose.model('Stat', statSchema)
