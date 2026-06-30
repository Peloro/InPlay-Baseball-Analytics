import { describe, it, expect } from 'vitest'
import {
  applyRunnerAdvance,
  applyHitToBases,
  forceAdvanceToFirst,
  makeLogEntry,
} from '../fieldGame'

describe('applyRunnerAdvance', () => {
  it('scores a runner from third on a single (1 base)', () => {
    const { nextRunners, runs } = applyRunnerAdvance({ first: false, second: false, third: true }, 1)
    expect(runs).toBe(1)
    expect(nextRunners.third).toBe(false)
  })

  it('moves runner from first to third on a double', () => {
    const { nextRunners, runs } = applyRunnerAdvance({ first: true, second: false, third: false }, 2)
    expect(nextRunners.third).toBe(true)
    expect(nextRunners.first).toBe(false)
    expect(runs).toBe(0)
  })

  it('scores runner from first on a triple', () => {
    const { nextRunners, runs } = applyRunnerAdvance({ first: true, second: false, third: false }, 3)
    expect(runs).toBe(1)
    expect(nextRunners.first).toBe(false)
  })

  it('handles empty bases', () => {
    const { nextRunners, runs } = applyRunnerAdvance({ first: false, second: false, third: false }, 2)
    expect(runs).toBe(0)
    expect(nextRunners).toEqual({ first: false, second: false, third: false })
  })

  it('scores all three runners on a bases-clearing triple', () => {
    const { nextRunners, runs } = applyRunnerAdvance({ first: true, second: true, third: true }, 3)
    expect(runs).toBe(3)
    expect(nextRunners).toEqual({ first: false, second: false, third: false })
  })
})

describe('applyHitToBases', () => {
  it('places batter on first on a single with empty bases', () => {
    const { nextRunners, runs, bases } = applyHitToBases({ first: false, second: false, third: false }, 'single')
    expect(nextRunners.first).toBeTruthy()
    expect(runs).toBe(0)
    expect(bases).toBe(1)
  })

  it('places batter on second on a double', () => {
    const { nextRunners, bases } = applyHitToBases({ first: false, second: false, third: false }, 'double')
    expect(nextRunners.second).toBeTruthy()
    expect(bases).toBe(2)
  })

  it('clears bases on a homerun', () => {
    const { nextRunners, runs, bases } = applyHitToBases({ first: true, second: true, third: true }, 'homerun')
    expect(runs).toBe(4) // batter + 3 runners
    expect(nextRunners).toEqual({ first: false, second: false, third: false })
    expect(bases).toBe(4)
  })

  it('scores runner from second on a double', () => {
    const { runs } = applyHitToBases({ first: false, second: true, third: false }, 'double')
    expect(runs).toBe(1)
  })

  it('places batterId on the base', () => {
    const { nextRunners } = applyHitToBases({ first: false, second: false, third: false }, 'single', 'batter42')
    expect(nextRunners.first).toBe('batter42')
  })
})

describe('forceAdvanceToFirst', () => {
  it('places batter on first when first is empty', () => {
    const { nextRunners, runs } = forceAdvanceToFirst({ first: false, second: false, third: false })
    expect(nextRunners.first).toBeTruthy()
    expect(runs).toBe(0)
  })

  it('forces runners when first is occupied', () => {
    const { nextRunners, runs } = forceAdvanceToFirst({ first: true, second: false, third: false })
    expect(nextRunners.first).toBeTruthy()
    expect(nextRunners.second).toBe(true)
    expect(runs).toBe(0)
  })

  it('scores a run when bases are loaded', () => {
    const { nextRunners, runs } = forceAdvanceToFirst({ first: true, second: true, third: true })
    expect(runs).toBe(1)
    expect(nextRunners.first).toBeTruthy()
    expect(nextRunners.second).toBe(true)
    expect(nextRunners.third).toBe(true)
  })
})

describe('makeLogEntry', () => {
  it('creates a log entry with correct shape', () => {
    const current = { inning: 3, inningHalf: 'bottom' }
    const entry = makeLogEntry(current, 'hit', 'Single to left')
    expect(entry.inning).toBe(3)
    expect(entry.half).toBe('bottom')
    expect(entry.type).toBe('hit')
    expect(entry.description).toBe('Single to left')
    expect(typeof entry.id).toBe('string')
    expect(typeof entry.ts).toBe('number')
  })

  it('defaults inning to 1 when undefined', () => {
    const entry = makeLogEntry({}, 'out', '')
    expect(entry.inning).toBe(1)
    expect(entry.half).toBe('top')
  })
})
