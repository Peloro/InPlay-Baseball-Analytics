import { useMemo, useState, useCallback } from 'react'
import { getPlayerId as getPlayerIdUtil, getMainPosition as getMainPositionUtil } from '../utils/player'

export default function usePlayers({ players, setPlayers, gameState }) {
  const [benchSearch, setBenchSearch] = useState('')

  const getPlayerId = useCallback((player) => getPlayerIdUtil(player), [])

  const playersById = useMemo(() => {
    const map = {}
    for (const player of players) {
      map[getPlayerId(player)] = player
    }
    return map
  }, [players, getPlayerId])

  const onFieldIds = useMemo(() => new Set(gameState.onFieldPlayerIds || []), [gameState.onFieldPlayerIds])

  const fieldPlayers = useMemo(
    () => players.filter((player) => onFieldIds.has(getPlayerId(player))),
    [players, onFieldIds, getPlayerId],
  )

  const getMainPosition = useCallback((player) => getMainPositionUtil(player), [])

  const benchPlayers = useMemo(() => {
    const term = benchSearch.trim().toLowerCase()
    return players
      .filter((player) => !onFieldIds.has(getPlayerId(player)))
      .filter((player) => {
        if (!term) return true
        return (
          player.name.toLowerCase().includes(term)
          || String(player.number).includes(term)
          || getMainPosition(player).toLowerCase().includes(term)
        )
      })
      .sort((a, b) => {
        const byPos = getMainPosition(a).localeCompare(getMainPosition(b))
        if (byPos !== 0) return byPos
        return a.number - b.number
      })
  }, [players, onFieldIds, benchSearch, getPlayerId, getMainPosition])

  const setupAvailablePlayers = useMemo(() => players, [players])

  const playerCanPlayPosition = useCallback((playerId, position) => {
    const player = playersById[playerId]
    if (!player) return false
    const allowed = Array.isArray(player.positions) ? player.positions : []
    return allowed.includes(position)
  }, [playersById])

  const pitchersOnField = useMemo(() => {
    return fieldPlayers.filter((p) => Array.isArray(p.positions) && p.positions.includes('P'))
  }, [fieldPlayers])

  return {
    benchSearch,
    setBenchSearch,
    playersById,
    fieldPlayers,
    benchPlayers,
    setupAvailablePlayers,
    playerCanPlayPosition,
    pitchersOnField,
    getPlayerId,
    getMainPosition,
    setPlayers,
  }
}
