import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import useFieldZoom from '../hooks/useFieldZoom'
import useDragPosition from '../hooks/useDragPosition'
import PlayerStatsModal from '../components/PlayerStatsModal'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import ConfirmModal from '../components/ui/ConfirmModal'
import CountDots from '../components/CountDots'
import { gameStatsApi, gamesApi, seasonStatsApi } from '../services/api'
import { getDefaultFieldPosition } from '../data/defaultFieldPositions'
import { VALID_POSITIONS } from '../data/positions'
import Scoreboard from '../components/game/Scoreboard/Scoreboard'
import Field from '../components/game/Field/Field'
import Bench from '../components/game/Bench/Bench'
import usePlayers from '../hooks/usePlayers'
import useGameState from '../hooks/useGameState'
import { safeNumber } from '../utils/number'
import { formatEraFromOuts, formatIpFromOuts, outsToInnings, addInningRuns } from '../utils/stats'
import { detectPlayerType, getPlayerId, getMainPosition } from '../utils/player'
import { EMPTY_GAME_STAT, EMPTY_PITCHING } from '../constants/stats'
import { incrementPitcherCount, computeInningTransition } from '../utils/gameState'
import StatLabel from '../components/ui/StatLabel'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { KeepAwake } from '@capacitor-community/keep-awake'

function haptic(style) { Haptics.impact({ style }).catch(() => {}) }

const LONG_PRESS_MS = 450
const DEFENSIVE_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
const PITCH_NAMES = { FB: 'Fastball', CV: 'Curveball', SL: 'Slider', CH: 'Changeup', SI: 'Sinker', CT: 'Cutter' }

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
function isInsideRect(clientX, clientY, rect) {
  if (!rect) return false
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}




function reorderList(list, from, to) {
  const safe = [...list]
  const [item] = safe.splice(from, 1)
  safe.splice(to, 0, item)
  return safe
}

function makeLogEntry(current, type, description) {
  return {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    ts: Date.now(),
    inning: current.inning || 1,
    half: current.inningHalf || 'top',
    type,
    description,
  }
}

function updateOppBatter(current, result) {
  const num = current.currentOpponentBatter?.number?.trim()
  if (!num) return {}
  const name = current.currentOpponentBatter?.name?.trim() || ''
  const existing = current.opposingBatters?.[num] || { number: num, name, atBats: 0, hits: 0, outs: 0, walks: 0, strikeouts: 0, homeRuns: 0 }
  const b = { ...existing, name: name || existing.name }
  if (result === 'hit')      { b.atBats++; b.hits++ }
  else if (result === 'homerun') { b.atBats++; b.hits++; b.homeRuns++ }
  else if (result === 'out')     { b.atBats++; b.outs++ }
  else if (result === 'strikeout') { b.atBats++; b.outs++; b.strikeouts++ }
  else if (result === 'walk')    { b.walks++ }
  else if (result === 'error')   { b.atBats++ }
  else if (result === 'sacfly')  { b.outs++ }
  return { opposingBatters: { ...(current.opposingBatters || {}), [num]: b } }
}

function oppBatterLabel(current) {
  const num = current.currentOpponentBatter?.number?.trim()
  const name = current.currentOpponentBatter?.name?.trim()
  if (!num) return 'ADV'
  return name ? `ADV #${num} ${name}` : `ADV #${num}`
}

function advanceOpponentLineup(current) {
  const lineup = Array.isArray(current.opponentLineup) ? [...current.opponentLineup] : []
  while (lineup.length < 9) lineup.push(null)
  const idx = (typeof current.opponentLineupIndex === 'number' ? current.opponentLineupIndex : 0) % 9
  const batter = current.currentOpponentBatter || { number: '', name: '' }
  if (batter.number?.trim()) {
    lineup[idx] = { number: batter.number.trim(), name: batter.name?.trim() || '' }
  }
  const nextIdx = (idx + 1) % 9
  const nextBatter = lineup[nextIdx]
  return {
    opponentLineup: lineup,
    opponentLineupIndex: nextIdx,
    currentOpponentBatter: nextBatter || { number: '', name: '' },
  }
}

