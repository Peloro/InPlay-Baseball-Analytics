import { getDefaultFieldPosition } from '../data/defaultFieldPositions'
import { DEFENSIVE_POSITIONS } from '../constants/fieldGame'

export function makeOpponentMarkers() {
  return DEFENSIVE_POSITIONS.map((position) => {
    const point = getDefaultFieldPosition(position)
    return {
      id: `opponent-${position}`,
      label: position,
      x: point.x,
      y: point.y,
    }
  })
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function isInsideRect(clientX, clientY, rect) {
  if (!rect) return false
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

export function reorderList(list, from, to) {
  const safe = [...list]
  const [item] = safe.splice(from, 1)
  safe.splice(to, 0, item)
  return safe
}

export function makeLogEntry(current, type, description) {
  return {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    ts: Date.now(),
    inning: current.inning || 1,
    half: current.inningHalf || 'top',
    type,
    description,
  }
}

export function updateOppBatter(current, result) {
  const num = current.currentOpponentBatter?.number?.trim()
  if (!num) return {}
  const name = current.currentOpponentBatter?.name?.trim() || ''
  const existing = current.opposingBatters?.[num] || { number: num, name, atBats: 0, hits: 0, outs: 0, walks: 0, strikeouts: 0, homeRuns: 0 }
  const b = { ...existing, name: name || existing.name }
  if (result === 'hit')             { b.atBats++; b.hits++ }
  else if (result === 'homerun')    { b.atBats++; b.hits++; b.homeRuns++ }
  else if (result === 'out')        { b.atBats++; b.outs++ }
  else if (result === 'strikeout')  { b.atBats++; b.outs++; b.strikeouts++ }
  else if (result === 'walk')       { b.walks++ }
  else if (result === 'error')      { b.atBats++ }
  else if (result === 'sacfly')     { b.outs++ }
  return { opposingBatters: { ...(current.opposingBatters || {}), [num]: b } }
}

export function oppBatterLabel(current) {
  const num = current.currentOpponentBatter?.number?.trim()
  const name = current.currentOpponentBatter?.name?.trim()
  if (!num) return 'ADV'
  return name ? `ADV #${num} ${name}` : `ADV #${num}`
}

export function advanceOpponentLineup(current) {
  const lineup = Array.isArray(current.opponentLineup) ? [...current.opponentLineup] : []
  while (lineup.length < 9) lineup.push(null)
  const idx = (typeof current.opponentLineupIndex === 'number' ? current.opponentLineupIndex : 0) % 9
  const batter = current.currentOpponentBatter || { number: '', name: '' }
  if (batter.number?.trim()) {
    lineup[idx] = { number: batter.number.trim(), name: batter.name?.trim() || '' }
  }
  const nextIdx = (idx + 1) % 9
  const nextBatter = lineup[nextIdx]
  return {
    opponentLineup: lineup,
    opponentLineupIndex: nextIdx,
    currentOpponentBatter: nextBatter || { number: '', name: '' },
  }
}

export function applyRunnerAdvance(runners, basesToAdvance) {
  const order = ['first', 'second', 'third']
  const nextRunners = { first: false, second: false, third: false }
  let runs = 0

  for (let index = order.length - 1; index >= 0; index -= 1) {
    const base = order[index]
    if (!runners?.[base]) continue

    const targetIndex = index + basesToAdvance
    if (targetIndex >= order.length) {
      runs += 1
    } else {
      nextRunners[order[targetIndex]] = runners[base]
    }
  }

  return { nextRunners, runs }
}

export function applyHitToBases(runners, hitType, batterId = null) {
  if (hitType === 'homerun') {
    let runs = 1
    if (runners?.first) runs += 1
    if (runners?.second) runs += 1
    if (runners?.third) runs += 1
    return {
      nextRunners: { first: false, second: false, third: false },
      runs,
      bases: 4,
    }
  }

  const bases = hitType === 'triple' ? 3 : hitType === 'double' ? 2 : 1
  const advanced = applyRunnerAdvance(runners, bases)
  const nextRunners = { ...advanced.nextRunners }
  const marker = batterId || true
  if (bases === 1) nextRunners.first = marker
  if (bases === 2) nextRunners.second = marker
  if (bases === 3) nextRunners.third = marker

  return {
    nextRunners,
    runs: advanced.runs,
    bases,
  }
}

export function forceAdvanceToFirst(runners, batterId = null) {
  const next = { ...(runners || { first: false, second: false, third: false }) }
  let runs = 0
  const marker = batterId || true

  if (!next.first) {
    next.first = marker
    return { nextRunners: next, runs }
  }

  if (next.second && next.third) {
    runs += 1
  }

  next.third = next.second ? next.second : next.third
  next.second = next.first
  next.first = marker

  return { nextRunners: next, runs }
}

export function getNextBatterIndexFromState(state) {
  const order = state.battingOrder || []
  if (!state.isAttacking || !order.length) return state.currentBatterIndex || 0
  const currentIndex = Math.min(state.currentBatterIndex || 0, order.length - 1)
  return (currentIndex + 1) % order.length
}
