import axios from 'axios'
import localDb from './localDb'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
})

// Initialize local DB
localDb.init().catch(() => {})

// Games API with local fallback/sync
export const gamesApi = {
  async create(payload) {
    if (!navigator.onLine) {
      const saved = await localDb.games.add(payload)
      const serverPayload = { ...payload }
      if (saved.id) delete serverPayload.id
      await localDb.syncQueue.enqueue({ method: 'create', resource: 'games', payload: serverPayload, localId: saved.id })
      return { data: saved }
    }

    try {
      const resp = await api.post('/games', payload)
      await localDb.games.put({ ...resp.data, synced: true })
      return resp
    } catch (e) {
      const saved = await localDb.games.add(payload)
      return { data: saved }
    }
  },
  async list() {
    try {
      const resp = await api.get('/games')
      const items = resp.data || []
      for (const it of items) await localDb.games.put({ ...it, synced: true })
      return resp
    } catch (e) {
      const items = await localDb.games.getAll()
      return { data: items }
    }
  },
  async getById(id) {
    try {
      const resp = await api.get(`/games/${id}`)
      await localDb.games.put({ ...resp.data, synced: true })
      return resp
    } catch (e) {
      const item = await localDb.games.getById(id)
      return { data: item }
    }
  },
  async update(id, payload) {
    if (!navigator.onLine) {
      const patched = { ...(payload || {}), id }
      await localDb.games.put(patched)
      await localDb.syncQueue.enqueue({ method: 'update', resource: 'games', id, payload })
      return { data: patched }
    }

    try {
      const resp = await api.put(`/games/${id}`, payload)
      await localDb.games.put({ ...resp.data, synced: true })
      return resp
    } catch (e) {
      const patched = { ...(payload || {}), id }
      await localDb.games.put(patched)
      return { data: patched }
    }
  },
  async remove(id) {
    if (!navigator.onLine) {
      await localDb.games.remove(id)
      await localDb.syncQueue.enqueue({ method: 'remove', resource: 'games', id })
      return
    }

    try {
      await api.delete(`/games/${id}`)
      await localDb.games.remove(id)
    } catch (e) {
      await localDb.games.remove(id)
    }
  },
}

// Players API
export const playersApi = {
  async list() {
    if (!navigator.onLine) {
      const items = await localDb.players.getAll()
      return { data: items }
    }

    try {
      const resp = await api.get('/players')
      const items = resp.data || []
      for (const it of items) await localDb.players.put({ ...it, synced: true })
      return resp
    } catch (e) {
      const items = await localDb.players.getAll()
      return { data: items }
    }
  },
  async create(payload) {
    if (!navigator.onLine) {
      const saved = await localDb.players.add(payload)
      // enqueue create (server payload should not include local id)
      const serverPayload = { ...payload }
      if (saved.id) delete serverPayload.id
      await localDb.syncQueue.enqueue({ method: 'create', resource: 'players', payload: serverPayload, localId: saved.id })
      return { data: saved }
    }

    try {
      const resp = await api.post('/players', payload)
      await localDb.players.put({ ...resp.data, synced: true })
      return resp
    } catch (e) {
      const saved = await localDb.players.add(payload)
      return { data: saved }
    }
  },
  async update(id, payload) {
    if (!navigator.onLine) {
      const patched = { ...(payload || {}), id }
      await localDb.players.put(patched)
      await localDb.syncQueue.enqueue({ method: 'update', resource: 'players', id, payload: payload })
      return { data: patched }
    }

    try {
      const resp = await api.put(`/players/${id}`, payload)
      await localDb.players.put({ ...resp.data, synced: true })
      return resp
    } catch (e) {
      const patched = { ...(payload || {}), id }
      await localDb.players.put(patched)
      return { data: patched }
    }
  },
  async remove(id) {
    if (!navigator.onLine) {
      await localDb.players.remove(id)
      await localDb.syncQueue.enqueue({ method: 'remove', resource: 'players', id })
      return
    }

    try {
      await api.delete(`/players/${id}`)
      await localDb.players.remove(id)
    } catch (e) {
      await localDb.players.remove(id)
    }
  },
}

