// Detects the winning pitcher (W), losing pitcher (L), and save pitcher (SV)
// from the game state at the end of a game, based on simplified MLB rules.
//
// Rules applied:
//   Win  — pitcher who was defending when the winning team's decisive lead was taken.
//          With a single pitcher, they get the W automatically.
//   Loss — pitcher on the mound when the opponent scored their decisive go-ahead run.
//   Save — last pitcher in, IF they entered with the team already winning, did not earn
//          the W themselves, and finished the game.
//
// Returns { winId, lossId, saveId } — each is a pitcherId string or ''.

export function detectWLS(gameState) {
  const { homeScore, awayScore, inningScores, pitcherStints } = gameState
  const empty = { winId: '', lossId: '', saveId: '' }

  if (!pitcherStints || pitcherStints.length === 0) return empty

  const homeWins = (homeScore || 0) > (awayScore || 0)
  const awayWins = (awayScore || 0) > (homeScore || 0)
  if (!homeWins && !awayWins) return empty

  const homeRuns = inningScores?.home || []
  const awayRuns = inningScores?.away || []
  const n = Math.max(homeRuns.length, awayRuns.length, 1)

  // Sort stints chronologically (earlier innings first, 'top' before 'bottom')
  const stints = [...pitcherStints].sort((a, b) => {
    if (a.inning !== b.inning) return a.inning - b.inning
    if (a.inningHalf === b.inningHalf) return 0
    return a.inningHalf === 'top' ? -1 : 1
  })

  const firstPitcherId = stints[0].pitcherId
  const lastPitcherId = stints[stints.length - 1].pitcherId

  // Returns the pitcher who was on the mound IN OR BEFORE a given inning
  function pitcherAtInning(inning) {
    let pitcher = firstPitcherId
    for (const s of stints) {
      if (s.inning <= inning) pitcher = s.pitcherId
      else break
    }
    return pitcher
  }

  // Find the LAST inning where the decisive lead changed hands
  // (last time: winner was not leading → then they were leading after this inning)
  let cumH = 0, cumA = 0
  let decisiveInning = n
  for (let i = 0; i < n; i++) {
    const prevH = cumH, prevA = cumA
    cumH += homeRuns[i] || 0
    cumA += awayRuns[i] || 0
    if (homeWins && prevH <= prevA && cumH > cumA) decisiveInning = i + 1
    if (awayWins && prevA <= prevH && cumA > cumH) decisiveInning = i + 1
  }

  if (homeWins) {
    // Win: pitcher defending after we took the decisive lead
    const winId = stints.length === 1 ? firstPitcherId : pitcherAtInning(decisiveInning)

    // Save: last pitcher if they entered while we were winning and they're not the win pitcher
    let saveId = ''
    if (stints.length > 1 && lastPitcherId !== winId) {
      const lastStintInning = stints[stints.length - 1].inning
      let cumHAtEntry = 0, cumAAtEntry = 0
      for (let i = 0; i < lastStintInning - 1; i++) {
        cumHAtEntry += homeRuns[i] || 0
        cumAAtEntry += awayRuns[i] || 0
      }
      if (cumHAtEntry > cumAAtEntry) saveId = lastPitcherId
    }

    return { winId, lossId: '', saveId }
  }

  if (awayWins) {
    const lossId = pitcherAtInning(decisiveInning)
    return { winId: '', lossId, saveId: '' }
  }

  return empty
}
