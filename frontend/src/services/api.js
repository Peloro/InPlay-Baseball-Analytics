import axios from 'axios'

// ── Local-first store ─────────────────────────────────────────────
// All data lives in localStorage. The app works offline from first launch.
// When VITE_API_URL is set and the device is online, changes sync in the background.

const LS = {
  players:   'baseball_lf_players_v1',
  games:     'baseball_lf_games_v1',
  gameStats: 'baseball_lf_gamestats_v1',
  syncQueue: 'baseball_lf_syncqueue_v1',
}

function lfGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

function lfSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch {}
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function safeN(v) {
  const x = parseFloat(v)
  return Number.isFinite(x) ? x : 0
}

// ── One-time migration from previous cache-based storage ──────────
;(function migrate() {
  if (localStorage.getItem('_lf_v1_done')) return
  try {
    const rawPlayers = localStorage.getItem('baseball_api_v1_/players')
    if (rawPlayers && !localStorage.getItem(LS.players)) {
      localStorage.setItem(LS.players, rawPlayers)
    }
    const rawGames = localStorage.getItem('baseball_api_v1_/games')
    if (rawGames && !localStorage.getItem(LS.games)) {
      localStorage.setItem(LS.games, rawGames)
    }
  } catch {}
  localStorage.setItem('_lf_v1_done', '1')
}())

// ── Optional backend (sync layer) ─────────────────────────────────

const BACKEND = import.meta.env.VITE_API_URL

const http = (BACKEND && !BACKEND.includes('YOUR_BACKEND'))
  ? axios.create({ baseURL: BACKEND, timeout: 8000 })
  : null

async function netGet(url, params) {
  if (!http) return null
  try {
    const res = await http.get(url, params ? { params } : undefined)
    return res.data
  } catch { return null }
}

async function netWrite(method, url, data) {
  if (!http) return null
  try {
    const res = method === 'delete'
      ? await http.delete(url)
      : await http[method](url, data)
    return res.data
  } catch { return null }
}

function queueSync(method, url, data, localId = null) {
  const q = lfGet(LS.syncQueue)
  q.push({ method, url, data, _ts: Date.now(), localId })
  lfSet(LS.syncQueue, q)
}

function replaceIdInStores(postUrl, localId, serverId, serverRecord) {
  if (postUrl === '/players') {
    const list = lfGet(LS.players)
    const idx = list.findIndex(p => p._id === localId)
    if (idx !== -1) { list[idx] = serverRecord; lfSet(LS.players, list) }
    lfSet(LS.gameStats, lfGet(LS.gameStats).map(s =>
      String(s.playerId) === localId ? { ...s, playerId: serverId } : s
    ))
  } else if (postUrl === '/games') {
    const list = lfGet(LS.games)
    const idx = list.findIndex(g => g._id === localId)
    if (idx !== -1) { list[idx] = serverRecord; lfSet(LS.games, list) }
    lfSet(LS.gameStats, lfGet(LS.gameStats).map(s =>
      s.gameId === localId ? { ...s, gameId: serverId } : s
    ))
  } else if (postUrl === '/game-stats') {
    const list = lfGet(LS.gameStats)
    const idx = list.findIndex(s => s._id === localId)
    if (idx !== -1) { list[idx] = serverRecord; lfSet(LS.gameStats, list) }
  }
}

export async function flushWriteQueue() {
  const queue = lfGet(LS.syncQueue)
  if (!queue.length) return
  const failed = []
  const idMap = {}

  for (const item of queue) {
    let url = item.url
    if (item.localId && idMap[item.localId]) {
      url = url.replace(item.localId, idMap[item.localId])
    }

    const ok = await netWrite(item.method, url, item.data)
    if (!ok) {
      failed.push(item)
    } else if (item.method === 'post' && item.localId && ok?._id) {
      idMap[item.localId] = ok._id
      replaceIdInStores(item.url, item.localId, ok._id, ok)
    }
  }

  lfSet(LS.syncQueue, failed)
}

if (typeof window !== 'undefined' && http) {
  window.addEventListener('online', () => { flushWriteQueue().catch(() => {}) })
}

// ── Players ───────────────────────────────────────────────────────

