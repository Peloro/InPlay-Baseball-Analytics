import { VALID_POSITIONS } from '../data/positions'

export function normalizePlayer(player) {
  const rawPositions = Array.isArray(player?.positions)
    ? player.positions
    : player?.position
      ? [player.position]
      : []

  const positions = rawPositions
    .map((item) => String(item || '').trim().toUpperCase())
    .filter((item) => VALID_POSITIONS.includes(item))

  const safePositions = positions.length ? positions : ['DH']
  const activePosition = safePositions.includes(player?.activePosition)
    ? player.activePosition
    : safePositions[0]

  return {
    ...player,
    positions: safePositions,
    activePosition,
    pitchCountLimit: Number.isFinite(player?.pitchCountLimit) ? player.pitchCountLimit : null,
    x: Number.isFinite(player?.x) ? player.x : 50,
    y: Number.isFinite(player?.y) ? player.y : 50,
  }
}

export function getPlayerId(player) {
  return player?._id || player?.id
}

export function getMainPosition(player) {
  return player.activePosition || player.positions?.[0] || 'DH'
}

export function detectPlayerType(player) {
  return Array.isArray(player?.positions) && player.positions.includes('P') ? 'pitcher' : 'hitter'
}
