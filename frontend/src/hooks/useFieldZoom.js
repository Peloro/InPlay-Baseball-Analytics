import { useEffect, useRef, useState } from 'react'

function getDistance(t1, t2) {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
}

function getCenter(t1, t2) {
  return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }
}

function clampOffset(raw, stageSize, contentSize) {
  const extra = Math.max(200, stageSize * 0.25)
  const min = Math.min(0, stageSize - contentSize) - extra
  const max = extra
  return Math.max(min, Math.min(raw, max))
}

export default function useFieldZoom({ fieldRect, fieldStageRef, activeTool }) {
  const [zoom, setZoom] = useState(0.85)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)

  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 })
  const isPinchingRef = useRef(false)
  const pinchRef = useRef({ initialDistance: 0, initialScale: 1, centerClientX: 0, centerClientY: 0, offsetX: 0, offsetY: 0 })

  // Touch (mobile) — pinch-to-zoom + one-finger pan
  const handleTouchStartMobile = (ev) => {
    if (!ev.touches) return
    if (ev.touches.length === 2) {
      isPinchingRef.current = true
      const d = getDistance(ev.touches[0], ev.touches[1])
      const center = getCenter(ev.touches[0], ev.touches[1])
      pinchRef.current = { initialDistance: d, initialScale: zoom, centerClientX: center.x, centerClientY: center.y, offsetX, offsetY }
      ev.preventDefault()
      isPanningRef.current = false
    } else if (ev.touches.length === 1) {
      const t = ev.touches[0]
      const target = ev.target
      if (
        target?.closest &&
        (target.closest('.player-marker') ||
          target.closest('.animated-ball-marker') ||
          target.closest('.runner-marker') ||
          target.closest('.tool-dock') ||
          target.closest('.player-tooltip'))
      ) return
      if (activeTool === 'mouse') {
        isPanningRef.current = true
        panStartRef.current = { x: t.clientX, y: t.clientY, offsetX, offsetY }
        ev.preventDefault()
      }
    }
  }

  const handleTouchMoveMobile = (ev) => {
    if (!ev.touches) return
    if (isPinchingRef.current && ev.touches.length === 2) {
      const d = getDistance(ev.touches[0], ev.touches[1])
      const factor = d / (pinchRef.current.initialDistance || 1)
      let newScale = Math.max(0.5, Math.min(2.5, pinchRef.current.initialScale * factor))

      const center = getCenter(ev.touches[0], ev.touches[1])
      const stageRect = fieldStageRef.current?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 }
      const centerLocalX = center.x - stageRect.left
      const centerLocalY = center.y - stageRect.top

      const contentX = (centerLocalX - pinchRef.current.offsetX) / pinchRef.current.initialScale
      const contentY = (centerLocalY - pinchRef.current.offsetY) / pinchRef.current.initialScale

      const nextOffsetX = centerLocalX - contentX * newScale
      const nextOffsetY = centerLocalY - contentY * newScale

      requestAnimationFrame(() => {
        setZoom(Number(newScale.toFixed(3)))
        setOffsetX(clampOffset(nextOffsetX, stageRect.width, fieldRect.width * newScale))
        setOffsetY(clampOffset(nextOffsetY, stageRect.height, fieldRect.height * newScale))
      })
      ev.preventDefault()
      return
    }

    if (isPanningRef.current && ev.touches.length === 1) {
      const t = ev.touches[0]
      const dx = t.clientX - panStartRef.current.x
      const dy = t.clientY - panStartRef.current.y
      requestAnimationFrame(() => {
        const stageRect = fieldStageRef.current?.getBoundingClientRect() || { width: 0, height: 0 }
        setOffsetX(clampOffset(panStartRef.current.offsetX + dx, stageRect.width, fieldRect.width * zoom))
        setOffsetY(clampOffset(panStartRef.current.offsetY + dy, stageRect.height, fieldRect.height * zoom))
      })
      ev.preventDefault()
    }
  }

  const handleTouchEndMobile = (ev) => {
    if (!ev.touches || ev.touches.length < 2) isPinchingRef.current = false
    if (!ev.touches || ev.touches.length === 0) isPanningRef.current = false
  }

  // Wheel zoom + pointer pan (desktop)
  useEffect(() => {
    const el = fieldStageRef.current
    if (!el) return undefined
    const targetEl = el.querySelector?.('.field-viewport') || el

    const handleWheel = (ev) => {
      if (activeTool !== 'mouse') return
      ev.preventDefault()
      const stageRect = el.getBoundingClientRect()
      const mouseX = ev.clientX - stageRect.left
      const mouseY = ev.clientY - stageRect.top

      const delta = ev.deltaY < 0 ? 1 : -1
      const newZoom = Math.max(0.5, Math.min(2.5, Number((zoom * (1 + delta * 0.08)).toFixed(3))))

      const contentX = (mouseX - offsetX) / zoom
      const contentY = (mouseY - offsetY) / zoom
      const nextOffsetX = mouseX - contentX * newZoom
      const nextOffsetY = mouseY - contentY * newZoom

      requestAnimationFrame(() => {
        setZoom(newZoom)
        setOffsetX(clampOffset(nextOffsetX, stageRect.width, fieldRect.width * newZoom))
        setOffsetY(clampOffset(nextOffsetY, stageRect.height, fieldRect.height * newZoom))
      })
    }

    const handlePointerDown = (ev) => {
      if (activeTool !== 'mouse') return
      if (ev.button !== 0) return
      if (
        ev.target?.closest &&
        (ev.target.closest('.player-marker') ||
          ev.target.closest('.animated-ball-marker') ||
          ev.target.closest('.runner-marker') ||
          ev.target.closest('.tool-dock') ||
          ev.target.closest('.player-tooltip'))
      ) return
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
        setOffsetX(clampOffset(panStartRef.current.offsetX + dx, stageRect.width, fieldRect.width * zoom))
        setOffsetY(clampOffset(panStartRef.current.offsetY + dy, stageRect.height, fieldRect.height * zoom))
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

  return {
    zoom,
    offsetX,
    offsetY,
    handleTouchStartMobile,
    handleTouchMoveMobile,
    handleTouchEndMobile,
  }
}
