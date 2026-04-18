import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import useDragPosition from '../hooks/useDragPosition'
import { getDefaultFieldPosition } from '../data/defaultFieldPositions'
import Player from '../components/game/Player/Player'
import Runner from '../components/game/Runner/Runner'

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

const DEFENSIVE_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']

const INITIAL_PLAYERS = DEFENSIVE_POSITIONS.map((position) => {
  const point = getDefaultFieldPosition(position)
  return {
    id: `training-player-${position}`,
    x: point.x,
    y: point.y,
    label: position,
  }
})

const INITIAL_RUNNERS = {
  first: { x: 58, y: 76, visible: false },
  second: { x: 50, y: 62, visible: false },
  third: { x: 42, y: 76, visible: false },
}

function TrainingField({ activeTool, clearDrawVersion }) {
  const fieldStageRef = useRef(null)
  const fieldImageRef = useRef(null)
  const drawingRef = useRef(null)
  const dragRef = useRef(null)
  const isDrawingRef = useRef(false)

  const [fieldRect, setFieldRect] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const [players, setPlayers] = useState(INITIAL_PLAYERS)
  const [runners, setRunners] = useState(INITIAL_RUNNERS)
  const [ball, setBall] = useState({ x: 50, y: 55 })
  const [strokes, setStrokes] = useState([])
  const [laser, setLaser] = useState({ visible: false, x: 0, y: 0 })
  const [showTrainingContainer, setShowTrainingContainer] = useState(true)
  const [showHud, setShowHud] = useState(true)
  const [zoom, setZoom] = useState(0.85)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 })

  const markers = useMemo(() => {
    const runnerList = Object.entries(runners)
      .filter(([, data]) => data.visible)
      .map(([base, data]) => ({ id: `runner-${base}`, label: `R-${base[0].toUpperCase()}`, ...data }))
    return [...players, ...runnerList]
  }, [players, runners])

  const computeBasePosition = (posName) => {
    const p = getDefaultFieldPosition(posName)
    const offsets = {
      '1B': { dx: -2, dy: -6 },
      '2B': { dx: -5.5, dy: 0 },
      '3B': { dx: 0, dy: 6 },
    }
    const off = offsets[posName] || { dx: 0, dy: 0 }
    return { x: p.x + off.dx, y: p.y + off.dy }
  }

  const toFieldPoint = useCallback((clientX, clientY) => {
    if (!fieldStageRef.current || !fieldRect.width || !fieldRect.height) return null

    const stageRect = fieldStageRef.current.getBoundingClientRect()
    const localX = clientX - stageRect.left
    const localY = clientY - stageRect.top

    const untransX = (localX - offsetX) / zoom
    const untransY = (localY - offsetY) / zoom

    const fieldX = ((untransX - fieldRect.left) / fieldRect.width) * 100
    const fieldY = ((untransY - fieldRect.top) / fieldRect.height) * 100

    if (fieldX < 0 || fieldX > 100 || fieldY < 0 || fieldY > 100) return null
    return { x: clamp(fieldX, 0, 100), y: clamp(fieldY, 0, 100) }
  }, [fieldRect, offsetX, offsetY, zoom])

  const toScreenPoint = (x, y) => ({
    left: (x / 100) * fieldRect.width,
    top: (y / 100) * fieldRect.height,
  })

  // Wheel zoom and pan handlers for training field
  useEffect(() => {
    const el = fieldStageRef.current
    if (!el) return undefined
    const targetEl = el.querySelector?.('.field-viewport') || el

    const handleWheel = (ev) => {
      // do not zoom when using pen/pointer tools
      if (activeTool !== 'mouse') return
      ev.preventDefault()
      const stageRect = el.getBoundingClientRect()
      const mouseX = ev.clientX - stageRect.left
      const mouseY = ev.clientY - stageRect.top
      const delta = ev.deltaY < 0 ? 1 : -1
      const factor = 1 + delta * 0.08
      const newZoom = Math.max(0.5, Math.min(2.5, Number((zoom * factor).toFixed(3))))

      // content coord under cursor (pre-zoom)
      const contentX = (mouseX - offsetX) / zoom
      const contentY = (mouseY - offsetY) / zoom

      // compute next offset so the same content point stays under the cursor
      const nextOffsetX = mouseX - contentX * newZoom
      const nextOffsetY = mouseY - contentY * newZoom

      const contentWidth = fieldRect.width * newZoom
      const contentHeight = fieldRect.height * newZoom
      const extraX = Math.max(200, (stageRect.width || 0) * 0.25)
      const extraY = Math.max(200, (stageRect.height || 0) * 0.25)
      const minX = Math.min(0, (stageRect.width || 0) - contentWidth) - extraX
      const minY = Math.min(0, (stageRect.height || 0) - contentHeight) - extraY
      const maxX = extraX
      const maxY = extraY
      const clampX = Math.max(minX, Math.min(nextOffsetX, maxX))
      const clampY = Math.max(minY, Math.min(nextOffsetY, maxY))

      requestAnimationFrame(() => {
        setZoom(newZoom)
        setOffsetX(clampX)
        setOffsetY(clampY)
      })
    }

    const handlePointerDown = (ev) => {
      // only allow panning with mouse tool and left button
      if (activeTool !== 'mouse') return
      if (ev.button !== 0) return
      const target = ev.target
      // Do not start pan when interacting with markers, runners, the training ball,
      // animated ball, tool dock, or other interactive UI — only start pan on pure background
      if (
        target.closest &&
        (target.closest('.player-marker') ||
          target.closest('.training-ball-marker') ||
          target.closest('.runner-marker') ||
          target.closest('.animated-ball-marker') ||
          target.closest('.tool-dock') ||
          target.closest('.player-tooltip'))
      )
        return

      isPanningRef.current = true
      panStartRef.current = { x: ev.clientX, y: ev.clientY, offsetX, offsetY }
      el.classList.add('grabbing')
      el.setPointerCapture?.(ev.pointerId)
    }

    const handlePointerMove = (ev) => {
      if (!isPanningRef.current) return
      const dx = ev.clientX - panStartRef.current.x
      const dy = ev.clientY - panStartRef.current.y
      requestAnimationFrame(() => {
        const stageRect = fieldStageRef.current?.getBoundingClientRect() || { width: 0, height: 0 }
        const contentWidth = fieldRect.width * zoom
        const contentHeight = fieldRect.height * zoom
        const extraX = Math.max(200, (stageRect.width || 0) * 0.25)
        const extraY = Math.max(200, (stageRect.height || 0) * 0.25)
        const minX = Math.min(0, (stageRect.width || 0) - contentWidth) - extraX
        const minY = Math.min(0, (stageRect.height || 0) - contentHeight) - extraY
        const maxX = extraX
        const maxY = extraY
        const rawX = panStartRef.current.offsetX + dx
        const rawY = panStartRef.current.offsetY + dy
        setOffsetX(Math.max(minX, Math.min(rawX, maxX)))
        setOffsetY(Math.max(minY, Math.min(rawY, maxY)))
      })
    }

    const handlePointerUp = (ev) => {
      if (isPanningRef.current) {
        isPanningRef.current = false
        el.classList.remove('grabbing')
        el.releasePointerCapture?.(ev.pointerId)
      }
    }

    targetEl.addEventListener('wheel', handleWheel, { passive: false })
    targetEl.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      targetEl.removeEventListener('wheel', handleWheel)
      targetEl.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [fieldStageRef, zoom, offsetX, offsetY, activeTool, fieldRect])

  useLayoutEffect(() => {
    const updateFieldRect = () => {
      if (!fieldStageRef.current) return

      const stageRect = fieldStageRef.current.getBoundingClientRect()

      // Use the stage container as the basis for the field rect to avoid a
      // circular dependency where the image size depends on fieldRect and
      // fieldRect is read from the image. This ensures the viewport has a
      // deterministic size even before the image finishes loading.
      setFieldRect({
        left: 0,
        top: 0,
        width: stageRect.width,
        height: stageRect.height,
      })
    }

    updateFieldRect()
    window.addEventListener('resize', updateFieldRect)
    return () => window.removeEventListener('resize', updateFieldRect)
  }, [])

  const scale = fieldRect && fieldRect.width ? Math.max(0.45, Math.min(1.6, fieldRect.width / 980)) : 1
  const combined = Math.max(0.25, Math.min(2.2, scale * (1 / (zoom || 1))))

  useEffect(() => {
    if (!drawingRef.current) return

    const canvas = drawingRef.current
    const width = Math.max(1, Math.floor(fieldRect.width))
    const height = Math.max(1, Math.floor(fieldRect.height))
    const ratio = window.devicePixelRatio || 1

    canvas.width = width * ratio
    canvas.height = height * ratio
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const context = canvas.getContext('2d')
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#E43D28'
    context.lineWidth = 3

    for (const stroke of strokes) {
      if (!stroke.length) continue
      context.beginPath()
      context.moveTo((stroke[0].x / 100) * width, (stroke[0].y / 100) * height)
      for (let index = 1; index < stroke.length; index += 1) {
        context.lineTo((stroke[index].x / 100) * width, (stroke[index].y / 100) * height)
      }
      context.stroke()
    }
  }, [strokes, fieldRect])

  useEffect(() => {
    if (!clearDrawVersion) return
    const frame = window.requestAnimationFrame(() => setStrokes([]))
    return () => window.cancelAnimationFrame(frame)
  }, [clearDrawVersion])

  const [isDragging, setIsDragging] = useState(false)

  // Unified drag handler: forward events to state updaters depending on dragRef
  useDragPosition({
    dragRef,
    toFieldPoint,
    activeTool,
    setIsDragging,
    onMove: (drag, point) => {
      if (drag.type === 'player') {
        setPlayers((current) =>
          current.map((player) => (player.id === drag.id ? { ...player, x: point.x, y: point.y } : player)),
        )
        return
      }

      if (drag.type === 'runner') {
        setRunners((current) => ({
          ...current,
          [drag.base]: { ...current[drag.base], x: point.x, y: point.y },
        }))
        return
      }

      if (drag.type === 'ball') {
        setBall({ x: point.x, y: point.y })
        return
      }
    },
    onEnd: () => {
      // Nothing extra to do for training end-of-drag; state cleared by hook
    },
  })

  const startPenStroke = (event) => {
    if (activeTool !== 'pen') return
    const point = toFieldPoint(event.clientX, event.clientY)
    if (!point) return
    isDrawingRef.current = true
    setStrokes((current) => [...current, [{ x: point.x, y: point.y }]])
  }

  const movePenStroke = useCallback((event) => {
    if (!isDrawingRef.current || activeTool !== 'pen') return
    const point = toFieldPoint(event.clientX, event.clientY)
    if (!point) return
    setStrokes((current) => {
      if (!current.length) return current
      const next = [...current]
      next[next.length - 1] = [...next[next.length - 1], point]
      return next
    })
  }, [activeTool, toFieldPoint])

  useEffect(() => {
    const pointerHandler = (event) => {
      if (activeTool === 'pointer' && fieldStageRef.current) {
        const rect = fieldStageRef.current.getBoundingClientRect()
        setLaser({ visible: true, x: event.clientX - rect.left, y: event.clientY - rect.top })
      }

      if (activeTool === 'pen') movePenStroke(event)
    }

    const handlePointerUp = () => {
      if (isDrawingRef.current) isDrawingRef.current = false
    }

    window.addEventListener('pointermove', pointerHandler)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', pointerHandler)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [activeTool, movePenStroke])

  return (
    <>
      <section className={`training-layout ${showTrainingContainer ? '' : 'mode-hidden'}`}>
          <div
            ref={fieldStageRef}
            style={{ ['--field-scale']: combined, ['--field-zoom']: zoom }}
            className={`field-stage ${activeTool}-mode ${isDragging ? 'is-dragging' : ''}`}
            onPointerDown={startPenStroke}
          >
          <div
            className="field-viewport"
            style={{
              width: `${fieldRect.width}px`,
              height: `${fieldRect.height}px`,
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            <img
              ref={fieldImageRef}
              src="/baseball-3778774_1280.webp"
              alt="Campo de treino"
              className="field-image"
              draggable={false}
              style={{ position: 'absolute', left: 0, top: 0, width: `${fieldRect.width}px`, height: `${fieldRect.height}px` }}
            />

            <canvas
              ref={drawingRef}
              className="field-draw-layer"
              style={{ left: 0, top: 0, width: `${fieldRect.width}px`, height: `${fieldRect.height}px` }}
            />

            {markers.map((marker) => {
          const point = toScreenPoint(marker.x, marker.y)
          if (marker.id.startsWith('runner-')) {
            return (
              <Runner
                key={marker.id}
                point={marker}
                pointStyle={{ left: `${point.left}px`, top: `${point.top}px` }}
                onPointerDown={(event) => {
                  if (activeTool !== 'mouse') return
                  event.preventDefault()
                  event.stopPropagation()
                  dragRef.current = { type: 'runner', base: marker.id.replace('runner-', '') }
                  setIsDragging(true)
                }}
              />
            )
          }

          return (
            <Player
              key={marker.id}
              player={marker}
              id={marker.id}
              isOpponent={false}
              screen={point}
              className={`training-player training-defense-marker`}
              startDragPlayer={(event) => {
                if (activeTool !== 'mouse') return
                event.preventDefault()
                event.stopPropagation()
                dragRef.current = { type: 'player', id: marker.id }
                setIsDragging(true)
              }}
              onDragStart={() => {}}
              getMainPosition={() => marker.label}
            />
          )
        })}

            <button
              type="button"
              className="training-ball-marker"
              style={{ left: `${toScreenPoint(ball.x, ball.y).left}px`, top: `${toScreenPoint(ball.x, ball.y).top}px` }}
              onPointerDown={(event) => {
                if (activeTool !== 'mouse') return
                event.preventDefault()
                event.stopPropagation()
                dragRef.current = { type: 'ball' }
                setIsDragging(true)
              }}
            />
          </div>

          {activeTool === 'pointer' && laser.visible && (
            <div className="laser-dot" style={{ left: `${laser.x}px`, top: `${laser.y}px` }} />
          )}
        </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          className="mode-toggle-btn"
          onClick={() => setShowHud((s) => !s)}
          aria-pressed={!showHud}
        >
          {showHud ? 'Esconder HUD' : 'Mostrar HUD'}
        </button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}>-</button>
          <div style={{ minWidth: 48, textAlign: 'center' }}>{(zoom * 100).toFixed(0)}%</div>
          <button type="button" onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(2))))}>+</button>
          <button type="button" onClick={() => setZoom(1)}>Reset</button>
        </div>
      </div>
      </section>

      {showHud && (
        <aside className="field-hud training-hud">
        <div className="field-hud-block">
          <h3>Modo Treino</h3>
          <p>Mova jogadores e corredores, desenhe jogadas e limpe quando quiser.</p>
          <div className="hud-actions">
            <button
              type="button"
              onClick={() => setRunners((current) => ({ ...current, first: { ...current.first, ...computeBasePosition('1B'), visible: true } }))}
            >
              + 1B
            </button>
            <button
              type="button"
              onClick={() => setRunners((current) => ({ ...current, second: { ...current.second, ...computeBasePosition('2B'), visible: true } }))}
            >
              + 2B
            </button>
            <button
              type="button"
              onClick={() => setRunners((current) => ({ ...current, third: { ...current.third, ...computeBasePosition('3B'), visible: true } }))}
            >
              + 3B
            </button>
          </div>
          <button
            type="button"
            className="full-width-btn"
            onClick={() => {
              setPlayers(INITIAL_PLAYERS)
              setRunners(INITIAL_RUNNERS)
              setBall({ x: 50, y: 55 })
              setStrokes([])
            }}
          >
            Resetar treino
          </button>
        </div>
        </aside>
      )}
    </>
  )
}

export default TrainingField
