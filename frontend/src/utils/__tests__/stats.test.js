import { describe, it, expect } from 'vitest'
import {
  avgFromValues,
  avgFromEntry,
  eraFromEntry,
  formatEraFromOuts,
  outsToInnings,
  formatIpFromOuts,
  inningsToOuts,
  addInningRuns,
  obpFromHitting,
  slgFromHitting,
  opsFromHitting,
  kPctFromHitting,
  bbPctFromHitting,
  whipFromPitching,
  k9FromPitching,
} from '../stats'

describe('avgFromValues', () => {
  it('returns .333 for 1 hit in 3 AB', () => {
    expect(avgFromValues(3, 1)).toBe('0.333')
  })

  it('returns .000 with 0 AB', () => {
    expect(avgFromValues(0, 5)).toBe('0.000')
  })

  it('returns 1.000 for 3 hits in 3 AB', () => {
    expect(avgFromValues(3, 3)).toBe('1.000')
  })

  it('handles string inputs', () => {
    expect(avgFromValues('4', '2')).toBe('0.500')
  })
})

describe('avgFromEntry', () => {
  it('reads hitting.atBats and hitting.hits', () => {
    expect(avgFromEntry({ hitting: { atBats: 10, hits: 3 } })).toBe('0.300')
  })

  it('returns .000 for empty entry', () => {
    expect(avgFromEntry(null)).toBe('0.000')
  })
})

describe('eraFromEntry', () => {
  it('calculates ERA from outsPitched', () => {
    // 3 outs = 1 IP, 1 ER → ERA = 9.000
    expect(eraFromEntry({ pitching: { outsPitched: 3, earnedRuns: 1 } })).toBe('9.000')
  })

  it('returns 0.000 with no outs and no IP', () => {
    expect(eraFromEntry({ pitching: { outsPitched: 0, earnedRuns: 3 } })).toBe('0.000')
  })

  it('calculates with 9 outs = 3 IP and 2 ER', () => {
    // ERA = (2 * 27) / 9 = 6.000
    expect(eraFromEntry({ pitching: { outsPitched: 9, earnedRuns: 2 } })).toBe('6.000')
  })

  it('returns 0.000 with 0 ER and some outs', () => {
    expect(eraFromEntry({ pitching: { outsPitched: 9, earnedRuns: 0 } })).toBe('0.000')
  })
})

describe('formatEraFromOuts', () => {
  it('returns placeholder when 0 outs', () => {
    expect(formatEraFromOuts(0, 2)).toBe('--')
  })

  it('calculates ERA correctly', () => {
    // 27 outs = 9 IP, 3 ER → ERA = 3.00
    expect(formatEraFromOuts(27, 3)).toBe('3.00')
  })

  it('uses custom digits', () => {
    expect(formatEraFromOuts(27, 3, 1)).toBe('3.0')
  })
})

describe('outsToInnings', () => {
  it('converts 3 outs to 1.0', () => {
    expect(outsToInnings(3)).toBe(1.0)
  })

  it('converts 4 outs to 1.1', () => {
    expect(outsToInnings(4)).toBe(1.1)
  })

  it('converts 0 outs to 0', () => {
    expect(outsToInnings(0)).toBe(0)
  })

  it('converts 10 outs to 3.1', () => {
    expect(outsToInnings(10)).toBe(3.1)
  })
})

describe('formatIpFromOuts', () => {
  it('formats 3 outs as "1.0"', () => {
    expect(formatIpFromOuts(3)).toBe('1.0')
  })

  it('formats 7 outs as "2.1"', () => {
    expect(formatIpFromOuts(7)).toBe('2.1')
  })

  it('formats 0 outs as "0.0"', () => {
    expect(formatIpFromOuts(0)).toBe('0.0')
  })
})

describe('inningsToOuts', () => {
  it('converts 1 inning to 3 outs', () => {
    expect(inningsToOuts(1)).toBe(3)
  })

  it('converts 1.1 to 4 outs', () => {
    expect(inningsToOuts(1.1)).toBe(4)
  })

  it('converts 0 to 0', () => {
    expect(inningsToOuts(0)).toBe(0)
  })

  it('converts 3.2 to 11 outs', () => {
    expect(inningsToOuts(3.2)).toBe(11)
  })
})

