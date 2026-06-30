export const GAME_STATE_STORAGE_KEY = 'baseball_game_state_v2'

export const INITIAL_GAME_STATE = {
  inning: 1,
  inningHalf: 'top',
  outs: 0,
  balls: 0,
  strikes: 0,
  pitchCount: 0,
  ourPitchCount: 0,
  opponentPitchCount: 0,
  pitchCounts: {},
  homeScore: 0,
  awayScore: 0,
  inningScores: { home: [], away: [] },
  isAttacking: true,
  score: { home: 0, away: 0 },
  onFieldPlayerIds: [],
  participantPlayerIds: [],
  battingOrder: [],
  lineup: [],
  bench: [],
  currentBatterIndex: 0,
  runners: { first: false, second: false, third: false },
  currentPitcherId: null,
  currentGameId: null,
  preGameConfigured: false,
  gameLog: [],
  substitutions: [],
  currentOpponentBatter: { number: '', name: '' },
  opposingBatters: {},
  opponentLineup: [],
  opponentLineupIndex: 0,
  opposingPitcher: { number: '', name: '' },
  maxInnings: 0,
  pitcherStints: [],
}

export function getSavedGameState() {
  try {
    const raw = window.localStorage.getItem(GAME_STATE_STORAGE_KEY)
    if (!raw) return INITIAL_GAME_STATE

    const parsed = JSON.parse(raw)

    // No active game → discard any stale progress fields entirely
    if (!parsed?.currentGameId) return INITIAL_GAME_STATE

    return {
      ...INITIAL_GAME_STATE,
      ...parsed,
      // migrate legacy `pitchCount` to `ourPitchCount` when needed
      ourPitchCount: Number.isFinite(parsed?.ourPitchCount)
        ? parsed.ourPitchCount
        : Number.isFinite(parsed?.pitchCount)
          ? parsed.pitchCount
          : 0,
      opponentPitchCount: Number.isFinite(parsed?.opponentPitchCount) ? parsed.opponentPitchCount : 0,
      pitchCounts: parsed?.pitchCounts || {},
      homeScore: Number.isFinite(parsed?.homeScore)
        ? parsed.homeScore
        : Number.isFinite(parsed?.score?.home)
          ? parsed.score.home
          : 0,
      awayScore: Number.isFinite(parsed?.awayScore)
        ? parsed.awayScore
        : Number.isFinite(parsed?.score?.away)
          ? parsed.score.away
          : 0,
      inningScores: parsed?.inningScores || { home: [], away: [] },
      score: { ...INITIAL_GAME_STATE.score, ...(parsed?.score || {}) },
      runners: { ...INITIAL_GAME_STATE.runners, ...(parsed?.runners || {}) },
      onFieldPlayerIds: Array.isArray(parsed?.onFieldPlayerIds) ? parsed.onFieldPlayerIds : [],
      participantPlayerIds: Array.isArray(parsed?.participantPlayerIds)
        ? parsed.participantPlayerIds
        : [],
      battingOrder: Array.isArray(parsed?.battingOrder) ? parsed.battingOrder : [],
      lineup: Array.isArray(parsed?.lineup) ? parsed.lineup : [],
      bench: Array.isArray(parsed?.bench) ? parsed.bench : [],
      currentBatterIndex: Number.isFinite(parsed?.currentBatterIndex) ? parsed.currentBatterIndex : 0,
      inningHalf: parsed?.inningHalf === 'bottom' ? 'bottom' : 'top',
      isAttacking: typeof parsed?.isAttacking === 'boolean' ? parsed.isAttacking : true,
      preGameConfigured: Boolean(parsed?.preGameConfigured),
      gameLog: Array.isArray(parsed?.gameLog) ? parsed.gameLog : [],
      substitutions: Array.isArray(parsed?.substitutions) ? parsed.substitutions : [],
      currentOpponentBatter: parsed?.currentOpponentBatter || { number: '', name: '' },
      opposingBatters: (parsed?.opposingBatters && typeof parsed.opposingBatters === 'object' && !Array.isArray(parsed.opposingBatters)) ? parsed.opposingBatters : {},
      opponentLineup: Array.isArray(parsed?.opponentLineup) ? parsed.opponentLineup : [],
      opponentLineupIndex: typeof parsed?.opponentLineupIndex === 'number' ? parsed.opponentLineupIndex : 0,
      opposingPitcher: parsed?.opposingPitcher || { number: '', name: '' },
      maxInnings: typeof parsed?.maxInnings === 'number' ? parsed.maxInnings : 0,
      pitcherStints: Array.isArray(parsed?.pitcherStints) ? parsed.pitcherStints : [],
    }
  } catch {
    return INITIAL_GAME_STATE
  }
}

export function advanceOnWalk(runners) {
  const next = { ...(runners || { first: false, second: false, third: false }) }
  let runs = 0

  if (!next.first) {
    next.first = true
    return { runners: next, runs }
  }

  if (next.second && next.third) {
    runs += 1
  }

  next.third = next.second ? true : next.third
  next.second = true
  next.first = true

  return { runners: next, runs }
}

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
