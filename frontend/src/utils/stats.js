import { safeNumber } from './number'

export function avgFromValues(atBats, hits) {
  const ab = safeNumber(atBats)
  if (!ab) return '0.000'
  return (safeNumber(hits) / ab).toFixed(3)
}

export function avgFromEntry(entry) {
  return avgFromValues(entry?.hitting?.atBats, entry?.hitting?.hits)
}

export function avgFromHitting(hitting) {
  return avgFromValues(hitting?.atBats, hitting?.hits)
}

export function eraFromEntry(entry) {
  const outs = safeNumber(entry?.pitching?.outsPitched)
  const er = safeNumber(entry?.pitching?.earnedRuns)
  if (outs) return ((er * 21) / outs).toFixed(3)

  const ip = safeNumber(entry?.pitching?.inningsPitched)
  if (!ip) return '0.000'
  return ((er * 7) / ip).toFixed(3)
}

export function eraFromPitching(pitching) {
  const outs = safeNumber(pitching?.outsPitched)
  if (outs) return ((safeNumber(pitching?.earnedRuns) * 21) / outs).toFixed(3)

  const ip = safeNumber(pitching?.inningsPitched)
  if (!ip) return '0.000'
  return ((safeNumber(pitching?.earnedRuns) * 7) / ip).toFixed(3)
}

export function formatEraFromOuts(outsPitched, er, digits = 2, noDataPlaceholder = '--') {
  const outs = safeNumber(outsPitched)
  if (!outs) return noDataPlaceholder
  return ((safeNumber(er) * 21) / outs).toFixed(digits)
}

export function outsToInnings(outs) {
  const o = safeNumber(outs)
  return Math.floor(o / 3) + ((o % 3) / 10)
}

export function inningsToOuts(innings) {
  const n = Number(innings) || 0
  const whole = Math.floor(n)
  const fraction = Math.round((n - whole) * 10)
  return whole * 3 + fraction
}