export const playersApi = {
  list() {
    if (http) {
      netGet('/players').then(data => {
        if (Array.isArray(data) && data.length) lfSet(LS.players, data)
      })
    }
    return { data: lfGet(LS.players) }
  },

  async create(payload) {
    const record = { ...payload, _id: uid() }
    lfSet(LS.players, [...lfGet(LS.players), record])

    const synced = await netWrite('post', '/players', payload)
    if (synced?._id) {
      const list = lfGet(LS.players)
      const idx = list.findIndex(p => p._id === record._id)
      if (idx !== -1) { list[idx] = synced; lfSet(LS.players, list) }
      return { data: synced }
    }

    queueSync('post', '/players', payload, record._id)
    return { data: record }
  },

  async update(id, patch) {
    const list = lfGet(LS.players)
    const idx = list.findIndex(p => p._id === id || p.id === id)
    if (idx !== -1) { list[idx] = { ...list[idx], ...patch }; lfSet(LS.players, list) }

    const synced = await netWrite('put', `/players/${id}`, patch)
    if (!synced) queueSync('put', `/players/${id}`, patch, id)

    return { data: idx !== -1 ? list[idx] : { _id: id, ...patch } }
  },

  async remove(id) {
    lfSet(LS.players, lfGet(LS.players).filter(p => p._id !== id && p.id !== id))

    const synced = await netWrite('delete', `/players/${id}`)
    if (!synced) queueSync('delete', `/players/${id}`, null, id)

    return { data: {} }
  },
}

// ── Games ─────────────────────────────────────────────────────────

export const gamesApi = {
  list() {
    if (http) {
      netGet('/games').then(data => {
        if (Array.isArray(data) && data.length) lfSet(LS.games, data)
      })
    }
    return { data: lfGet(LS.games) }
  },

  getById(id) {
    const game = lfGet(LS.games).find(g => g._id === id || g.id === id) || null
    if (http && id) {
      netGet(`/games/${id}`).then(data => {
        if (!data) return
        const list = lfGet(LS.games)
        const idx = list.findIndex(g => g._id === id || g.id === id)
        if (idx !== -1) { list[idx] = data; lfSet(LS.games, list) }
        else lfSet(LS.games, [...list, data])
      })
    }
    return { data: game }
  },

  async create(payload) {
    const record = { ...payload, _id: uid() }
    lfSet(LS.games, [...lfGet(LS.games), record])

    const synced = await netWrite('post', '/games', payload)
    if (synced?._id) {
      const list = lfGet(LS.games)
      const idx = list.findIndex(g => g._id === record._id)
      if (idx !== -1) { list[idx] = synced; lfSet(LS.games, list) }
      return { data: synced }
    }

    queueSync('post', '/games', payload, record._id)
    return { data: record }
  },

  async update(id, patch) {
    const list = lfGet(LS.games)
    const idx = list.findIndex(g => g._id === id || g.id === id)
    if (idx !== -1) { list[idx] = { ...list[idx], ...patch }; lfSet(LS.games, list) }

    const synced = await netWrite('put', `/games/${id}`, patch)
    if (!synced) queueSync('put', `/games/${id}`, patch, id)

    return { data: idx !== -1 ? list[idx] : { _id: id, ...patch } }
  },

  async remove(id) {
    lfSet(LS.games, lfGet(LS.games).filter(g => g._id !== id && g.id !== id))
    lfSet(LS.gameStats, lfGet(LS.gameStats).filter(s => s.gameId !== id))

    const synced = await netWrite('delete', `/games/${id}`)
    if (!synced) queueSync('delete', `/games/${id}`, null, id)

    return { data: {} }
  },
}

// ── Game stats ────────────────────────────────────────────────────

export const gameStatsApi = {
  listByGame(gameId, playerId) {
    const all = lfGet(LS.gameStats)
    const filtered = all.filter(s =>
      s.gameId === gameId && (!playerId || s.playerId === playerId)
    )
    if (http && gameId) {
      netGet(`/game-stats/${gameId}`, playerId ? { playerId } : undefined).then(data => {
        if (!Array.isArray(data)) return
        const rest = lfGet(LS.gameStats).filter(s => s.gameId !== gameId)
        lfSet(LS.gameStats, [...rest, ...data])
      })
    }
    return { data: filtered }
  },

  async create(payload) {
    const record = { ...payload, _id: uid() }
    lfSet(LS.gameStats, [...lfGet(LS.gameStats), record])

    const synced = await netWrite('post', '/game-stats', payload)
    if (synced?._id) {
      const list = lfGet(LS.gameStats)
      const idx = list.findIndex(s => s._id === record._id)
      if (idx !== -1) { list[idx] = synced; lfSet(LS.gameStats, list) }
      return { data: synced }
    }

    queueSync('post', '/game-stats', payload, record._id)
    return { data: record }
  },

  async update(id, patch) {
    const list = lfGet(LS.gameStats)
    const idx = list.findIndex(s => s._id === id || s.id === id)
    if (idx !== -1) { list[idx] = { ...list[idx], ...patch }; lfSet(LS.gameStats, list) }

    const synced = await netWrite('put', `/game-stats/${id}`, patch)
    if (!synced) queueSync('put', `/game-stats/${id}`, patch, id)

    return { data: idx !== -1 ? list[idx] : { _id: id, ...patch } }
  },
}

