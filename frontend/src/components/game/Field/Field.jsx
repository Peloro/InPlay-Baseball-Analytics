import React from 'react'
import Player from '../Player/Player'
import Runner from '../Runner/Runner'

export default function Field({
  fieldStageRef,
  fieldImageRef,
  drawingRef,
  activeTool,
  dropTarget,
  setDropTarget,
  fieldRect,
  toScreenPoint,
  visibleFieldMarkers,
  getPlayerId,
  selectedId,
  setSelectedId,
  onPlayerClick,
  openEditModal,
  startDragPlayer,
  draggingPlayerId,
  recentlyDroppedId,
  getDefaultFieldPosition,
  runnerDrag,
  gameState,
  laser,
  dragRef,
  setRunnerDrag,
  dragSource,
  dropMessage,
  startPenStroke,
  onDragStartPlayer,
  zoom = 1,
}) {
  const scale = fieldRect && fieldRect.width ? Math.max(0.45, Math.min(1.6, fieldRect.width / 980)) : 1
  const combined = Math.max(0.25, Math.min(2.2, scale * (zoom || 1)))

  return (
    <div
      ref={fieldStageRef}
      style={{ ['--field-scale']: combined, ['--field-zoom']: zoom }}
      className={`field-stage ${activeTool}-mode ${dropTarget === 'field' ? 'drop-ready' : ''}`}
      onPointerDown={startPenStroke}
      onDragEnter={(event) => {
        event.preventDefault()
        setDropTarget('field')
      }}
      onDragLeave={() => setDropTarget(null)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        setDropTarget(null)
      }}
    >
      <img
        ref={fieldImageRef}
        src="/baseball-3778774_1280.webp"
        alt="Baseball field"
        className="field-image"
        draggable={false}
      />

      <canvas
        ref={drawingRef}
        className="field-draw-layer"
        style={{
          left: `${fieldRect.left}px`,
          top: `${fieldRect.top}px`,
          width: `${fieldRect.width}px`,
          height: `${fieldRect.height}px`,
        }}
      />

      {visibleFieldMarkers.map((player) => {
        const id = getPlayerId(player)
        const isSelected = selectedId === id
        const screen = toScreenPoint(player.x, player.y)
        const isOpponent = gameState.isAttacking

        return (
          <Player
            key={id}
            player={player}
            id={id}
            isOpponent={isOpponent}
            screen={screen}
            tooltipId={selectedId}
            selectedId={selectedId}
            draggingPlayerId={draggingPlayerId}
            recentlyDroppedId={recentlyDroppedId}
            onPlayerClick={onPlayerClick}
            openEditModal={openEditModal}
            startDragPlayer={startDragPlayer}
            onPointerDown={(event) => {
              if (isOpponent) {
                if (activeTool !== 'mouse') return
                event.preventDefault()
                dragRef.current = { type: 'opponent', id }
                setSelectedId(null)
                return
              }
            }}
            onDragStart={(event, pid) => {
              if (isOpponent) return
              event.dataTransfer.setData('text/plain', pid)
              // inform parent
              if (typeof onDragStartPlayer === 'function') onDragStartPlayer(pid)
            }}
            getMainPosition={(p) => p.activePosition || p.positions?.[0] || 'DH'}
          />
        )
      })}

      {['first', 'second', 'third'].map((base) => {
        if (!gameState.runners?.[base]) return null
        const map = { first: '1B', second: '2B', third: '3B' }
        const basePosition = runnerDrag?.base === base
          ? { x: runnerDrag.x, y: runnerDrag.y }
          : getDefaultFieldPosition(map[base])
        const point = toScreenPoint(basePosition.x, basePosition.y)
        const style = { left: `${point.left}px`, top: `${point.top}px` }
        return (
          <Runner
            key={`runner-${base}`}
            point={basePosition}
            pointStyle={style}
            onPointerDown={(event) => {
              if (activeTool !== 'mouse') return
              event.preventDefault()
              dragRef.current = { type: 'runner', base }
              setRunnerDrag({ base, x: basePosition.x, y: basePosition.y })
            }}
          />
        )
      })}

      {activeTool === 'pointer' && laser.visible && (
        <div className="laser-dot" style={{ left: `${laser.x}px`, top: `${laser.y}px` }} />
      )}

      {dropTarget === 'field' && dragSource === 'bench' && (
        <div className="drop-hint field-drop-hint">{dropMessage || 'Soltar para colocar no campo'}</div>
      )}
    </div>
  )
}
