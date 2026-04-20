// Minimal IndexedDB helper for offline storage
const DB_NAME = 'baseball-local-db'
const DB_VERSION = 1
let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result
      if (!db.objectStoreNames.contains('players')) db.createObjectStore('players', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('gameStats')) db.createObjectStore('gameStats', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('seasonStats')) db.createObjectStore('seasonStats', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' })
      // store for queuing offline changes to sync when online
      if (!db.objectStoreNames.contains('syncQueue')) db.createObjectStore('syncQueue', { keyPath: 'qId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName))
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `local-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

const players = {
  async getAll() {
    const store = await tx('players')
    return new Promise((res, rej) => {
      const req = store.getAll()
      req.onsuccess = () => res(req.result || [])
      req.onerror = () => rej(req.error)
    })
  },
  async add(payload) {
    const id = payload.id || generateId()
    const now = new Date().toISOString()
    const record = { ...payload, id, synced: false, createdAt: now, updatedAt: now }
    const store = await tx('players', 'readwrite')
    return new Promise((res, rej) => {
      const req = store.put(record)
      req.onsuccess = () => res(record)
      req.onerror = () => rej(req.error)
    })
  },
  async put(payload) {
    if (!payload?.id) return this.add(payload)
    const now = new Date().toISOString()
    const record = { ...payload, updatedAt: now }
    const store = await tx('players', 'readwrite')
    return new Promise((res, rej) => {
      const req = store.put(record)
      req.onsuccess = () => res(record)
      req.onerror = () => rej(req.error)
    })
  },
  async remove(id) {
    const store = await tx('players', 'readwrite')
    return new Promise((res, rej) => {
      const req = store.delete(id)
      req.onsuccess = () => res()
      req.onerror = () => rej(req.error)
    })
  },
}

const games = {
  async getAll() {
    const store = await tx('games')
    return new Promise((res, rej) => {
      const req = store.getAll()
      req.onsuccess = () => res(req.result || [])
      req.onerror = () => rej(req.error)
    })
  },
  async add(payload) {
    const id = payload.id || generateId()
    const now = new Date().toISOString()
    const record = { ...payload, id, synced: false, createdAt: now, updatedAt: now }
    const store = await tx('games', 'readwrite')
    return new Promise((res, rej) => {
      const req = store.put(record)
      req.onsuccess = () => res(record)
      req.onerror = () => rej(req.error)
    })
  },
  async put(payload) {
    if (!payload?.id) return this.add(payload)
    const now = new Date().toISOString()
    const record = { ...payload, updatedAt: now }
    const store = await tx('games', 'readwrite')
    return new Promise((res, rej) => {
      const req = store.put(record)
      req.onsuccess = () => res(record)
      req.onerror = () => rej(req.error)
    })
  },
  async getById(id) {
    const store = await tx('games')
    return new Promise((res, rej) => {
      const req = store.get(id)
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
  },
  async remove(id) {
    const store = await tx('games', 'readwrite')
    return new Promise((res, rej) => {
      const req = store.delete(id)
      req.onsuccess = () => res()
      req.onerror = () => rej(req.error)
    })
  },
}

const gameStats = {
  async listByGame(gameId, playerId) {
    const store = await tx('gameStats')
    return new Promise((res, rej) => {
      const req = store.getAll()
      req.onsuccess = () => {
        const items = (req.result || []).filter((r) => r.gameId === gameId && (!playerId || r.playerId === playerId))
        res(items)
      }
      req.onerror = () => rej(req.error)
    })
  },
  async add(payload) {
    const id = payload.id || generateId()
    const now = new Date().toISOString()
    const record = { ...payload, id, synced: false, createdAt: now, updatedAt: now }
    const store = await tx('gameStats', 'readwrite')
    return new Promise((res, rej) => {
      const req = store.put(record)
      req.onsuccess = () => res(record)
      req.onerror = () => rej(req.error)
    })
  },
  async put(payload) {
    if (!payload?.id) return this.add(payload)
    const now = new Date().toISOString()
    const record = { ...payload, updatedAt: now }
    const store = await tx('gameStats', 'readwrite')
    return new Promise((res, rej) => {
      const req = store.put(record)
      req.onsuccess = () => res(record)
      req.onerror = () => rej(req.error)
    })
  },
}

const seasonStats = {
  async list(playerId) {
    const store = await tx('seasonStats')
    return new Promise((res, rej) => {
      const req = store.getAll()
      req.onsuccess = () => {
        const items = (req.result || []).filter((r) => !playerId || r.playerId === playerId)
        res(items)
      }
      req.onerror = () => rej(req.error)
    })
  },
  async put(payload) {
    const id = payload.id || generateId()
    const now = new Date().toISOString()
    const record = { ...payload, id, synced: false, createdAt: now, updatedAt: now }
    const store = await tx('seasonStats', 'readwrite')
    return new Promise((res, rej) => {
      const req = store.put(record)
      req.onsuccess = () => res(record)
      req.onerror = () => rej(req.error)
    })
  },
}

const settings = {
  async get(key) {
    const store = await tx('settings')
    return new Promise((res, rej) => {
      const req = store.get(key)
      req.onsuccess = () => res(req.result ? req.result.value : undefined)
      req.onerror = () => rej(req.error)
    })
  },
  async put(key, value) {
    const store = await tx('settings', 'readwrite')
    return new Promise((res, rej) => {
      const req = store.put({ key, value })
      req.onsuccess = () => res()
      req.onerror = () => rej(req.error)
    })
  },
}

const syncQueue = {
  async enqueue(action) {
    const qId = generateId()
    const store = await tx('syncQueue', 'readwrite')
    return new Promise((res, rej) => {
      const req = store.put({ qId, ...action })
      req.onsuccess = () => res({ qId, ...action })
      req.onerror = () => rej(req.error)
    })
  },
  async getAll() {
    const store = await tx('syncQueue')
    return new Promise((res, rej) => {
      const req = store.getAll()
      req.onsuccess = () => res(req.result || [])
      req.onerror = () => rej(req.error)
    })
  },
  async remove(qId) {
    const store = await tx('syncQueue', 'readwrite')
    return new Promise((res, rej) => {
      const req = store.delete(qId)
      req.onsuccess = () => res()
      req.onerror = () => rej(req.error)
    })
  },
}

export default {
  init: openDB,
  players,
  games,
  gameStats,
  seasonStats,
  settings,
  syncQueue,
}

