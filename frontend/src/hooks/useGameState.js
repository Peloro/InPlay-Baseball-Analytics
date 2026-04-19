import { useEffect, useMemo, useState } from 'react'
import { gameStatsApi } from '../services/api'

export default function useGameState({ gameState, activeGame }) {
  const [pitcherLiveStat, setPitcherLiveStat] = useState(null)

  useEffect(() => {
    if (!gameState.currentGameId || !gameState.currentPitcherId || gameState.isAttacking) {
      const timer = window.setTimeout(() => setPitcherLiveStat(null), 0)
      return () => window.clearTimeout(timer)
    }

    const load = async () => {
      try {
        const response = await gameStatsApi.listByGame(gameState.currentGameId, gameState.currentPitcherId)
        setPitcherLiveStat(response.data?.[0] || null)
      } catch {
        setPitcherLiveStat(null)
      }
    }

    load()
  }, [gameState.currentGameId, gameState.currentPitcherId, gameState.isAttacking, gameState.pitchCounts, gameState.ourPitchCount, gameState.outs, gameState.homeScore, gameState.awayScore])

  const livePitching = useMemo(() => pitcherLiveStat?.pitching || {}, [pitcherLiveStat])

  const opponentName = activeGame?.opponentName || activeGame?.opponent || 'ADVERSARIO'

  return {
    pitcherLiveStat,
    livePitching,
    opponentName,
  }
}
