const express = require('express')
const mongoose = require('mongoose')
const GameStat = require('../models/GameStat')

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const playerFilter = req.query.playerId
    const match = { teamId: new mongoose.Types.ObjectId(req.user.teamId) }

    if (playerFilter && mongoose.Types.ObjectId.isValid(playerFilter)) {
      match.playerId = new mongoose.Types.ObjectId(playerFilter)
    }

    const seasonStats = await GameStat.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$playerId',
          hittingAtBats:     { $sum: '$hitting.atBats' },
          hittingHits:       { $sum: '$hitting.hits' },
          hittingStrikeouts: { $sum: '$hitting.strikeouts' },
          hittingOuts:       { $sum: '$hitting.outs' },
          hittingWalks:      { $sum: '$hitting.walks' },
          hittingRuns:       { $sum: '$hitting.runs' },
          hittingRbi:        { $sum: '$hitting.rbi' },
          hittingHomeRuns:   { $sum: '$hitting.homeRuns' },
          pitchingInningsPitched: { $sum: '$pitching.inningsPitched' },
          pitchingOutsPitched:    { $sum: '$pitching.outsPitched' },
          pitchingEarnedRuns:     { $sum: '$pitching.earnedRuns' },
          pitchingStrikeouts:     { $sum: '$pitching.strikeouts' },
          pitchingWalks:          { $sum: '$pitching.walks' },
          pitchingStrikes:        { $sum: '$pitching.strikes' },
          pitchingBalls:          { $sum: '$pitching.balls' },
          pitchingPitchCount:     { $sum: '$pitching.pitchCount' },
          pitchingHitsAllowed:    { $sum: '$pitching.hitsAllowed' },
          defenseErrors:      { $sum: '$defense.errors' },
          defenseDoublePlays: { $sum: '$defense.doublePlays' },
          defenseFlyOuts:     { $sum: '$defense.flyOuts' },
          defenseGroundOuts:  { $sum: '$defense.groundOuts' },
          defenseLineOuts:    { $sum: '$defense.lineOuts' },
          hitterGames:  { $sum: { $cond: [{ $eq: ['$type', 'hitter'] }, 1, 0] } },
          pitcherGames: { $sum: { $cond: [{ $eq: ['$type', 'pitcher'] }, 1, 0] } },
        },
      },
      {
        $addFields: {
          avg: {
            $cond: [{ $eq: ['$hittingAtBats', 0] }, 0, { $divide: ['$hittingHits', '$hittingAtBats'] }],
          },
          era: {
            $cond: [
              { $eq: ['$pitchingOutsPitched', 0] },
              0,
              {
                $divide: [
                  { $multiply: ['$pitchingEarnedRuns', 27] },
                  '$pitchingOutsPitched',
                ],
              },
            ],
          },
        },
      },
      {
        $project: {
          playerId: '$_id',
          hitting: {
            atBats:     '$hittingAtBats',
            hits:       '$hittingHits',
            strikeouts: '$hittingStrikeouts',
            outs:       '$hittingOuts',
            walks:      '$hittingWalks',
            runs:       '$hittingRuns',
            rbi:        '$hittingRbi',
            homeRuns:   '$hittingHomeRuns',
          },
          pitching: {
            inningsPitched: '$pitchingInningsPitched',
            outsPitched:    '$pitchingOutsPitched',
            earnedRuns:     '$pitchingEarnedRuns',
            strikeouts:     '$pitchingStrikeouts',
            walks:          '$pitchingWalks',
            strikes:        '$pitchingStrikes',
            balls:          '$pitchingBalls',
            pitchCount:     '$pitchingPitchCount',
            hitsAllowed:    '$pitchingHitsAllowed',
          },
          defense: {
            errors:      '$defenseErrors',
            doublePlays: '$defenseDoublePlays',
            flyOuts:     '$defenseFlyOuts',
            groundOuts:  '$defenseGroundOuts',
            lineOuts:    '$defenseLineOuts',
          },
          roleSummary: {
            hitterGames:  '$hitterGames',
            pitcherGames: '$pitcherGames',
          },
          avg: 1,
          era: 1,
          _id: 0,
        },
      },
    ])

    res.json(seasonStats)
  } catch (error) {
    res.status(500).json({ message: 'Erro ao calcular estatisticas da temporada.' })
  }
})

module.exports = router
