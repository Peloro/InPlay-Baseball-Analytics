// Tests for gameStatsApi.upsert using jsdom localStorage
// The module is re-imported fresh per suite to avoid cross-test state pollution.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Stub out axios (the module references import.meta.env which won't be set in tests)
vi.mock('axios', () => ({
  default: { create: () => null },
}))

// Prevent the module-level migration IIFE from throwing on localStorage access
const LS_KEY_PREFIX = 'baseball_lf_local_gamestats_v1'

function clearStore() {
  localStorage.clear()
}

function getStore() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_PREFIX) || '[]') } catch { return [] }
}

describe('gameStatsApi.upsert', () => {
  beforeEach(() => {
    clearStore()
    vi.resetModules()
  })

  it('creates a new record when none exists', async () => {
    const { gameStatsApi } = await import('../api')
    const gameId = 'game1'
    const playerId = 'player1'
    const payload = { hitting: { atBats: 3, hits: 1 } }

    const { data } = gameStatsApi.upsert(gameId, playerId, payload)

    expect(data._id).toBeTruthy()
    expect(data.gameId).toBe(gameId)
    expect(data.playerId).toBe(playerId)
    expect(data.hitting.atBats).toBe(3)

    const store = getStore()
    expect(store.length).toBe(1)
  })

  it('updates existing record by (gameId, playerId) composite key', async () => {
    const { gameStatsApi } = await import('../api')
    const gameId = 'game1'
    const playerId = 'player1'

    gameStatsApi.upsert(gameId, playerId, { hitting: { atBats: 3, hits: 1 } })
    const { data } = gameStatsApi.upsert(gameId, playerId, { hitting: { atBats: 4, hits: 2 } })

    const store = getStore()
    expect(store.length).toBe(1) // no duplicate
    expect(data.hitting.atBats).toBe(4)
    expect(data.hitting.hits).toBe(2)
  })

  it('creates separate records for different players in the same game', async () => {
    const { gameStatsApi } = await import('../api')
    const gameId = 'game1'

    gameStatsApi.upsert(gameId, 'player1', { hitting: { atBats: 3 } })
    gameStatsApi.upsert(gameId, 'player2', { hitting: { atBats: 2 } })

    const store = getStore()
    expect(store.length).toBe(2)
  })

  it('creates separate records for the same player in different games', async () => {
    const { gameStatsApi } = await import('../api')
    const playerId = 'player1'

    gameStatsApi.upsert('game1', playerId, { hitting: { atBats: 3 } })
    gameStatsApi.upsert('game2', playerId, { hitting: { atBats: 5 } })

    const store = getStore()
    expect(store.length).toBe(2)
  })

  it('preserves the local _id on subsequent upserts', async () => {
    const { gameStatsApi } = await import('../api')
    const gameId = 'game1'
    const playerId = 'player1'

    const first = gameStatsApi.upsert(gameId, playerId, { hitting: { atBats: 1 } })
    const second = gameStatsApi.upsert(gameId, playerId, { hitting: { atBats: 2 } })

    expect(first.data._id).toBe(second.data._id)
  })
})
