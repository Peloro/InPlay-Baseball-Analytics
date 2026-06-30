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

  // Split into two memos: participant/field filter (expensive) and search filter (cheap).
  // This way a search term change doesn't re-run the participant filter, and vice-versa.
  const benchBase = useMemo(() => {
    const participantSet = gameState.participantPlayerIds?.length
      ? new Set(gameState.participantPlayerIds)
      : null
    return players.filter((player) => {
      const id = getPlayerId(player)
      if (onFieldIds.has(id)) return false
      if (participantSet && !participantSet.has(id)) return false
      return true
    })
  }, [players, onFieldIds, gameState.participantPlayerIds, getPlayerId])

  const benchPlayers = useMemo(() => {
    const term = benchSearch.trim().toLowerCase()
    return benchBase
      .filter((player) => {
        if (!term) return true
        return (
          (player.name?.toLowerCase() ?? '').includes(term)
          || String(player.number).includes(term)
          || getMainPosition(player).toLowerCase().includes(term)
        )
      })
      .sort((a, b) => {
        const byPos = getMainPosition(a).localeCompare(getMainPosition(b))
        if (byPos !== 0) return byPos
        return a.number - b.number
      })
  }, [benchBase, benchSearch, getMainPosition])

  const setupAvailablePlayers = useMemo(() => {
    const participantIds = gameState.participantPlayerIds
    if (!participantIds || !participantIds.length) return players
    const idSet = new Set(participantIds)
    return players.filter((p) => idSet.has(getPlayerId(p)))
  }, [players, gameState.participantPlayerIds, getPlayerId])

  // All players can play any position; returns true always so existing callers still compile.
  const playerCanPlayPosition = useCallback((_playerId, _position) => true, [])

  const playerPrefersPosition = useCallback((playerId, position) => {
    const player = playersById[playerId]
    if (!player) return false
    return Array.isArray(player.positions) && player.positions.includes(position)
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
    playerPrefersPosition,
    pitchersOnField,
    getPlayerId,
    getMainPosition,
    setPlayers,
  }
}
