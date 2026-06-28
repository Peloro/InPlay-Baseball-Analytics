export const EMPTY_HITTING = {
  atBats: 0, hits: 0, strikeouts: 0, outs: 0, walks: 0, runs: 0, rbi: 0, homeRuns: 0,
}

export const EMPTY_PITCHING = {
  inningsPitched: 0, outsPitched: 0, earnedRuns: 0, strikeouts: 0, walks: 0,
  strikes: 0, balls: 0, pitchCount: 0, hitsAllowed: 0,
  pitchTypes: { FB: 0, CV: 0, SL: 0, CH: 0, SI: 0, CT: 0, other: 0 },
}

export const EMPTY_DEFENSE = {
  errors: 0, doublePlays: 0, flyOuts: 0, groundOuts: 0, lineOuts: 0,
}

export const EMPTY_GAME_STAT = {
  hitting: EMPTY_HITTING,
  pitching: EMPTY_PITCHING,
  defense: EMPTY_DEFENSE,
}
