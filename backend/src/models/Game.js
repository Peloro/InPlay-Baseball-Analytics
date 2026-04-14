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
    gameState: {
      inning: { type: Number, default: 1 },
      inningHalf: { type: String, default: 'top', trim: true },
      outs: { type: Number, default: 0 },
      balls: { type: Number, default: 0 },
      strikes: { type: Number, default: 0 },
      pitchCount: { type: Number, default: 0 },
      homeScore: { type: Number, default: 0 },
      awayScore: { type: Number, default: 0 },
      isAttacking: { type: Boolean, default: true },
      onFieldPlayerIds: { type: [String], default: [] },
      participantPlayerIds: { type: [String], default: [] },
      currentBatterIndex: { type: Number, default: 0 },
      currentPitcherId: { type: String, default: '' },
      runners: {
        first: { type: Boolean, default: false },
        second: { type: Boolean, default: false },
        third: { type: Boolean, default: false },
      },
      preGameConfigured: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
)

gameSchema.index({ date: -1, competition: 1 })

module.exports = mongoose.model('Game', gameSchema)
