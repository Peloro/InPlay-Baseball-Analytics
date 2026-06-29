import axios from 'axios'
import { EMPTY_HITTING, EMPTY_PITCHING, EMPTY_DEFENSE } from '../constants/stats'

// ── Local-first store ─────────────────────────────────────────────
// All data lives in localStorage. The app works offline from first launch.
// When VITE_API_URL is set and the device is online, changes sync in the background.

const AUTH_KEY = 'baseball_auth_v1'

export function getAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null') } catch { return null }
}

// Logical key names — the actual localStorage key is prefixed with teamId via lsKey()
const LS = {
  players:   'players',
  games:     'games',
  gameStats: 'gamestats',
  syncQueue: 'syncqueue',
}

function lsKey(name) {
  const teamId = getAuth()?.teamId || 'local'
  return `baseball_lf_${teamId}_${name}_v1`
}

function lfGet(key) {
  try { return JSON.parse(localStorage.getItem(lsKey(key)) || '[]') } catch { return [] }
}

function lfSet(key, data) {
  try { localStorage.setItem(lsKey(key), JSON.stringify(data)) } catch {}
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
    if (rawPlayers && !localStorage.getItem(lsKey(LS.players))) {
      localStorage.setItem(lsKey(LS.players), rawPlayers)
    }
    const rawGames = localStorage.getItem('baseball_api_v1_/games')
    if (rawGames && !localStorage.getItem(lsKey(LS.games))) {
      localStorage.setItem(lsKey(LS.games), rawGames)
    }
  } catch {}
  localStorage.setItem('_lf_v1_done', '1')
}())

// ── Optional backend (sync layer) ─────────────────────────────────

const BACKEND = import.meta.env.VITE_API_URL

const http = (BACKEND && !BACKEND.includes('YOUR_BACKEND'))
  ? axios.create({ baseURL: BACKEND, timeout: 35000 })
  : null

if (http) {
  // 2.2 — attach Bearer token to every request
  http.interceptors.request.use(cfg => {
    const auth = getAuth()
    if (auth?.token) cfg.headers.Authorization = `Bearer ${auth.token}`
    return cfg
  })

  // 2.3 — on 401 clear auth and signal the app to show login screen
  http.interceptors.response.use(
    res => res,
    err => {
      if (err?.response?.status === 401) {
        localStorage.removeItem(AUTH_KEY)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('baseball:logout'))
        }
      }
      return Promise.reject(err)
    }
  )
}

// ── Auth helpers ──────────────────────────────────────────────────

function getTokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp ? payload.exp * 1000 : null
  } catch { return null }
}

export async function refreshTokenIfNeeded() {
  if (!http) return
  const auth = getAuth()
  if (!auth?.token) return
  const exp = getTokenExpiry(auth.token)
  if (!exp) return
  const now = Date.now()
  if (exp <= now) return // already expired — 401 interceptor will handle it
  if (exp - now > 7 * 24 * 60 * 60 * 1000) return // more than 7 days left, skip
  try {
    const res = await http.post('/auth/refresh')
    localStorage.setItem(AUTH_KEY, JSON.stringify({ ...auth, token: res.data.token }))
  } catch { /* silent — actual expiry is handled by the 401 interceptor */ }
}

export async function login(email, password) {
  if (!http) throw new Error('Backend não configurado.')
  const res = await http.post('/auth/login', { email, password })
  localStorage.setItem(AUTH_KEY, JSON.stringify(res.data))
  return res.data
}

export async function register(teamName, email, password) {
  if (!http) throw new Error('Backend não configurado.')
  const res = await http.post('/auth/register', { teamName, email, password })
  return res.data
}

export function logout() {
  const auth = getAuth()
  const teamId = auth?.teamId
  if (teamId) {
    const prefix = `baseball_lf_${teamId}_`
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(prefix)) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
  }
  localStorage.removeItem(AUTH_KEY)
}

