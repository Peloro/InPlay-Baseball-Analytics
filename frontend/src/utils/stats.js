import { safeNumber } from './number'

function toNum(v) {
  return safeNumber(v)
}

function formatFixed(n, digits = 3) {
  return Number(n || 0).toFixed(digits)
}

export function avgFromValues(atBats, hits) {
  const ab = toNum(atBats)
  if (!ab) return '0.000'
  return (toNum(hits) / ab).toFixed(3)
}

export function avgFromEntry(entry) {
  return avgFromValues(entry?.hitting?.atBats, entry?.hitting?.hits)
}

export function avgFromHitting(hitting) {
  return avgFromValues(hitting?.atBats, hitting?.hits)
}

function eraFrom({ outsPitched, inningsPitched, earnedRuns }, digits = 3) {
  const outs = toNum(outsPitched)
  const er = toNum(earnedRuns)
  if (outs) return ((er * 27) / outs).toFixed(digits)

  const ip = toNum(inningsPitched)
  if (!ip) return formatFixed(0, digits)
  return ((er * 9) / ip).toFixed(digits)
}

export function eraFromEntry(entry) {
  return eraFrom({
    outsPitched: entry?.pitching?.outsPitched,
    inningsPitched: entry?.pitching?.inningsPitched,
    earnedRuns: entry?.pitching?.earnedRuns,
  })
}

export function eraFromPitching(pitching) {
  return eraFrom({
    outsPitched: pitching?.outsPitched,
    inningsPitched: pitching?.inningsPitched,
    earnedRuns: pitching?.earnedRuns,
  })
}

export function formatEraFromOuts(outsPitched, er, digits = 2, noDataPlaceholder = '--') {
  const outs = toNum(outsPitched)
  if (!outs) return noDataPlaceholder
  return ((toNum(er) * 27) / outs).toFixed(digits)
}

export function outsToInnings(outs) {
  const o = toNum(outs)
  return Math.floor(o / 3) + ((o % 3) / 10)
}

export function formatIpFromOuts(outsPitched) {
  const o = toNum(outsPitched)
  return `${Math.floor(o / 3)}.${o % 3}`
}

export function inningsToOuts(innings) {
  const n = Number(innings) || 0
  const whole = Math.floor(n)
  const fraction = Math.round((n - whole) * 10)
  return whole * 3 + fraction
}

// Updates the per-inning score table when runs are scored.
// Returns a new { home, away } object — does not mutate.
export function addInningRuns(inningScores, inning, ourRuns, theirRuns) {
  const idx = Math.max(0, (inning || 1) - 1)
  const home = [...(inningScores?.home || [])]
  const away = [...(inningScores?.away || [])]
  while (home.length <= idx) home.push(0)
  while (away.length <= idx) away.push(0)
  if (ourRuns > 0) home[idx] = (home[idx] || 0) + ourRuns
  if (theirRuns > 0) away[idx] = (away[idx] || 0) + theirRuns
  return { home, away }
}

export function obpFromHitting(hitting) {
  const h = toNum(hitting?.hits)
  const bb = toNum(hitting?.walks)
  const ab = toNum(hitting?.atBats)
  const denom = ab + bb
  if (!denom) return '---'
  return ((h + bb) / denom).toFixed(3)
}

export function slgFromHitting(hitting) {
  const ab = toNum(hitting?.atBats)
  if (!ab) return '---'
  const h  = toNum(hitting?.hits)
  const d  = toNum(hitting?.doubles)
  const t  = toNum(hitting?.triples)
  const hr = toNum(hitting?.homeRuns)
  // TB = H + 2B + 2×3B + 3×HR  (singles count once, already in H)
  return ((h + d + t * 2 + hr * 3) / ab).toFixed(3)
}

export function opsFromHitting(hitting) {
  const ab = toNum(hitting?.atBats)
  const bb = toNum(hitting?.walks)
  if (!(ab + bb)) return '---'
  const h  = toNum(hitting?.hits)
  const d  = toNum(hitting?.doubles)
  const t  = toNum(hitting?.triples)
  const hr = toNum(hitting?.homeRuns)
  const obp = (h + bb) / (ab + bb)
  const slg = ab ? (h + d + t * 2 + hr * 3) / ab : 0
  return (obp + slg).toFixed(3)
}

export function whipFromPitching(pitching) {
  const outs = toNum(pitching?.outsPitched)
  if (!outs) return '---'
  const bb = toNum(pitching?.walks)
  const h = toNum(pitching?.hitsAllowed)
  return ((bb + h) / (outs / 3)).toFixed(2)
}

export function k9FromPitching(pitching) {
  const outs = toNum(pitching?.outsPitched)
  if (!outs) return '---'
  return ((toNum(pitching?.strikeouts) * 9) / (outs / 3)).toFixed(1)
}
