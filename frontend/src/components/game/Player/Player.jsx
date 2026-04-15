import React from 'react'

export default function Player({
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

  return (
    <button
      key={id}
      type="button"
      className={`player-marker ${opponent ? 'opponent-marker mode-attack' : 'team-defense-marker mode-defense'} ${isSelected ? 'selected' : ''} ${draggingPlayerId === id ? 'dragging' : ''} ${recentlyDroppedId === id ? 'drop-snap' : ''} ${className || ''}`}
      style={{ left: `${screen.left}px`, top: `${screen.top}px` }}
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