async function netGet(url, params) {
  if (!http) return null
  try {
    const res = await http.get(url, params ? { params } : undefined)
    return res.data
  } catch { return null }
}

async function netWrite(method, url, data) {
  if (!http) return {}
  try {
    const res = method === 'delete'
      ? await http.delete(url)
      : await http[method](url, data)
    return res.data || {}  // 204 No Content → res.data="" (falsy) → treat as success
  } catch (e) {
    // 4xx = permanent client error, no point retrying (404 DELETE = already gone)
    if (e?.response?.status >= 400 && e?.response?.status < 500) return {}
    return null
  }
}

function queueSync(method, url, data, localId = null) {
  const q = lfGet(LS.syncQueue)
  if (method !== 'post') {
    // For PUT/DELETE, replace any existing item with the same URL to avoid queue bloat
    const idx = q.findIndex(item => item.method === method && item.url === url)
    if (idx !== -1) {
      q[idx] = { method, url, data, _ts: Date.now(), localId }
      lfSet(LS.syncQueue, q)
      emitStatus('pending')
      return
    }
  }
  q.push({ method, url, data, _ts: Date.now(), localId })
  lfSet(LS.syncQueue, q)
  emitStatus('pending')
}

// Returns IDs of records that are pending a POST to the server (created offline)
function pendingSyncIds(storeKey) {
  const q = lfGet(LS.syncQueue)
  const urlPrefix = storeKey === LS.players ? '/players' : storeKey === LS.games ? '/games' : '/game-stats'
  const ids = new Set()
  for (const item of q) {
    if (item.method === 'post' && item.localId && item.url === urlPrefix) ids.add(item.localId)
  }
  return ids
}

// Merges server list with local-only records (created offline, not yet synced)
function mergeWithLocal(serverList, localKey) {
  const pendingIds = pendingSyncIds(localKey)
  if (!pendingIds.size) return serverList
  const local = lfGet(localKey)
  const localOnly = local.filter(r => pendingIds.has(r._id))
  return [...serverList, ...localOnly]
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

function removeOrphanedRecord(postUrl, localId) {
  if (postUrl === '/players') {
    lfSet(LS.players, lfGet(LS.players).filter(p => p._id !== localId))
  } else if (postUrl === '/games') {
    lfSet(LS.games, lfGet(LS.games).filter(g => g._id !== localId))
    lfSet(LS.gameStats, lfGet(LS.gameStats).filter(s => s.gameId !== localId))
  } else if (postUrl === '/game-stats') {
    lfSet(LS.gameStats, lfGet(LS.gameStats).filter(s => s._id !== localId))
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
    } else if (item.method === 'post' && item.localId) {
      if (ok._id) {
        idMap[item.localId] = ok._id
        replaceIdInStores(item.url, item.localId, ok._id, ok)
      } else {
        // 4xx permanent failure — server rejected the create; remove the local-only record
        console.warn('[sync] discarding failed POST, removing orphaned record:', item.url, item.localId)
        removeOrphanedRecord(item.url, item.localId)
      }
    }
  }

  lfSet(LS.syncQueue, failed)
}

// ── Sync status ───────────────────────────────────────────────────
// Tracks the last known sync state. App reads this via getSyncStatus()
// and subscribes to 'baseball:syncstatus' DOM events for reactive updates.

let _syncStatus = http ? 'unknown' : 'no-backend'
let _syncing = false

export function getSyncStatus() { return _syncStatus }

function emitStatus(status) {
  _syncStatus = status
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('baseball:syncstatus', { detail: { status } }))
  }
}

// ── syncWithServer ────────────────────────────────────────────────
// Full sync cycle: push pending writes → pull fresh data → merge local.
// Call this on app mount and on reconnect. All game-time reads stay local.

