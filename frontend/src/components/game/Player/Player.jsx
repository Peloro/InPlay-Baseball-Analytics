import React, { useMemo } from 'react'

function Player({
  player,
  id,
  isOpponent,
  screen,
  className,
  tooltipId,
  selectedId,
  draggingPlayerId,
  recentlyDroppedId,
  onPlayerClick,
  openEditModal,
  startDragPlayer,
  onPointerDown,
  onDragStart,
  getMainPosition,
}) {
  const isSelected = selectedId === id
  const opponent = isOpponent
  const style = useMemo(() => ({ left: `${screen.left}px`, top: `${screen.top}px` }), [screen.left, screen.top])
  const classes = useMemo(() => [
    'player-marker',
    opponent ? 'opponent-marker mode-attack' : 'team-defense-marker mode-defense',
    isSelected && 'selected',
    draggingPlayerId === id && 'dragging',
    recentlyDroppedId === id && 'drop-snap',
    className,
  ].filter(Boolean).join(' '), [opponent, isSelected, draggingPlayerId, recentlyDroppedId, className, id])

  return (
    <button
      key={id}
      type="button"
      className={classes}
      style={style}
      onClick={() => {
        if (opponent) return
        onPlayerClick?.(id)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        if (opponent) return
        openEditModal?.(id)
      }}
      onPointerDown={(event) => {
        if (opponent) {
          if (typeof onPointerDown === 'function') {
            onPointerDown(event)
          }
          return
        }
        startDragPlayer?.(event, id, 'field')
      }}
      draggable={!opponent}
      onDragStart={(event) => onDragStart?.(event, id)}
    >
      <span>{opponent ? player.label : getMainPosition(player)}</span>
      {!opponent && tooltipId === id && (
        <div className="player-tooltip">
          {player.name} #{player.number}
        </div>
      )}
    </button>
  )
}

export default React.memo(Player, (prev, next) => {
  return (
    prev.id === next.id &&
    prev.selectedId === next.selectedId &&
    prev.draggingPlayerId === next.draggingPlayerId &&
    prev.recentlyDroppedId === next.recentlyDroppedId &&
    prev.tooltipId === next.tooltipId &&
    prev.className === next.className &&
    prev.isOpponent === next.isOpponent &&
    prev.screen?.left === next.screen?.left &&
    prev.screen?.top === next.screen?.top &&
    prev.player === next.player &&
    prev.getMainPosition === next.getMainPosition &&
    prev.onPlayerClick === next.onPlayerClick &&
    prev.openEditModal === next.openEditModal &&
    prev.startDragPlayer === next.startDragPlayer &&
    prev.onPointerDown === next.onPointerDown &&
    prev.onDragStart === next.onDragStart
  )
})
