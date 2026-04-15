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
  offsetX = 0,
  offsetY = 0,
  animateRunners = false,
}) {
  const scale = fieldRect && fieldRect.width ? Math.max(0.45, Math.min(1.6, fieldRect.width / 980)) : 1
  // Invert marker scaling vs. camera zoom: when zoom increases markers get smaller
  const combined = Math.max(0.25, Math.min(2.2, scale * (1 / (zoom || 1))))

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
      <div
        className="field-viewport"
        style={{
          width: `${fieldRect.width}px`,
          height: `${fieldRect.height}px`,
          transform: `translate(${(offsetX || 0)}px, ${(offsetY || 0)}px) scale(${zoom || 1})`,
          transformOrigin: '0 0',
        }}
      >
        <img
          ref={fieldImageRef}
          src="/baseball-3778774_1280.webp"
          alt="Baseball field"
          className="field-image"
          draggable={false}
          style={{ position: 'absolute', left: 0, top: 0, width: `${fieldRect.width}px`, height: `${fieldRect.height}px` }}
        />

        <canvas
          ref={drawingRef}
          className="field-draw-layer"
          style={{
            left: 0,
            top: 0,
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
              // Always use training-player sizing so both teams match training mode
              className={'training-player'}
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
        // compute base plate position (separate from fielder position)
        const computeBasePosition = (posName) => {
          const p = getDefaultFieldPosition(posName)
          // small offsets to place runner ON the base plate and avoid overlap
          // Use same offsets as TrainingField so runner placement is consistent
          const offsets = {
            '1B': { dx: -2, dy: -6 },
            '2B': { dx: -5.5, dy: 0 },
            '3B': { dx: 0, dy: 6 },
          }
          const off = offsets[posName] || { dx: 0, dy: 0 }
          return { x: p.x + off.dx, y: p.y + off.dy }
        }

        const basePosition = runnerDrag?.base === base
          ? { x: runnerDrag.x, y: runnerDrag.y }
          : computeBasePosition(map[base])
        const point = toScreenPoint(basePosition.x, basePosition.y)
        const style = { left: `${point.left}px`, top: `${point.top}px` }
        return (
          <Runner
            key={`runner-${base}`}
            point={basePosition}
            pointStyle={style}
            animate={animateRunners}
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
    </div>
  )
}

