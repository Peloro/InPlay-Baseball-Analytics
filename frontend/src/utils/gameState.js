// Increments the pitch count for the current pitcher and returns the new pitchCounts map.
export function incrementPitcherCount(state) {
  const next = { ...(state.pitchCounts || {}) }
  const pid = state.currentPitcherId
  if (pid) next[pid] = Number(next[pid] || 0) + 1
  return next
}

// Computes inning-transition fields from the current state given an outs delta.
// Returns { nextOuts, sideSwitch, nextHalf, nextInning } — caller spreads into state update.
export function computeInningTransition(current, outsDelta = 1) {
  const nextOuts = Math.min(Number(current.outs || 0) + outsDelta, 3)
  const sideSwitch = nextOuts >= 3
  const nextHalf = sideSwitch
    ? current.inningHalf === 'top' ? 'bottom' : 'top'
    : current.inningHalf || 'top'
  const nextInning = sideSwitch && current.inningHalf === 'bottom'
    ? Math.max(1, (current.inning || 1) + 1)
    : current.inning || 1
  return { nextOuts, sideSwitch, nextHalf, nextInning }
}
