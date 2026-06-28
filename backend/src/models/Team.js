const mongoose = require('mongoose')

const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'blocked'], default: 'active' },
    billingStatus: { type: String, enum: ['trial', 'paid', 'unpaid'], default: 'trial' },
    billingNotes: { type: String, default: '' },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Team', teamSchema)