export async function syncWithServer() {
  if (!http) {
    lfSet(LS.syncQueue, [])
    emitStatus('no-backend')
    return { ok: false, reason: 'no-backend' }
  }
  if (!navigator.onLine) {
    emitStatus('offline')
    return { ok: false, reason: 'offline' }
  }
  if (_syncing) return { ok: false, reason: 'busy' }
  _syncing = true

  emitStatus('syncing')
  try {
    await refreshTokenIfNeeded()
    // Push pending local writes first so the server pull reflects them
    await flushWriteQueue()

    // Pull fresh data from server and merge with any still-pending local records
    const [players, games, gameStats] = await Promise.all([
      netGet('/players'),
      netGet('/games'),
      netGet('/game-stats'),
    ])

    if (Array.isArray(players))   lfSet(LS.players,   mergeWithLocal(players,   LS.players))
    if (Array.isArray(games))     lfSet(LS.games,      mergeWithLocal(games,     LS.games))
    if (Array.isArray(gameStats)) lfSet(LS.gameStats,  mergeWithLocal(gameStats, LS.gameStats))

    const pendingLeft = lfGet(LS.syncQueue).length
    emitStatus(pendingLeft > 0 ? 'pending' : 'synced')

    // Signal React to re-fetch from updated localStorage
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('baseball:synced'))
    }

    return { ok: true }
  } catch {
    emitStatus('error')
    return { ok: false, reason: 'error' }
  } finally {
    _syncing = false
  }
}

if (typeof window !== 'undefined' && http) {
  window.addEventListener('online', () => { syncWithServer().catch(() => {}) })
  window.addEventListener('offline', () => { emitStatus('offline') })
}

// ── Players ───────────────────────────────────────────────────────

export const playersApi = {
  list() {
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

    // null = network failure (retry later); {} = server rejected (don't retry)
    if (synced === null) queueSync('post', '/players', payload, record._id)
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
    lfSet(LS.gameStats, lfGet(LS.gameStats).filter(s => String(s.playerId?._id || s.playerId) !== id))

    const synced = await netWrite('delete', `/players/${id}`)
    if (!synced) queueSync('delete', `/players/${id}`, null, id)

    return { data: {} }
  },
}

// ── Games ─────────────────────────────────────────────────────────

