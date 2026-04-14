import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getDefaultFieldPosition } from '../data/defaultFieldPositions'

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

  const markers = useMemo(() => {
    const runnerList = Object.entries(runners)
      .filter(([, data]) => data.visible)
      .map(([base, data]) => ({ id: `runner-${base}`, label: `R-${base[0].toUpperCase()}`, ...data }))
    return [...players, ...runnerList]
  }, [players, runners])

  const toFieldPoint = useCallback((clientX, clientY) => {
    if (!fieldStageRef.current || !fieldRect.width || !fieldRect.height) return null

    const stageRect = fieldStageRef.current.getBoundingClientRect()
    const localX = clientX - stageRect.left
    const localY = clientY - stageRect.top

    const fieldX = ((localX - fieldRect.left) / fieldRect.width) * 100
    const fieldY = ((localY - fieldRect.top) / fieldRect.height) * 100

    if (fieldX < 0 || fieldX > 100 || fieldY < 0 || fieldY > 100) return null
    return { x: clamp(fieldX, 0, 100), y: clamp(fieldY, 0, 100) }
  }, [fieldRect])

  const toScreenPoint = (x, y) => ({
    left: fieldRect.left + (x / 100) * fieldRect.width,
    top: fieldRect.top + (y / 100) * fieldRect.height,
  })

  useLayoutEffect(() => {
    const updateFieldRect = () => {
      if (!fieldStageRef.current || !fieldImageRef.current) return

      const stageRect = fieldStageRef.current.getBoundingClientRect()
      const imageRect = fieldImageRef.current.getBoundingClientRect()

      setFieldRect({
        left: imageRect.left - stageRect.left,
        top: imageRect.top - stageRect.top,
        width: imageRect.width,
        height: imageRect.height,
      })
    }

    updateFieldRect()
    window.addEventListener('resize', updateFieldRect)
    return () => window.removeEventListener('resize', updateFieldRect)
  }, [])

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

  useEffect(() => {
    const onMove = (event) => {
      if (activeTool === 'pointer' && fieldStageRef.current) {
        const rect = fieldStageRef.current.getBoundingClientRect()
        setLaser({ visible: true, x: event.clientX - rect.left, y: event.clientY - rect.top })
      }

      if (activeTool === 'pen' && isDrawingRef.current) {
        const point = toFieldPoint(event.clientX, event.clientY)
        if (!point) return
        setStrokes((current) => {
          if (!current.length) return current
          const next = [...current]
          next[next.length - 1] = [...next[next.length - 1], point]
          return next
        })
      }

      if (!dragRef.current || activeTool !== 'mouse') return
      const point = toFieldPoint(event.clientX, event.clientY)
      if (!point) return

      const drag = dragRef.current
      if (drag.type === 'player') {
        setPlayers((current) =>
          current.map((player) => (player.id === drag.id ? { ...player, x: point.x, y: point.y } : player)),
        )
      }

      if (drag.type === 'runner') {
        setRunners((current) => ({
          ...current,
          [drag.base]: { ...current[drag.base], x: point.x, y: point.y },
        }))
      }

      if (drag.type === 'ball') {
        setBall({ x: point.x, y: point.y })
      }
    }

    const onUp = () => {
      dragRef.current = null
      isDrawingRef.current = false
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [activeTool, toFieldPoint])

  const startPenStroke = (event) => {
    if (activeTool !== 'pen') return
    const point = toFieldPoint(event.clientX, event.clientY)
    if (!point) return
    isDrawingRef.current = true
    setStrokes((current) => [...current, [{ x: point.x, y: point.y }]])
  }

  return (
    <section className="training-layout">
      <div
        ref={fieldStageRef}
        className={`field-stage ${activeTool}-mode`}
        onPointerDown={startPenStroke}
      >
        <img
          ref={fieldImageRef}
          src="/baseball-3778774_1280.webp"
          alt="Campo de treino"
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

        {markers.map((marker) => {
          const point = toScreenPoint(marker.x, marker.y)
          return (
            <button
              key={marker.id}
              type="button"
              className={`player-marker ${marker.id.startsWith('runner-') ? 'runner-marker' : 'training-defense-marker'}`}
              style={{ left: `${point.left}px`, top: `${point.top}px` }}
              onPointerDown={() => {
                if (activeTool !== 'mouse') return
                if (marker.id.startsWith('runner-')) {
                  dragRef.current = { type: 'runner', base: marker.id.replace('runner-', '') }
                } else {
                  dragRef.current = { type: 'player', id: marker.id }
                }
              }}
            >
              <span>{marker.label}</span>
            </button>
          )
        })}

        <button
          type="button"
          className="training-ball-marker"
          style={{ left: `${toScreenPoint(ball.x, ball.y).left}px`, top: `${toScreenPoint(ball.x, ball.y).top}px` }}
          onPointerDown={() => {
            if (activeTool !== 'mouse') return
            dragRef.current = { type: 'ball' }
          }}
        />

        {activeTool === 'pointer' && laser.visible && (
          <div className="laser-dot" style={{ left: `${laser.x}px`, top: `${laser.y}px` }} />
        )}
      </div>

      <aside className="field-hud training-hud">
        <div className="field-hud-block">
          <h3>Modo Treino</h3>
          <p>Mova jogadores e corredores, desenhe jogadas e limpe quando quiser.</p>
          <div className="hud-actions">
            <button type="button" onClick={() => setRunners((current) => ({ ...current, first: { ...current.first, visible: true } }))}>
              + 1B
            </button>
            <button type="button" onClick={() => setRunners((current) => ({ ...current, second: { ...current.second, visible: true } }))}>
              + 2B
            </button>
            <button type="button" onClick={() => setRunners((current) => ({ ...current, third: { ...current.third, visible: true } }))}>
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
    </section>
  )
}

export default TrainingField
