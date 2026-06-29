import { safeNumber, toFixed3 } from '../utils/number'
import { avgFromEntry, obpFromHitting, slgFromHitting, opsFromHitting } from '../utils/stats'

// Each entry: { label, sortKey, get(entry) }
// `entry` must have .hitting and optionally .avg (precomputed batting average)
export const HITTER_COLS = [
  { label: 'AB',  sortKey: 'atBats',      get: (e) => safeNumber(e.hitting?.atBats) },
  { label: 'H',   sortKey: 'hits',        get: (e) => safeNumber(e.hitting?.hits) },
  { label: '2B',  sortKey: 'doubles',     get: (e) => safeNumber(e.hitting?.doubles) },
  { label: '3B',  sortKey: 'triples',     get: (e) => safeNumber(e.hitting?.triples) },
  { label: 'HR',  sortKey: 'homeRuns',    get: (e) => safeNumber(e.hitting?.homeRuns) },
  { label: 'R',   sortKey: 'runs',        get: (e) => safeNumber(e.hitting?.runs) },
  { label: 'RBI', sortKey: 'rbi',         get: (e) => safeNumber(e.hitting?.rbi) },
  { label: 'BB',  sortKey: 'walks',       get: (e) => safeNumber(e.hitting?.walks) },
  { label: 'SO',  sortKey: 'strikeouts',  get: (e) => safeNumber(e.hitting?.strikeouts) },
  { label: 'SB',  sortKey: 'stolenBases', get: (e) => safeNumber(e.hitting?.stolenBases) },
  { label: 'OUT', sortKey: 'outs',        get: (e) => safeNumber(e.hitting?.outs) },
  { label: 'AVG', sortKey: 'avg',         get: (e) => e.avg != null ? toFixed3(e.avg) : avgFromEntry(e) },
  { label: 'OBP', sortKey: 'obp',         get: (e) => obpFromHitting(e.hitting) },
  { label: 'SLG', sortKey: 'slg',         get: (e) => slgFromHitting(e.hitting) },
  { label: 'OPS', sortKey: 'ops',         get: (e) => opsFromHitting(e.hitting) },
]

// `entry` must have .defense
export const DEFENSE_COLS = [
  { label: 'E',  get: (e) => safeNumber(e.defense?.errors) },
  { label: 'DP', get: (e) => safeNumber(e.defense?.doublePlays) },
  { label: 'FO', get: (e) => safeNumber(e.defense?.flyOuts) },
  { label: 'GO', get: (e) => safeNumber(e.defense?.groundOuts) },
  { label: 'LO', get: (e) => safeNumber(e.defense?.lineOuts) },
]
