import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
})

export const gamesApi = {
  create: (payload) => api.post('/games', payload),
  list: () => api.get('/games'),
  getById: (id) => api.get(`/games/${id}`),
  update: (id, payload) => api.put(`/games/${id}`, payload),
  remove: (id) => api.delete(`/games/${id}`),
}

export const playersApi = {
  create: (payload) => api.post('/players', payload),
  update: (id, payload) => api.put(`/players/${id}`, payload),
  remove: (id) => api.delete(`/players/${id}`),
}

export const gameStatsApi = {
  create: (payload) => api.post('/game-stats', payload),
  update: (id, payload) => api.put(`/game-stats/${id}`, payload),
  listByGame: (gameId, playerId) =>
    api.get(`/game-stats/${gameId}`, {
      params: playerId ? { playerId } : undefined,
    }),
}

export const seasonStatsApi = {
  list: (playerId) =>
    api.get('/season-stats', {
      params: playerId ? { playerId } : undefined,
    }),
}

export default api