export const gamesApi = {
  list() {
    return { data: lfGet(LS.games) }
  },

  getById(id) {
    const game = lfGet(LS.games).find(g => g._id === id || g.id === id) || null
    if (http && id) {
      netGet(`/games/${id}`).then(data => {
        if (!data) return
        // Don't overwrite if there are pending local writes for this game
        const hasPending = lfGet(LS.syncQueue).some(
          item => item.localId === id || item.url.includes(`/${id}`)
        )
        if (hasPending) return
        const list = lfGet(LS.games)
        const idx = list.findIndex(g => g._id === id || g.id === id)
        if (idx !== -1) { list[idx] = data; lfSet(LS.games, list) }
        else lfSet(LS.games, [...list, data])
      }).catch(() => {})
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

    if (synced === null) queueSync('post', '/games', payload, record._id)
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

  clearSeason() {
    lfSet(LS.games, [])
    lfSet(LS.gameStats, [])
    const q = lfGet(LS.syncQueue).filter(
      item => !item.url.startsWith('/games') && !item.url.startsWith('/game-stats')
    )
    lfSet(LS.syncQueue, q)
    return { data: [] }
  },
}

// ── Game stats ────────────────────────────────────────────────────

export const gameStatsApi = {
  listByGame(gameId, playerId) {
    const all = lfGet(LS.gameStats)
    if (!playerId) return { data: all.filter(s => s.gameId === gameId) }
    const pid = String(playerId?._id || playerId)
    return { data: all.filter(s => s.gameId === gameId && String(s.playerId?._id || s.playerId) === pid) }
  },

  // Upsert using (gameId, playerId) as composite key.
  // Avoids the stale-_id bug: after a background server sync replaces a local
  // _id with the MongoDB id, subsequent writes still find the record correctly.
  upsert(gameId, playerId, payload) {
    const pid = String(playerId?._id || playerId)
    const all = lfGet(LS.gameStats)
    const idx = all.findIndex(s =>
      s.gameId === gameId && String(s.playerId?._id || s.playerId) === pid
    )

    let record
    if (idx >= 0) {
      record = { ...all[idx], ...payload }
      all[idx] = record
      lfSet(LS.gameStats, all)
      const id = record._id
      netWrite('put', `/game-stats/${id}`, payload)
        .then(synced => { if (!synced) queueSync('put', `/game-stats/${id}`, payload, id) })
    } else {
      record = { _id: uid(), gameId, playerId: pid, ...payload }
      const localId = record._id
      lfSet(LS.gameStats, [...lfGet(LS.gameStats), record])
      netWrite('post', '/game-stats', { gameId, playerId: pid, ...payload })
        .then(synced => {
          if (synced?._id) {
            const list = lfGet(LS.gameStats)
            const i = list.findIndex(s => s._id === localId)
            if (i >= 0) { list[i] = synced; lfSet(LS.gameStats, list) }
          } else if (synced === null) {
            queueSync('post', '/game-stats', { gameId, playerId: pid, ...payload }, localId)
          }
        })
    }

    return { data: record }
  },
}

// ── Season stats (computed from local game stats) ─────────────────

export const seasonStatsApi = {
  list(playerId) {
    const all = lfGet(LS.gameStats)
    const normPid = playerId ? String(playerId?._id || playerId) : null
    const source = normPid ? all.filter(s => String(s.playerId?._id || s.playerId) === normPid) : all

    const byPlayer = {}
    for (const stat of source) {
      const pid = String(stat.playerId?._id || stat.playerId)
      if (!byPlayer[pid]) {
        byPlayer[pid] = {
          playerId: pid,
          hitting:  { ...EMPTY_HITTING },
          pitching: { ...EMPTY_PITCHING, pitchTypes: { ...EMPTY_PITCHING.pitchTypes } },
          defense:  { ...EMPTY_DEFENSE },
          roleSummary: { hitterGames: 0, pitcherGames: 0 },
        }
      }
      const agg = byPlayer[pid]
      const h = stat.hitting || {}
      agg.hitting.atBats     += safeN(h.atBats)
      agg.hitting.hits       += safeN(h.hits)
      agg.hitting.strikeouts += safeN(h.strikeouts)
      agg.hitting.outs       += safeN(h.outs)
      agg.hitting.walks      += safeN(h.walks)
      agg.hitting.runs       += safeN(h.runs)
      agg.hitting.rbi        += safeN(h.rbi)
      agg.hitting.homeRuns   += safeN(h.homeRuns)
      const p = stat.pitching || {}
      agg.pitching.outsPitched  += safeN(p.outsPitched)
      agg.pitching.earnedRuns   += safeN(p.earnedRuns)
      agg.pitching.strikeouts   += safeN(p.strikeouts)
      agg.pitching.walks        += safeN(p.walks)
      agg.pitching.strikes      += safeN(p.strikes)
      agg.pitching.balls        += safeN(p.balls)
      agg.pitching.pitchCount   += safeN(p.pitchCount)
      agg.pitching.hitsAllowed  += safeN(p.hitsAllowed)
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

// ── Admin API (direct HTTP — no localStorage layer) ───────────────

export const adminApi = {
  async getPending() {
    const res = await http.get('/admin/pending')
    return res.data
  },
  async getTeams() {
    const res = await http.get('/admin/teams')
    return res.data
  },
  async approveUser(id) {
    await http.patch(`/admin/users/${id}/approve`)
  },
  async rejectUser(id) {
    await http.delete(`/admin/users/${id}`)
  },
  async setTeamStatus(teamId, status) {
    await http.patch(`/admin/teams/${teamId}/status`, { status })
  },
  async saveBilling(teamId, data) {
    await http.patch(`/admin/teams/${teamId}/billing`, data)
  },
  async deleteTeam(teamId) {
    await http.delete(`/admin/teams/${teamId}`)
  },
}
