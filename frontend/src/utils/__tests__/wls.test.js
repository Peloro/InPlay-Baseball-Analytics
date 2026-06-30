import { describe, it, expect } from 'vitest'
import { detectWLS } from '../wls'

function makeState({ homeScore, awayScore, homeRuns, awayRuns, stints }) {
  return {
    homeScore,
    awayScore,
    inningScores: { home: homeRuns, away: awayRuns },
    pitcherStints: stints,
  }
}

describe('detectWLS', () => {
  it('returns empty when no pitcher stints', () => {
    const result = detectWLS(makeState({ homeScore: 5, awayScore: 3, homeRuns: [5], awayRuns: [3], stints: [] }))
    expect(result).toEqual({ winId: '', lossId: '', saveId: '' })
  })

  it('returns empty on a tie', () => {
    const result = detectWLS(makeState({
      homeScore: 3, awayScore: 3,
      homeRuns: [3], awayRuns: [3],
      stints: [{ pitcherId: 'p1', inning: 1, inningHalf: 'top' }],
    }))
    expect(result).toEqual({ winId: '', lossId: '', saveId: '' })
  })

  it('gives W to solo pitcher when team wins', () => {
    const result = detectWLS(makeState({
      homeScore: 5, awayScore: 2,
      homeRuns: [3, 2], awayRuns: [1, 1],
      stints: [{ pitcherId: 'p1', inning: 1, inningHalf: 'top' }],
    }))
    expect(result.winId).toBe('p1')
    expect(result.lossId).toBe('')
  })

  it('gives L to solo pitcher when team loses', () => {
    const result = detectWLS(makeState({
      homeScore: 2, awayScore: 5,
      homeRuns: [1, 1], awayRuns: [3, 2],
      stints: [{ pitcherId: 'p1', inning: 1, inningHalf: 'top' }],
    }))
    expect(result.lossId).toBe('p1')
    expect(result.winId).toBe('')
  })

  it('gives L to pitcher who gave up the decisive run in multi-pitcher game', () => {
    // p1 pitches innings 1-2, p2 pitches inning 3 onward
    // opponent scores decisive run in inning 3 (when p2 is pitching)
    const result = detectWLS(makeState({
      homeScore: 2, awayScore: 4,
      homeRuns: [2, 0, 0],
      awayRuns: [1, 0, 3], // p2 gave up 3 decisive runs in inning 3
      stints: [
        { pitcherId: 'p1', inning: 1, inningHalf: 'top' },
        { pitcherId: 'p2', inning: 3, inningHalf: 'top' },
      ],
    }))
    expect(result.lossId).toBe('p2')
  })

  it('awards save to last pitcher who entered with lead and did not get W', () => {
    // We win 5-3. p1 starts, p2 comes in during inning 3 while we lead.
    // p1 gets W (was pitching when we took decisive lead in inning 1)
    // p2 gets SV (entered inning 3 while we led 3-1)
    const result = detectWLS(makeState({
      homeScore: 5, awayScore: 3,
      homeRuns: [3, 0, 2], // We score in inning 1 and 3
      awayRuns: [1, 1, 1], // Opponent scores spread out
      stints: [
        { pitcherId: 'p1', inning: 1, inningHalf: 'top' },
        { pitcherId: 'p2', inning: 3, inningHalf: 'top' },
      ],
    }))
    expect(result.winId).toBe('p1')
    expect(result.saveId).toBe('p2')
  })

  it('does not award save if last pitcher entered while losing', () => {
    // We end up winning, but p2 entered while tied or trailing
    const result = detectWLS(makeState({
      homeScore: 4, awayScore: 3,
      homeRuns: [0, 0, 4], // We only go ahead in inning 3
      awayRuns: [2, 1, 0],
      stints: [
        { pitcherId: 'p1', inning: 1, inningHalf: 'top' },
        { pitcherId: 'p2', inning: 2, inningHalf: 'top' }, // entered while down 0-2
      ],
    }))
    expect(result.saveId).toBe('')
  })
})
