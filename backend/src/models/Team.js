const mongoose = require('mongoose')

const teamSchema = new mongoose.Schema(
  { name: { type: String, required: true, trim: true } },
  { timestamps: true }
)

module.exports = mongoose.model('Team', teamSchema)