// Game stats API
export const gameStatsApi = {
  async create(payload) {
    if (!navigator.onLine) {
      const saved = await localDb.gameStats.add(payload)
      await localDb.syncQueue.enqueue({ method: 'create', resource: 'gameStats', payload, localId: saved.id })
      return { data: saved }
    }

    try {
      const resp = await api.post('/game-stats', payload)
      await localDb.gameStats.put({ ...resp.data, synced: true })
      return resp
    } catch (e) {
      const saved = await localDb.gameStats.add(payload)
      return { data: saved }
    }
  },
  async update(id, payload) {
    if (!navigator.onLine) {
      const patched = { ...(payload || {}), id }
      await localDb.gameStats.put(patched)
      await localDb.syncQueue.enqueue({ method: 'update', resource: 'gameStats', id, payload })
      return { data: patched }
    }

    try {
      const resp = await api.put(`/game-stats/${id}`, payload)
      await localDb.gameStats.put({ ...resp.data, synced: true })
      return resp
    } catch (e) {
      const patched = { ...(payload || {}), id }
      await localDb.gameStats.put(patched)
      return { data: patched }
    }
  },
  async listByGame(gameId, playerId) {
    if (!navigator.onLine) {
      const items = await localDb.gameStats.listByGame(gameId, playerId)
      return { data: items }
    }

    try {
      const resp = await api.get(`/game-stats/${gameId}`, { params: playerId ? { playerId } : undefined })
      const items = resp.data || []
      for (const it of items) await localDb.gameStats.put({ ...it, synced: true })
      return resp
    } catch (e) {
      const items = await localDb.gameStats.listByGame(gameId, playerId)
      return { data: items }
    }
  },
}

// Season stats API
export const seasonStatsApi = {
  async list(playerId) {
    if (!navigator.onLine) {
      const items = await localDb.seasonStats.list(playerId)
      return { data: items }
    }

    try {
      const resp = await api.get('/season-stats', { params: playerId ? { playerId } : undefined })
      const items = resp.data || []
      for (const it of items) await localDb.seasonStats.put(it)
      return resp
    } catch (e) {
      const items = await localDb.seasonStats.list(playerId)
      return { data: items }
    }
  },
}

export default api

// Synchronization: process queued actions when back online
export async function sync() {
  if (!navigator.onLine) return
  const queue = await localDb.syncQueue.getAll()
  if (!queue || queue.length === 0) return

  // mapping from localId -> serverId for created records
  const localToServer = {}

  for (const q of queue) {
    try {
      if (q.resource === 'players') {
        if (q.method === 'create') {
          const resp = await api.post('/players', q.payload)
          const server = { ...resp.data, synced: true }
          // write server copy (mark synced)
          await localDb.players.put(server)
          // remove old local record if needed
          if (q.localId && q.localId !== server.id) await localDb.players.remove(q.localId)
          if (q.localId) localToServer[q.localId] = server.id
        } else if (q.method === 'update') {
          const targetId = localToServer[q.id] || q.id
          await api.put(`/players/${targetId}`, q.payload)
        } else if (q.method === 'remove') {
          const targetId = localToServer[q.id] || q.id
          await api.delete(`/players/${targetId}`)
        }
      }

      if (q.resource === 'games') {
        if (q.method === 'create') {
          const resp = await api.post('/games', q.payload)
          const server = { ...resp.data, synced: true }
          await localDb.games.put(server)
          if (q.localId && q.localId !== server.id) await localDb.games.remove(q.localId)
          if (q.localId) localToServer[q.localId] = server.id
        } else if (q.method === 'update') {
          const targetId = localToServer[q.id] || q.id
          await api.put(`/games/${targetId}`, q.payload)
        } else if (q.method === 'remove') {
          const targetId = localToServer[q.id] || q.id
          await api.delete(`/games/${targetId}`)
        }
      }

      if (q.resource === 'gameStats') {
        if (q.method === 'create') {
          const resp = await api.post('/game-stats', q.payload)
          const server = { ...resp.data, synced: true }
          await localDb.gameStats.put(server)
          if (q.localId && q.localId !== server.id) await localDb.gameStats.remove(q.localId)
          if (q.localId) localToServer[q.localId] = server.id
        } else if (q.method === 'update') {
          const targetId = localToServer[q.id] || q.id
          await api.put(`/game-stats/${targetId}`, q.payload)
        }
      }

      // remove processed queue item
      await localDb.syncQueue.remove(q.qId)
    } catch (err) {
      // leave item in queue and continue with next; will retry later
      console.warn('sync item failed, will retry later', q, err)
    }
  }
}
