import { describe, it, expect } from 'vitest'
import {
  advanceOnWalk,
  incrementPitcherCount,
  computeInningTransition,
} from '../gameState'

describe('advanceOnWalk', () => {
  it('places batter on first when bases empty', () => {
    const { runners, runs } = advanceOnWalk({ first: false, second: false, third: false })
    expect(runners.first).toBe(true)
    expect(runners.second).toBe(false)
    expect(runs).toBe(0)
  })

  it('forces runners when first is occupied', () => {
    const { runners, runs } = advanceOnWalk({ first: true, second: false, third: false })
    expect(runners.first).toBe(true)
    expect(runners.second).toBe(true)
    expect(runs).toBe(0)
  })

  it('forces all runners when bases loaded', () => {
    const { runners, runs } = advanceOnWalk({ first: true, second: true, third: true })
    expect(runners.first).toBe(true)
    expect(runners.second).toBe(true)
    expect(runners.third).toBe(true)
    expect(runs).toBe(1)
  })

  it('pushes runner from second to third when first and second occupied', () => {
    const { runners, runs } = advanceOnWalk({ first: true, second: true, third: false })
    expect(runners.third).toBe(true)
    expect(runs).toBe(0)
  })
})

describe('incrementPitcherCount', () => {
  it('increments count for current pitcher', () => {
    const state = { currentPitcherId: 'p1', pitchCounts: { p1: 10 } }
    const result = incrementPitcherCount(state)
    expect(result.p1).toBe(11)
  })

  it('initializes count from zero if not set', () => {
    const state = { currentPitcherId: 'p2', pitchCounts: {} }
    const result = incrementPitcherCount(state)
    expect(result.p2).toBe(1)
  })

  it('does not modify other pitchers', () => {
    const state = { currentPitcherId: 'p1', pitchCounts: { p1: 5, p2: 20 } }
    const result = incrementPitcherCount(state)
    expect(result.p2).toBe(20)
  })

  it('returns unchanged map when no current pitcher', () => {
    const state = { currentPitcherId: null, pitchCounts: { p1: 5 } }
    const result = incrementPitcherCount(state)
    expect(result.p1).toBe(5)
  })
})

describe('computeInningTransition', () => {
  it('adds outs without a side switch when total < 3', () => {
    const current = { outs: 1, inningHalf: 'top', inning: 2 }
    const { nextOuts, sideSwitch, nextHalf, nextInning } = computeInningTransition(current, 1)
    expect(nextOuts).toBe(2)
    expect(sideSwitch).toBe(false)
    expect(nextHalf).toBe('top')
    expect(nextInning).toBe(2)
  })

  it('triggers side switch when outs reach 3', () => {
    const current = { outs: 2, inningHalf: 'top', inning: 1 }
    const { nextOuts, sideSwitch, nextHalf, nextInning } = computeInningTransition(current, 1)
    expect(nextOuts).toBe(3)
    expect(sideSwitch).toBe(true)
    expect(nextHalf).toBe('bottom')
    expect(nextInning).toBe(1)
  })

  it('advances to new inning when switching from bottom', () => {
    const current = { outs: 2, inningHalf: 'bottom', inning: 3 }
    const { nextOuts, sideSwitch, nextHalf, nextInning } = computeInningTransition(current, 1)
    expect(sideSwitch).toBe(true)
    expect(nextHalf).toBe('top')
    expect(nextInning).toBe(4)
  })

  it('caps outs at 3', () => {
    const current = { outs: 2, inningHalf: 'top', inning: 1 }
    const { nextOuts } = computeInningTransition(current, 5)
    expect(nextOuts).toBe(3)
  })

  it('uses default delta of 1', () => {
    const current = { outs: 0, inningHalf: 'top', inning: 1 }
    const { nextOuts } = computeInningTransition(current)
    expect(nextOuts).toBe(1)
  })
})
