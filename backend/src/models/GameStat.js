const mongoose = require('mongoose')

const numberField = { type: Number, default: 0, min: 0 }

const gameStatSchema = new mongoose.Schema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game',
      required: true,
      index: true,
    },
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['hitter', 'pitcher'],
      default: 'hitter',
      required: true,
    },
    hitting: {
      atBats: numberField,
      hits: numberField,
      strikeouts: numberField,
      outs: numberField,
      walks: numberField,
      runs: numberField,
      rbi: numberField,
      homeRuns: numberField,
    },
    pitching: {
      inningsPitched: numberField,
      outsPitched: numberField,
      earnedRuns: numberField,
      strikeouts: numberField,
      walks: numberField,
      strikes: numberField,
      balls: numberField,
      pitchCount: numberField,
      hitsAllowed: numberField,
      pitchTypes: {
        FB: numberField,
        CV: numberField,
        SL: numberField,
        CH: numberField,
        SI: numberField,
        CT: numberField,
        other: numberField,
      },
    },
    defense: {
      errors: numberField,
      doublePlays: numberField,
      flyOuts: numberField,
      groundOuts: numberField,
      lineOuts: numberField,
    },
    events: [
      {
        type: { type: String, required: true, trim: true },
        createdAt: { type: Date, default: Date.now },
        note: { type: String, trim: true, default: '' },
      },
    ],
  },
  { timestamps: true },
)

gameStatSchema.index({ gameId: 1, playerId: 1 }, { unique: true })

module.exports = mongoose.model('GameStat', gameStatSchema)
