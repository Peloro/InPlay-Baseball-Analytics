const mongoose = require('mongoose')
const { VALID_POSITIONS } = require('../constants/positions')

const playerSchema = new mongoose.Schema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    name: { type: String, required: true, trim: true },
    number: { type: Number, required: true },
    positions: {
      type: [String],
      required: true,
      validate: {
        validator(values) {
          return Array.isArray(values) && values.length > 0 && values.every((item) => VALID_POSITIONS.includes(item))
        },
        message: 'positions deve conter ao menos uma posicao valida.',
      },
    },
    activePosition: {
      type: String,
      required: true,
      enum: VALID_POSITIONS,
    },
    x: { type: Number, default: 50 },
    y: { type: Number, default: 50 },
    pitchCountLimit: { type: Number, default: null },
    pitchRepertoire: { type: [String], default: [] },
  },
  { timestamps: true },
)

module.exports = mongoose.model('Player', playerSchema)