describe('addInningRuns', () => {
  it('adds home runs to the correct inning index', () => {
    const result = addInningRuns({ home: [], away: [] }, 1, 2, 0)
    expect(result.home[0]).toBe(2)
    expect(result.away[0]).toBe(0)
  })

  it('adds away runs to the correct inning index', () => {
    const result = addInningRuns({ home: [], away: [] }, 2, 0, 3)
    expect(result.home[1]).toBe(0)
    expect(result.away[1]).toBe(3)
  })

  it('accumulates runs in the same inning', () => {
    const existing = { home: [1], away: [0] }
    const result = addInningRuns(existing, 1, 2, 0)
    expect(result.home[0]).toBe(3)
  })

  it('does not mutate the original object', () => {
    const original = { home: [1, 2], away: [0, 1] }
    addInningRuns(original, 1, 5, 0)
    expect(original.home[0]).toBe(1)
  })
})

describe('obpFromHitting', () => {
  it('calculates OBP correctly', () => {
    const hitting = { hits: 3, walks: 1, hitByPitch: 0, atBats: 10, sacrificeFlies: 0 }
    // (3+1+0) / (10+1+0+0) = 4/11
    expect(obpFromHitting(hitting)).toBe((4 / 11).toFixed(3))
  })

  it('returns --- with no plate appearances', () => {
    expect(obpFromHitting({ hits: 0, walks: 0, hitByPitch: 0, atBats: 0, sacrificeFlies: 0 })).toBe('---')
  })
})

describe('slgFromHitting', () => {
  it('calculates SLG with a double', () => {
    // 1 double, 1 AB → TB = 1+1 = 2 → SLG = 2.000
    const hitting = { atBats: 1, hits: 1, doubles: 1, triples: 0, homeRuns: 0 }
    expect(slgFromHitting(hitting)).toBe('2.000')
  })

  it('calculates SLG with a homerun', () => {
    // 1 HR, 4 AB → TB = 1+0+0+3 = 4 → SLG = 1.000
    const hitting = { atBats: 4, hits: 1, doubles: 0, triples: 0, homeRuns: 1 }
    expect(slgFromHitting(hitting)).toBe('1.000')
  })

  it('returns --- with 0 AB', () => {
    expect(slgFromHitting({ atBats: 0 })).toBe('---')
  })
})

describe('whipFromPitching', () => {
  it('calculates WHIP correctly', () => {
    // 3 BB + 3 H = 6, 9 outs = 3 IP → WHIP = 6/3 = 2.00
    const pitching = { outsPitched: 9, walks: 3, hitsAllowed: 3 }
    expect(whipFromPitching(pitching)).toBe('2.00')
  })

  it('returns --- with 0 outs', () => {
    expect(whipFromPitching({ outsPitched: 0, walks: 1, hitsAllowed: 1 })).toBe('---')
  })
})

describe('k9FromPitching', () => {
  it('calculates K/9 correctly', () => {
    // 3 K, 9 outs = 3 IP → K/9 = (3*9)/3 = 9.0
    const pitching = { outsPitched: 9, strikeouts: 3 }
    expect(k9FromPitching(pitching)).toBe('9.0')
  })

  it('returns --- with 0 outs', () => {
    expect(k9FromPitching({ outsPitched: 0, strikeouts: 3 })).toBe('---')
  })
})

describe('kPctFromHitting', () => {
  it('calculates K% correctly', () => {
    // 3 K, 10 AB, 0 BB/HBP/SF → 3/10 = 30.0%
    const hitting = { atBats: 10, strikeouts: 3, walks: 0, hitByPitch: 0, sacrificeFlies: 0 }
    expect(kPctFromHitting(hitting)).toBe('30.0%')
  })

  it('returns --- with 0 PA', () => {
    expect(kPctFromHitting({ atBats: 0, strikeouts: 0, walks: 0, hitByPitch: 0, sacrificeFlies: 0 })).toBe('---')
  })
})

describe('bbPctFromHitting', () => {
  it('calculates BB% correctly', () => {
    // 2 BB, 8 AB → 2/10 = 20.0%
    const hitting = { atBats: 8, walks: 2, hitByPitch: 0, sacrificeFlies: 0 }
    expect(bbPctFromHitting(hitting)).toBe('20.0%')
  })

  it('returns --- with 0 PA', () => {
    expect(bbPctFromHitting({ atBats: 0, walks: 0, hitByPitch: 0, sacrificeFlies: 0 })).toBe('---')
  })
})
