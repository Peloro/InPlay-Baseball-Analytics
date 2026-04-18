import { useEffect } from 'react'

// Centralized drag manager that listens to global pointer events and
// forwards normalized field coordinates to caller callbacks.
// Parameters:
// - dragRef: a React ref object where callers set `dragRef.current = { type, ... }` on pointerdown
// - toFieldPoint: function(clientX, clientY) => { x, y } | null
// - activeTool: string, only handle drags when === 'mouse'
// - onMove: (dragDescriptor, point, ev) => void
// - onEnd: (dragDescriptor, point, ev) => void
// - setIsDragging: optional setter to toggle dragging CSS/state
export default function useDragPosition({ dragRef, toFieldPoint, activeTool, onMove, onEnd, setIsDragging }) {
  useEffect(() => {
    const handleMove = (ev) => {
      if (activeTool !== 'mouse') return
      const drag = dragRef && dragRef.current
      if (!drag) return
      const point = toFieldPoint ? toFieldPoint(ev.clientX, ev.clientY) : null
      if (!point) return
      try {
        if (typeof onMove === 'function') onMove(drag, point, ev)
      } catch (err) {
        // swallow errors to avoid breaking global listeners
        // eslint-disable-next-line no-console
        console.error('useDragPosition onMove error', err)
      }
    }

    const handleUp = (ev) => {
      if (activeTool !== 'mouse') return
      const drag = dragRef && dragRef.current
      const point = toFieldPoint ? toFieldPoint(ev.clientX, ev.clientY) : null
      try {
        if (drag && typeof onEnd === 'function') onEnd(drag, point, ev)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('useDragPosition onEnd error', err)
      }

      if (dragRef && dragRef.current) dragRef.current = null
      if (typeof setIsDragging === 'function') setIsDragging(false)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)

    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [dragRef, toFieldPoint, activeTool, onMove, onEnd, setIsDragging])
}
