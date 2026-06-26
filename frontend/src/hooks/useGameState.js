import { useEffect, useMemo, useState } from 'react'
import { gameStatsApi } from '../services/api'

export default function useGameState({ gameState, activeGame, refreshKey = 0 }) {
  const [pitcherLiveStat, setPitcherLiveStat] = useState(null)

  useEffect(() => {
    // derive a minimal key for when we actually need to reload the pitcher stat
    const pitcherRequestKey = gameState.currentGameId && gameState.currentPitcherId && !gameState.isAttacking
      ? `${gameState.currentGameId}:${gameState.currentPitcherId}`
      : null

    if (!pitcherRequestKey) {
      // ensure state cleared when there is no valid request
      const timer = window.setTimeout(() => setPitcherLiveStat(null), 0)
      return () => window.clearTimeout(timer)
    }

    let mounted = true
    const load = async () => {
      try {
        const response = await gameStatsApi.listByGame(gameState.currentGameId, gameState.currentPitcherId)
        if (mounted) setPitcherLiveStat(response.data?.[0] || null)
      } catch {
        if (mounted) setPitcherLiveStat(null)
      }
    }

    load()
    return () => { mounted = false }
  // refreshKey forces a re-fetch after any pitch stat write completes
  }, [gameState.currentGameId, gameState.currentPitcherId, gameState.isAttacking, refreshKey])

  const livePitching = useMemo(() => pitcherLiveStat?.pitching || {}, [pitcherLiveStat])

  const opponentName = activeGame?.opponentName || activeGame?.opponent || 'ADVERSARIO'

  return {
    pitcherLiveStat,
    livePitching,
    opponentName,
  }
}