const HIT_LABELS = { single: 'Simples', double: 'Dupla', triple: 'Tripla', homerun: 'Home Run' }
const INNING_HALF = (half) => (half === 'top' ? '▲' : '▼')

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
  allowPregameWithoutGame = false,
  onCancelPreGame = null,
  statsRefreshKey = 0,
  onStatsUpdated = null,
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
  const benchHoverTargetIdRef = useRef(null)

  const [selectedId, setSelectedId] = useState(null)
  const [, setTooltipId] = useState(null)
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
  const [benchHoverTargetId, setBenchHoverTargetId] = useState(null)
  const [runnerDrag, setRunnerDrag] = useState(null)
  const [animatedBall, setAnimatedBall] = useState({ visible: false, x: 50, y: 87 })
  const [editingPlayerId, setEditingPlayerId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', number: '', positions: ['DH'], activePosition: 'DH' })
  const [showPreGameSetup, setShowPreGameSetup] = useState(false)
  const [setupAttacking, setSetupAttacking] = useState(true)
  const [setupStarters, setSetupStarters] = useState([])
  const [setupBattingOrder, setSetupBattingOrder] = useState([])
  const [pregameForm, setPregameForm] = useState(() => {
    const today = new Date().toISOString().split('T')[0]
    return { date: today, opponentName: '', competition: '', location: '', maxInnings: '9' }
  })
  const [setupDraggingId, setSetupDraggingId] = useState(null)
  const [opponentDefense, setOpponentDefense] = useState(makeOpponentMarkers)
  const [modePendingConfirm, setModePendingConfirm] = useState(false)
  const modePendingTimerRef = useRef(null)
  const [pendingSubstitution, setPendingSubstitution] = useState(null)
  const [pendingDefenseError, setPendingDefenseError] = useState(false)
  const [selectedErrorDefenderId, setSelectedErrorDefenderId] = useState('')
  const [pendingOutTypeSelect, setPendingOutTypeSelect] = useState(false)
  const [selectedOutType, setSelectedOutType] = useState('')
  const [selectedOutFielderId, setSelectedOutFielderId] = useState('')
  const [selectedPitchType, setSelectedPitchType] = useState('FB')
  const [pendingDoublePlaySelect, setPendingDoublePlaySelect] = useState(false)
  const orderTouchRef = useRef({ dragging: null })
  const orderListRef = useRef(null)
  const [selectedDoublePlayRunnerBase, setSelectedDoublePlayRunnerBase] = useState('')
  const [selectedDoublePlayDefenderIds, setSelectedDoublePlayDefenderIds] = useState([])
  const [undoStack, setUndoStack] = useState([])
  const [confirmChangePitcherAdv, setConfirmChangePitcherAdv] = useState(false)
  const [invalidFeedback, setInvalidFeedback] = useState('')
  const [pendingEndGame, setPendingEndGame] = useState(false)
  const [pendingRemoveRunner, setPendingRemoveRunner] = useState(null)
  const [pendingSwap, setPendingSwap] = useState(null)
  const [pendingAutoEnd, setPendingAutoEnd] = useState(null)
  const [showGameSummary, setShowGameSummary] = useState(false)
  const [gameSummarySnapshot, setGameSummarySnapshot] = useState(null)
  const [summaryWP, setSummaryWP] = useState('')
  const [summaryLP, setSummaryLP] = useState('')
  const [summarySV, setSummarySV] = useState('')
  const [batterStatsCollapsed, setBatterStatsCollapsed] = useState(false)
  const autoEndShownRef = useRef(null)
  const [showFieldContainer] = useState(true)
  const [showScoreboard, setShowScoreboard] = useState(false)
  const [gameSubView, setGameSubView] = useState('campo')
  const touchStartRef = useRef(null)
  const isProcessingRef = useRef(false)
  const [sideSwitchBanner, setSideSwitchBanner] = useState(null)
  const sideSwitchTimerRef = useRef(null)
  const prevIsAttackingRef = useRef(null)

  const { zoom, offsetX, offsetY, handleTouchStartMobile, handleTouchMoveMobile, handleTouchEndMobile } =
    useFieldZoom({ fieldRect, fieldStageRef, activeTool })

  const {
    benchSearch,
    setBenchSearch,
    playersById,
    fieldPlayers,
    benchPlayers,
    setupAvailablePlayers,
    playerCanPlayPosition,
    playerPrefersPosition,
    pitchersOnField: pitchersFromHook,
    getPlayerId,
    getMainPosition,
    setPlayers: _setPlayersFromHook,
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
    // No game and not allowed to create one here → close modal
    if (!gameState.currentGameId && !allowPregameWithoutGame) {
      const timer = window.setTimeout(() => setShowPreGameSetup(false), 0)
      return () => window.clearTimeout(timer)
    }

    // Game exists and is fully configured → close modal
    if (gameState.currentGameId && gameState.preGameConfigured) {
      const timer = window.setTimeout(() => setShowPreGameSetup(false), 0)
      return () => window.clearTimeout(timer)
    }

    // Either: no game (need to create one) OR game exists but not yet configured → open modal
    const starters = DEFENSIVE_POSITIONS.map((position) => ({ position, playerId: '' }))

    const timer = window.setTimeout(() => {
      const today = new Date().toISOString().split('T')[0]
      setPregameForm((current) => ({ ...current, date: current.date || today }))
      setSetupAttacking(true)
      setSetupStarters(starters)
      setSetupBattingOrder([])
      setShowPreGameSetup(true)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [gameState.currentGameId, gameState.preGameConfigured, players, allowPregameWithoutGame])

  const { livePitching, opponentName } = useGameState({ gameState, activeGame, refreshKey: statsRefreshKey })

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
      // schedule state changes to avoid synchronous setState inside an effect
      window.setTimeout(() => {
        setShowScoreboard(true)
        setAnimateRunners(true)
        window.setTimeout(() => setAnimateRunners(false), 900)
      }, 0)
    }
    prevScoreRef.current = { home: nextHome, away: nextAway }
  }, [gameState.homeScore, gameState.awayScore, gameState.preGameConfigured])

  useEffect(() => {
    autoEndShownRef.current = null
  }, [gameState.currentGameId])

  useEffect(() => {
    const maxInn = Number(gameState.maxInnings) || 0
    if (!maxInn || !gameState.currentGameId || !gameState.preGameConfigured) return

    let kind = null
    let message = null

    if (gameState.inning > maxInn && autoEndShownRef.current !== 'limit') {
      kind = 'limit'
      message = `Limite de ${maxInn} innings atingido. Encerrar o jogo?`
    } else if (
      autoEndShownRef.current !== 'walkoff' &&
      autoEndShownRef.current !== 'limit' &&
      gameState.inningHalf === 'bottom' &&
      gameState.inning >= maxInn &&
      gameState.isAttacking &&
      gameState.homeScore > gameState.awayScore
    ) {
      kind = 'walkoff'
      message = 'Walk-off! CAASO venceu. Encerrar o jogo?'
    }

    if (kind && message) {
      autoEndShownRef.current = kind
      setPendingAutoEnd(message)
    }
  }, [
    gameState.inning,
    gameState.maxInnings,
    gameState.homeScore,
    gameState.awayScore,
    gameState.isAttacking,
    gameState.inningHalf,
    gameState.currentGameId,
    gameState.preGameConfigured,
  ])

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
  }, [gameState.isAttacking, gameState.onFieldPlayerIds, gameState.lineup, setPlayers, getPlayerId, getMainPosition])

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
      maxInnings: Number(pregameForm.maxInnings) || 0,
    }), 'Configuracao inicial confirmada')

    // Ensure a game exists: create if missing, then persist setup to backend
    let targetGameId = gameState.currentGameId
    if (!targetGameId) {
      // require basic info before creating
      if (!pregameForm.date || !pregameForm.opponentName.trim() || !pregameForm.competition.trim()) return
      try {
        const response = await gamesApi.create({
          date: pregameForm.date,
          opponent: pregameForm.opponentName.trim(),
          opponentName: pregameForm.opponentName.trim(),
          competition: pregameForm.competition.trim(),
          location: pregameForm.location.trim(),
          // include pregame setup so backend has lineup and battingOrder immediately
          lineup: starters,
          battingOrder: setupBattingOrder,
          bench,
          isAttacking: setupAttacking,
          maxInnings: Number(pregameForm.maxInnings) || 0,
        })
        const created = response.data
        targetGameId = created && created._id ? created._id : targetGameId
        onUpdateGameState((current) => ({ ...current, currentGameId: targetGameId }), 'Jogo criado')
      } catch {
        // Mantem setup local mesmo sem backend.
      }
    }

    if (targetGameId) {
      try {
        await gamesApi.update(targetGameId, {
          isAttacking: setupAttacking,
          battingOrder: setupBattingOrder,
          lineup: starters,
          bench,
        })
      } catch {
        // Mantem setup local mesmo sem backend.
      }
    }

    setShowPreGameSetup(false)
  }

  const assignStarter = (position, playerId) => {
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

  const onOrderPointerDown = (id, ev) => {
    if (ev.pointerType === 'mouse') return
    ev.stopPropagation()
    orderTouchRef.current.dragging = id
    setSetupDraggingId(id)
    orderListRef.current?.setPointerCapture(ev.pointerId)
  }

  const onOrderPointerMove = (ev) => {
    if (ev.pointerType === 'mouse') return
    if (!orderTouchRef.current.dragging) return
    ev.stopPropagation()
    const el = document.elementFromPoint(ev.clientX, ev.clientY)
    const targetId = el?.closest('[data-order-id]')?.dataset?.orderId
    if (targetId && targetId !== orderTouchRef.current.dragging) {
      setSetupBattingOrder((current) => {
        const from = current.indexOf(orderTouchRef.current.dragging)
        const to = current.indexOf(targetId)
        if (from < 0 || to < 0) return current
        return reorderList(current, from, to)
      })
    }
  }

  const onOrderPointerUp = () => {
    orderTouchRef.current.dragging = null
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

    // Use gameState.lineup as the position source (always in sync with onFieldPlayerIds).
    // Reading player.activePosition here causes false conflicts because activePosition is a
    // derived UI property that can lag behind by one render after a substitution.
    const lineupPositions = {}
    for (const item of Array.isArray(gameState.lineup) ? gameState.lineup : []) {
      if (item?.playerId && item?.position) lineupPositions[item.playerId] = item.position
    }

    const seen = new Set()
    const keepReversed = []

    for (let index = onField.length - 1; index >= 0; index -= 1) {
      const id = onField[index]
      if (!playersById[id]) continue
      const position = lineupPositions[id]
      if (!position) {
        // Player on field but not in lineup (e.g. DH): keep without conflict check.
        keepReversed.push(id)
        continue
      }
      if (seen.has(position)) continue
      seen.add(position)
      keepReversed.push(id)
    }

    const keep = keepReversed.reverse()
    if (keep.length !== onField.length) {
      onUpdateGameState((current) => {
        const unique = Array.from(new Set(keep))
        const battingOrder = (current.battingOrder || []).filter((id) => unique.includes(id))
        const nextLineup = (current.lineup || []).filter((item) => unique.includes(item.playerId))
        const bench = players.map((item) => getPlayerId(item)).filter((id) => !unique.includes(id))
        return {
          ...current,
          onFieldPlayerIds: unique,
          battingOrder,
          lineup: nextLineup,
          bench,
          participantPlayerIds: [...unique, ...bench],
        }
      }, 'Conflito de posicao resolvido: jogador anterior enviado ao banco')
    }
  }, [gameState.onFieldPlayerIds, gameState.lineup, onUpdateGameState, players, playersById, getPlayerId])
  

  const advanceRunner = useCallback((base) => {
    const order = ['first', 'second', 'third']
    const index = order.indexOf(base)
    if (index === -1) return
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    window.setTimeout(() => { isProcessingRef.current = false }, 700)

    onUpdateGameState((current) => {
      if (!current.runners?.[base]) return current

      const nextRunners = { ...current.runners, [base]: false }
      const nextBase = order[index + 1]
      const runs = nextBase ? 0 : 1

      if (nextBase) {
        nextRunners[nextBase] = true
      }

      const ourR = current.isAttacking ? runs : 0
      const theirR = current.isAttacking ? 0 : runs
      return {
        ...current,
        runners: nextRunners,
        homeScore: (current.homeScore || 0) + ourR,
        awayScore: (current.awayScore || 0) + theirR,
        inningScores: runs > 0 ? addInningRuns(current.inningScores, current.inning, ourR, theirR) : (current.inningScores || { home: [], away: [] }),
      }
    }, `Corredor avancou de ${base}`)

    if (!gameState.isAttacking && base === 'third' && gameState.runners?.third) {
      onDefensiveEarnedRun?.(1)
    }
  }, [gameState.isAttacking, gameState.runners, onDefensiveEarnedRun, onUpdateGameState])

  const removeRunner = useCallback((base) => {
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    window.setTimeout(() => { isProcessingRef.current = false }, 700)

    onUpdateGameState((current) => {
      if (!current.runners?.[base]) return current

      const { nextOuts, sideSwitch, nextHalf, nextInning } = computeInningTransition(current)

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
        inning: nextInning,
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
      type: detectPlayerType(playersById[playerId]),
      hitting: {
        atBats:      safeNumber(patch.hitting?.atBats      ?? current?.hitting?.atBats),
        hits:        safeNumber(patch.hitting?.hits        ?? current?.hitting?.hits),
        doubles:     safeNumber(patch.hitting?.doubles     ?? current?.hitting?.doubles),
        triples:     safeNumber(patch.hitting?.triples     ?? current?.hitting?.triples),
        homeRuns:    safeNumber(patch.hitting?.homeRuns    ?? current?.hitting?.homeRuns),
        strikeouts:  safeNumber(patch.hitting?.strikeouts  ?? current?.hitting?.strikeouts),
        outs:        safeNumber(patch.hitting?.outs        ?? current?.hitting?.outs),
        walks:       safeNumber(patch.hitting?.walks       ?? current?.hitting?.walks),
        runs:        safeNumber(patch.hitting?.runs        ?? current?.hitting?.runs),
        rbi:         safeNumber(patch.hitting?.rbi         ?? current?.hitting?.rbi),
        stolenBases: safeNumber(patch.hitting?.stolenBases ?? current?.hitting?.stolenBases),
      },
      pitching: {
        inningsPitched: safeNumber(current?.pitching?.inningsPitched),
        outsPitched:    safeNumber(current?.pitching?.outsPitched),
        earnedRuns:     safeNumber(current?.pitching?.earnedRuns),
        strikeouts:     safeNumber(current?.pitching?.strikeouts),
        walks:          safeNumber(current?.pitching?.walks),
        strikes:        safeNumber(current?.pitching?.strikes),
        balls:          safeNumber(current?.pitching?.balls),
        pitchCount:     safeNumber(current?.pitching?.pitchCount),
        hitsAllowed:    safeNumber(current?.pitching?.hitsAllowed),
        wins:           safeNumber(current?.pitching?.wins),
        losses:         safeNumber(current?.pitching?.losses),
        saves:          safeNumber(current?.pitching?.saves),
      },
      defense: {
        errors:      safeNumber(current?.defense?.errors),
        doublePlays: safeNumber(current?.defense?.doublePlays),
        flyOuts:     safeNumber(current?.defense?.flyOuts),
        groundOuts:  safeNumber(current?.defense?.groundOuts),
        lineOuts:    safeNumber(current?.defense?.lineOuts),
      },
    }

    gameStatsApi.upsert(gameState.currentGameId, playerId, payload)
  }, [gameState.currentGameId, playersById])

  const upsertPlayerStat = useCallback(async (playerId, patch = {}) => {
    if (!gameState.currentGameId || !playerId) return

    const found = await gameStatsApi.listByGame(gameState.currentGameId, playerId)
    const current = found.data?.[0]

    const payload = {
      type: detectPlayerType(playersById[playerId]),
      hitting: {
        atBats:      safeNumber(patch.hitting?.atBats      ?? current?.hitting?.atBats),
        hits:        safeNumber(patch.hitting?.hits        ?? current?.hitting?.hits),
        doubles:     safeNumber(patch.hitting?.doubles     ?? current?.hitting?.doubles),
        triples:     safeNumber(patch.hitting?.triples     ?? current?.hitting?.triples),
        homeRuns:    safeNumber(patch.hitting?.homeRuns    ?? current?.hitting?.homeRuns),
        strikeouts:  safeNumber(patch.hitting?.strikeouts  ?? current?.hitting?.strikeouts),
        outs:        safeNumber(patch.hitting?.outs        ?? current?.hitting?.outs),
        walks:       safeNumber(patch.hitting?.walks       ?? current?.hitting?.walks),
        runs:        safeNumber(patch.hitting?.runs        ?? current?.hitting?.runs),
        rbi:         safeNumber(patch.hitting?.rbi         ?? current?.hitting?.rbi),
        stolenBases: safeNumber(patch.hitting?.stolenBases ?? current?.hitting?.stolenBases),
      },
      pitching: {
        inningsPitched: safeNumber(patch.pitching?.inningsPitched ?? current?.pitching?.inningsPitched),
        outsPitched:    safeNumber(patch.pitching?.outsPitched    ?? current?.pitching?.outsPitched),
        earnedRuns:     safeNumber(patch.pitching?.earnedRuns     ?? current?.pitching?.earnedRuns),
        strikeouts:     safeNumber(patch.pitching?.strikeouts     ?? current?.pitching?.strikeouts),
        walks:          safeNumber(patch.pitching?.walks          ?? current?.pitching?.walks),
        strikes:        safeNumber(patch.pitching?.strikes        ?? current?.pitching?.strikes),
        balls:          safeNumber(patch.pitching?.balls          ?? current?.pitching?.balls),
        pitchCount:     safeNumber(patch.pitching?.pitchCount     ?? current?.pitching?.pitchCount),
        hitsAllowed:    safeNumber(patch.pitching?.hitsAllowed    ?? current?.pitching?.hitsAllowed),
        wins:           safeNumber(patch.pitching?.wins           ?? current?.pitching?.wins),
        losses:         safeNumber(patch.pitching?.losses         ?? current?.pitching?.losses),
        saves:          safeNumber(patch.pitching?.saves          ?? current?.pitching?.saves),
        pitchTypes:     patch.pitching?.pitchTypes ?? current?.pitching?.pitchTypes ?? EMPTY_PITCHING.pitchTypes,
      },
      defense: {
        errors:      safeNumber(patch.defense?.errors      ?? current?.defense?.errors),
        doublePlays: safeNumber(patch.defense?.doublePlays ?? current?.defense?.doublePlays),
        flyOuts:     safeNumber(patch.defense?.flyOuts     ?? current?.defense?.flyOuts),
        groundOuts:  safeNumber(patch.defense?.groundOuts  ?? current?.defense?.groundOuts),
        lineOuts:    safeNumber(patch.defense?.lineOuts    ?? current?.defense?.lineOuts),
      },
    }

    gameStatsApi.upsert(gameState.currentGameId, playerId, payload)
  }, [gameState.currentGameId, playersById])

  const syncDefensivePitcherEvent = useCallback(async ({ outsDelta = 0, earnedRunsDelta = 0, pitchCountDelta = 0, walksDelta = 0, strikeoutsDelta = 0, hitsAllowedDelta = 0 } = {}) => {
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
        hitsAllowed: safeNumber(current?.pitching?.hitsAllowed) + safeNumber(hitsAllowedDelta),
        pitchTypes: current?.pitching?.pitchTypes ?? EMPTY_PITCHING.pitchTypes,
      },
    }

    await upsertPlayerStat(pitcherId, patch)
    onStatsUpdated?.()
  }, [gameState.currentGameId, gameState.currentPitcherId, gameState.isAttacking, upsertPlayerStat, onStatsUpdated])

  const showInvalidAction = useCallback((message) => {
    setInvalidFeedback(message)
    window.setTimeout(() => setInvalidFeedback(''), 1400)
  }, [])

  const prevUndoLenRef = useRef(0)
  useEffect(() => {
    if (undoStack.length >= 75 && prevUndoLenRef.current < 75) {
      showInvalidAction('Histórico de desfazer quase cheio — ações antigas serão descartadas')
    }
    prevUndoLenRef.current = undoStack.length
  }, [undoStack.length, showInvalidAction])

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
          walks: safeNumber(entry.hitting?.walks),
          runs: safeNumber(entry.hitting?.runs),
          rbi: safeNumber(entry.hitting?.rbi),
          homeRuns: safeNumber(entry.hitting?.homeRuns),
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
          hitsAllowed: safeNumber(entry.pitching?.hitsAllowed),
          pitchTypes: entry.pitching?.pitchTypes ?? EMPTY_PITCHING.pitchTypes,
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

  const handleDefensivePitch = useCallback(async (kind) => {
    if (!gameState.currentPitcherId) {
      showInvalidAction('Selecione o arremessador antes de registrar pitches')
      return
    }
    if ((gameState.onFieldPlayerIds || []).length < 9) {
      showInvalidAction('É necessário ter 9 jogadores em campo para arremessar')
      return
    }
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    window.setTimeout(() => { isProcessingRef.current = false }, 700)
    await captureUndoSnapshot()
    onPitchAction?.(kind, { pitchType: selectedPitchType })
    haptic(ImpactStyle.Light)
  }, [captureUndoSnapshot, gameState.currentPitcherId, onPitchAction, selectedPitchType, showInvalidAction])

  const handlePitcherSelect = useCallback((nextId) => {
    if (!nextId) return
    const nextPitcher = playersById[nextId]
    if (!nextPitcher) return

    const fieldIdSet = new Set(gameState.onFieldPlayerIds || [])
    const isOnField = fieldIdSet.has(nextId)
    const pitcherCoord = getDefaultFieldPosition('P')

    setPlayers(current =>
      current.map(p => getPlayerId(p) === nextId ? { ...p, x: pitcherCoord.x, y: pitcherCoord.y, activePosition: 'P' } : p)
    )

    if (isOnField) {
      onUpdateGameState(current => {
        const nextPitchCounts = { ...(current.pitchCounts || {}) }
        if (!Number.isFinite(nextPitchCounts[nextId])) nextPitchCounts[nextId] = 0
        const nextLineup = (current.lineup || []).map(l =>
          l.playerId === nextId ? { ...l, position: 'P' } : l
        )
        return { ...current, currentPitcherId: nextId, pitchCounts: nextPitchCounts, lineup: nextLineup }
      }, 'Arremessador alterado')
    } else {
      const oldPitcherId = gameState.currentPitcherId
      onUpdateGameState(current => {
        const currentOnField = current.onFieldPlayerIds || []
        const nextOnField = [...currentOnField.filter(id => id !== oldPitcherId), nextId]
        const nextPitchCounts = { ...(current.pitchCounts || {}) }
        if (!Number.isFinite(nextPitchCounts[nextId])) nextPitchCounts[nextId] = 0
        const battingOrder = [...(current.battingOrder || [])]
        if (oldPitcherId) {
          const idx = battingOrder.findIndex(id => id === oldPitcherId)
          if (idx >= 0) battingOrder[idx] = nextId
          else if (!battingOrder.includes(nextId)) battingOrder.push(nextId)
        } else if (!battingOrder.includes(nextId)) {
          battingOrder.push(nextId)
        }
        const nextLineup = [
          ...(current.lineup || []).filter(l => l.playerId !== oldPitcherId && l.playerId !== nextId),
          { playerId: nextId, position: 'P' },
        ]
        const bench = players.map(p => getPlayerId(p)).filter(id => !nextOnField.includes(id))
        const oldPitcherName = oldPitcherId ? (playersById[oldPitcherId]?.name || '?') : null
        const subRecord = {
          id: `sub_${Date.now()}`,
          ts: Date.now(),
          inning: current.inning || 1,
          half: current.inningHalf || 'top',
          playerInId: nextId,
          playerInName: nextPitcher?.name || '',
          position: 'P',
          playerOutId: oldPitcherId || null,
          playerOutName: oldPitcherName || '',
        }
        return {
          ...current,
          onFieldPlayerIds: Array.from(new Set(nextOnField)),
          battingOrder,
          lineup: nextLineup,
          bench,
          participantPlayerIds: [...nextOnField, ...bench],
          currentPitcherId: nextId,
          pitchCounts: nextPitchCounts,
          substitutions: [...(current.substitutions || []), subRecord],
          gameLog: [
            ...(current.gameLog || []),
            makeLogEntry(current, 'sub', `Sub pitcher: ${nextPitcher?.name || '?'}${oldPitcherName ? ` → ${oldPitcherName}` : ''}`),
          ],
        }
      }, `${nextPitcher?.name || 'Jogador'} entrou como pitcher`)
    }
  }, [playersById, gameState.onFieldPlayerIds, gameState.currentPitcherId, players, setPlayers, onUpdateGameState, getPlayerId])

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
          ...EMPTY_GAME_STAT,
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
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    window.setTimeout(() => { isProcessingRef.current = false }, 700)

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
      const { nextOuts: outs, sideSwitch, nextHalf, nextInning } = computeInningTransition(current, isOut ? 1 : 0)

      let nextRunners = { ...(current.runners || { first: false, second: false, third: false }) }
      let runs = 0

      if (isHit) {
        const hitResult = applyHitToBases(nextRunners, kind)
        nextRunners = hitResult.nextRunners
        runs = hitResult.runs
      }

      const batterName = playersById[localOrder[currentIndex]]?.name || '?'
      const logDesc = kind === 'homerun'
        ? `${batterName}: Home Run${runs > 1 ? ` (${runs} pontos)` : ''}`
        : isHit
          ? `${batterName}: ${HIT_LABELS[kind] || kind}${runs > 0 ? ` (+${runs})` : ''}`
          : kind === 'strikeout'
            ? `${batterName}: K`
            : `${batterName}: Out`

      return {
        ...current,
        opponentPitchCount: Number(current.opponentPitchCount || 0) + 1,
        outs: sideSwitch ? 0 : outs,
        balls: 0,
        strikes: 0,
        currentBatterIndex: nextIndex,
        isAttacking: sideSwitch ? !current.isAttacking : current.isAttacking,
        inningHalf: nextHalf,
        inning: nextInning,
        runners: sideSwitch ? { first: false, second: false, third: false } : nextRunners,
        homeScore: (current.homeScore || 0) + (current.isAttacking ? runs : 0),
        awayScore: (current.awayScore || 0) + (!current.isAttacking ? runs : 0),
        inningScores: runs > 0 ? addInningRuns(current.inningScores, current.inning, current.isAttacking ? runs : 0, current.isAttacking ? 0 : runs) : (current.inningScores || { home: [], away: [] }),
        gameLog: [...(current.gameLog || []), makeLogEntry(current, isHit ? `hit-${kind}` : 'out', logDesc)],
      }
    }, `Acao de bastao: ${kind}`)
    haptic(isHit ? ImpactStyle.Light : ImpactStyle.Medium)

    if (isHit) setAnimatedBall({ visible: false, x: 50, y: 87 })

    try {
      const endedAsOut = kind === 'strikeout' || kind === 'out'
      const isHitKind = kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'homerun'
      const isHomeRun = kind === 'homerun'

      // Pre-compute runs scored to credit RBI to the batter.
      // applyHitToBases already includes the batter in `runs` for home runs
      // (e.g. solo HR → runs=1, grand slam → runs=4), so rbi = runsOnHit.
      const hitPreview = isHitKind
        ? applyHitToBases(gameState.runners || { first: false, second: false, third: false }, kind)
        : null
      const runsOnHit = hitPreview?.runs || 0
      const rbiCredit = runsOnHit
      const batterRuns = isHomeRun ? 1 : 0  // batter only scores in same PA on HR

      const found = await gameStatsApi.listByGame(gameState.currentGameId, batterId)
      const current = found.data?.[0]
      const patch = {
        hitting: {
          atBats:    safeNumber(current?.hitting?.atBats)    + 1,
          hits:      safeNumber(current?.hitting?.hits)      + (isHitKind ? 1 : 0),
          doubles:   safeNumber(current?.hitting?.doubles)   + (kind === 'double'  ? 1 : 0),
          triples:   safeNumber(current?.hitting?.triples)   + (kind === 'triple'  ? 1 : 0),
          homeRuns:  safeNumber(current?.hitting?.homeRuns)  + (isHomeRun ? 1 : 0),
          strikeouts:safeNumber(current?.hitting?.strikeouts)+ (kind === 'strikeout' ? 1 : 0),
          outs:      safeNumber(current?.hitting?.outs)      + (endedAsOut ? 1 : 0),
          rbi:       safeNumber(current?.hitting?.rbi)       + rbiCredit,
          runs:      safeNumber(current?.hitting?.runs)      + batterRuns,
        },
      }
      await upsertCurrentBatterStats(batterId, patch)
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.battingOrder, gameState.currentBatterIndex, gameState.currentGameId, gameState.isAttacking, onUpdateGameState, upsertCurrentBatterStats, setAnimatedBall, gameState.runners])

  const applyDefensiveHit = useCallback(async (kind) => {
    if (gameState.isAttacking) return
    if (!gameState.currentPitcherId) {
      showInvalidAction('Selecione o arremessador antes de registrar o evento')
      return
    }
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    window.setTimeout(() => { isProcessingRef.current = false }, 700)

    await captureUndoSnapshot()

    let runsScored = 0

    // Pre-compute runs before onUpdateGameState so earnedRunsDelta is available synchronously
    // (React's functional updater runs after current sync code — runsScored set inside it would be 0)
    const preHitResult = applyHitToBases(gameState.runners || { first: false, second: false, third: false }, kind)
    const preRunsScored = preHitResult.runs

    const isHit = kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'homerun'
    if (isHit) {
      const preview = preHitResult
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

      const logDesc = `${oppBatterLabel(current)}: ${HIT_LABELS[kind] || kind}${hitResult.runs > 0 ? ` (+${hitResult.runs})` : ''}`

      return {
        ...current,
        balls: 0,
        strikes: 0,
        ourPitchCount: Number(current.ourPitchCount || 0) + 1,
        pitchCounts: incrementPitcherCount(current),
        runners: hitResult.nextRunners,
        homeScore: (current.homeScore || 0) + (current.isAttacking ? hitResult.runs : 0),
        awayScore: (current.awayScore || 0) + (!current.isAttacking ? hitResult.runs : 0),
        inningScores: hitResult.runs > 0 ? addInningRuns(current.inningScores, current.inning, current.isAttacking ? hitResult.runs : 0, current.isAttacking ? 0 : hitResult.runs) : (current.inningScores || { home: [], away: [] }),
        ...updateOppBatter(current, kind === 'homerun' ? 'homerun' : 'hit'),
        ...advanceOpponentLineup(current),
        gameLog: [...(current.gameLog || []), makeLogEntry(current, `def-hit-${kind}`, logDesc)],
      }
    }, `Hit do adversario: ${kind}`)

    if (isHit) setAnimatedBall({ visible: false, x: 50, y: 87 })

    try {
      await syncDefensivePitcherEvent({
        pitchCountDelta: 1,
        earnedRunsDelta: preRunsScored,
        hitsAllowedDelta: 1,
      })
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.isAttacking, gameState.currentPitcherId, onUpdateGameState, syncDefensivePitcherEvent, setAnimatedBall, gameState.runners, showInvalidAction])

  const applyAttackCountAction = useCallback(async (kind) => {
    if (!gameState.isAttacking) return
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    window.setTimeout(() => { isProcessingRef.current = false }, 700)

    await captureUndoSnapshot()

    // Pre-compute outcome before state update so we can record batter stats
    const preStrikes = Number(gameState.strikes || 0)
    const preBalls = Number(gameState.balls || 0)
    const preNextStrikes = kind === 'strike' ? preStrikes + 1 : kind === 'foul' ? Math.min(2, preStrikes + 1) : preStrikes
    const preNextBalls = kind === 'ball' ? preBalls + 1 : preBalls
    const didStrikeout = preNextStrikes >= 3
    const didWalk = !didStrikeout && preNextBalls >= 4

    // Capture current batter id BEFORE state advances the index
    const preOrder = gameState.battingOrder || []
    const preBatterIndex = Math.min(gameState.currentBatterIndex || 0, Math.max(0, preOrder.length - 1))
    const batterId = preOrder[preBatterIndex] || null

    // Pre-compute forced runs to credit RBI on walk (mirrors logic inside onUpdateGameState)
    let preScoredRuns = 0
    if (didWalk) {
      const preRunners = { ...(gameState.runners || { first: false, second: false, third: false }) }
      preScoredRuns = forceAdvanceToFirst(preRunners).runs
    }

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

      const cDidStrikeout = nextStrikesRaw >= 3
      const cDidWalk = !cDidStrikeout && nextBallsRaw >= 4
      const order = current.battingOrder || []

      let nextOuts = Number(current.outs || 0)
      let nextInning = Number(current.inning || 1)
      let nextHalf = current.inningHalf || 'top'
      let nextIsAttacking = current.isAttacking
      let nextRunners = { ...(current.runners || { first: false, second: false, third: false }) }
      let scoredRuns = 0

      if (cDidStrikeout) {
        nextOuts += 1

        if (nextOuts >= 3) {
          nextOuts = 0
          nextIsAttacking = false
          nextHalf = current.inningHalf === 'top' ? 'bottom' : 'top'
          if (current.inningHalf === 'bottom') nextInning = Math.max(1, nextInning + 1)
          nextRunners = { first: false, second: false, third: false }
        }
      }

      if (cDidWalk) {
        const forced = forceAdvanceToFirst(nextRunners)
        nextRunners = forced.nextRunners
        scoredRuns = forced.runs
      }

      const shouldAdvanceBatter = order.length > 0 && (cDidStrikeout || cDidWalk)
      const nextBatterIndex = shouldAdvanceBatter
        ? getNextBatterIndexFromState(current)
        : Number(current.currentBatterIndex || 0)

      const logEntries = current.gameLog || []
      let newLog = logEntries
      if (cDidStrikeout || cDidWalk) {
        const batterIdx = Math.min(current.currentBatterIndex || 0, Math.max(0, order.length - 1))
        const batterName = playersById[order[batterIdx]]?.name || '?'
        const logDesc = cDidStrikeout ? `${batterName}: K` : `${batterName}: BB (base por bolas)`
        newLog = [...logEntries, makeLogEntry(current, cDidStrikeout ? 'out' : 'walk', logDesc)]
      }

      return {
        ...current,
        // attack-side increment goes to opponentPitchCount only
        opponentPitchCount: Number(current.opponentPitchCount || 0) + 1,
        strikes: cDidStrikeout || cDidWalk ? 0 : nextStrikesRaw,
        balls: cDidStrikeout || cDidWalk ? 0 : nextBallsRaw,
        currentBatterIndex: nextBatterIndex,
        outs: nextOuts,
        inning: nextInning,
        inningHalf: nextHalf,
        isAttacking: nextIsAttacking,
        runners: nextRunners,
        homeScore: Number(current.homeScore || 0) + scoredRuns,
        awayScore: Number(current.awayScore || 0),
        inningScores: scoredRuns > 0 ? addInningRuns(current.inningScores, current.inning, scoredRuns, 0) : (current.inningScores || { home: [], away: [] }),
        gameLog: newLog,
      }
    }, `Contagem no ataque: ${kind}`)
    haptic(didStrikeout ? ImpactStyle.Medium : ImpactStyle.Light)

    // Auto-record batter stats when count produces K or BB
    if ((didStrikeout || didWalk) && batterId && gameState.currentGameId) {
      try {
        const found = await gameStatsApi.listByGame(gameState.currentGameId, batterId)
        const cur = found.data?.[0]
        await upsertCurrentBatterStats(batterId, {
          hitting: {
            atBats: safeNumber(cur?.hitting?.atBats) + (didStrikeout ? 1 : 0),
            hits: safeNumber(cur?.hitting?.hits),
            strikeouts: safeNumber(cur?.hitting?.strikeouts) + (didStrikeout ? 1 : 0),
            outs: safeNumber(cur?.hitting?.outs) + (didStrikeout ? 1 : 0),
            walks: safeNumber(cur?.hitting?.walks) + (didWalk ? 1 : 0),
            rbi: safeNumber(cur?.hitting?.rbi) + (didWalk ? preScoredRuns : 0),
          },
        })
      } catch {
        // Mantem fluxo local mesmo sem backend.
      }
    }
  }, [captureUndoSnapshot, gameState.isAttacking, gameState.strikes, gameState.balls, gameState.battingOrder, gameState.currentBatterIndex, gameState.currentGameId, onUpdateGameState, upsertCurrentBatterStats])

  const applyDefensiveOutEvent = useCallback(async (outType = 'out', fielderId = '') => {
    if (gameState.isAttacking) return
    if (!gameState.currentPitcherId) {
      showInvalidAction('Selecione o arremessador antes de registrar o evento')
      return
    }
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    window.setTimeout(() => { isProcessingRef.current = false }, 700)

    await captureUndoSnapshot()

    onUpdateGameState((current) => {
      if (current.isAttacking) return current

      const { nextOuts: nextOutsRaw, sideSwitch, nextHalf, nextInning } = computeInningTransition(current)

      const outLabel = outType === 'strikeout' ? 'K' : outType === 'flyout' ? 'FO' : outType === 'groundout' ? 'GO' : outType === 'lineout' ? 'LO' : 'Out'
      const logDesc = `${oppBatterLabel(current)}: ${outLabel}`

      return {
        ...current,
        outs: sideSwitch ? 0 : nextOutsRaw,
        ourPitchCount: Number(current.ourPitchCount || 0) + 1,
        pitchCounts: incrementPitcherCount(current),
        balls: 0,
        strikes: 0,
        isAttacking: sideSwitch ? !current.isAttacking : current.isAttacking,
        inningHalf: nextHalf,
        inning: nextInning,
        runners: sideSwitch ? { first: false, second: false, third: false } : current.runners,
        ...updateOppBatter(current, outType === 'strikeout' ? 'strikeout' : 'out'),
        ...advanceOpponentLineup(current),
        gameLog: [...(current.gameLog || []), makeLogEntry(current, 'def-out', logDesc)],
      }
    }, `Out defensivo: ${outType}`)
    haptic(ImpactStyle.Medium)

    try {
      await syncDefensivePitcherEvent({
        outsDelta: 1,
        pitchCountDelta: 1,
        strikeoutsDelta: outType === 'strikeout' ? 1 : 0,
      })

      if (fielderId && outType !== 'strikeout') {
        const found = await gameStatsApi.listByGame(gameState.currentGameId, fielderId)
        const cur = found.data?.[0]
        await upsertPlayerStat(fielderId, {
          defense: {
            errors: safeNumber(cur?.defense?.errors),
            doublePlays: safeNumber(cur?.defense?.doublePlays),
            flyOuts: safeNumber(cur?.defense?.flyOuts) + (outType === 'flyout' ? 1 : 0),
            groundOuts: safeNumber(cur?.defense?.groundOuts) + (outType === 'groundout' ? 1 : 0),
            lineOuts: safeNumber(cur?.defense?.lineOuts) + (outType === 'lineout' ? 1 : 0),
          },
        })
      }
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.isAttacking, gameState.currentPitcherId, gameState.currentGameId, onUpdateGameState, syncDefensivePitcherEvent, upsertPlayerStat, showInvalidAction])

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
      const { nextOuts: nextOutsRaw, sideSwitch, nextHalf, nextInning } = computeInningTransition(current, 2)

      const dpSide = current.isAttacking ? 'Nós' : oppBatterLabel(current)
      const logDesc = `${dpSide}: Double Play em ${runnerBase}${defenderText ? ` (${defenderText})` : ''}`

      return {
        ...current,
        ...(current.isAttacking
          ? { opponentPitchCount: Number(current.opponentPitchCount || 0) + 1 }
          : { ourPitchCount: Number(current.ourPitchCount || 0) + 1, pitchCounts: incrementPitcherCount(current) }),
        outs: sideSwitch ? 0 : nextOutsRaw,
        balls: 0,
        strikes: 0,
        currentBatterIndex: getNextBatterIndexFromState(current),
        isAttacking: sideSwitch ? !current.isAttacking : current.isAttacking,
        inningHalf: nextHalf,
        inning: nextInning,
        runners: sideSwitch ? { first: false, second: false, third: false } : nextRunners,
        ...(!current.isAttacking ? advanceOpponentLineup(current) : {}),
        gameLog: [...(current.gameLog || []), makeLogEntry(current, 'double-play', logDesc)],
      }
    }, `Double play em ${runnerBase}${defenderText}`)
    haptic(ImpactStyle.Medium)

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
    if (!gameState.runners?.third) {
      showInvalidAction('Nenhum corredor na terceira base para sac fly')
      return
    }

    await captureUndoSnapshot()

    let runScored = 0
    // Pre-compute before state update: React's functional updater runs after current sync code,
    // so runScored set inside onUpdateGameState would still be 0 in the try block below.
    const preRunScored = 1

    onUpdateGameState((current) => {
      const hadRunnerOnThird = Boolean(current.runners?.third)
      const { nextOuts: nextOutsRaw, sideSwitch, nextHalf, nextInning } = computeInningTransition(current)

      const nextRunners = { ...(current.runners || { first: false, second: false, third: false }) }
      if (hadRunnerOnThird) {
        nextRunners.third = false
        runScored = 1
      }

      const sfOrder = current.battingOrder || []
      const sfIdx = Math.min(current.currentBatterIndex || 0, Math.max(0, sfOrder.length - 1))
      const sfWho = current.isAttacking
        ? (playersById[sfOrder[sfIdx]]?.name || '?')
        : oppBatterLabel(current)
      const sfLogDesc = `${sfWho}: Sac Fly${runScored > 0 ? ' (+1)' : ''}`

      return {
        ...current,
        ...(current.isAttacking
          ? { opponentPitchCount: Number(current.opponentPitchCount || 0) + 1 }
          : { ourPitchCount: Number(current.ourPitchCount || 0) + 1, pitchCounts: incrementPitcherCount(current) }),
        outs: sideSwitch ? 0 : nextOutsRaw,
        balls: 0,
        strikes: 0,
        currentBatterIndex: getNextBatterIndexFromState(current),
        isAttacking: sideSwitch ? !current.isAttacking : current.isAttacking,
        inningHalf: nextHalf,
        inning: nextInning,
        runners: sideSwitch ? { first: false, second: false, third: false } : nextRunners,
        homeScore: (current.homeScore || 0) + (current.isAttacking ? runScored : 0),
        awayScore: (current.awayScore || 0) + (!current.isAttacking ? runScored : 0),
        inningScores: runScored > 0 ? addInningRuns(current.inningScores, current.inning, current.isAttacking ? runScored : 0, current.isAttacking ? 0 : runScored) : (current.inningScores || { home: [], away: [] }),
        ...(!current.isAttacking ? updateOppBatter(current, 'sacfly') : {}),
        ...(!current.isAttacking ? advanceOpponentLineup(current) : {}),
        gameLog: [...(current.gameLog || []), makeLogEntry(current, 'sac-fly', sfLogDesc)],
      }
    }, 'Sac fly')
    haptic(ImpactStyle.Medium)

    try {
      if (!gameState.isAttacking) {
        await syncDefensivePitcherEvent({ outsDelta: 1, earnedRunsDelta: preRunScored, pitchCountDelta: 1 })
      } else {
        // Sac fly: batter gets RBI (runner on third confirmed above, preRunScored = 1)
        const order = gameState.battingOrder || []
        const batterIndex = Math.min(gameState.currentBatterIndex || 0, order.length - 1)
        const batterId = order[batterIndex]
        if (batterId && gameState.currentGameId) {
          const found = await gameStatsApi.listByGame(gameState.currentGameId, batterId)
          const cur = found.data?.[0]
          await upsertCurrentBatterStats(batterId, {
            hitting: {
              atBats:    safeNumber(cur?.hitting?.atBats),
              hits:      safeNumber(cur?.hitting?.hits),
              strikeouts:safeNumber(cur?.hitting?.strikeouts),
              outs:      safeNumber(cur?.hitting?.outs),
              walks:     safeNumber(cur?.hitting?.walks),
              runs:      safeNumber(cur?.hitting?.runs),
              rbi:       safeNumber(cur?.hitting?.rbi) + preRunScored,
              homeRuns:  safeNumber(cur?.hitting?.homeRuns),
            },
          })
        }
      }
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.isAttacking, gameState.runners, gameState.battingOrder, gameState.currentBatterIndex, gameState.currentGameId, onUpdateGameState, syncDefensivePitcherEvent, upsertCurrentBatterStats, showInvalidAction])

  const applyHBP = useCallback(async () => {
    await captureUndoSnapshot()

    onUpdateGameState((current) => {
      const forced = forceAdvanceToFirst(current.runners || { first: false, second: false, third: false })

      const ourR = current.isAttacking ? forced.runs : 0
      const theirR = current.isAttacking ? 0 : forced.runs

      const hbpOrder = current.battingOrder || []
      const hbpIdx = Math.min(current.currentBatterIndex || 0, Math.max(0, hbpOrder.length - 1))
      const hbpWho = current.isAttacking
        ? (playersById[hbpOrder[hbpIdx]]?.name || '?')
        : oppBatterLabel(current)
      const hbpLogEntry = makeLogEntry(current, 'hbp', `${hbpWho}: HBP`)

      if (current.isAttacking) {
        return {
          ...current,
          opponentPitchCount: Number(current.opponentPitchCount || 0) + 1,
          balls: 0,
          strikes: 0,
          currentBatterIndex: getNextBatterIndexFromState(current),
          runners: forced.nextRunners,
          homeScore: (current.homeScore || 0) + ourR,
          awayScore: (current.awayScore || 0) + theirR,
          inningScores: forced.runs > 0 ? addInningRuns(current.inningScores, current.inning, ourR, theirR) : (current.inningScores || { home: [], away: [] }),
          gameLog: [...(current.gameLog || []), hbpLogEntry],
        }
      }

      return {
        ...current,
        ourPitchCount: Number(current.ourPitchCount || 0) + 1,
        pitchCounts: incrementPitcherCount(current),
        balls: 0,
        strikes: 0,
        currentBatterIndex: getNextBatterIndexFromState(current),
        runners: forced.nextRunners,
        homeScore: (current.homeScore || 0) + ourR,
        awayScore: (current.awayScore || 0) + theirR,
        inningScores: forced.runs > 0 ? addInningRuns(current.inningScores, current.inning, ourR, theirR) : (current.inningScores || { home: [], away: [] }),
        ...advanceOpponentLineup(current),
        gameLog: [...(current.gameLog || []), hbpLogEntry],
      }
    }, 'HBP')

    try {
      if (!gameState.isAttacking) {
        // HBP counts as a pitch and puts a runner on base, but is NOT a base-on-balls (BB)
        await syncDefensivePitcherEvent({ pitchCountDelta: 1 })
      }
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.isAttacking, onUpdateGameState, syncDefensivePitcherEvent])

  const applyErrorEvent = async (defenderId = '') => {
    // Capture batter before state advances the index
    const errPreOrder = gameState.battingOrder || []
    const errPreIdx = Math.min(gameState.currentBatterIndex || 0, Math.max(0, errPreOrder.length - 1))
    const errBatterId = gameState.isAttacking ? (errPreOrder[errPreIdx] || null) : null

    await captureUndoSnapshot()

    let runsScored = 0

    onUpdateGameState((current) => {
      const advanced = applyRunnerAdvance(current.runners || { first: false, second: false, third: false }, 1)
      const nextRunners = { ...advanced.nextRunners, first: true }
      runsScored = advanced.runs

      const errOurR = current.isAttacking ? advanced.runs : 0
      const errTheirR = current.isAttacking ? 0 : advanced.runs

      const errWho = current.isAttacking ? 'Erro do ADV' : `Erro: ${playersById[defenderId]?.name || 'defensor'}`
      const errLogEntry = makeLogEntry(current, 'error', errWho)

      if (current.isAttacking) {
        return {
          ...current,
          opponentPitchCount: Number(current.opponentPitchCount || 0) + 1,
          balls: 0,
          strikes: 0,
          currentBatterIndex: getNextBatterIndexFromState(current),
          runners: nextRunners,
          homeScore: (current.homeScore || 0) + errOurR,
          awayScore: (current.awayScore || 0) + errTheirR,
          inningScores: advanced.runs > 0 ? addInningRuns(current.inningScores, current.inning, errOurR, errTheirR) : (current.inningScores || { home: [], away: [] }),
          gameLog: [...(current.gameLog || []), errLogEntry],
        }
      }

      return {
        ...current,
        ourPitchCount: Number(current.ourPitchCount || 0) + 1,
        pitchCounts: incrementPitcherCount(current),
        balls: 0,
        strikes: 0,
        currentBatterIndex: getNextBatterIndexFromState(current),
        runners: nextRunners,
        homeScore: (current.homeScore || 0) + errOurR,
        awayScore: (current.awayScore || 0) + errTheirR,
        inningScores: advanced.runs > 0 ? addInningRuns(current.inningScores, current.inning, errOurR, errTheirR) : (current.inningScores || { home: [], away: [] }),
        ...updateOppBatter(current, 'error'),
        ...advanceOpponentLineup(current),
        gameLog: [...(current.gameLog || []), errLogEntry],
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

        // Runs on errors are unearned — do NOT pass earnedRunsDelta
        await syncDefensivePitcherEvent({ pitchCountDelta: 1 })
      } else if (errBatterId && gameState.currentGameId) {
        // Reach on error is an official AB (no hit credited)
        const found = await gameStatsApi.listByGame(gameState.currentGameId, errBatterId)
        const cur = found.data?.[0]
        await upsertCurrentBatterStats(errBatterId, {
          hitting: {
            atBats: safeNumber(cur?.hitting?.atBats) + 1,
            hits: safeNumber(cur?.hitting?.hits),
            strikeouts: safeNumber(cur?.hitting?.strikeouts),
            outs: safeNumber(cur?.hitting?.outs),
            walks: safeNumber(cur?.hitting?.walks),
            rbi: safeNumber(cur?.hitting?.rbi),
          },
        })
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
    {
      const draggedPlayer = playersById[playerId]
      const isBench = source === 'bench'
      setDragPreview({
        x: event.clientX,
        y: event.clientY,
        label: isBench
          ? (draggedPlayer?.activePosition || draggedPlayer?.positions?.[0] || 'DH')
          : (draggedPlayer?.name || 'Jogador'),
        playerName: isBench ? (draggedPlayer?.name || '') : null,
        playerNumber: isBench ? (draggedPlayer?.number ?? '') : null,
      })
    }

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
          if (point) {
            let nearest = null
            let nearestDist = Infinity
            for (const fp of fieldPlayers) {
              const dist = Math.hypot(fp.x - point.x, fp.y - point.y)
              if (dist < nearestDist) { nearestDist = dist; nearest = getPlayerId(fp) }
            }
            const hoverId = nearestDist <= 5 ? nearest : null
            benchHoverTargetIdRef.current = hoverId
            setBenchHoverTargetId(hoverId)
            if (hoverId) {
              const hoverPlayer = playersById[hoverId]
              const targetEntry = (gameState.lineup || []).find((l) => l.playerId === hoverId)
              const targetPos = targetEntry?.position || getMainPosition(hoverPlayer)
              const isRec = playerPrefersPosition(drag.playerId, targetPos)
              setDropMessage(`Substituir ${hoverPlayer?.name || '?'} (${targetPos})${isRec ? ' ★' : ''}`)
            } else {
              setDropMessage((gameState.onFieldPlayerIds || []).length < 9 ? 'Soltar para colocar no campo' : 'Arraste sobre um jogador para substituir')
            }
          } else {
            benchHoverTargetIdRef.current = null
            setBenchHoverTargetId(null)
            setDropMessage('Soltar para colocar no campo')
          }
        } else {
          if (drag.source === 'bench') {
            benchHoverTargetIdRef.current = null
            setBenchHoverTargetId(null)
          }
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
          const hoveredId = benchHoverTargetIdRef.current

          const executeSubstitution = (incomingPlayer, replacedId, onField, overridePosition = null) => {
            let positionToUse = overridePosition
            if (!positionToUse) {
              const currentLineup = (gameState.lineup || []).filter(
                (item) => onField.includes(item.playerId) && item.playerId !== replacedId,
              )
              const usedPositions = new Set(currentLineup.map((item) => item.position))
              const enteringPosition = getMainPosition(incomingPlayer)
              positionToUse = !usedPositions.has(enteringPosition)
                ? enteringPosition
                : DEFENSIVE_POSITIONS.find((position) => !usedPositions.has(position)) || enteringPosition
            }
            const targetCoord = getDefaultFieldPosition(positionToUse)

            const nextOnField = replacedId
              ? [...onField.filter((id) => id !== replacedId), drag.playerId]
              : [...onField, drag.playerId]

            setPlayers((current) =>
              current.map((item) =>
                getPlayerId(item) === drag.playerId
                  ? { ...item, x: targetCoord.x, y: targetCoord.y }
                  : item,
              ),
            )

            onUpdateGameState((current) => {
              const battingOrder = [...(current.battingOrder || [])]
              if (replacedId) {
                const replacedIndex = battingOrder.findIndex((id) => id === replacedId)
                if (replacedIndex >= 0) battingOrder[replacedIndex] = drag.playerId
              } else if (!battingOrder.includes(drag.playerId) && battingOrder.length < 9) {
                battingOrder.push(drag.playerId)
              }

              const lineup = (current.lineup || []).filter((item) => nextOnField.includes(item.playerId))
              const lineupWithoutDuplicate = replacedId
                ? lineup.filter((item) => item.playerId !== replacedId)
                : lineup

              const nextLineup = [...lineupWithoutDuplicate, { playerId: drag.playerId, position: positionToUse }]
              const bench = players
                .map((item) => getPlayerId(item))
                .filter((id) => !nextOnField.includes(id))

              const playerOutName = replacedId ? (playersById[replacedId]?.name || '') : ''
              const subRecord = {
                id: `sub_${Date.now()}`,
                ts: Date.now(),
                inning: current.inning || 1,
                half: current.inningHalf || 'top',
                playerInId: drag.playerId,
                playerInName: incomingPlayer?.name || '',
                position: positionToUse,
                playerOutId: replacedId || null,
                playerOutName,
              }
              const subLogDesc = replacedId
                ? `Sub: ${incomingPlayer?.name || '?'} → ${playerOutName || '?'} (${positionToUse})`
                : `${incomingPlayer?.name || '?'} entrou em campo (${positionToUse})`

              // If the outgoing player was the active pitcher, auto-switch to the incoming one
              let nextCurrentPitcherId = current.currentPitcherId
              if (replacedId && replacedId === current.currentPitcherId) {
                const inPositions = Array.isArray(incomingPlayer?.positions) ? incomingPlayer.positions : []
                nextCurrentPitcherId = inPositions.includes('P') ? drag.playerId : null
              }

              return {
                ...current,
                onFieldPlayerIds: Array.from(new Set(nextOnField)),
                battingOrder,
                lineup: nextLineup,
                bench,
                participantPlayerIds: [...nextOnField, ...bench],
                preGameConfigured: current.preGameConfigured || nextOnField.length === 9,
                substitutions: [...(current.substitutions || []), subRecord],
                gameLog: [...(current.gameLog || []), makeLogEntry(current, 'sub', subLogDesc)],
                currentPitcherId: nextCurrentPitcherId,
              }
            }, replacedId
              ? `${incomingPlayer?.name || 'Jogador'} substituiu ${playersById[replacedId]?.name || '?'} em ${positionToUse}`
              : `${incomingPlayer?.name || 'Jogador'} entrou em campo (${positionToUse})`)
          }

          if (hoveredId) {
            const replaced = playersById[hoveredId]
            const targetEntry = (gameState.lineup || []).find((l) => l.playerId === hoveredId)
            const targetPosition = targetEntry?.position || getMainPosition(replaced)
            const isRecommended = playerPrefersPosition(drag.playerId, targetPosition)
            setPendingSubstitution({
              player,
              replaced,
              isRecommended,
              targetPosition,
              currentOnField,
              execute: () => executeSubstitution(player, hoveredId, currentOnField, targetPosition),
            })
          } else if (currentOnField.length < 9) {
            executeSubstitution(player, null, currentOnField)
          }

          benchHoverTargetIdRef.current = null
          setBenchHoverTargetId(null)
          setDragPreview(null)
          setDropTarget(null)
          setDropMessage('')
          return
        }

        if (drag.source === 'field' && inBench) {
          onUpdateGameState((current) => {
            const nextOnField = (current.onFieldPlayerIds || []).filter((id) => id !== drag.playerId)
            const battingOrder = (current.battingOrder || []).filter((id) => id !== drag.playerId)
            const lineup = (current.lineup || []).filter((item) => item.playerId !== drag.playerId)
            const bench = players
              .map((item) => getPlayerId(item))
              .filter((id) => !nextOnField.includes(id))
            const nextCurrentPitcherId = drag.playerId === current.currentPitcherId ? null : current.currentPitcherId

            return {
              ...current,
              onFieldPlayerIds: nextOnField,
              battingOrder,
              lineup,
              bench,
              participantPlayerIds: [...nextOnField, ...bench],
              currentPitcherId: nextCurrentPitcherId,
            }
          }, `${player?.name || 'Jogador'} foi para o banco`)
        }

        // Field-to-field: drop a field player onto another field player → swap their positions
        // Only trigger on an actual drag (not a click), by checking pointer movement
        const dragStart = dragStartRef.current
        const didDrag = dragStart && (Math.abs(ev.clientX - dragStart.x) > 8 || Math.abs(ev.clientY - dragStart.y) > 8)
        if (drag.source === 'field' && inField && point && didDrag) {
          const draggedId = drag.playerId
          const swapTarget = fieldPlayers.find(p => {
            const id = getPlayerId(p)
            return id !== draggedId && Math.hypot(p.x - point.x, p.y - point.y) < 4
          })
          if (swapTarget) {
            const targetId = getPlayerId(swapTarget)
            const draggedLineupEntry = (gameState.lineup || []).find(l => l.playerId === draggedId)
            const targetLineupEntry = (gameState.lineup || []).find(l => l.playerId === targetId)
            if (draggedLineupEntry && targetLineupEntry) {
              const dp = draggedLineupEntry.position
              const tp = targetLineupEntry.position
              const dpCoord = getDefaultFieldPosition(dp)
              const tpCoord = getDefaultFieldPosition(tp)
              const draggedName = playersById[draggedId]?.name || '?'
              const targetName = swapTarget?.name || '?'
              setPendingSwap({
                message: `Trocar ${draggedName} (${dp}) com ${targetName} (${tp})?`,
                execute: () => {
                  setPlayers((current) =>
                    current.map((p) => {
                      const id = getPlayerId(p)
                      if (id === draggedId) return { ...p, x: tpCoord.x, y: tpCoord.y }
                      if (id === targetId) return { ...p, x: dpCoord.x, y: dpCoord.y }
                      return p
                    }),
                  )
                  onUpdateGameState((current) => {
                    const nextLineup = (current.lineup || []).map(l => {
                      if (l.playerId === draggedId) return { ...l, position: tp }
                      if (l.playerId === targetId) return { ...l, position: dp }
                      return l
                    })
                    return {
                      ...current,
                      lineup: nextLineup,
                      gameLog: [...(current.gameLog || []), makeLogEntry(current, 'swap', `Troca: ${draggedName} ↔ ${targetName}`)],
                    }
                  }, `Troca de posição`)
                },
              })
            }
          }
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
      setBenchHoverTargetId(null)
      benchHoverTargetIdRef.current = null
    },
  })

  const focusedPlayer = focusedPlayerId ? playersById[focusedPlayerId] : null
  const pitchersOnField = pitchersFromHook || fieldPlayers.filter((player) => getMainPosition(player) === 'P')
  const allPitchers = players.filter(p => Array.isArray(p.positions) && p.positions.includes('P'))
  const onFieldIdSet = new Set(gameState.onFieldPlayerIds || [])
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
    safeNumber(livePitching.strikes),
    safeNumber(livePitching.balls),
  ].join('|'), [livePitching])

  const activePitchTypes = useMemo(() => {
    const rep = playersById[gameState.currentPitcherId]?.pitchRepertoire
    return Array.isArray(rep) && rep.length > 0 ? rep : ['FB', 'CV', 'SL', 'CH', 'SI', 'CT']
  }, [playersById, gameState.currentPitcherId])

  // Use a string key so this effect only fires when the actual repertoire content changes,
  // not on every drag frame when playersById gets a new object reference.
  const activePitchTypesKey = activePitchTypes.join(',')
  useEffect(() => {
    const types = activePitchTypesKey.split(',')
    setSelectedPitchType(t => types.includes(t) ? t : (types[0] || 'FB'))
  }, [activePitchTypesKey])
  
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
  }, [defensivePlayers, getPlayerId, getMainPosition])
  const doublePlayRunnerOptions = useMemo(
    () => ['first', 'second', 'third'].filter((base) => Boolean(gameState.runners?.[base])),
    [gameState.runners],
  )
  const doublePlayDefenderOptions = useMemo(
    () => defensivePlayers.map((player) => ({
      id: getPlayerId(player),
      label: `${player.name} #${player.number} (${getMainPosition(player)})`,
    })),
    [defensivePlayers, getPlayerId, getMainPosition],
  )

  const batterSeasonStats = useMemo(() => {
    if (!currentBatterId || !gameState.isAttacking) return null
    const { data } = seasonStatsApi.list()
    return data.find(s => s.playerId === currentBatterId) || null
  // statsRefreshKey ensures the memo updates after any stat write completes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBatterId, gameState.isAttacking, statsRefreshKey])

  // Keep the screen on while a game is in progress
  useEffect(() => {
    if (!gameState.currentGameId) return
    KeepAwake.keepAwake().catch(() => {})
    return () => { KeepAwake.allowSleep().catch(() => {}) }
  }, [gameState.currentGameId])

  // Side-switch banner: fires when isAttacking flips as result of 3 outs (outs reset to 0)
  useEffect(() => {
    const prev = prevIsAttackingRef.current
    prevIsAttackingRef.current = gameState.isAttacking
    if (prev === null || prev === gameState.isAttacking) return
    if (gameState.outs !== 0) return
    const label = gameState.isAttacking ? 'ATACANDO' : 'DEFENDENDO'
    setSideSwitchBanner(label)
    haptic(ImpactStyle.Heavy)
    if (sideSwitchTimerRef.current) clearTimeout(sideSwitchTimerRef.current)
    sideSwitchTimerRef.current = setTimeout(() => setSideSwitchBanner(null), 2500)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.isAttacking, gameState.outs])

  return (
      <section className={`field-layout ${showFieldContainer ? '' : 'mode-hidden'}`} ref={layoutRef}>
        <div
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {`Inning ${gameState.inning || 1} ${gameState.inningHalf === 'top' ? 'topo' : 'parte baixa'}, ${gameState.outs || 0} out${(gameState.outs || 0) !== 1 ? 's' : ''}, CAASO ${gameState.homeScore || 0} x ${gameState.awayScore || 0} ${opponentName || 'Adversário'}`}
        </div>
        <Scoreboard gameState={gameState} opponentName={opponentName} visible={gameSubView === 'campo' && showScoreboard} />
        {sideSwitchBanner && (
          <div className={`side-switch-banner side-switch-banner--${gameState.isAttacking ? 'attack' : 'defense'}`}>
            TROCA DE LADO — {sideSwitchBanner}
          </div>
        )}

      {gameSubView === 'campo' && <Field
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
        benchHoverTargetId={benchHoverTargetId}
      />}

      {gameSubView === 'campo' && (
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
      />
      )}

      {gameSubView === 'acoes' && (
        <div className="acoes-view">
          <div className="acoes-left">
            <div className="acoes-score-row">
              <span className="acoes-score-team">CAASO</span>
              <span className="acoes-score-num">{gameState.homeScore || 0}</span>
              <span className="acoes-score-sep">×</span>
              <span className="acoes-score-num">{gameState.awayScore || 0}</span>
              <span className="acoes-score-team">{opponentName || 'Adv'}</span>
            </div>

            <div className="acoes-inning-row">
              <span>Inning {gameState.inning || 1}</span>
              <span className="acoes-inning-half">{gameState.inningHalf === 'top' ? '▲' : '▼'}</span>
            </div>

            {(() => {
              const is = gameState.inningScores || { home: [], away: [] }
              const total = Math.max(9, is.home.length, is.away.length, gameState.inning || 1)
              const cols = Array.from({ length: total }, (_, i) => i)
              return (
                <div className="acoes-box-score-wrap">
                  <table className="box-score acoes-box-score">
                    <thead>
                      <tr>
                        <th className="box-score-team"></th>
                        {cols.map(i => (
                          <th key={i} className={`box-score-cell${i + 1 === gameState.inning ? ' box-score-current' : ''}`}>{i + 1}</th>
                        ))}
                        <th className="box-score-total">R</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className={!gameState.isAttacking ? 'box-score-batting' : ''}>
                        <td className="box-score-team box-score-team--away">
                          {!gameState.isAttacking && <span className="box-score-bat-indicator"></span>}
                          <span className="box-score-team-label">▲ ADV</span>
                        </td>
                        {cols.map(i => (
                          <td key={i} className={`box-score-cell${i + 1 === gameState.inning ? ' box-score-current' : ''}`}>
                            {is.away[i] != null ? is.away[i] : (i + 1 < gameState.inning ? 0 : '–')}
                          </td>
                        ))}
                        <td className="box-score-total">{gameState.awayScore || 0}</td>
                      </tr>
                      <tr className={gameState.isAttacking ? 'box-score-batting' : ''}>
                        <td className="box-score-team box-score-team--home">
                          {gameState.isAttacking && <span className="box-score-bat-indicator"></span>}
                          <span className="box-score-team-label">▼ NÓS</span>
                        </td>
                        {cols.map(i => (
                          <td key={i} className={`box-score-cell${i + 1 === gameState.inning ? ' box-score-current' : ''}`}>
                            {is.home[i] != null ? is.home[i] : (i + 1 < gameState.inning ? 0 : '–')}
                          </td>
                        ))}
                        <td className="box-score-total">{gameState.homeScore || 0}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )
            })()}

            <div className="acoes-mode-row">
              <span className={`hud-mode-badge ${gameState.isAttacking ? 'hud-mode-attack' : 'hud-mode-defense'}`}>
                {gameState.isAttacking ? 'ATACANDO' : 'DEFENDENDO'}
              </span>
              <button
                type="button"
                className={`hud-mode-toggle-btn${modePendingConfirm ? ' hud-mode-toggle-pending' : ''}`}
                onClick={() => {
                  if (!modePendingConfirm) {
                    setModePendingConfirm(true)
                    if (modePendingTimerRef.current) clearTimeout(modePendingTimerRef.current)
                    modePendingTimerRef.current = window.setTimeout(() => setModePendingConfirm(false), 2000)
                    return
                  }
                  clearTimeout(modePendingTimerRef.current)
                  setModePendingConfirm(false)
                  onUpdateGameState((current) => ({
                    ...current, isAttacking: !current.isAttacking, balls: 0, strikes: 0,
                  }), 'Modo alternado manualmente')
                }}
              >
                {modePendingConfirm ? 'Confirmar?' : 'Trocar'}
              </button>
            </div>

            <div className="acoes-count-row">
              <CountDots label="B" value={gameState.balls || 0} max={4} color="#2f9d58" />
              <CountDots label="S" value={gameState.strikes || 0} max={3} color="#d2a100" />
              <CountDots label="O" value={gameState.outs || 0} max={3} color="#c33b34" />
            </div>

            {gameState.isAttacking && (
              <div className="acoes-batter-row">
                <span className="acoes-label">Rebate</span>
                <strong>{currentBatter ? `${currentBatter.name} #${currentBatter.number}` : '—'}</strong>
                {onDeckBatter && <span className="acoes-ondeck">Deck: {onDeckBatter.name}</span>}
              </div>
            )}

            {!gameState.isAttacking && (
              <div className="acoes-pitcher-row">
                <span className="acoes-label">Pitcher</span>
                <select
                  className="acoes-pitcher-select"
                  value={gameState.currentPitcherId || ''}
                  onChange={(event) => handlePitcherSelect(event.target.value || null)}
                >
                  {!allPitchers.length && <option value="">Sem pitcher</option>}
                  {allPitchers.filter(p => onFieldIdSet.has(getPlayerId(p))).map(player => (
                    <option key={getPlayerId(player)} value={getPlayerId(player)}>
                      {player.name} #{player.number}
                    </option>
                  ))}
                  {allPitchers.filter(p => !onFieldIdSet.has(getPlayerId(p))).map(player => (
                    <option key={getPlayerId(player)} value={getPlayerId(player)}>
                      {player.name} #{player.number} (banco)
                    </option>
                  ))}
                </select>
                <span className="acoes-pitcher-pc">
                  PC: {gameState.currentPitcherId && gameState.pitchCounts && Number.isFinite(gameState.pitchCounts[gameState.currentPitcherId])
                    ? gameState.pitchCounts[gameState.currentPitcherId]
                    : 0}
                </span>
              </div>
            )}

            {!gameState.isAttacking && (() => {
              const oppLineup = Array.isArray(gameState.opponentLineup) ? gameState.opponentLineup : []
              const oppIdx = typeof gameState.opponentLineupIndex === 'number' ? gameState.opponentLineupIndex : 0
              const knownCount = oppLineup.filter(Boolean).length
              const slotLabel = knownCount === 9
                ? `${oppIdx + 1}º rebatedor`
                : `${knownCount}/9 registrados`
              const currentBatterStats = gameState.currentOpponentBatter?.number?.trim()
                ? gameState.opposingBatters?.[gameState.currentOpponentBatter.number.trim()]
                : null
              return (
                <div className="acoes-opp-batter-section">
                  <div className="acoes-opp-batter-header">
                    <span className="acoes-label">Batter Adv.</span>
                    <span className="acoes-opp-lineup-slot">{slotLabel}</span>
                  </div>
                  <div className="acoes-opp-batter-row">
                    <input
                      type="text"
                      className={`acoes-opp-batter-num${knownCount === 9 ? ' acoes-input-prefilled' : ''}`}
                      placeholder="#"
                      maxLength={3}
                      value={gameState.currentOpponentBatter?.number || ''}
                      onChange={(e) => {
                        const v = e.target.value
                        onUpdateGameState((curr) => ({ ...curr, currentOpponentBatter: { ...curr.currentOpponentBatter, number: v } }))
                      }}
                    />
                    <input
                      type="text"
                      className={`acoes-opp-batter-name${knownCount === 9 ? ' acoes-input-prefilled' : ''}`}
                      placeholder="Nome (opcional)"
                      value={gameState.currentOpponentBatter?.name || ''}
                      onChange={(e) => {
                        const v = e.target.value
                        onUpdateGameState((curr) => ({ ...curr, currentOpponentBatter: { ...curr.currentOpponentBatter, name: v } }))
                      }}
                    />
                  </div>
                  {currentBatterStats && (() => {
                    const b = currentBatterStats
                    const avg = b.atBats > 0 ? (b.hits / b.atBats).toFixed(3) : '.000'
                    return (
                      <div className="acoes-opp-batter-stats">
                        {b.hits}-{b.atBats}{b.homeRuns ? `, ${b.homeRuns}HR` : ''}{b.strikeouts ? `, ${b.strikeouts}K` : ''}{b.walks ? `, ${b.walks}BB` : ''} · {avg}
                      </div>
                    )
                  })()}
                </div>
              )
            })()}

            {gameState.isAttacking && (
              <div className="acoes-opp-pitcher-section">
                <span className="acoes-label">Pitcher Adv.</span>
                <div className="acoes-opp-batter-row">
                  <input
                    type="text"
                    className="acoes-opp-batter-num"
                    placeholder="#"
                    maxLength={3}
                    value={gameState.opposingPitcher?.number || ''}
                    onChange={(e) => {
                      const v = e.target.value
                      onUpdateGameState((curr) => ({ ...curr, opposingPitcher: { ...curr.opposingPitcher, number: v } }))
                    }}
                  />
                  <input
                    type="text"
                    className="acoes-opp-batter-name"
                    placeholder="Nome (opcional)"
                    value={gameState.opposingPitcher?.name || ''}
                    onChange={(e) => {
                      const v = e.target.value
                      onUpdateGameState((curr) => ({ ...curr, opposingPitcher: { ...curr.opposingPitcher, name: v } }))
                    }}
                  />
                </div>
                {confirmChangePitcherAdv ? (
                  <div className="acoes-confirm-row">
                    <span className="acoes-confirm-label">Resetar PC do pitcher adversário?</span>
                    <button
                      type="button"
                      className="acoes-change-pitcher-btn acoes-change-pitcher-btn--confirm"
                      onClick={() => {
                        setConfirmChangePitcherAdv(false)
                        onUpdateGameState((current) => {
                          const num = current.opposingPitcher?.number?.trim()
                          const name = current.opposingPitcher?.name?.trim()
                          const label = num ? (name ? `#${num} ${name}` : `#${num}`) : (name || 'Adv')
                          return {
                            ...current,
                            opponentPitchCount: 0,
                            gameLog: [...(current.gameLog || []), makeLogEntry(current, 'pitcher-change', `Pitcher Adv: ${label} entrou`)],
                          }
                        })
                      }}
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      className="acoes-change-pitcher-btn acoes-change-pitcher-btn--cancel"
                      onClick={() => setConfirmChangePitcherAdv(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="acoes-change-pitcher-btn acoes-change-pitcher-btn--full"
                    onClick={() => setConfirmChangePitcherAdv(true)}
                  >
                    Trocar Pitcher Adv.
                  </button>
                )}
              </div>
            )}

            <div className="acoes-pc-row">
              <div className="acoes-pc-item"><span>PC Nós</span><strong>{gameState.ourPitchCount || 0}</strong></div>
              <div className="acoes-pc-item"><span>PC Adv</span><strong>{gameState.opponentPitchCount || 0}</strong></div>
            </div>

            <div className="acoes-runners-section">
              <svg viewBox="0 0 100 100" className="acoes-diamond-svg" aria-hidden="true">
                <line x1="50" y1="16" x2="84" y2="50" stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round"/>
                <line x1="84" y1="50" x2="50" y2="84" stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round"/>
                <line x1="50" y1="84" x2="16" y2="50" stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round"/>
                <line x1="16" y1="50" x2="50" y2="16" stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round"/>
                <rect x="43" y="9" width="14" height="14" transform="rotate(45 50 16)"
                  fill={gameState.runners?.second ? '#d2a100' : '#1e1e1e'} stroke={gameState.runners?.second ? '#e8b800' : '#484848'} strokeWidth="1.5"/>
                <rect x="77" y="43" width="14" height="14" transform="rotate(45 84 50)"
                  fill={gameState.runners?.first ? '#d2a100' : '#1e1e1e'} stroke={gameState.runners?.first ? '#e8b800' : '#484848'} strokeWidth="1.5"/>
                <rect x="9" y="43" width="14" height="14" transform="rotate(45 16 50)"
                  fill={gameState.runners?.third ? '#d2a100' : '#1e1e1e'} stroke={gameState.runners?.third ? '#e8b800' : '#484848'} strokeWidth="1.5"/>
                <polygon points="44,78 56,78 59,84 50,89 41,84"
                  fill="#1e1e1e" stroke="#484848" strokeWidth="1.5"/>
              </svg>
              <div className="acoes-runners-grid">
                {['first', 'second', 'third'].map((base) => (
                  <div key={base} className="acoes-runner-item">
                    <span className={`acoes-base-badge ${gameState.runners?.[base] ? 'occupied' : ''}`}>
                      {base === 'first' ? '1ª' : base === 'second' ? '2ª' : '3ª'}
                    </span>
                    {!gameState.runners?.[base] && (
                      <button type="button" className="acoes-runner-btn" onClick={() => onUpdateGameState((current) => ({ ...current, runners: { ...current.runners, [base]: true } }), `Corredor em ${base}`)}>+</button>
                    )}
                    {gameState.runners?.[base] && (
                      <>
                        <button type="button" className="acoes-runner-btn" onClick={() => advanceRunner(base)}>Av</button>
                        <button type="button" className="acoes-runner-btn" onClick={() => setPendingRemoveRunner(base)}>Out</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {invalidFeedback && <div className="drop-hint">{invalidFeedback}</div>}

            <div className="acoes-end-row">
              <button type="button" className="acoes-undo-btn" onClick={() => handleUndo().catch(() => {})}>↩ Desfazer</button>
              <button type="button" className="acoes-end-btn" onClick={() => setPendingEndGame(true)}>Encerrar jogo</button>
            </div>
          </div>

          <div className="acoes-right">
            <div className="acoes-btns-grid">
              {gameState.isAttacking ? (
                <>
                  <button type="button" className="acoes-btn acoes-strike" onClick={() => applyAttackCountAction('strike')}>STRIKE</button>
                  <button type="button" className="acoes-btn acoes-ball" onClick={() => applyAttackCountAction('ball')}>BALL</button>
                  <button type="button" className="acoes-btn acoes-foul" onClick={() => applyAttackCountAction('foul')}>FOUL</button>
                  <button type="button" className="acoes-btn acoes-out" onClick={() => applyPlateAppearance('out')}>OUT</button>
                  <button type="button" className="acoes-btn acoes-1b" onClick={() => applyPlateAppearance('single')}>SIMPLES</button>
                  <button type="button" className="acoes-btn acoes-2b" onClick={() => applyPlateAppearance('double')}>DUPLA</button>
                  <button type="button" className="acoes-btn acoes-3b" onClick={() => applyPlateAppearance('triple')}>TRIPLA</button>
                  <button type="button" className="acoes-btn acoes-hr" onClick={() => applyPlateAppearance('homerun')}>HOME RUN</button>
                  {(gameState.runners?.first || gameState.runners?.second || gameState.runners?.third) && gameState.outs < 2 && (
                    <button type="button" className="acoes-btn acoes-dp" onClick={handleDoublePlayAction}>D. PLAY</button>
                  )}
                  {gameState.runners?.third && gameState.outs < 2 && (
                    <button type="button" className="acoes-btn acoes-sf" onClick={applySacFly}>SAC FLY</button>
                  )}
                  <button type="button" className="acoes-btn acoes-erro" onClick={() => applyErrorEvent('')}>ERRO</button>
                  <button type="button" className="acoes-btn acoes-hbp" onClick={applyHBP}>HBP</button>
                </>
              ) : (
                <>
                  <div className="pitch-type-selector">
                    {activePitchTypes.map(t => (
                      <button
                        key={t}
                        type="button"
                        className={`pitch-type-btn${selectedPitchType === t ? ' active' : ''}`}
                        onClick={() => setSelectedPitchType(t)}
                      >{t}</button>
                    ))}
                  </div>
                  <div className="pitch-type-selected-desc">{PITCH_NAMES[selectedPitchType]}</div>
                  <button type="button" className="acoes-btn acoes-strike" onClick={() => handleDefensivePitch('strike')}>STRIKE</button>
                  <button type="button" className="acoes-btn acoes-ball" onClick={() => handleDefensivePitch('ball')}>BALL</button>
                  <button type="button" className="acoes-btn acoes-foul" onClick={() => handleDefensivePitch('foul')}>FOUL</button>
                  <button type="button" className="acoes-btn acoes-out" onClick={() => { setSelectedOutType(''); setSelectedOutFielderId(''); setPendingOutTypeSelect(true) }}>OUT</button>
                  <button type="button" className="acoes-btn acoes-1b" onClick={() => applyDefensiveHit('single')}>SINGLE</button>
                  <button type="button" className="acoes-btn acoes-2b" onClick={() => applyDefensiveHit('double')}>DOUBLE</button>
                  <button type="button" className="acoes-btn acoes-3b" onClick={() => applyDefensiveHit('triple')}>TRIPLE</button>
                  <button type="button" className="acoes-btn acoes-hr" onClick={() => applyDefensiveHit('homerun')}>HOME RUN</button>
                  {(gameState.runners?.first || gameState.runners?.second || gameState.runners?.third) && gameState.outs < 2 && (
                    <button type="button" className="acoes-btn acoes-dp" onClick={handleDoublePlayAction}>D. PLAY</button>
                  )}
                  {gameState.runners?.third && gameState.outs < 2 && (
                    <button type="button" className="acoes-btn acoes-sf" onClick={applySacFly}>SAC FLY</button>
                  )}
                  <button type="button" className="acoes-btn acoes-erro" onClick={() => { setSelectedErrorDefenderId((current) => current || errorDefenderOptions[0]?.id || ''); setPendingDefenseError(true) }}>ERRO</button>
                  <button type="button" className="acoes-btn acoes-hbp" onClick={applyHBP}>HBP</button>
                </>
              )}
            </div>

            {gameState.isAttacking && currentBatter && (() => {
              const h = batterSeasonStats?.hitting || {}
              const avg = batterSeasonStats?.avg
              const kPct = h.atBats ? Math.round(safeNumber(h.strikeouts) / h.atBats * 100) : null
              const fmtAvg = avg != null ? avg.toFixed(3).replace(/^0/, '') : '---'
              return (
                <div className="acoes-batter-stats">
                  <button
                    type="button"
                    className="acoes-batter-stats-toggle"
                    onClick={() => setBatterStatsCollapsed(c => !c)}
                  >
                    <span className="acoes-batter-stats-name">
                      {currentBatter.name} <em>#{currentBatter.number}</em>
                    </span>
                    <span className="acoes-batter-stats-avg">{fmtAvg}</span>
                    <span className="acoes-batter-stats-arrow">{batterStatsCollapsed ? '▶' : '▼'}</span>
                  </button>
                  {!batterStatsCollapsed && (
                    <>
                      <div className="acoes-batter-stats-grid">
                        <div><span>AVG</span><strong>{fmtAvg}</strong></div>
                        <div><span>HR</span><strong>{safeNumber(h.homeRuns)}</strong></div>
                        <div><span>RBI</span><strong>{safeNumber(h.rbi)}</strong></div>
                        <div><span>K%</span><strong>{kPct !== null ? `${kPct}%` : '---'}</strong></div>
                        <div><span>H</span><strong>{safeNumber(h.hits)}</strong></div>
                        <div><span>AB</span><strong>{safeNumber(h.atBats)}</strong></div>
                      </div>
                      {onDeckBatter && onDeckBatter !== currentBatter && (
                        <div className="acoes-batter-ondeck">
                          On deck: {onDeckBatter.name} #{onDeckBatter.number}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })()}

            {!gameState.isAttacking && (() => {
              const pitcherPitches = gameState.currentPitcherId && gameState.pitchCounts
                ? (gameState.pitchCounts[gameState.currentPitcherId] ?? 0)
                : 0
              const pitcherLimit = playersById[gameState.currentPitcherId]?.pitchCountLimit ?? null
              const nearLimit = pitcherLimit !== null && pitcherPitches >= pitcherLimit - 10
              const overLimit = pitcherLimit !== null && pitcherPitches >= pitcherLimit
              return (
                <div key={`pitching-pulse-${pitchingPulseKey}`} className="acoes-pitcher-stats stats-pulse">
                  {overLimit && (
                    <div className="pitch-limit-alert pitch-limit-alert--over">
                      LIMITE DE PITCHES ATINGIDO ({pitcherPitches}/{pitcherLimit})
                    </div>
                  )}
                  {nearLimit && !overLimit && (
                    <div className="pitch-limit-alert pitch-limit-alert--near">
                      Aproximando do limite: {pitcherPitches}/{pitcherLimit}
                    </div>
                  )}
                  <div className="acoes-pitcher-stats-grid">
                    <div><span><StatLabel abbr="IP" /></span><strong>{formatIpFromOuts(livePitching.outsPitched)}</strong></div>
                    <div><span><StatLabel abbr="ERA" /></span><strong>{formatEraFromOuts(livePitching.outsPitched, livePitching.earnedRuns)}</strong></div>
                    <div><span>SO</span><strong>{safeNumber(livePitching.strikeouts)}</strong></div>
                    <div><span><StatLabel abbr="BB" /></span><strong>{safeNumber(livePitching.walks)}</strong></div>
                    <div className={overLimit ? 'pc-over' : nearLimit ? 'pc-near' : ''}>
                      <span><StatLabel abbr="PC" /></span>
                      <strong>{pitcherPitches}{pitcherLimit ? `/${pitcherLimit}` : ''}</strong>
                    </div>
                    <div><span><StatLabel abbr="STR" /></span><strong>{safeNumber(livePitching.strikes)}</strong></div>
                    <div><span><StatLabel abbr="BAL" /></span><strong>{safeNumber(livePitching.balls)}</strong></div>
                  </div>
                  <div className="pitch-type-totals">
                    {activePitchTypes.map(t => {
                      const count = safeNumber(livePitching.pitchTypes?.[t])
                      return (
                        <span key={t} className={`pitch-type-count${count === 0 ? ' pitch-type-count--zero' : ''}`}>
                          <em><StatLabel abbr={t} /></em>{count}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {gameSubView === 'log' && (
        <div className="log-view">
          <div className="log-section">
            <h4 className="log-section-title">Play-by-play</h4>
            {(gameState.gameLog || []).length === 0 ? (
              <p className="log-empty">Nenhum evento registrado ainda.</p>
            ) : (
              <div className="log-list">
                {[...(gameState.gameLog || [])].reverse().map((entry) => (
                  <div key={entry.id} className={`log-entry log-entry--${(entry.type || 'other').replace(/[^a-z-]/g, '-')}`}>
                    <span className="log-inning">{entry.inning}º {INNING_HALF(entry.half)}</span>
                    <span className="log-desc">{entry.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(gameState.substitutions || []).length > 0 && (
            <div className="log-section">
              <h4 className="log-section-title">Substituições</h4>
              <div className="log-list">
                {[...(gameState.substitutions || [])].reverse().map((sub) => (
                  <div key={sub.id} className="log-entry log-entry--sub">
                    <span className="log-inning">{sub.inning}º {INNING_HALF(sub.half)}</span>
                    <span className="log-desc">
                      {sub.playerOutName
                        ? `${sub.playerInName} → ${sub.playerOutName} (${sub.position})`
                        : `${sub.playerInName} entrou (${sub.position})`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(gameState.opposingBatters || {}).length > 0 && (
            <div className="log-section">
              <h4 className="log-section-title">Batters adversários</h4>
              <div className="log-opp-batters">
                {Object.values(gameState.opposingBatters || {}).map((b) => {
                  const avg = b.atBats > 0 ? (b.hits / b.atBats).toFixed(3) : '.000'
                  return (
                    <div key={b.number} className="log-opp-batter-row">
                      <span className="log-opp-num">#{b.number}</span>
                      {b.name && <span className="log-opp-name">{b.name}</span>}
                      <span className="log-opp-stat">{b.hits}-{b.atBats}</span>
                      {b.homeRuns > 0 && <span className="log-opp-badge">{b.homeRuns}HR</span>}
                      {b.strikeouts > 0 && <span className="log-opp-badge">{b.strikeouts}K</span>}
                      {b.walks > 0 && <span className="log-opp-badge">{b.walks}BB</span>}
                      <span className="log-opp-avg">{avg}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-view toggle */}
      <div className="game-subview-bar" role="tablist" aria-label="Visão do jogo">
        <button
          type="button"
          role="tab"
          aria-selected={gameSubView === 'campo'}
          className={gameSubView === 'campo' ? 'active' : ''}
          onClick={() => setGameSubView('campo')}
        >
          Campo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={gameSubView === 'acoes'}
          className={gameSubView === 'acoes' ? 'active' : ''}
          onClick={() => setGameSubView('acoes')}
        >
          Ações
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={gameSubView === 'log'}
          className={gameSubView === 'log' ? 'active' : ''}
          onClick={() => setGameSubView('log')}
        >
          Log{(gameState.gameLog || []).length > 0 ? ` (${(gameState.gameLog || []).length})` : ''}
        </button>
      </div>

    

      {showPreGameSetup && (
        <Modal
          title="Configuracao Inicial"
          onClose={gameState.currentGameId ? () => setShowPreGameSetup(false) : onCancelPreGame ?? undefined}
          closeLabel="Cancelar"
        >
          <div className="pregame-grid">
                <section className="player-stats-block pregame-info">
                  <h4>0) Informações do jogo</h4>
                  <label htmlFor="pregame-date" className="field-label">Data</label>
                  <input
                    id="pregame-date"
                    type="date"
                    value={pregameForm.date}
                    onChange={(e) => setPregameForm((c) => ({ ...c, date: e.target.value }))}
                    style={{ marginBottom: 8 }}
                  />
                  <label htmlFor="pregame-opponent" className="field-label">Adversário</label>
                  <input
                    id="pregame-opponent"
                    placeholder="Nome do adversario"
                    value={pregameForm.opponentName}
                    onChange={(e) => setPregameForm((c) => ({ ...c, opponentName: e.target.value }))}
                    style={{ marginBottom: 8 }}
                  />
                  <label htmlFor="pregame-competition" className="field-label">Competição</label>
                  <input
                    id="pregame-competition"
                    placeholder="Competicao (treino/campeonato)"
                    value={pregameForm.competition}
                    onChange={(e) => setPregameForm((c) => ({ ...c, competition: e.target.value }))}
                    style={{ marginBottom: 8 }}
                  />
                  <label htmlFor="pregame-location" className="field-label">Local (opcional)</label>
                  <input
                    id="pregame-location"
                    placeholder="Local (opcional)"
                    value={pregameForm.location}
                    onChange={(e) => setPregameForm((c) => ({ ...c, location: e.target.value }))}
                  />
                  <label htmlFor="pregame-innings" className="field-label" style={{ marginTop: 8, display: 'block' }}>Innings (0 = ilimitado)</label>
                  <input
                    id="pregame-innings"
                    type="number"
                    min="0"
                    max="20"
                    placeholder="9"
                    value={pregameForm.maxInnings}
                    onChange={(e) => setPregameForm((c) => ({ ...c, maxInnings: e.target.value }))}
                  />
                </section>

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
                        {(() => {
                          const available = setupAvailablePlayers.filter(
                            (player) => !selectedIds.includes(getPlayerId(player))
                          )
                          const preferred = available.filter((p) => playerPrefersPosition(getPlayerId(p), slot.position))
                          const others = available.filter((p) => !playerPrefersPosition(getPlayerId(p), slot.position))
                          const makeOption = (player, prefix = '') => {
                            const id = getPlayerId(player)
                            return (
                              <option key={`setup-player-${slot.position}-${id}`} value={id}>
                                {prefix}{player.name} #{player.number}
                              </option>
                            )
                          }
                          return (
                            <>
                              {preferred.length > 0 && (
                                <optgroup label="Recomendados">
                                  {preferred.map((p) => makeOption(p, '★ '))}
                                </optgroup>
                              )}
                              {others.length > 0 && (
                                <optgroup label="Outros">
                                  {others.map((p) => makeOption(p))}
                                </optgroup>
                              )}
                            </>
                          )
                        })()}
                      </select>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="player-stats-block">
              <h4>3) Ordem de rebatida</h4>
              <div
                ref={orderListRef}
                className="pregame-order-list"
                onPointerMove={onOrderPointerMove}
                onPointerUp={onOrderPointerUp}
                onPointerCancel={onOrderPointerUp}
              >
                {setupBattingOrder.map((id, index) => {
                  const player = playersById[id]
                  if (!player) return null
                  return (
                    <div
                      key={`order-${id}`}
                      data-order-id={id}
                      className={`pregame-order-item ${setupDraggingId === id ? 'dragging' : ''}`}
                      draggable
                      onDragStart={() => onBattingDragStart(id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => onBattingDrop(id)}
                    >
                      <span>{index + 1}.</span>
                      <strong>{player.name}</strong>
                      <span>#{player.number}</span>
                      <span
                        className="pregame-order-handle"
                        style={{ touchAction: 'none' }}
                        onPointerDown={(ev) => onOrderPointerDown(id, ev)}
                      >⠿</span>
                    </div>
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
              disabled={
                setupBattingOrder.length !== 9
                || setupStarters.filter((item) => item.playerId).length !== 9
                || (!gameState.currentGameId && (!pregameForm.date || !pregameForm.opponentName.trim() || !pregameForm.competition.trim()))
              }
            >
              Iniciar jogo
            </Button>
          </div>
        </Modal>
      )}

      {pendingEndGame && (
        <ConfirmModal
          message="Encerrar o jogo? Esta ação é irreversível."
          confirmLabel="Encerrar"
          danger
          onConfirm={() => {
            setPendingEndGame(false)
            setGameSummarySnapshot({ homeScore: gameState.homeScore, awayScore: gameState.awayScore, inning: gameState.inning, opponentName: opponentName || 'Adversário', inningScores: gameState.inningScores || { home: [], away: [] } })
            setShowGameSummary(true)
          }}
          onCancel={() => setPendingEndGame(false)}
        />
      )}

      {pendingRemoveRunner && (
        <ConfirmModal
          message={`Eliminar corredor em ${pendingRemoveRunner === 'first' ? '1ª' : pendingRemoveRunner === 'second' ? '2ª' : '3ª'} base?`}
          confirmLabel="Eliminar"
          danger
          onConfirm={() => { const b = pendingRemoveRunner; setPendingRemoveRunner(null); removeRunner(b) }}
          onCancel={() => setPendingRemoveRunner(null)}
        />
      )}

      {pendingSwap && (
        <ConfirmModal
          message={pendingSwap.message}
          confirmLabel="Confirmar troca"
          onConfirm={() => { pendingSwap.execute(); setPendingSwap(null) }}
          onCancel={() => setPendingSwap(null)}
        />
      )}

      {pendingAutoEnd && (
        <ConfirmModal
          message={pendingAutoEnd}
          confirmLabel="Encerrar"
          danger
          onConfirm={() => {
            setPendingAutoEnd(null)
            setGameSummarySnapshot({ homeScore: gameState.homeScore, awayScore: gameState.awayScore, inning: gameState.inning, opponentName: opponentName || 'Adversário' })
            setShowGameSummary(true)
          }}
          onCancel={() => setPendingAutoEnd(null)}
        />
      )}

      {showGameSummary && gameSummarySnapshot && (
        <Modal title="Resumo do Jogo" onClose={() => { setShowGameSummary(false); onEndGame?.() }}>
          <div className="game-summary">
            <div className="game-summary-result">
              {gameSummarySnapshot.homeScore > gameSummarySnapshot.awayScore
                ? 'CAASO venceu!'
                : gameSummarySnapshot.homeScore < gameSummarySnapshot.awayScore
                  ? `${gameSummarySnapshot.opponentName} venceu`
                  : 'Empate'}
            </div>
            <div className="game-summary-box-wrap">
              <table className="game-summary-box">
                <thead>
                  <tr>
                    <th className="gsb-team"></th>
                    {Array.from(
                      { length: Math.max(gameSummarySnapshot.inning, (gameSummarySnapshot.inningScores?.home || []).length, (gameSummarySnapshot.inningScores?.away || []).length, 1) },
                      (_, i) => <th key={i} className="gsb-cell">{i + 1}</th>
                    )}
                    <th className="gsb-total">R</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="gsb-team gsb-team-label">{gameSummarySnapshot.opponentName}</td>
                    {Array.from(
                      { length: Math.max(gameSummarySnapshot.inning, (gameSummarySnapshot.inningScores?.home || []).length, (gameSummarySnapshot.inningScores?.away || []).length, 1) },
                      (_, i) => <td key={i} className="gsb-cell">{(gameSummarySnapshot.inningScores?.away || [])[i] ?? 0}</td>
                    )}
                    <td className="gsb-total">{gameSummarySnapshot.awayScore}</td>
                  </tr>
                  <tr>
                    <td className="gsb-team gsb-team-label">CAASO</td>
                    {Array.from(
                      { length: Math.max(gameSummarySnapshot.inning, (gameSummarySnapshot.inningScores?.home || []).length, (gameSummarySnapshot.inningScores?.away || []).length, 1) },
                      (_, i) => <td key={i} className="gsb-cell">{(gameSummarySnapshot.inningScores?.home || [])[i] ?? 0}</td>
                    )}
                    <td className="gsb-total">{gameSummarySnapshot.homeScore}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {(() => {
              const participantIds = new Set(gameState.participantPlayerIds || [])
              const pitchers = players.filter(p => detectPlayerType(p) === 'pitcher' && (participantIds.size === 0 || participantIds.has(getPlayerId(p))))
              if (!pitchers.length) return null
              return (
                <div className="game-summary-wlsv">
                  <h4>Decisão (opcional)</h4>
                  <div className="game-summary-wlsv-row">
                    <label>
                      W
                      <select value={summaryWP} onChange={e => setSummaryWP(e.target.value)}>
                        <option value="">—</option>
                        {pitchers.map(p => <option key={getPlayerId(p)} value={getPlayerId(p)}>{p.name}</option>)}
                      </select>
                    </label>
                    <label>
                      L
                      <select value={summaryLP} onChange={e => setSummaryLP(e.target.value)}>
                        <option value="">—</option>
                        {pitchers.map(p => <option key={getPlayerId(p)} value={getPlayerId(p)}>{p.name}</option>)}
                      </select>
                    </label>
                    <label>
                      SV
                      <select value={summarySV} onChange={e => setSummarySV(e.target.value)}>
                        <option value="">—</option>
                        {pitchers.map(p => <option key={getPlayerId(p)} value={getPlayerId(p)}>{p.name}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              )
            })()}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Button variant="primary" onClick={async () => {
                const saves = [
                  summaryWP ? { id: summaryWP, field: 'wins' }   : null,
                  summaryLP ? { id: summaryLP, field: 'losses' } : null,
                  summarySV ? { id: summarySV, field: 'saves' }  : null,
                ].filter(Boolean)
                for (const { id, field } of saves) {
                  const found = await gameStatsApi.listByGame(gameState.currentGameId, id)
                  const cur = found.data?.[0]
                  await upsertPlayerStat(id, { pitching: { [field]: safeNumber(cur?.pitching?.[field]) + 1 } })
                }
                setSummaryWP(''); setSummaryLP(''); setSummarySV('')
                setShowGameSummary(false)
                onEndGame?.()
              }}>
                Ver Estatísticas
              </Button>
            </div>
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
              <Button type="button" variant="secondary" onClick={() => setPendingDoublePlaySelect(false)}>
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

      {pendingSubstitution && (
        <ConfirmModal
          message={`${pendingSubstitution.player?.name || 'Jogador'} entra${pendingSubstitution.targetPosition ? ` em ${pendingSubstitution.targetPosition}` : ''} e ${pendingSubstitution.replaced?.name || 'jogador'} vai para o banco.`}
          detail={pendingSubstitution.isRecommended !== undefined ? (
            <div className={`sub-recommendation ${pendingSubstitution.isRecommended ? 'sub-recommendation--yes' : 'sub-recommendation--no'}`}>
              {pendingSubstitution.isRecommended ? '★ Posição recomendada para este jogador' : '⚠ Fora da posição preferida deste jogador'}
            </div>
          ) : null}
          confirmLabel="Confirmar substituição"
          onConfirm={() => {
            pendingSubstitution.execute()
            setPendingSubstitution(null)
          }}
          onCancel={() => setPendingSubstitution(null)}
        />
      )}

      {pendingOutTypeSelect && (
        <Modal title="Tipo de out" onClose={() => setPendingOutTypeSelect(false)}>
          <div className="player-stats-block">
            <div className="detail-actions" style={{ flexWrap: 'wrap', marginBottom: '12px' }}>
              {[
                ['flyout', 'FO (Fly Out)'],
                ['groundout', 'GO (Ground Out)'],
                ['lineout', 'LO (Line Out)'],
                ['strikeout', 'K (Strikeout)'],
              ].map(([type, label]) => (
                <Button
                  key={type}
                  type="button"
                  variant={selectedOutType === type ? 'primary' : 'secondary'}
                  onClick={() => setSelectedOutType(type)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {selectedOutType && selectedOutType !== 'strikeout' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px' }}>Fielder (opcional)</label>
                <select
                  value={selectedOutFielderId}
                  onChange={(ev) => setSelectedOutFielderId(ev.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">-- nenhum --</option>
                  {errorDefenderOptions.map((opt) => (
                    <option key={`out-fielder-${opt.id}`} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="detail-actions">
              <Button type="button" variant="secondary" onClick={() => setPendingOutTypeSelect(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!selectedOutType}
                onClick={() => {
                  applyDefensiveOutEvent(selectedOutType, selectedOutFielderId)
                  setPendingOutTypeSelect(false)
                }}
              >
                Confirmar out
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
              <Button type="button" variant="secondary" onClick={() => setPendingDefenseError(false)}>
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

      {dragPreview && dragSource === 'bench' && (
        <div
          className="player-marker team-defense-marker bench-drag-ball"
          style={{ left: `${dragPreview.x}px`, top: `${dragPreview.y}px` }}
        >
          <span>{dragPreview.label}</span>
          {dragPreview.playerName && (
            <div className="bench-drag-name">{dragPreview.playerName} #{dragPreview.playerNumber}</div>
          )}
        </div>
      )}
      {dragPreview && dragSource !== 'bench' && (
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
