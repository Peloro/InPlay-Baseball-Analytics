const mongoose = require('mongoose')

const gameSchema = new mongoose.Schema(
  {
    gameId: {
      type: String,
      default() {
        return this._id ? String(this._id) : ''
      },
      index: true,
    },
    date: { type: Date, required: true },
    opponent: { type: String, required: true, trim: true },
    opponentName: { type: String, trim: true, default: '' },
    competition: { type: String, required: true, trim: true },
    location: { type: String, trim: true, default: '' },
    isAttacking: { type: Boolean, default: true },
    battingOrder: { type: [String], default: [] },
    lineup: {
      type: [
        {
          playerId: { type: String, required: true },
          position: { type: String, required: true, trim: true },
        },
      ],
      default: [],
    },
    bench: { type: [String], default: [] },
    isFinished: { type: Boolean, default: false },
    finishedAt: { type: Date, default: null },
    gameState: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
)

gameSchema.index({ date: -1, competition: 1 })

module.exports = mongoose.model('Game', gameSchema)
