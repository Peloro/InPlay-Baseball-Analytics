import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import useDragPosition from '../hooks/useDragPosition'
import PlayerStatsModal from '../components/PlayerStatsModal'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import CountDots from '../components/CountDots'
import { gameStatsApi, gamesApi, seasonStatsApi } from '../services/api'
import { getDefaultFieldPosition } from '../data/defaultFieldPositions'
import { VALID_POSITIONS } from '../data/positions'
import Scoreboard from '../components/game/Scoreboard/Scoreboard'
import Field from '../components/game/Field/Field'
import Bench from '../components/game/Bench/Bench'
import GameHUD from '../components/game/GameHUD'
import useResponsive from '../hooks/useResponsive'
import usePlayers from '../hooks/usePlayers'
import useGameState from '../hooks/useGameState'

const LONG_PRESS_MS = 450
const DEFENSIVE_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']

function makeOpponentMarkers() {
  return DEFENSIVE_POSITIONS.map((position) => {
    const point = getDefaultFieldPosition(position)
    return {
      id: `opponent-${position}`,
      label: position,
      x: point.x,
      y: point.y,
    }
  })
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function getPlayerId(player) {
  return player?._id || player?.id
}

function isInsideRect(clientX, clientY, rect) {
  if (!rect) return false
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

function getMainPosition(player) {
  return player.activePosition || player.positions?.[0] || 'DH'
}

function getRoleType(player) {
  return Array.isArray(player?.positions) && player.positions.includes('P') ? 'pitcher' : 'hitter'
}

function safeNumber(value) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function formatIpFromOuts(outsPitched) {
  const outs = safeNumber(outsPitched)
  const innings = Math.floor(outs / 3)
  const remainder = outs % 3
  return `${innings}.${remainder}`
}

function formatEraFromOuts(outsPitched, earnedRuns) {
  const outs = safeNumber(outsPitched)
  const runs = safeNumber(earnedRuns)
  if (!outs) return '--'
  return ((runs * 21) / outs).toFixed(2)
}

function reorderList(list, from, to) {
  const safe = [...list]
  const [item] = safe.splice(from, 1)
  safe.splice(to, 0, item)
  return safe
}

function applyRunnerAdvance(runners, basesToAdvance) {
  const order = ['first', 'second', 'third']
  const nextRunners = { first: false, second: false, third: false }
  let runs = 0

  for (let index = order.length - 1; index >= 0; index -= 1) {
    const base = order[index]
    if (!runners?.[base]) continue

    const targetIndex = index + basesToAdvance
    if (targetIndex >= order.length) {
      runs += 1
    } else {
      nextRunners[order[targetIndex]] = true
    }
  }

  return { nextRunners, runs }
}

function applyHitToBases(runners, hitType) {
  if (hitType === 'homerun') {
    let runs = 1
    if (runners?.first) runs += 1
    if (runners?.second) runs += 1
    if (runners?.third) runs += 1
    return {
      nextRunners: { first: false, second: false, third: false },
      runs,
      bases: 4,
    }
  }

  const bases = hitType === 'triple' ? 3 : hitType === 'double' ? 2 : 1
  const advanced = applyRunnerAdvance(runners, bases)
  const nextRunners = { ...advanced.nextRunners }
  if (bases === 1) nextRunners.first = true
  if (bases === 2) nextRunners.second = true
  if (bases === 3) nextRunners.third = true

  return {
    nextRunners,
    runs: advanced.runs,
    bases,
  }
}

function forceAdvanceToFirst(runners) {
  const next = { ...(runners || { first: false, second: false, third: false }) }
  let runs = 0

  if (!next.first) {
    next.first = true
    return { nextRunners: next, runs }
  }

  if (next.second && next.third) {
    runs += 1
  }

  next.third = next.second ? true : next.third
  next.second = true
  next.first = true

  return { nextRunners: next, runs }
}

function getNextBatterIndexFromState(state) {
  const order = state.battingOrder || []
  if (!state.isAttacking || !order.length) return state.currentBatterIndex || 0
  const currentIndex = Math.min(state.currentBatterIndex || 0, order.length - 1)
  return (currentIndex + 1) % order.length
}

function FieldPage({
  players,
  setPlayers,
  activeTool,
  clearDrawVersion,
  gameState,
  onUpdateGameState,
  onUpdatePlayer,
  onPitchAction,
  onDefensiveOut,
  onDefensiveEarnedRun,
  activeGame,
  onEndGame,
}) {
  const layoutRef = useRef(null)
  const fieldStageRef = useRef(null)
  const fieldImageRef = useRef(null)
  const benchRef = useRef(null)
  const drawingRef = useRef(null)
  const dragRef = useRef(null)
  const isDrawingRef = useRef(false)
  const longPressTimerRef = useRef(null)
  const dragStartRef = useRef(null)
  const suppressModalUntilRef = useRef(0)

  const [selectedId, setSelectedId] = useState(null)
  const [tooltipId, setTooltipId] = useState(null)
  const [fieldRect, setFieldRect] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const [strokes, setStrokes] = useState([])
  const [laser, setLaser] = useState({ visible: false, x: 0, y: 0 })
  const [dragPreview, setDragPreview] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [focusedPlayerId, setFocusedPlayerId] = useState(null)
  const [focusedSeasonEntry, setFocusedSeasonEntry] = useState(null)
  const [focusedGameEntry, setFocusedGameEntry] = useState(null)
  const [draggingPlayerId, setDraggingPlayerId] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [recentlyDroppedId, setRecentlyDroppedId] = useState(null)
  const [dragSource, setDragSource] = useState(null)
  const [dropMessage, setDropMessage] = useState('')
  const [runnerDrag, setRunnerDrag] = useState(null)
  const [animatedBall, setAnimatedBall] = useState({ visible: false, x: 50, y: 87 })
  const [editingPlayerId, setEditingPlayerId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', number: '', positions: ['DH'], activePosition: 'DH' })
  const [showPreGameSetup, setShowPreGameSetup] = useState(false)
  const [setupAttacking, setSetupAttacking] = useState(true)
  const [setupStarters, setSetupStarters] = useState([])
  const [setupBattingOrder, setSetupBattingOrder] = useState([])
  const [setupDraggingId, setSetupDraggingId] = useState(null)
  const [opponentDefense, setOpponentDefense] = useState(makeOpponentMarkers)
  const [pendingDefenseError, setPendingDefenseError] = useState(false)
  const [selectedErrorDefenderId, setSelectedErrorDefenderId] = useState('')
  const [pendingDoublePlaySelect, setPendingDoublePlaySelect] = useState(false)
  const [selectedDoublePlayRunnerBase, setSelectedDoublePlayRunnerBase] = useState('')
  const [selectedDoublePlayDefenderIds, setSelectedDoublePlayDefenderIds] = useState([])
  const [undoStack, setUndoStack] = useState([])
  const [invalidFeedback, setInvalidFeedback] = useState('')
  const [showFieldContainer, setShowFieldContainer] = useState(true)
  const [showHud, setShowHud] = useState(true)
  const [showScoreboard, setShowScoreboard] = useState(false)
  const touchStartRef = useRef(null)
  const [zoom, setZoom] = useState(0.85)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 })
  const isPinchingRef = useRef(false)
  const pinchRef = useRef({ initialDistance: 0, initialScale: 1, centerClientX: 0, centerClientY: 0, offsetX: 0, offsetY: 0 })

  const getDistance = (t1, t2) => {
    const dx = t2.clientX - t1.clientX
    const dy = t2.clientY - t1.clientY
    return Math.hypot(dx, dy)
  }

  const getCenter = (t1, t2) => ({ x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 })

  const handleTouchStartMobile = (ev) => {
    if (!ev.touches) return
    if (ev.touches.length === 2) {
      isPinchingRef.current = true
      const d = getDistance(ev.touches[0], ev.touches[1])
      const center = getCenter(ev.touches[0], ev.touches[1])
      pinchRef.current = {
        initialDistance: d,
        initialScale: zoom,
        centerClientX: center.x,
        centerClientY: center.y,
        offsetX,
        offsetY,
      }
      ev.preventDefault()
      isPanningRef.current = false
    } else if (ev.touches.length === 1) {
      const t = ev.touches[0]
      const target = ev.target
      if (
        target &&
        target.closest &&
        (target.closest('.player-marker') ||
          target.closest('.animated-ball-marker') ||
          target.closest('.runner-marker') ||
          target.closest('.tool-dock') ||
          target.closest('.player-tooltip'))
      ) {
        // touched an interactive element — let its handlers take precedence
        return
      }
      // Only start panning on touch when in mouse tool. Pen/pointer should
      // allow their own interactions (drawing/laser) and must not trigger pan.
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
      let newScale = pinchRef.current.initialScale * factor
      newScale = Math.max(0.5, Math.min(2.5, newScale))

      const center = getCenter(ev.touches[0], ev.touches[1])
      const stageRect = fieldStageRef.current?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 }
      const centerLocalX = center.x - stageRect.left
      const centerLocalY = center.y - stageRect.top

      const contentX = (centerLocalX - pinchRef.current.offsetX) / pinchRef.current.initialScale
      const contentY = (centerLocalY - pinchRef.current.offsetY) / pinchRef.current.initialScale

      const nextOffsetX = centerLocalX - contentX * newScale
      const nextOffsetY = centerLocalY - contentY * newScale

      const contentWidth = fieldRect.width * newScale
      const contentHeight = fieldRect.height * newScale
      const extraX = Math.max(200, (stageRect.width || 0) * 0.25)
      const extraY = Math.max(200, (stageRect.height || 0) * 0.25)
      const minX = Math.min(0, (stageRect.width || 0) - contentWidth) - extraX
      const minY = Math.min(0, (stageRect.height || 0) - contentHeight) - extraY
      const maxX = extraX
      const maxY = extraY
      const clampX = Math.max(minX, Math.min(nextOffsetX, maxX))
      const clampY = Math.max(minY, Math.min(nextOffsetY, maxY))

      requestAnimationFrame(() => {
        setZoom(Number(newScale.toFixed(3)))
        setOffsetX(clampX)
        setOffsetY(clampY)
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
      ev.preventDefault()
    }
  }

  const handleTouchEndMobile = (ev) => {
    if (!ev.touches || ev.touches.length < 2) {
      isPinchingRef.current = false
    }
    if (!ev.touches || ev.touches.length === 0) {
      isPanningRef.current = false
    }
  }

  const {
    benchSearch,
    setBenchSearch,
    playersById,
    fieldPlayers,
    benchPlayers,
    setupStarterIds,
    setupAvailablePlayers,
    playerCanPlayPosition,
    pitchersOnField: pitchersFromHook,
    getPlayerId,
    getMainPosition,
    setPlayers: setPlayersFromHook,
  } = usePlayers({ players, setPlayers, gameState })

  // helper to return base plate positions (separate from fielder positions)
  const computeBasePosition = (posName) => {
    const p = getDefaultFieldPosition(posName)
    const offsets = {
      '1B': { dx: 3, dy: 6 },
      '2B': { dx: 0, dy: 8 },
      '3B': { dx: -3, dy: 6 },
    }
    const off = offsets[posName] || { dx: 0, dy: 0 }
    return { x: p.x + off.dx, y: p.y + off.dy }
  }

  // keep original setPlayers reference available (setPlayersFromHook === setPlayers)

  useEffect(() => {
    // show scoreboard when mouse near top or on mobile pull-down from top
    const handlePointerMoveScore = (ev) => {
      const y = ev.clientY || (ev.touches && ev.touches[0] && ev.touches[0].clientY) || 0
      const threshold = 64
      if (y <= threshold) {
        if (!showScoreboard) setShowScoreboard(true)
      } else {
        if (showScoreboard) setShowScoreboard(false)
      }
    }

    const handleTouchStart = (ev) => {
      const y = ev.touches && ev.touches[0] && ev.touches[0].clientY
      if (typeof y === 'number' && y <= 64) {
        touchStartRef.current = y
      } else {
        touchStartRef.current = null
      }
    }

    const handleTouchMove = (ev) => {
      if (touchStartRef.current == null) return
      const y = ev.touches && ev.touches[0] && ev.touches[0].clientY
      if (typeof y === 'number' && y - touchStartRef.current > 30) {
        if (!showScoreboard) setShowScoreboard(true)
      }
    }

    window.addEventListener('pointermove', handlePointerMoveScore)
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })

    return () => {
      window.removeEventListener('pointermove', handlePointerMoveScore)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
    }
  }, [showScoreboard])

  useEffect(() => {
    if (!gameState.currentGameId) {
      const timer = window.setTimeout(() => setShowPreGameSetup(false), 0)
      return () => window.clearTimeout(timer)
    }

    if (gameState.preGameConfigured) {
      const timer = window.setTimeout(() => setShowPreGameSetup(false), 0)
      return () => window.clearTimeout(timer)
    }

    const starters = DEFENSIVE_POSITIONS.map((position) => {
      return { position, playerId: '' }
    })

    const timer = window.setTimeout(() => {
      setSetupAttacking(true)
      setSetupStarters(starters)
      setSetupBattingOrder([])
      setShowPreGameSetup(true)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [gameState.currentGameId, gameState.preGameConfigured, players])

  const { pitcherLiveStat, livePitching, opponentName } = useGameState({ gameState, activeGame })

  const { isMobile } = useResponsive()

  // animate runners briefly when score increases and show scoreboard
  const prevScoreRef = useRef({ home: gameState.homeScore || 0, away: gameState.awayScore || 0 })
  const [animateRunners, setAnimateRunners] = useState(false)

  useEffect(() => {
    const prev = prevScoreRef.current
    const nextHome = gameState.homeScore || 0
    const nextAway = gameState.awayScore || 0
    const homeInc = nextHome > prev.home
    const awayInc = nextAway > prev.away
    if ((homeInc || awayInc) && !gameState.preGameConfigured) {
      // show scoreboard and animate runners
      setShowScoreboard(true)
      setAnimateRunners(true)
      window.setTimeout(() => setAnimateRunners(false), 900)
    }
    prevScoreRef.current = { home: nextHome, away: nextAway }
  }, [gameState.homeScore, gameState.awayScore, gameState.preGameConfigured])


  useEffect(() => {
    if (gameState.isAttacking) return

    const lineup = Array.isArray(gameState.lineup) ? gameState.lineup : []
    const lineupById = {}
    for (const item of lineup) {
      if (item?.playerId && item?.position) lineupById[item.playerId] = item.position
    }

    setPlayers((current) =>
      current.map((player) => {
        const id = getPlayerId(player)
        if (!(gameState.onFieldPlayerIds || []).includes(id)) return player
        const position = lineupById[id] || getMainPosition(player)
        const point = getDefaultFieldPosition(position)
        return { ...player, activePosition: position, x: point.x, y: point.y }
      }),
    )
  }, [gameState.isAttacking, gameState.onFieldPlayerIds, gameState.lineup, setPlayers])

  useEffect(() => {
    if (!gameState.currentGameId || !gameState.preGameConfigured || showPreGameSetup) return

    const lineup = Array.isArray(gameState.lineup) ? gameState.lineup : []
    const battingOrder = Array.isArray(gameState.battingOrder) ? gameState.battingOrder : []
    const bench = Array.isArray(gameState.bench) ? gameState.bench : []

    gamesApi.update(gameState.currentGameId, {
      isAttacking: gameState.isAttacking,
      lineup,
      battingOrder,
      bench,
    }).catch(() => {})
  }, [
    gameState.currentGameId,
    gameState.preGameConfigured,
    gameState.isAttacking,
    gameState.lineup,
    gameState.battingOrder,
    gameState.bench,
    showPreGameSetup,
  ])

  const confirmPreGameSetup = async () => {
    const starters = setupStarters.filter((item) => item.playerId)
    const starterIds = starters.map((item) => item.playerId)

    if (starters.length !== 9) return
    if (new Set(starterIds).size !== 9) return
    if (new Set(starters.map((item) => item.position)).size !== 9) return
    if (!starters.every((item) => playerCanPlayPosition(item.playerId, item.position))) return
    if (setupBattingOrder.length !== 9) return
    if (new Set(setupBattingOrder).size !== 9) return
    if (!setupBattingOrder.every((id) => starterIds.includes(id))) return

    const lineupById = {}
    for (const item of starters) lineupById[item.playerId] = item.position
    const bench = players.map((player) => getPlayerId(player)).filter((id) => !starterIds.includes(id))

    setPlayers((current) =>
      current.map((player) => {
        const id = getPlayerId(player)
        const position = lineupById[id]
        if (!position) return player
        const point = getDefaultFieldPosition(position)
        return { ...player, activePosition: position, x: point.x, y: point.y }
      }),
    )

    onUpdateGameState((current) => ({
      ...current,
      isAttacking: setupAttacking,
      lineup: starters,
      bench,
      battingOrder: setupBattingOrder,
      currentBatterIndex: 0,
      participantPlayerIds: [...starterIds, ...bench],
      onFieldPlayerIds: starterIds,
      preGameConfigured: true,
      outs: 0,
      balls: 0,
      strikes: 0,
      runners: { first: false, second: false, third: false },
      inning: current.inning || 1,
      inningHalf: current.inningHalf || 'top',
    }), 'Configuracao inicial confirmada')

    try {
      await gamesApi.update(gameState.currentGameId, {
        isAttacking: setupAttacking,
        battingOrder: setupBattingOrder,
        lineup: starters,
        bench,
      })
    } catch {
      // Mantem setup local mesmo sem backend.
    }

    setShowPreGameSetup(false)
  }

  const assignStarter = (position, playerId) => {
    if (playerId && !playerCanPlayPosition(playerId, position)) return

    setSetupStarters((current) => {
      const next = current.map((item) => (item.position === position ? { ...item, playerId } : item))
      const ids = next.map((item) => item.playerId).filter(Boolean)
      setSetupBattingOrder((order) => {
        const filtered = order.filter((id) => ids.includes(id))
        for (const id of ids) {
          if (!filtered.includes(id)) filtered.push(id)
        }
        return filtered.slice(0, 9)
      })
      return next
    })
  }

  const onBattingDragStart = (id) => setSetupDraggingId(id)

  const onBattingDrop = (targetId) => {
    if (!setupDraggingId || setupDraggingId === targetId) return
    setSetupBattingOrder((current) => {
      const from = current.indexOf(setupDraggingId)
      const to = current.indexOf(targetId)
      if (from < 0 || to < 0) return current
      return reorderList(current, from, to)
    })
    setSetupDraggingId(null)
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

  const toScreenPoint = useCallback((x, y) => ({
    // Return position in raw pixels inside the field viewport (before camera transform)
    left: (x / 100) * fieldRect.width,
    top: (y / 100) * fieldRect.height,
  }), [fieldRect])

  // Wheel zoom and pan handlers (camera control)
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
      // Do not start pan when interacting with markers, runners, animated ball,
      // tool dock, or other interactive UI — only start pan on pure background
      if (
        target.closest &&
        (target.closest('.player-marker') ||
          target.closest('.animated-ball-marker') ||
          target.closest('.runner-marker') ||
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

      // Use the stage container size as the viewport. Relying on the image
      // bounding rect created a circular dependency (image size depended on
      // fieldRect which itself was derived from the image). Using the stage
      // gives a predictable initial size even before the image loads.
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
    const onField = gameState.onFieldPlayerIds || []
    if (!onField.length) return

    // Keep the most recently added player in a duplicated position.
    const seen = new Set()
    const keepReversed = []

    for (let index = onField.length - 1; index >= 0; index -= 1) {
      const id = onField[index]
      const player = playersById[id]
      if (!player) continue
      const position = getMainPosition(player)
      if (seen.has(position)) continue
      seen.add(position)
      keepReversed.push(id)
    }

    const keep = keepReversed.reverse()
    if (keep.length !== onField.length) {
      onUpdateGameState((current) => {
        const unique = Array.from(new Set(keep))
        const battingOrder = (current.battingOrder || []).filter((id) => unique.includes(id))
        const lineup = (current.lineup || []).filter((item) => unique.includes(item.playerId))
        const bench = players.map((item) => getPlayerId(item)).filter((id) => !unique.includes(id))
        return {
          ...current,
          onFieldPlayerIds: unique,
          battingOrder,
          lineup,
          bench,
          participantPlayerIds: [...unique, ...bench],
        }
      }, 'Conflito de posicao resolvido: jogador anterior enviado ao banco')
    }
  }, [gameState.onFieldPlayerIds, onUpdateGameState, players, playersById])

  const advanceRunner = useCallback((base) => {
    const order = ['first', 'second', 'third']
    const index = order.indexOf(base)
    if (index === -1) return

    onUpdateGameState((current) => {
      if (!current.runners?.[base]) return current

      const nextRunners = { ...current.runners, [base]: false }
      const nextBase = order[index + 1]
      const runs = nextBase ? 0 : 1

      if (nextBase) {
        nextRunners[nextBase] = true
      }

      return {
        ...current,
        runners: nextRunners,
        homeScore: (current.homeScore || 0) + (current.isAttacking ? runs : 0),
        awayScore: (current.awayScore || 0) + (!current.isAttacking ? runs : 0),
      }
    }, `Corredor avancou de ${base}`)

    if (!gameState.isAttacking && base === 'third' && gameState.runners?.third) {
      onDefensiveEarnedRun?.(1)
    }
  }, [gameState.isAttacking, gameState.runners, onDefensiveEarnedRun, onUpdateGameState])

  const removeRunner = useCallback((base) => {
    onUpdateGameState((current) => {
      if (!current.runners?.[base]) return current

      const nextOuts = clamp((current.outs || 0) + 1, 0, 3)
      const sideSwitch = nextOuts >= 3
      const nextHalf = sideSwitch
        ? current.inningHalf === 'top'
          ? 'bottom'
          : 'top'
        : current.inningHalf || 'top'
      const shouldAdvanceInning = sideSwitch && current.inningHalf === 'bottom'

      return {
        ...current,
        runners: sideSwitch
          ? { first: false, second: false, third: false }
          : { ...current.runners, [base]: false },
        outs: sideSwitch ? 0 : nextOuts,
        balls: sideSwitch ? 0 : current.balls,
        strikes: sideSwitch ? 0 : current.strikes,
        isAttacking: sideSwitch ? !current.isAttacking : current.isAttacking,
        inningHalf: nextHalf,
        inning: shouldAdvanceInning ? Math.max(1, (current.inning || 1) + 1) : current.inning,
      }
    }, `Corredor removido em ${base}`)
    if (!gameState.isAttacking && gameState.runners?.[base]) {
      onDefensiveOut?.(1)
    }
  }, [gameState.isAttacking, gameState.runners, onDefensiveOut, onUpdateGameState])

  const upsertCurrentBatterStats = useCallback(async (playerId, patch = {}) => {
    if (!gameState.currentGameId || !playerId) return

    const found = await gameStatsApi.listByGame(gameState.currentGameId, playerId)
    const current = found.data?.[0]

    const payload = {
      type: getRoleType(playersById[playerId]),
      hitting: {
        atBats: safeNumber(patch.hitting?.atBats ?? current?.hitting?.atBats),
        hits: safeNumber(patch.hitting?.hits ?? current?.hitting?.hits),
        strikeouts: safeNumber(patch.hitting?.strikeouts ?? current?.hitting?.strikeouts),
        outs: safeNumber(patch.hitting?.outs ?? current?.hitting?.outs),
      },
      pitching: {
        inningsPitched: safeNumber(current?.pitching?.inningsPitched),
        earnedRuns: safeNumber(current?.pitching?.earnedRuns),
        strikeouts: safeNumber(current?.pitching?.strikeouts),
        walks: safeNumber(current?.pitching?.walks),
        strikes: safeNumber(current?.pitching?.strikes),
        balls: safeNumber(current?.pitching?.balls),
        pitchCount: safeNumber(current?.pitching?.pitchCount),
      },
      defense: {
        errors: safeNumber(current?.defense?.errors),
        doublePlays: safeNumber(current?.defense?.doublePlays),
        flyOuts: safeNumber(current?.defense?.flyOuts),
        groundOuts: safeNumber(current?.defense?.groundOuts),
        lineOuts: safeNumber(current?.defense?.lineOuts),
      },
    }

    if (current?._id) {
      await gameStatsApi.update(current._id, payload)
    } else {
      await gameStatsApi.create({ gameId: gameState.currentGameId, playerId, ...payload })
    }
  }, [gameState.currentGameId, playersById])

  const upsertPlayerStat = useCallback(async (playerId, patch = {}) => {
    if (!gameState.currentGameId || !playerId) return

    const found = await gameStatsApi.listByGame(gameState.currentGameId, playerId)
    const current = found.data?.[0]

    const payload = {
      type: getRoleType(playersById[playerId]),
      hitting: {
        atBats: safeNumber(patch.hitting?.atBats ?? current?.hitting?.atBats),
        hits: safeNumber(patch.hitting?.hits ?? current?.hitting?.hits),
        strikeouts: safeNumber(patch.hitting?.strikeouts ?? current?.hitting?.strikeouts),
        outs: safeNumber(patch.hitting?.outs ?? current?.hitting?.outs),
      },
      pitching: {
        inningsPitched: safeNumber(patch.pitching?.inningsPitched ?? current?.pitching?.inningsPitched),
        outsPitched: safeNumber(patch.pitching?.outsPitched ?? current?.pitching?.outsPitched),
        earnedRuns: safeNumber(patch.pitching?.earnedRuns ?? current?.pitching?.earnedRuns),
        strikeouts: safeNumber(patch.pitching?.strikeouts ?? current?.pitching?.strikeouts),
        walks: safeNumber(patch.pitching?.walks ?? current?.pitching?.walks),
        strikes: safeNumber(patch.pitching?.strikes ?? current?.pitching?.strikes),
        balls: safeNumber(patch.pitching?.balls ?? current?.pitching?.balls),
        pitchCount: safeNumber(patch.pitching?.pitchCount ?? current?.pitching?.pitchCount),
      },
      defense: {
        errors: safeNumber(patch.defense?.errors ?? current?.defense?.errors),
        doublePlays: safeNumber(patch.defense?.doublePlays ?? current?.defense?.doublePlays),
        flyOuts: safeNumber(patch.defense?.flyOuts ?? current?.defense?.flyOuts),
        groundOuts: safeNumber(patch.defense?.groundOuts ?? current?.defense?.groundOuts),
        lineOuts: safeNumber(patch.defense?.lineOuts ?? current?.defense?.lineOuts),
      },
    }

    if (current?._id) {
      await gameStatsApi.update(current._id, payload)
    } else {
      await gameStatsApi.create({ gameId: gameState.currentGameId, playerId, ...payload })
    }
  }, [gameState.currentGameId, playersById])

  const syncDefensivePitcherEvent = useCallback(async ({ outsDelta = 0, earnedRunsDelta = 0, pitchCountDelta = 0, walksDelta = 0, strikeoutsDelta = 0 } = {}) => {
    if (gameState.isAttacking) return
    if (!gameState.currentGameId || !gameState.currentPitcherId) return

    const pitcherId = gameState.currentPitcherId
    const found = await gameStatsApi.listByGame(gameState.currentGameId, pitcherId)
    const current = found.data?.[0]

    const nextOutsPitched = safeNumber(current?.pitching?.outsPitched) + safeNumber(outsDelta)
    const patch = {
      pitching: {
        outsPitched: nextOutsPitched,
        inningsPitched: Math.floor(nextOutsPitched / 3) + ((nextOutsPitched % 3) / 10),
        earnedRuns: safeNumber(current?.pitching?.earnedRuns) + safeNumber(earnedRunsDelta),
        strikeouts: safeNumber(current?.pitching?.strikeouts) + safeNumber(strikeoutsDelta),
        walks: safeNumber(current?.pitching?.walks) + safeNumber(walksDelta),
        strikes: safeNumber(current?.pitching?.strikes),
        balls: safeNumber(current?.pitching?.balls),
        pitchCount: safeNumber(current?.pitching?.pitchCount) + safeNumber(pitchCountDelta),
      },
    }

    await upsertPlayerStat(pitcherId, patch)
  }, [gameState.currentGameId, gameState.currentPitcherId, gameState.isAttacking, upsertPlayerStat])

  const showInvalidAction = useCallback((message) => {
    setInvalidFeedback(message)
    window.setTimeout(() => setInvalidFeedback(''), 1400)
  }, [])

  const captureUndoSnapshot = useCallback(async () => {
    if (!gameState.currentGameId) return

    let statsSnapshot = []
    try {
      const response = await gameStatsApi.listByGame(gameState.currentGameId)
      statsSnapshot = (response.data || []).map((entry) => ({
        playerId: entry.playerId?._id || entry.playerId,
        type: entry.type,
        hitting: {
          atBats: safeNumber(entry.hitting?.atBats),
          hits: safeNumber(entry.hitting?.hits),
          strikeouts: safeNumber(entry.hitting?.strikeouts),
          outs: safeNumber(entry.hitting?.outs),
        },
        pitching: {
          inningsPitched: safeNumber(entry.pitching?.inningsPitched),
          outsPitched: safeNumber(entry.pitching?.outsPitched),
          earnedRuns: safeNumber(entry.pitching?.earnedRuns),
          strikeouts: safeNumber(entry.pitching?.strikeouts),
          walks: safeNumber(entry.pitching?.walks),
          strikes: safeNumber(entry.pitching?.strikes),
          balls: safeNumber(entry.pitching?.balls),
          pitchCount: safeNumber(entry.pitching?.pitchCount),
        },
        defense: {
          errors: safeNumber(entry.defense?.errors),
          doublePlays: safeNumber(entry.defense?.doublePlays),
          flyOuts: safeNumber(entry.defense?.flyOuts),
          groundOuts: safeNumber(entry.defense?.groundOuts),
          lineOuts: safeNumber(entry.defense?.lineOuts),
        },
      }))
    } catch {
      statsSnapshot = []
    }

    const stateSnapshot = JSON.parse(JSON.stringify(gameState))
    setUndoStack((current) => [...current, { stateSnapshot, statsSnapshot }].slice(-80))
  }, [gameState])

  const handleUndo = useCallback(async () => {
    const latest = undoStack[undoStack.length - 1]
    if (!latest) {
      showInvalidAction('Nada para desfazer')
      return
    }

    setUndoStack((current) => current.slice(0, -1))
    onUpdateGameState(latest.stateSnapshot)

    if (!gameState.currentGameId) return

    try {
      const currentStatsResponse = await gameStatsApi.listByGame(gameState.currentGameId)
      const currentStats = currentStatsResponse.data || []
      const snapshotMap = {}
      for (const item of latest.statsSnapshot || []) {
        snapshotMap[item.playerId] = item
      }

      for (const currentEntry of currentStats) {
        const pid = currentEntry.playerId?._id || currentEntry.playerId
        const saved = snapshotMap[pid]

        if (saved) {
          await upsertPlayerStat(pid, saved)
          continue
        }

        await upsertPlayerStat(pid, {
          type: currentEntry.type,
          hitting: { atBats: 0, hits: 0, strikeouts: 0, outs: 0 },
          pitching: {
            inningsPitched: 0,
            outsPitched: 0,
            earnedRuns: 0,
            strikeouts: 0,
            walks: 0,
            strikes: 0,
            balls: 0,
            pitchCount: 0,
          },
          defense: { errors: 0, doublePlays: 0, flyOuts: 0, groundOuts: 0, lineOuts: 0 },
        })
      }

      for (const saved of latest.statsSnapshot || []) {
        const alreadyExists = currentStats.some((item) => {
          const pid = item.playerId?._id || item.playerId
          return pid === saved.playerId
        })
        if (!alreadyExists) {
          await upsertPlayerStat(saved.playerId, saved)
        }
      }
    } catch {
      showInvalidAction('Falha ao restaurar stats')
    }
  }, [gameState.currentGameId, onUpdateGameState, showInvalidAction, undoStack, upsertPlayerStat])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (String(event.key || '').toLowerCase() !== 'z') return
      event.preventDefault()
      handleUndo().catch(() => {})
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleUndo])

  const applyPlateAppearance = useCallback(async (kind) => {
    const order = gameState.battingOrder || []
    if (!order.length || !gameState.isAttacking) return

    await captureUndoSnapshot()

    const batterIndex = Math.min(gameState.currentBatterIndex || 0, order.length - 1)
    const batterId = order[batterIndex]
    const isHit = kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'homerun'

    if (isHit) {
      const preview = applyHitToBases(gameState.runners || { first: false, second: false, third: false }, kind)
      const bases = preview.bases || 1
      const destName = bases >= 4 ? 'C' : bases === 3 ? '3B' : bases === 2 ? '2B' : '1B'
      const homePos = getDefaultFieldPosition('C')
      const destPos = getDefaultFieldPosition(destName)

      setAnimatedBall({ visible: true, x: homePos.x, y: homePos.y })
      // allow a render frame
      await new Promise((r) => setTimeout(r, 40))
      setAnimatedBall({ visible: true, x: destPos.x, y: destPos.y })
      // wait for transition to finish (matches runner transition timing)
      await new Promise((r) => setTimeout(r, 480))
    }

    onUpdateGameState((current) => {
      const localOrder = current.battingOrder || []
      if (!localOrder.length) return current

      const currentIndex = Math.min(current.currentBatterIndex || 0, localOrder.length - 1)
      const nextIndex = (currentIndex + 1) % localOrder.length
      const isOut = kind === 'strikeout' || kind === 'out'
      const outs = isOut ? clamp((current.outs || 0) + 1, 0, 3) : current.outs || 0

      let nextRunners = { ...(current.runners || { first: false, second: false, third: false }) }
      let runs = 0

      if (isHit) {
        const hitResult = applyHitToBases(nextRunners, kind)
        nextRunners = hitResult.nextRunners
        runs = hitResult.runs
      }

      const sideSwitch = outs >= 3
      const nextHalf = sideSwitch
        ? current.inningHalf === 'top'
          ? 'bottom'
          : 'top'
        : current.inningHalf || 'top'
      const shouldAdvanceInning = sideSwitch && current.inningHalf === 'bottom'

      return {
        ...current,
        outs: sideSwitch ? 0 : outs,
        balls: 0,
        strikes: 0,
        currentBatterIndex: nextIndex,
        isAttacking: sideSwitch ? !current.isAttacking : current.isAttacking,
        inningHalf: nextHalf,
        inning: shouldAdvanceInning ? Math.max(1, (current.inning || 1) + 1) : current.inning,
        runners: sideSwitch ? { first: false, second: false, third: false } : nextRunners,
        homeScore: (current.homeScore || 0) + (current.isAttacking ? runs : 0),
        awayScore: (current.awayScore || 0) + (!current.isAttacking ? runs : 0),
      }
    }, `Acao de bastao: ${kind}`)

    if (isHit) setAnimatedBall({ visible: false, x: 50, y: 87 })

    try {
      const endedAsOut = kind === 'strikeout' || kind === 'out'
      const found = await gameStatsApi.listByGame(gameState.currentGameId, batterId)
      const current = found.data?.[0]
      const patch = {
        hitting: {
          atBats: safeNumber(current?.hitting?.atBats) + 1,
          hits: safeNumber(current?.hitting?.hits) + (kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'homerun' ? 1 : 0),
          strikeouts: safeNumber(current?.hitting?.strikeouts) + (kind === 'strikeout' ? 1 : 0),
          outs: safeNumber(current?.hitting?.outs) + (endedAsOut ? 1 : 0),
        },
      }
      await upsertCurrentBatterStats(batterId, patch)
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.battingOrder, gameState.currentBatterIndex, gameState.currentGameId, gameState.isAttacking, onUpdateGameState, upsertCurrentBatterStats, setAnimatedBall, getDefaultFieldPosition, gameState.runners])

  const applyDefensiveHit = useCallback(async (kind) => {
    if (gameState.isAttacking) return

    await captureUndoSnapshot()

    let runsScored = 0

    const isHit = kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'homerun'
    if (isHit) {
      const preview = applyHitToBases(gameState.runners || { first: false, second: false, third: false }, kind)
      const bases = preview.bases || 1
      const destName = bases >= 4 ? 'C' : bases === 3 ? '3B' : bases === 2 ? '2B' : '1B'
      const homePos = getDefaultFieldPosition('C')
      const destPos = getDefaultFieldPosition(destName)

      setAnimatedBall({ visible: true, x: homePos.x, y: homePos.y })
      await new Promise((r) => setTimeout(r, 40))
      setAnimatedBall({ visible: true, x: destPos.x, y: destPos.y })
      await new Promise((r) => setTimeout(r, 480))
    }

    onUpdateGameState((current) => {
      if (current.isAttacking) return current

      const hitResult = applyHitToBases(current.runners || { first: false, second: false, third: false }, kind)
      runsScored = hitResult.runs

      return {
        ...current,
        balls: 0,
        strikes: 0,
        // defensive event: increment our counts and per-pitcher mapping
        pitchCount: Number(current.pitchCount || 0) + 1,
        ourPitchCount: Number(current.ourPitchCount || 0) + 1,
        pitchCounts: (() => {
          const next = { ...(current.pitchCounts || {}) }
          const pid = current.currentPitcherId
          if (pid) next[pid] = Number(next[pid] || 0) + 1
          return next
        })(),
        runners: hitResult.nextRunners,
        homeScore: (current.homeScore || 0) + (current.isAttacking ? hitResult.runs : 0),
        awayScore: (current.awayScore || 0) + (!current.isAttacking ? hitResult.runs : 0),
      }
    }, `Hit do adversario: ${kind}`)

    if (isHit) setAnimatedBall({ visible: false, x: 50, y: 87 })

    try {
      await syncDefensivePitcherEvent({
        pitchCountDelta: 1,
        earnedRunsDelta: runsScored > 0 ? runsScored : 0,
      })
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.isAttacking, onUpdateGameState, syncDefensivePitcherEvent, setAnimatedBall, getDefaultFieldPosition, gameState.runners])

  const applyAttackCountAction = useCallback(async (kind) => {
    if (!gameState.isAttacking) return

    await captureUndoSnapshot()

    onUpdateGameState((current) => {
      if (!current.isAttacking) return current

      const beforeStrikes = Number(current.strikes || 0)
      const beforeBalls = Number(current.balls || 0)
      const nextStrikesRaw = kind === 'strike'
        ? beforeStrikes + 1
        : kind === 'foul'
          ? Math.min(2, beforeStrikes + 1)
          : beforeStrikes
      const nextBallsRaw = kind === 'ball' ? beforeBalls + 1 : beforeBalls

      const didStrikeout = nextStrikesRaw >= 3
      const didWalk = !didStrikeout && nextBallsRaw >= 4
      const order = current.battingOrder || []

      let nextOuts = Number(current.outs || 0)
      let nextInning = Number(current.inning || 1)
      let nextHalf = current.inningHalf || 'top'
      let nextIsAttacking = current.isAttacking
      let nextRunners = { ...(current.runners || { first: false, second: false, third: false }) }
      let scoredRuns = 0

      if (didStrikeout) {
        nextOuts += 1

        if (nextOuts >= 3) {
          nextOuts = 0
          nextIsAttacking = false
          nextHalf = current.inningHalf === 'top' ? 'bottom' : 'top'
          if (current.inningHalf === 'bottom') nextInning = Math.max(1, nextInning + 1)
          nextRunners = { first: false, second: false, third: false }
        }
      }

      if (didWalk) {
        const forced = forceAdvanceToFirst(nextRunners)
        nextRunners = forced.nextRunners
        scoredRuns = forced.runs
      }

      const shouldAdvanceBatter = order.length > 0 && (didStrikeout || didWalk)
      const nextBatterIndex = shouldAdvanceBatter
        ? getNextBatterIndexFromState(current)
        : Number(current.currentBatterIndex || 0)

      return {
        ...current,
        // attack-side increment goes to opponentPitchCount only
        opponentPitchCount: Number(current.opponentPitchCount || 0) + 1,
        strikes: didStrikeout || didWalk ? 0 : nextStrikesRaw,
        balls: didStrikeout || didWalk ? 0 : nextBallsRaw,
        currentBatterIndex: nextBatterIndex,
        outs: nextOuts,
        inning: nextInning,
        inningHalf: nextHalf,
        isAttacking: nextIsAttacking,
        runners: nextRunners,
        homeScore: Number(current.homeScore || 0) + scoredRuns,
        awayScore: Number(current.awayScore || 0),
      }
    }, `Contagem no ataque: ${kind}`)
  }, [captureUndoSnapshot, gameState.isAttacking, onUpdateGameState])

  const applyDefensiveOutEvent = useCallback(async (kind = 'out') => {
    if (gameState.isAttacking) return

    await captureUndoSnapshot()

    onUpdateGameState((current) => {
      if (current.isAttacking) return current

      const nextOutsRaw = Number(current.outs || 0) + 1
      const sideSwitch = nextOutsRaw >= 3
      const nextHalf = sideSwitch
        ? current.inningHalf === 'top'
          ? 'bottom'
          : 'top'
        : current.inningHalf || 'top'
      const shouldAdvanceInning = sideSwitch && current.inningHalf === 'bottom'

      return {
        ...current,
        outs: sideSwitch ? 0 : nextOutsRaw,
        // defensive event: increment our counts and per-pitcher mapping
        pitchCount: Number(current.pitchCount || 0) + 1,
        ourPitchCount: Number(current.ourPitchCount || 0) + 1,
        pitchCounts: (() => {
          const next = { ...(current.pitchCounts || {}) }
          const pid = current.currentPitcherId
          if (pid) next[pid] = Number(next[pid] || 0) + 1
          return next
        })(),
        balls: 0,
        strikes: 0,
        isAttacking: sideSwitch ? !current.isAttacking : current.isAttacking,
        inningHalf: nextHalf,
        inning: shouldAdvanceInning ? Math.max(1, (current.inning || 1) + 1) : current.inning,
        runners: sideSwitch ? { first: false, second: false, third: false } : current.runners,
      }
    }, `Out defensivo: ${kind}`)

    try {
      await syncDefensivePitcherEvent({
        outsDelta: 1,
        pitchCountDelta: 1,
        strikeoutsDelta: kind === 'strikeout' ? 1 : 0,
      })
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.isAttacking, onUpdateGameState, syncDefensivePitcherEvent])

  const applyDoublePlayWithRunner = async (runnerBase, defenderIds = []) => {
    if (!runnerBase) return

    await captureUndoSnapshot()

    const defenderLabel = defenderIds.length
      ? defenderIds
        .map((id) => playersById[id])
        .filter(Boolean)
        .map((player) => getMainPosition(player))
        .join(' -> ')
      : ''
    const defenderText = defenderLabel ? ` | defesa: ${defenderLabel}` : ''

    onUpdateGameState((current) => {
      const hasRunner = Boolean(current.runners?.[runnerBase])
      if (!hasRunner) return current

      const nextRunners = { ...(current.runners || { first: false, second: false, third: false }), [runnerBase]: false }
      const nextOutsRaw = Number(current.outs || 0) + 2
      const sideSwitch = nextOutsRaw >= 3
      const nextHalf = sideSwitch
        ? current.inningHalf === 'top'
          ? 'bottom'
          : 'top'
        : current.inningHalf || 'top'
      const shouldAdvanceInning = sideSwitch && current.inningHalf === 'bottom'

      return {
        ...current,
        outs: sideSwitch ? 0 : nextOutsRaw,
        // defensive double play: increment our counts and per-pitcher mapping
        pitchCount: Number(current.pitchCount || 0) + 1,
        ourPitchCount: Number(current.ourPitchCount || 0) + 1,
        pitchCounts: (() => {
          const next = { ...(current.pitchCounts || {}) }
          const pid = current.currentPitcherId
          if (pid) next[pid] = Number(next[pid] || 0) + 1
          return next
        })(),
        balls: 0,
        strikes: 0,
        currentBatterIndex: getNextBatterIndexFromState(current),
        isAttacking: sideSwitch ? !current.isAttacking : current.isAttacking,
        inningHalf: nextHalf,
        inning: shouldAdvanceInning ? Math.max(1, (current.inning || 1) + 1) : current.inning,
        runners: sideSwitch ? { first: false, second: false, third: false } : nextRunners,
      }
    }, `Double play em ${runnerBase}${defenderText}`)

    try {
      if (!gameState.isAttacking) {
        await syncDefensivePitcherEvent({ outsDelta: 2, pitchCountDelta: 1 })

        for (const defenderId of defenderIds) {
          const found = await gameStatsApi.listByGame(gameState.currentGameId, defenderId)
          const current = found.data?.[0]
          await upsertPlayerStat(defenderId, {
            defense: {
              errors: safeNumber(current?.defense?.errors),
              doublePlays: safeNumber(current?.defense?.doublePlays) + 1,
              flyOuts: safeNumber(current?.defense?.flyOuts),
              groundOuts: safeNumber(current?.defense?.groundOuts),
              lineOuts: safeNumber(current?.defense?.lineOuts),
            },
          })
        }
      }
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }

    setPendingDoublePlaySelect(false)
    setSelectedDoublePlayRunnerBase('')
    setSelectedDoublePlayDefenderIds([])
  }

  const handleDoublePlayAction = () => {
    const occupied = ['first', 'second', 'third'].filter((base) => Boolean(gameState.runners?.[base]))
    if (!occupied.length) {
      showInvalidAction('Double play exige corredor em base')
      return
    }

    if (occupied.length === 1 && gameState.isAttacking) {
      applyDoublePlayWithRunner(occupied[0], [])
      return
    }

    setSelectedDoublePlayRunnerBase(occupied[0])
    if (!gameState.isAttacking) {
      setSelectedDoublePlayDefenderIds([])
    }
    setPendingDoublePlaySelect(true)
  }

  const applySacFly = useCallback(async () => {
    await captureUndoSnapshot()

    let runScored = 0

    onUpdateGameState((current) => {
      const hadRunnerOnThird = Boolean(current.runners?.third)
      const nextOutsRaw = Number(current.outs || 0) + 1
      const sideSwitch = nextOutsRaw >= 3

      const nextRunners = { ...(current.runners || { first: false, second: false, third: false }) }
      if (hadRunnerOnThird) {
        nextRunners.third = false
        runScored = 1
      }

      const nextHalf = sideSwitch
        ? current.inningHalf === 'top'
          ? 'bottom'
          : 'top'
        : current.inningHalf || 'top'
      const shouldAdvanceInning = sideSwitch && current.inningHalf === 'bottom'

      return {
        ...current,
        outs: sideSwitch ? 0 : nextOutsRaw,
        // defensive sac fly: increment our counts and per-pitcher mapping
        pitchCount: Number(current.pitchCount || 0) + 1,
        ourPitchCount: Number(current.ourPitchCount || 0) + 1,
        pitchCounts: (() => {
          const next = { ...(current.pitchCounts || {}) }
          const pid = current.currentPitcherId
          if (pid) next[pid] = Number(next[pid] || 0) + 1
          return next
        })(),
        balls: 0,
        strikes: 0,
        currentBatterIndex: getNextBatterIndexFromState(current),
        isAttacking: sideSwitch ? !current.isAttacking : current.isAttacking,
        inningHalf: nextHalf,
        inning: shouldAdvanceInning ? Math.max(1, (current.inning || 1) + 1) : current.inning,
        runners: sideSwitch ? { first: false, second: false, third: false } : nextRunners,
        homeScore: (current.homeScore || 0) + (current.isAttacking ? runScored : 0),
        awayScore: (current.awayScore || 0) + (!current.isAttacking ? runScored : 0),
      }
    }, 'Sac fly')

    try {
      if (!gameState.isAttacking) {
        await syncDefensivePitcherEvent({ outsDelta: 1, earnedRunsDelta: runScored, pitchCountDelta: 1 })
      }
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.isAttacking, onUpdateGameState, syncDefensivePitcherEvent])

  const applyDeadBall = useCallback(async () => {
    await captureUndoSnapshot()

    onUpdateGameState((current) => {
      const forced = forceAdvanceToFirst(current.runners || { first: false, second: false, third: false })

      if (current.isAttacking) {
        return {
          ...current,
          opponentPitchCount: Number(current.opponentPitchCount || 0) + 1,
          currentBatterIndex: getNextBatterIndexFromState(current),
          runners: forced.nextRunners,
          homeScore: (current.homeScore || 0) + (current.isAttacking ? forced.runs : 0),
          awayScore: (current.awayScore || 0) + (!current.isAttacking ? forced.runs : 0),
        }
      }

      return {
        ...current,
        // defensive dead ball
        pitchCount: Number(current.pitchCount || 0) + 1,
        ourPitchCount: Number(current.ourPitchCount || 0) + 1,
        pitchCounts: (() => {
          const next = { ...(current.pitchCounts || {}) }
          const pid = current.currentPitcherId
          if (pid) next[pid] = Number(next[pid] || 0) + 1
          return next
        })(),
        currentBatterIndex: getNextBatterIndexFromState(current),
        runners: forced.nextRunners,
        homeScore: (current.homeScore || 0) + (current.isAttacking ? forced.runs : 0),
        awayScore: (current.awayScore || 0) + (!current.isAttacking ? forced.runs : 0),
      }
    }, 'Dead ball')

    try {
      if (!gameState.isAttacking) {
        await syncDefensivePitcherEvent({ pitchCountDelta: 1, walksDelta: 1 })
      }
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.isAttacking, onUpdateGameState, syncDefensivePitcherEvent])

  const applyErrorEvent = async (defenderId = '') => {
    await captureUndoSnapshot()

    let runsScored = 0

    onUpdateGameState((current) => {
      const advanced = applyRunnerAdvance(current.runners || { first: false, second: false, third: false }, 1)
      const nextRunners = { ...advanced.nextRunners, first: true }
      runsScored = advanced.runs

      if (current.isAttacking) {
        return {
          ...current,
          opponentPitchCount: Number(current.opponentPitchCount || 0) + 1,
          balls: 0,
          strikes: 0,
          currentBatterIndex: getNextBatterIndexFromState(current),
          runners: nextRunners,
          homeScore: (current.homeScore || 0) + (current.isAttacking ? advanced.runs : 0),
          awayScore: (current.awayScore || 0) + (!current.isAttacking ? advanced.runs : 0),
        }
      }

      return {
        ...current,
        pitchCount: Number(current.pitchCount || 0) + 1,
        ourPitchCount: Number(current.ourPitchCount || 0) + 1,
        pitchCounts: (() => {
          const next = { ...(current.pitchCounts || {}) }
          const pid = current.currentPitcherId
          if (pid) next[pid] = Number(next[pid] || 0) + 1
          return next
        })(),
        balls: 0,
        strikes: 0,
        currentBatterIndex: getNextBatterIndexFromState(current),
        runners: nextRunners,
        homeScore: (current.homeScore || 0) + (current.isAttacking ? advanced.runs : 0),
        awayScore: (current.awayScore || 0) + (!current.isAttacking ? advanced.runs : 0),
      }
    }, defenderId ? `Erro defensivo: ${defenderId}` : 'Erro defensivo')

    try {
      if (!gameState.isAttacking) {
        if (defenderId) {
          const found = await gameStatsApi.listByGame(gameState.currentGameId, defenderId)
          const current = found.data?.[0]
          await upsertPlayerStat(defenderId, {
            defense: {
              errors: safeNumber(current?.defense?.errors) + 1,
              doublePlays: safeNumber(current?.defense?.doublePlays),
              flyOuts: safeNumber(current?.defense?.flyOuts),
              groundOuts: safeNumber(current?.defense?.groundOuts),
              lineOuts: safeNumber(current?.defense?.lineOuts),
            },
          })
        }

        if (runsScored > 0) {
          await syncDefensivePitcherEvent({ earnedRunsDelta: runsScored, pitchCountDelta: 1 })
        } else {
          await syncDefensivePitcherEvent({ pitchCountDelta: 1 })
        }
      }
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }

    setPendingDefenseError(false)
    setSelectedErrorDefenderId('')
  }

  const confirmDefensiveError = async () => {
    if (!selectedErrorDefenderId) return
    await applyErrorEvent(selectedErrorDefenderId)
  }

  const openPlayerDetails = useCallback((playerId) => {
    setFocusedSeasonEntry(null)
    setFocusedGameEntry(null)
    setFocusedPlayerId(null)
    window.requestAnimationFrame(() => setFocusedPlayerId(playerId))
  }, [setFocusedGameEntry, setFocusedPlayerId, setFocusedSeasonEntry])

  const openEditModal = (playerId) => {
    const player = playersById[playerId]
    if (!player) return

    const positions = Array.isArray(player.positions) && player.positions.length
      ? player.positions
      : ['DH']

    setEditForm({
      name: player.name,
      number: String(player.number),
      positions,
      activePosition: positions.includes(player.activePosition) ? player.activePosition : positions[0],
    })
    setEditingPlayerId(playerId)
  }

  const toggleEditPosition = (position) => {
    setEditForm((current) => {
      const has = current.positions.includes(position)
      const nextPositions = has
        ? current.positions.filter((item) => item !== position)
        : [...current.positions, position]
      const safePositions = nextPositions.length ? nextPositions : ['DH']

      return {
        ...current,
        positions: safePositions,
        activePosition: safePositions.includes(current.activePosition)
          ? current.activePosition
          : safePositions[0],
      }
    })
  }

  const saveEditedPlayer = async () => {
    if (!editingPlayerId) return
    if (!editForm.name.trim() || !editForm.number || !editForm.positions.length) return

    await onUpdatePlayer?.(editingPlayerId, {
      name: editForm.name.trim(),
      number: Number(editForm.number),
      positions: editForm.positions,
      activePosition: editForm.activePosition,
    })

    setEditingPlayerId(null)
  }

  const onPlayerClick = (playerId) => {
    setSelectedId(playerId)
  }

  const startDragPlayer = (event, playerId, source, options = {}) => {
    if (activeTool !== 'mouse') return
    event.preventDefault()

    // support starting opponent drags via options.asType === 'opponent'
    if (options && options.asType === 'opponent') {
      dragRef.current = { type: 'opponent', id: playerId }
      dragStartRef.current = { x: event.clientX, y: event.clientY }
      setDragSource(source)
      setDraggingPlayerId(playerId)
      setSelectedId(null)
      setDragPreview({ x: event.clientX, y: event.clientY, label: playersById[playerId]?.name || 'Jogador' })
      setIsDragging(true)
      return
    }

    dragRef.current = { type: 'player', source, playerId }
    dragStartRef.current = { x: event.clientX, y: event.clientY }
    setDragSource(source)
    setDraggingPlayerId(playerId)
    setSelectedId(playerId)
    setDragPreview({ x: event.clientX, y: event.clientY, label: playersById[playerId]?.name || 'Jogador' })

    // mark dragging state to disable transitions
    setIsDragging(true)

    if (source === 'field') {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = setTimeout(() => setTooltipId(playerId), LONG_PRESS_MS)
    }
  }

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
    if (!focusedPlayerId) {
      const frame = window.requestAnimationFrame(() => {
        setFocusedSeasonEntry(null)
        setFocusedGameEntry(null)
      })
      return () => window.cancelAnimationFrame(frame)
    }

    const load = async () => {
      try {
        const [seasonResponse, gameResponse] = await Promise.all([
          seasonStatsApi.list(focusedPlayerId),
          gameState.currentGameId
            ? gameStatsApi.listByGame(gameState.currentGameId, focusedPlayerId)
            : Promise.resolve({ data: [] }),
        ])

        setFocusedSeasonEntry(seasonResponse.data?.[0] || null)
        setFocusedGameEntry(gameResponse.data?.[0] || null)
      } catch {
        setFocusedSeasonEntry(null)
        setFocusedGameEntry(null)
      }
    }

    load()
    return undefined
  }, [focusedPlayerId, gameState.currentGameId])

  // Separate small pointer handler for laser and pen drawing (non-drag responsibilities)
  useEffect(() => {
    const pointerHandler = (event) => {
      if (activeTool === 'pointer' && fieldStageRef.current) {
        const rect = fieldStageRef.current.getBoundingClientRect()
        setLaser({ visible: true, x: event.clientX - rect.left, y: event.clientY - rect.top })
      }

      if (activeTool === 'pen') movePenStroke(event)
    }

    window.addEventListener('pointermove', pointerHandler)
    return () => window.removeEventListener('pointermove', pointerHandler)
  }, [activeTool, movePenStroke])

  // Unified drag handling for field entities (players, opponents, runners)
  useDragPosition({
    dragRef,
    toFieldPoint,
    activeTool,
    setIsDragging,
    onMove: (drag, point, ev) => {
      // update preview and drop hints
      setDragPreview((current) => (current ? { ...current, x: ev.clientX, y: ev.clientY } : current))

      const inField = isInsideRect(ev.clientX, ev.clientY, fieldImageRef.current?.getBoundingClientRect())
      const inBench = isInsideRect(ev.clientX, ev.clientY, benchRef.current?.getBoundingClientRect())
      setDropTarget(inField ? 'field' : inBench ? 'bench' : null)

      if (drag.type === 'player') {
        if (drag.source === 'field' && inBench) {
          setDropMessage('Soltar para adicionar ao banco')
        } else if (drag.source === 'bench' && inField) {
          const draggedPlayer = playersById[drag.playerId]
          const hasConflict = (gameState.onFieldPlayerIds || []).some((id) => {
            const existing = playersById[id]
            return existing && draggedPlayer && getMainPosition(existing) === getMainPosition(draggedPlayer)
          })
          setDropMessage(hasConflict ? 'Confirmar substituicao' : 'Soltar para colocar no campo')
        } else {
          setDropMessage('')
        }
      }

      if (drag.type === 'player' && drag.source === 'field') {
        setPlayers((current) =>
          current.map((player) => {
            const id = getPlayerId(player)
            return id === drag.playerId ? { ...player, x: point.x, y: point.y } : player
          }),
        )
      }

      if (drag.type === 'opponent') {
        setOpponentDefense((current) =>
          current.map((item) => (item.id === drag.id ? { ...item, x: point.x, y: point.y } : item)),
        )
      }

      if (drag.type === 'runner') {
        setRunnerDrag({ base: drag.base, x: point.x, y: point.y })
      }
    },
    onEnd: (drag, point, ev) => {
      clearTimeout(longPressTimerRef.current)
      setTooltipId(null)
      if (activeTool === 'pen') isDrawingRef.current = false

      if (!drag) {
        setDragPreview(null)
        setDropTarget(null)
        return
      }

      const inField = isInsideRect(ev.clientX, ev.clientY, fieldImageRef.current?.getBoundingClientRect())
      const inBench = isInsideRect(ev.clientX, ev.clientY, benchRef.current?.getBoundingClientRect())

      if (drag.type === 'player') {
        const player = playersById[drag.playerId]
        const currentOnField = gameState.onFieldPlayerIds || []

        if (drag.source === 'bench' && inField && point) {
          const defaultPosition = getDefaultFieldPosition(player?.activePosition)

          if (currentOnField.length >= 9) {
            setDragPreview(null)
            setDropTarget(null)
            return
          }

          const duplicateId = currentOnField.find((id) => {
            const existing = playersById[id]
            return existing && getMainPosition(existing) === getMainPosition(player)
          })

          if (duplicateId) {
            const replaced = playersById[duplicateId]
            const confirmed = window.confirm(`Confirmar substituicao: ${player?.name || 'Jogador'} entra e ${replaced?.name || 'jogador'} vai para o banco?`)
            if (!confirmed) {
              setDragPreview(null)
              setDropTarget(null)
              setDropMessage('')
              return
            }
          }

          const nextOnField = duplicateId
            ? [...currentOnField.filter((id) => id !== duplicateId), drag.playerId]
            : [...currentOnField, drag.playerId]

          setPlayers((current) =>
            current.map((item) =>
              getPlayerId(item) === drag.playerId
                ? { ...item, x: defaultPosition.x, y: defaultPosition.y }
                : item,
            ),
          )

          onUpdateGameState((current) => {
            const battingOrder = [...(current.battingOrder || [])]
            if (duplicateId) {
              const replacedIndex = battingOrder.findIndex((id) => id === duplicateId)
              if (replacedIndex >= 0) battingOrder[replacedIndex] = drag.playerId
            } else if (!battingOrder.includes(drag.playerId) && battingOrder.length < 9) {
              battingOrder.push(drag.playerId)
            }

            const lineup = (current.lineup || []).filter((item) => nextOnField.includes(item.playerId))
            const usedPositions = new Set(lineup.map((item) => item.position))

            const enteringPosition = getMainPosition(player)
            const positionToUse = !usedPositions.has(enteringPosition)
              ? enteringPosition
              : DEFENSIVE_POSITIONS.find((position) => !usedPositions.has(position)) || enteringPosition

            const lineupWithoutDuplicate = duplicateId
              ? lineup.filter((item) => item.playerId !== duplicateId)
              : lineup

            const nextLineup = [...lineupWithoutDuplicate, { playerId: drag.playerId, position: positionToUse }]
            const bench = players
              .map((item) => getPlayerId(item))
              .filter((id) => !nextOnField.includes(id))

            return {
              ...current,
              onFieldPlayerIds: Array.from(new Set(nextOnField)),
              battingOrder,
              lineup: nextLineup,
              bench,
              participantPlayerIds: [...nextOnField, ...bench],
              preGameConfigured: current.preGameConfigured || nextOnField.length === 9,
            }
          }, duplicateId
            ? `${player?.name || 'Jogador'} substituiu jogador em ${getMainPosition(player)}`
            : `${player?.name || 'Jogador'} entrou em campo`)
        }

        if (drag.source === 'field' && inBench) {
          onUpdateGameState((current) => {
            const nextOnField = (current.onFieldPlayerIds || []).filter((id) => id !== drag.playerId)
            const battingOrder = (current.battingOrder || []).filter((id) => id !== drag.playerId)
            const lineup = (current.lineup || []).filter((item) => item.playerId !== drag.playerId)
            const bench = players
              .map((item) => getPlayerId(item))
              .filter((id) => !nextOnField.includes(id))

            return {
              ...current,
              onFieldPlayerIds: nextOnField,
              battingOrder,
              lineup,
              bench,
              participantPlayerIds: [...nextOnField, ...bench],
            }
          }, `${player?.name || 'Jogador'} foi para o banco`)
        }

        const start = dragStartRef.current
        if (start) {
          const dx = Math.abs(ev.clientX - start.x)
          const dy = Math.abs(ev.clientY - start.y)
          if (dx > 6 || dy > 6) {
            suppressModalUntilRef.current = Date.now() + 300
            setRecentlyDroppedId(drag.playerId)
            window.setTimeout(() => setRecentlyDroppedId(null), 220)
          }
        }
      }

      if (drag.type === 'runner') {
        const sourceBase = drag.base
        const fieldPoint = point

        if (!fieldPoint) {
          onUpdateGameState((current) => ({
            ...current,
            runners: { ...current.runners, [sourceBase]: false },
          }), `Corredor removido de ${sourceBase}`)
        } else {
          const baseKeys = ['first', 'second', 'third']
          const baseMap = { first: '1B', second: '2B', third: '3B' }

          let nearest = null
          let nearestDistance = Number.POSITIVE_INFINITY

          for (const base of baseKeys) {
            const pos = computeBasePosition(baseMap[base])
            const distance = Math.hypot(fieldPoint.x - pos.x, fieldPoint.y - pos.y)
            if (distance < nearestDistance) {
              nearestDistance = distance
              nearest = base
            }
          }

          if (nearest && nearestDistance <= 12) {
            onUpdateGameState((current) => {
              const nextRunners = { ...current.runners, [sourceBase]: false, [nearest]: true }
              return { ...current, runners: nextRunners }
            }, `Corredor movido para ${nearest}`)
          }
        }
      }

      setDragSource(null)
      setDraggingPlayerId(null)
      setDragPreview(null)
      setDropMessage('')
      setRunnerDrag(null)
      setDropTarget(null)
    },
  })

  const focusedPlayer = focusedPlayerId ? playersById[focusedPlayerId] : null
  const pitchersOnField = pitchersFromHook || fieldPlayers.filter((player) => getMainPosition(player) === 'P')
  const battingOrder = gameState.battingOrder || []
  const currentBatterId = battingOrder.length
    ? battingOrder[Math.min(gameState.currentBatterIndex || 0, battingOrder.length - 1)]
    : null
  const currentBatter = currentBatterId ? playersById[currentBatterId] : null
  const onDeckBatter = battingOrder.length
    ? playersById[battingOrder[(Math.min(gameState.currentBatterIndex || 0, battingOrder.length - 1) + 1) % battingOrder.length]]
    : null
  const inTheHoleBatter = battingOrder.length
    ? playersById[battingOrder[(Math.min(gameState.currentBatterIndex || 0, battingOrder.length - 1) + 2) % battingOrder.length]]
    : null
  const pitchingPulseKey = useMemo(() => [
    safeNumber(livePitching.outsPitched),
    safeNumber(livePitching.earnedRuns),
    safeNumber(livePitching.strikeouts),
    safeNumber(livePitching.walks),
    safeNumber(livePitching.pitchCount),
  ].join('|'), [livePitching])
  
  const opponentMarkers = useMemo(() => opponentDefense, [opponentDefense])
  const defensivePlayers = useMemo(() => {
    if (gameState.isAttacking) return []
    return fieldPlayers
  }, [fieldPlayers, gameState.isAttacking])
  const visibleFieldMarkers = useMemo(() => {
    if (!gameState.preGameConfigured) return []
    return gameState.isAttacking ? opponentMarkers : defensivePlayers
  }, [defensivePlayers, gameState.isAttacking, gameState.preGameConfigured, opponentMarkers])
  const errorDefenderOptions = useMemo(() => {
    return defensivePlayers.map((player) => ({
      id: getPlayerId(player),
      label: `${player.name} #${player.number} (${getMainPosition(player)})`,
    }))
  }, [defensivePlayers])
  const doublePlayRunnerOptions = useMemo(
    () => ['first', 'second', 'third'].filter((base) => Boolean(gameState.runners?.[base])),
    [gameState.runners],
  )
  const doublePlayDefenderOptions = useMemo(
    () => defensivePlayers.map((player) => ({
      id: getPlayerId(player),
      label: `${player.name} #${player.number} (${getMainPosition(player)})`,
    })),
    [defensivePlayers],
  )

  return (
      <section className={`field-layout ${showFieldContainer ? '' : 'mode-hidden'}`} ref={layoutRef}>
        <Scoreboard gameState={gameState} opponentName={opponentName} visible={showScoreboard} />

      <Field
        fieldStageRef={fieldStageRef}
        fieldImageRef={fieldImageRef}
        drawingRef={drawingRef}
        activeTool={activeTool}
        dropTarget={dropTarget}
        setDropTarget={setDropTarget}
        fieldRect={fieldRect}
        toScreenPoint={toScreenPoint}
        visibleFieldMarkers={visibleFieldMarkers}
        getPlayerId={getPlayerId}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        onPlayerClick={onPlayerClick}
        openEditModal={openEditModal}
        startDragPlayer={startDragPlayer}
        draggingPlayerId={draggingPlayerId}
        recentlyDroppedId={recentlyDroppedId}
        getDefaultFieldPosition={getDefaultFieldPosition}
        runnerDrag={runnerDrag}
        gameState={gameState}
        animatedBall={animatedBall}
        laser={laser}
        dragRef={dragRef}
        setRunnerDrag={setRunnerDrag}
        dragSource={dragSource}
        dropMessage={dropMessage}
        startPenStroke={startPenStroke}
        onDragStartPlayer={(id) => {
          setDragSource('field')
          setDraggingPlayerId(id)
        }}
        onStartDrag={(event, descriptor) => {
          dragRef.current = descriptor
          dragStartRef.current = { x: event.clientX, y: event.clientY }
          setDragSource('field')
          setDraggingPlayerId(descriptor.playerId || descriptor.id || null)
          setSelectedId(descriptor.playerId || descriptor.id || null)
          setDragPreview({ x: event.clientX, y: event.clientY, label: descriptor.label || '' })
          setIsDragging(true)
        }}
        animateRunners={animateRunners}
        isDragging={isDragging}
        zoom={zoom}
        offsetX={offsetX}
        offsetY={offsetY}
        onTouchStartMobile={handleTouchStartMobile}
        onTouchMoveMobile={handleTouchMoveMobile}
        onTouchEndMobile={handleTouchEndMobile}
      />

      {showHud && (
      <Bench
        ref={benchRef}
        benchPlayers={benchPlayers}
        dropTarget={dropTarget}
        dropMessage={dropMessage}
        benchSearch={benchSearch}
        setBenchSearch={setBenchSearch}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        startDragPlayer={startDragPlayer}
        openPlayerDetails={openPlayerDetails}
        openEditModal={openEditModal}
        getPlayerId={getPlayerId}
        getMainPosition={getMainPosition}
        playersById={playersById}
        setPlayers={setPlayers}
        gameState={gameState}
        onUpdateGameState={onUpdateGameState}
        isMobile={isMobile}
      />
      )}

      {showHud && (
        <GameHUD
          invalidFeedback={invalidFeedback}
          gameState={gameState}
          currentBatter={currentBatter}
          onDeckBatter={onDeckBatter}
          inTheHoleBatter={inTheHoleBatter}
          pitchersOnField={pitchersOnField}
          livePitching={livePitching}
          applyAttackCountAction={applyAttackCountAction}
          applyPlateAppearance={applyPlateAppearance}
          applyDefensiveHit={applyDefensiveHit}
          handleDoublePlayAction={handleDoublePlayAction}
          applySacFly={applySacFly}
          applyErrorEvent={applyErrorEvent}
          applyDeadBall={applyDeadBall}
          applyDefensiveOutEvent={applyDefensiveOutEvent}
          advanceRunner={advanceRunner}
          removeRunner={removeRunner}
          setZoom={setZoom}
          zoom={zoom}
          onEndGame={onEndGame}
          isMobile={isMobile}
          benchRef={benchRef}
        />
      )}
        
      {/* Persistent HUD toggle button (always visible) */}
      <button
        type="button"
        className="mode-toggle-btn"
        onClick={() => setShowHud((s) => !s)}
        aria-pressed={!showHud}
      >
        {showHud ? 'Esconder HUD' : 'Mostrar HUD'}
      </button>

    

      {showPreGameSetup && (
        <Modal title="Configuracao Inicial" onClose={() => setShowPreGameSetup(false)}>
          <div className="pregame-grid">
            <section className="player-stats-block">
              <h4>1) Inicio</h4>
              <div className="pregame-radio-row">
                <label>
                  <input
                    type="radio"
                    name="setup-start"
                    checked={setupAttacking}
                    onChange={() => setSetupAttacking(true)}
                  />
                  Comecar atacando
                </label>
                <label>
                  <input
                    type="radio"
                    name="setup-start"
                    checked={!setupAttacking}
                    onChange={() => setSetupAttacking(false)}
                  />
                  Comecar defendendo
                </label>
              </div>
            </section>

            <section className="player-stats-block">
              <h4>2) Titulares e posicoes</h4>
              <div className="pregame-lineup-grid">
                {setupStarters.map((slot) => {
                  const selectedIds = setupStarters
                    .filter((item) => item.position !== slot.position)
                    .map((item) => item.playerId)
                    .filter(Boolean)
                  const selectedPlayer = playersById[slot.playerId]

                  return (
                    <div key={`setup-${slot.position}`} className="pregame-slot">
                      <strong>{slot.position}</strong>
                      <select
                        value={slot.playerId}
                        onChange={(event) => assignStarter(slot.position, event.target.value)}
                      >
                        <option value="">Selecionar jogador</option>
                        {selectedPlayer && (
                          <option value={slot.playerId}>
                            {selectedPlayer.name} #{selectedPlayer.number}
                          </option>
                        )}
                        {setupAvailablePlayers
                          .filter((player) => {
                            const id = getPlayerId(player)
                            const allowed = Array.isArray(player.positions) ? player.positions : []
                            return !selectedIds.includes(id) && allowed.includes(slot.position)
                          })
                          .map((player) => {
                            const id = getPlayerId(player)
                            return (
                              <option key={`setup-player-${slot.position}-${id}`} value={id}>
                                {player.name} #{player.number}
                              </option>
                            )
                          })}
                      </select>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="player-stats-block">
              <h4>3) Ordem de rebatida</h4>
              <div className="pregame-order-list">
                {setupBattingOrder.map((id, index) => {
                  const player = playersById[id]
                  if (!player) return null
                  return (
                    <button
                      key={`order-${id}`}
                      type="button"
                      className={`pregame-order-item ${setupDraggingId === id ? 'dragging' : ''}`}
                      draggable
                      onDragStart={() => onBattingDragStart(id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => onBattingDrop(id)}
                    >
                      <span>{index + 1}.</span>
                      <strong>{player.name}</strong>
                      <span>#{player.number}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          </div>

          <div className="detail-actions">
            <Button
              type="button"
              variant="primary"
              onClick={confirmPreGameSetup}
              disabled={setupBattingOrder.length !== 9 || setupStarters.filter((item) => item.playerId).length !== 9}
            >
              Iniciar jogo
            </Button>
          </div>
        </Modal>
      )}

      {pendingDoublePlaySelect && (
        <Modal title="Double Play: corredor eliminado" onClose={() => setPendingDoublePlaySelect(false)}>
          <div className="player-stats-block">
            <select
              value={selectedDoublePlayRunnerBase}
              onChange={(event) => setSelectedDoublePlayRunnerBase(event.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">Selecionar base</option>
              {doublePlayRunnerOptions.map((base) => (
                <option key={`dp-base-${base}`} value={base}>
                  {base.toUpperCase()}
                </option>
              ))}
            </select>

            {!gameState.isAttacking && (
              <div style={{ marginTop: '10px' }}>
                <strong>Defensores envolvidos (2 ou 3)</strong>
                <div className="lineup-picker" style={{ marginTop: '6px' }}>
                  {doublePlayDefenderOptions.map((defender) => {
                    const checked = selectedDoublePlayDefenderIds.includes(defender.id)
                    const disableUnchecked = !checked && selectedDoublePlayDefenderIds.length >= 3
                    return (
                      <label key={`dp-defender-${defender.id}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disableUnchecked}
                          onChange={() => {
                            setSelectedDoublePlayDefenderIds((current) => {
                              if (current.includes(defender.id)) {
                                return current.filter((id) => id !== defender.id)
                              }
                              if (current.length >= 3) return current
                              return [...current, defender.id]
                            })
                          }}
                        />
                        {defender.label}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="detail-actions" style={{ marginTop: '10px' }}>
              <Button type="button" variant="primary" onClick={() => setPendingDoublePlaySelect(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={
                  !selectedDoublePlayRunnerBase
                  || (!gameState.isAttacking && (selectedDoublePlayDefenderIds.length < 2 || selectedDoublePlayDefenderIds.length > 3))
                }
                onClick={() => applyDoublePlayWithRunner(selectedDoublePlayRunnerBase, selectedDoublePlayDefenderIds)}
              >
                Confirmar DP
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {pendingDefenseError && (
        <Modal title="Selecionar defensor com erro" onClose={() => setPendingDefenseError(false)}>
          <div className="player-stats-block">
            <select
              value={selectedErrorDefenderId}
              onChange={(event) => setSelectedErrorDefenderId(event.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">Selecionar jogador</option>
              {errorDefenderOptions.map((option) => (
                <option key={`error-option-${option.id}`} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="detail-actions" style={{ marginTop: '10px' }}>
              <Button type="button" variant="primary" onClick={() => setPendingDefenseError(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!selectedErrorDefenderId}
                onClick={() => {
                  confirmDefensiveError()
                }}
              >
                Confirmar erro
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {dragPreview && (
        <div
          className="drag-preview"
          style={{ left: `${dragPreview.x + 12}px`, top: `${dragPreview.y + 12}px` }}
        >
          {dragPreview.label}
        </div>
      )}

      <PlayerStatsModal
        player={focusedPlayer}
        seasonEntry={focusedSeasonEntry}
        gameEntry={focusedGameEntry}
        onClose={() => setFocusedPlayerId(null)}
      />

      {editingPlayerId && (
        <Modal title="Editar jogador" onClose={() => setEditingPlayerId(null)}>
          <form className="player-form" onSubmit={(event) => { event.preventDefault(); saveEditedPlayer() }}>
            <input
              placeholder="Nome"
              value={editForm.name}
              onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
            />
            <input
              placeholder="Numero"
              type="number"
              value={editForm.number}
              onChange={(event) => setEditForm((current) => ({ ...current, number: event.target.value }))}
            />

            <div className="positions-picker">
              {VALID_POSITIONS.map((position) => (
                <label key={`edit-${position}`}>
                  <input
                    type="checkbox"
                    checked={editForm.positions.includes(position)}
                    onChange={() => toggleEditPosition(position)}
                  />
                  {position}
                </label>
              ))}
            </div>

            <select
              value={editForm.activePosition}
              onChange={(event) => setEditForm((current) => ({ ...current, activePosition: event.target.value }))}
            >
              {editForm.positions.map((position) => (
                <option key={`edit-active-${position}`} value={position}>
                  Titular: {position}
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button type="button" variant="primary" onClick={saveEditedPlayer}>
                Salvar alteracoes
              </Button>
              <Button type="button" variant="danger" onClick={() => setEditingPlayerId(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

export default FieldPage
