export function getPlayerId(player) {
  return player?._id || player?.id
}

export function getMainPosition(player) {
  return player.activePosition || player.positions?.[0] || 'DH'
}

export function detectPlayerType(player) {
  return Array.isArray(player?.positions) && player.positions.includes('P') ? 'pitcher' : 'hitter'
}
