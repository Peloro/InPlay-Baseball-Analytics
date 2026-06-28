const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    role: { type: String, enum: ['coach', 'admin'], default: 'coach' },
  },
  { timestamps: true }
)

module.exports = mongoose.model('User', userSchema)