// ── Season stats (computed from local game stats) ─────────────────

export const seasonStatsApi = {
  list(playerId) {
    const all = lfGet(LS.gameStats)
    const source = playerId ? all.filter(s => s.playerId === playerId) : all

    const byPlayer = {}
    for (const stat of source) {
      const pid = String(stat.playerId?._id || stat.playerId)
      if (!byPlayer[pid]) {
        byPlayer[pid] = {
          playerId: pid,
          hitting:  { atBats: 0, hits: 0, strikeouts: 0, outs: 0 },
          pitching: { inningsPitched: 0, outsPitched: 0, earnedRuns: 0, strikeouts: 0, walks: 0, strikes: 0, balls: 0, pitchCount: 0 },
          defense:  { errors: 0, doublePlays: 0, flyOuts: 0, groundOuts: 0, lineOuts: 0 },
          roleSummary: { hitterGames: 0, pitcherGames: 0 },
        }
      }
      const agg = byPlayer[pid]
      const h = stat.hitting || {}
      agg.hitting.atBats     += safeN(h.atBats)
      agg.hitting.hits       += safeN(h.hits)
      agg.hitting.strikeouts += safeN(h.strikeouts)
      agg.hitting.outs       += safeN(h.outs)
      const p = stat.pitching || {}
      agg.pitching.outsPitched  += safeN(p.outsPitched)
      agg.pitching.earnedRuns   += safeN(p.earnedRuns)
      agg.pitching.strikeouts   += safeN(p.strikeouts)
      agg.pitching.walks        += safeN(p.walks)
      agg.pitching.strikes      += safeN(p.strikes)
      agg.pitching.balls        += safeN(p.balls)
      agg.pitching.pitchCount   += safeN(p.pitchCount)
      const d = stat.defense || {}
      agg.defense.errors      += safeN(d.errors)
      agg.defense.doublePlays += safeN(d.doublePlays)
      agg.defense.flyOuts     += safeN(d.flyOuts)
      agg.defense.groundOuts  += safeN(d.groundOuts)
      agg.defense.lineOuts    += safeN(d.lineOuts)
      if (stat.type === 'pitcher') agg.roleSummary.pitcherGames += 1
      else agg.roleSummary.hitterGames += 1
    }

    const result = Object.values(byPlayer).map(agg => {
      const outs = agg.pitching.outsPitched
      const fullInnings = Math.floor(outs / 3)
      const rem = outs % 3
      agg.pitching.inningsPitched = fullInnings + rem / 10
      const ipDecimal = fullInnings + rem / 3
      const ab = agg.hitting.atBats
      return {
        ...agg,
        avg: ab ? agg.hitting.hits / ab : 0,
        era: ipDecimal ? (agg.pitching.earnedRuns / ipDecimal) * 9 : 0,
      }
    })

    return { data: result }
  },
}

// ── Default export (api.get / api.post / api.put / api.delete) ────
// Used in App.jsx for player operations via generic URL paths.

const api = {
  get(url) {
    if (url === '/players') return playersApi.list()
    if (url === '/games') return gamesApi.list()
    return { data: [] }
  },
  post(url, data) {
    if (url === '/players') return playersApi.create(data)
    if (url === '/games') return gamesApi.create(data)
    return Promise.resolve({ data })
  },
  put(url, data) {
    const pm = url.match(/^\/players\/(.+)$/)
    if (pm) return playersApi.update(pm[1], data)
    const gm = url.match(/^\/games\/(.+)$/)
    if (gm) return gamesApi.update(gm[1], data)
    return Promise.resolve({ data })
  },
  delete(url) {
    const pm = url.match(/^\/players\/(.+)$/)
    if (pm) return playersApi.remove(pm[1])
    const gm = url.match(/^\/games\/(.+)$/)
    if (gm) return gamesApi.remove(gm[1])
    return Promise.resolve({ data: {} })
  },
}

export default api
