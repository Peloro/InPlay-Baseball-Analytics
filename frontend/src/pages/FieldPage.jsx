import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import useFieldZoom from '../hooks/useFieldZoom'
import useDragPosition from '../hooks/useDragPosition'
import PlayerStatsModal from '../components/PlayerStatsModal'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
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
import { computeInningTransition } from '../utils/gameState'
import StatLabel from '../components/ui/StatLabel'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { LONG_PRESS_MS, DEFENSIVE_POSITIONS, PITCH_NAMES, INNING_HALF } from '../constants/fieldGame'
import { makeOpponentMarkers, clamp, isInsideRect, makeLogEntry } from '../utils/fieldGame'
import useGameActions from '../hooks/useGameActions'
import GameSummaryModal from '../components/game/GameSummaryModal'
import PreGameSetupModal from '../components/game/PreGameSetupModal'

function haptic(style) { Haptics.impact({ style }).catch(() => {}) }

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
  const [opponentDefense, setOpponentDefense] = useState(makeOpponentMarkers)
  const [showModeConfirmModal, setShowModeConfirmModal] = useState(false)
  const [benchCollapsed, setBenchCollapsed] = useState(false)
  const [runnerBasePopover, setRunnerBasePopover] = useState(null)
  const [pendingSubstitution, setPendingSubstitution] = useState(null)
  const [pendingDefenseError, setPendingDefenseError] = useState(false)
  const [selectedErrorDefenderId, setSelectedErrorDefenderId] = useState('')
  const [pendingOutTypeSelect, setPendingOutTypeSelect] = useState(false)
  const [selectedOutType, setSelectedOutType] = useState('')
  const [selectedOutFielderId, setSelectedOutFielderId] = useState('')
  const [selectedPitchType, setSelectedPitchType] = useState('FB')
  const [pendingDoublePlaySelect, setPendingDoublePlaySelect] = useState(false)
  const [selectedDoublePlayRunnerBase, setSelectedDoublePlayRunnerBase] = useState('')
  const [selectedDoublePlayDefenderIds, setSelectedDoublePlayDefenderIds] = useState([])
  const [confirmChangePitcherAdv, setConfirmChangePitcherAdv] = useState(false)
  const [pendingEndGame, setPendingEndGame] = useState(false)
  const [pendingRemoveRunner, setPendingRemoveRunner] = useState(null)
  const [pendingSwap, setPendingSwap] = useState(null)
  const [pendingAutoEnd, setPendingAutoEnd] = useState(null)
  const [showGameSummary, setShowGameSummary] = useState(false)
  const [gameSummarySnapshot, setGameSummarySnapshot] = useState(null)
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
    const timer = window.setTimeout(() => setShowPreGameSetup(true), 0)
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

  const onPreGameConfirm = async ({ starters, battingOrder, isAttacking, pregameForm }) => {
    const starterIds = starters.map((item) => item.playerId)
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
      isAttacking,
      lineup: starters,
      bench,
      battingOrder,
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
      try {
        const response = await gamesApi.create({
          date: pregameForm.date,
          opponent: pregameForm.opponentName.trim(),
          opponentName: pregameForm.opponentName.trim(),
          competition: pregameForm.competition.trim(),
          location: pregameForm.location.trim(),
          lineup: starters,
          battingOrder,
          bench,
          isAttacking,
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
        await gamesApi.update(targetGameId, { isAttacking, battingOrder, lineup: starters, bench })
      } catch {
        // Mantem setup local mesmo sem backend.
      }
    }

    setShowPreGameSetup(false)
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

    // Capture runner ID before state update so we can credit SB
    const runnerId = typeof gameState.runners?.[base] === 'string' ? gameState.runners[base] : null

    onUpdateGameState((current) => {
      if (!current.runners?.[base]) return current

      const nextRunners = { ...current.runners, [base]: false }
      const nextBase = order[index + 1]
      const runs = nextBase ? 0 : 1

      if (nextBase) {
        nextRunners[nextBase] = current.runners[base]  // preserve player ID
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

    // Credit stolen base when attacking and runner ID is known
    if (gameState.isAttacking && runnerId && gameState.currentGameId) {
      const found = gameStatsApi.listByGame(gameState.currentGameId, runnerId)
      const cur = found.data?.[0]
      if (cur) {
        gameStatsApi.upsert(gameState.currentGameId, runnerId, {
          ...cur,
          hitting: { ...(cur.hitting || {}), stolenBases: safeNumber(cur.hitting?.stolenBases) + 1 },
        })
      }
    }

    if (!gameState.isAttacking && base === 'third' && gameState.runners?.third) {
      onDefensiveEarnedRun?.(1)
    }
  }, [gameState.isAttacking, gameState.runners, gameState.currentGameId, onDefensiveEarnedRun, onUpdateGameState])

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

  const {
    undoStack,
    invalidFeedback,
    showInvalidAction,
    captureUndoSnapshot,
    upsertPlayerStat,
    handleUndo,
    handleDefensivePitch,
    handlePitcherSelect,
    applyPlateAppearance,
    applyDefensiveHit,
    applyAttackCountAction,
    applyDefensiveOutEvent,
    applyDoublePlayWithRunner: _applyDoublePlayWithRunner,
    applySacFly,
    applyHBP,
    applyErrorEvent: _applyErrorEvent,
  } = useGameActions({
    gameState,
    onUpdateGameState,
    players,
    setPlayers,
    playersById,
    onPitchAction,
    onStatsUpdated,
    setAnimatedBall,
    selectedPitchType,
  })

  const applyDoublePlayWithRunner = async (runnerBase, defenderIds = []) => {
    await _applyDoublePlayWithRunner(runnerBase, defenderIds)
    setPendingDoublePlaySelect(false)
    setSelectedDoublePlayRunnerBase('')
    setSelectedDoublePlayDefenderIds([])
  }

  const confirmDefensiveError = async () => {
    if (!selectedErrorDefenderId) return
    await _applyErrorEvent(selectedErrorDefenderId)
    setPendingDefenseError(false)
    setSelectedErrorDefenderId('')
  }

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
        collapsed={benchCollapsed}
        onToggleCollapse={() => setBenchCollapsed(c => !c)}
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
                className="hud-mode-toggle-btn"
                onClick={() => setShowModeConfirmModal(true)}
              >
                Trocar
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
                <Select
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
                </Select>
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
                    <Input
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
                    <Input
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
                  <Input
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
                  <Input
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
              <div className="acoes-diamond-wrap">
                <svg viewBox="0 0 100 100" className="acoes-diamond-svg" aria-label="Diamante — toque uma base para gerenciar corredor">
                  <line x1="50" y1="16" x2="84" y2="50" stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="84" y1="50" x2="50" y2="84" stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="50" y1="84" x2="16" y2="50" stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="16" y1="50" x2="50" y2="16" stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round"/>
                  {/* 2ª base (topo) */}
                  <rect x="43" y="9" width="14" height="14" transform="rotate(45 50 16)"
                    fill={gameState.runners?.second ? '#d2a100' : '#1e1e1e'}
                    stroke={runnerBasePopover === 'second' ? '#fff' : (gameState.runners?.second ? '#e8b800' : '#484848')}
                    strokeWidth={runnerBasePopover === 'second' ? '2.5' : '1.5'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setRunnerBasePopover(p => p === 'second' ? null : 'second')}
                  />
                  <text x="50" y="19" textAnchor="middle" fontSize="5" fill={gameState.runners?.second ? '#1b1b1b' : '#666'} style={{ pointerEvents: 'none' }}>2</text>
                  {/* 1ª base (direita) */}
                  <rect x="77" y="43" width="14" height="14" transform="rotate(45 84 50)"
                    fill={gameState.runners?.first ? '#d2a100' : '#1e1e1e'}
                    stroke={runnerBasePopover === 'first' ? '#fff' : (gameState.runners?.first ? '#e8b800' : '#484848')}
                    strokeWidth={runnerBasePopover === 'first' ? '2.5' : '1.5'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setRunnerBasePopover(p => p === 'first' ? null : 'first')}
                  />
                  <text x="84" y="53" textAnchor="middle" fontSize="5" fill={gameState.runners?.first ? '#1b1b1b' : '#666'} style={{ pointerEvents: 'none' }}>1</text>
                  {/* 3ª base (esquerda) */}
                  <rect x="9" y="43" width="14" height="14" transform="rotate(45 16 50)"
                    fill={gameState.runners?.third ? '#d2a100' : '#1e1e1e'}
                    stroke={runnerBasePopover === 'third' ? '#fff' : (gameState.runners?.third ? '#e8b800' : '#484848')}
                    strokeWidth={runnerBasePopover === 'third' ? '2.5' : '1.5'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setRunnerBasePopover(p => p === 'third' ? null : 'third')}
                  />
                  <text x="16" y="53" textAnchor="middle" fontSize="5" fill={gameState.runners?.third ? '#1b1b1b' : '#666'} style={{ pointerEvents: 'none' }}>3</text>
                  <polygon points="44,78 56,78 59,84 50,89 41,84" fill="#1e1e1e" stroke="#484848" strokeWidth="1.5"/>
                </svg>
                <p className="acoes-diamond-hint">Toque uma base</p>
              </div>

              {runnerBasePopover && (
                <div className="runner-popover">
                  <div className="runner-popover-header">
                    {runnerBasePopover === 'first' ? '1ª Base' : runnerBasePopover === 'second' ? '2ª Base' : '3ª Base'}
                    <span className={`runner-popover-status ${gameState.runners?.[runnerBasePopover] ? 'occupied' : ''}`}>
                      {gameState.runners?.[runnerBasePopover] ? 'ocupada' : 'vazia'}
                    </span>
                  </div>
                  <div className="runner-popover-btns">
                    {!gameState.runners?.[runnerBasePopover] ? (
                      <button type="button" className="runner-popover-btn runner-popover-btn--add"
                        onClick={() => {
                          onUpdateGameState((current) => ({ ...current, runners: { ...current.runners, [runnerBasePopover]: true } }), `Corredor em ${runnerBasePopover}`)
                          setRunnerBasePopover(null)
                        }}>
                        + Colocar corredor
                      </button>
                    ) : (
                      <>
                        <button type="button" className="runner-popover-btn runner-popover-btn--advance"
                          onClick={() => { advanceRunner(runnerBasePopover); setRunnerBasePopover(null) }}>
                          Avançar →
                        </button>
                        <button type="button" className="runner-popover-btn runner-popover-btn--out"
                          onClick={() => { setPendingRemoveRunner(runnerBasePopover); setRunnerBasePopover(null) }}>
                          Out ✕
                        </button>
                      </>
                    )}
                    <button type="button" className="runner-popover-btn runner-popover-btn--cancel"
                      onClick={() => setRunnerBasePopover(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {invalidFeedback && <div className="drop-hint">{invalidFeedback}</div>}

            <div className="acoes-end-row">
              <button
                type="button"
                className={`acoes-undo-btn${undoStack.length === 0 ? ' acoes-undo-btn--empty' : ''}`}
                disabled={undoStack.length === 0}
                onClick={() => handleUndo().catch(() => {})}
              >
                ↩ {undoStack.length > 0 && (gameState.gameLog || []).length > 0
                  ? `Desfazer: ${(gameState.gameLog || []).slice(-1)[0].description}`
                  : 'Desfazer'}
              </button>
              <button type="button" className="acoes-end-btn" onClick={() => setPendingEndGame(true)}>Encerrar jogo</button>
            </div>
          </div>

          <div className="acoes-right">
            {/* Persistent status bar */}
            <div className="acoes-status-bar">
              <span className={`acoes-status-mode ${gameState.isAttacking ? 'acoes-status-mode--atk' : 'acoes-status-mode--def'}`}>
                {gameState.isAttacking ? 'ATACANDO' : 'DEFENDENDO'}
              </span>
              <span className="acoes-status-inning">
                {gameState.inningHalf === 'top' ? '▲' : '▼'} {gameState.inning || 1}ª
              </span>
              <span className="acoes-status-count">
                {gameState.balls||0}B · {gameState.strikes||0}S · {gameState.outs||0}O
              </span>
              {gameState.isAttacking && currentBatter && (
                <span className="acoes-status-batter">{currentBatter.name} #{currentBatter.number}</span>
              )}
              {!gameState.isAttacking && gameState.currentPitcherId && playersById[gameState.currentPitcherId] && (
                <span className="acoes-status-batter">{playersById[gameState.currentPitcherId].name} #{playersById[gameState.currentPitcherId].number}</span>
              )}
            </div>

            {/* Pitch type selector (defense only) */}
            {!gameState.isAttacking && (
              <>
                <div className="pitch-type-selector">
                  {activePitchTypes.map(t => (
                    <button
                      key={t}
                      type="button"
                      className={`pitch-type-btn${selectedPitchType === t ? ' active' : ''}`}
                      onClick={() => setSelectedPitchType(t)}
                    >
                      <span className="pitch-type-btn-abbr">{t}</span>
                      {selectedPitchType === t && <span className="pitch-type-btn-name">{PITCH_NAMES[t]}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Count section */}
            <div className="acoes-section-label">Contagem</div>
            <div className="acoes-count-btns">
              {gameState.isAttacking ? (
                <>
                  <button type="button" className="acoes-btn acoes-strike" onClick={() => applyAttackCountAction('strike')}>STRIKE</button>
                  <button type="button" className="acoes-btn acoes-ball" onClick={() => applyAttackCountAction('ball')}>BALL</button>
                  <button type="button" className="acoes-btn acoes-foul" onClick={() => applyAttackCountAction('foul')}>FOUL</button>
                </>
              ) : (
                <>
                  <button type="button" className="acoes-btn acoes-strike" onClick={() => handleDefensivePitch('strike')}>STRIKE</button>
                  <button type="button" className="acoes-btn acoes-ball" onClick={() => handleDefensivePitch('ball')}>BALL</button>
                  <button type="button" className="acoes-btn acoes-foul" onClick={() => handleDefensivePitch('foul')}>FOUL</button>
                </>
              )}
            </div>

            {/* Result section */}
            <div className="acoes-section-label">Resultado</div>
            <div className="acoes-btns-grid">
              {gameState.isAttacking ? (
                <>
                  <button type="button" className="acoes-btn acoes-out" onClick={() => applyPlateAppearance('out')}>OUT</button>
                  <button type="button" className="acoes-btn acoes-1b" onClick={() => applyPlateAppearance('single')}>SIMPLES</button>
                  <button type="button" className="acoes-btn acoes-2b" onClick={() => applyPlateAppearance('double')}>DUPLA</button>
                  <button type="button" className="acoes-btn acoes-3b" onClick={() => applyPlateAppearance('triple')}>TRIPLA</button>
                  <button type="button" className="acoes-btn acoes-hr" onClick={() => applyPlateAppearance('homerun')}>HOME RUN</button>
                  <button type="button" className="acoes-btn acoes-hbp" onClick={applyHBP}>HBP</button>
                  <button type="button" className="acoes-btn acoes-erro" onClick={() => applyErrorEvent('')}>ERRO</button>
                  {(gameState.runners?.first || gameState.runners?.second || gameState.runners?.third) && gameState.outs < 2 && (
                    <button type="button" className="acoes-btn acoes-dp" onClick={handleDoublePlayAction}>D. PLAY</button>
                  )}
                  {gameState.runners?.third && gameState.outs < 2 && (
                    <button type="button" className="acoes-btn acoes-sf" onClick={applySacFly}>SAC FLY</button>
                  )}
                </>
              ) : (
                <>
                  <button type="button" className="acoes-btn acoes-out" onClick={() => { setSelectedOutType(''); setSelectedOutFielderId(''); setPendingOutTypeSelect(true) }}>OUT</button>
                  <button type="button" className="acoes-btn acoes-1b" onClick={() => applyDefensiveHit('single')}>SINGLE</button>
                  <button type="button" className="acoes-btn acoes-2b" onClick={() => applyDefensiveHit('double')}>DOUBLE</button>
                  <button type="button" className="acoes-btn acoes-3b" onClick={() => applyDefensiveHit('triple')}>TRIPLE</button>
                  <button type="button" className="acoes-btn acoes-hr" onClick={() => applyDefensiveHit('homerun')}>HOME RUN</button>
                  <button type="button" className="acoes-btn acoes-hbp" onClick={applyHBP}>HBP</button>
                  <button type="button" className="acoes-btn acoes-erro" onClick={() => { setSelectedErrorDefenderId((current) => current || errorDefenderOptions[0]?.id || ''); setPendingDefenseError(true) }}>ERRO</button>
                  {(gameState.runners?.first || gameState.runners?.second || gameState.runners?.third) && gameState.outs < 2 && (
                    <button type="button" className="acoes-btn acoes-dp" onClick={handleDoublePlayAction}>D. PLAY</button>
                  )}
                  {gameState.runners?.third && gameState.outs < 2 && (
                    <button type="button" className="acoes-btn acoes-sf" onClick={applySacFly}>SAC FLY</button>
                  )}
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

      {/* Always-visible score chip on campo view */}
      {gameSubView === 'campo' && gameState.preGameConfigured && (
        <button type="button" className="score-chip" onClick={() => setShowScoreboard(s => !s)}>
          <span className={`score-chip-mode ${gameState.isAttacking ? 'score-chip-mode--atk' : 'score-chip-mode--def'}`}>
            {gameState.isAttacking ? 'ATK' : 'DEF'}
          </span>
          <span className="score-chip-score">CAASO {gameState.homeScore||0} × {gameState.awayScore||0} {opponentName||'Adv'}</span>
          <span className="score-chip-dot">·</span>
          <span className="score-chip-inning">{gameState.inningHalf==='top'?'▲':'▼'} {gameState.inning||1}ª</span>
          <span className="score-chip-dot">·</span>
          <span className="score-chip-outs">{gameState.outs||0} out</span>
        </button>
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
        <PreGameSetupModal
          gameState={gameState}
          playersById={playersById}
          setupAvailablePlayers={setupAvailablePlayers}
          playerPrefersPosition={playerPrefersPosition}
          getPlayerId={getPlayerId}
          onConfirm={onPreGameConfirm}
          onClose={gameState.currentGameId ? () => setShowPreGameSetup(false) : onCancelPreGame ?? undefined}
        />
      )}

      {showModeConfirmModal && (
        <ConfirmModal
          message={`Trocar para ${gameState.isAttacking ? 'DEFENDENDO' : 'ATACANDO'}?`}
          confirmLabel="Confirmar"
          onConfirm={() => {
            setShowModeConfirmModal(false)
            onUpdateGameState((current) => ({
              ...current, isAttacking: !current.isAttacking, balls: 0, strikes: 0,
            }), 'Modo alternado manualmente')
          }}
          onCancel={() => setShowModeConfirmModal(false)}
        />
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
        <GameSummaryModal
          snapshot={gameSummarySnapshot}
          gameState={gameState}
          players={players}
          upsertPlayerStat={upsertPlayerStat}
          onClose={() => { setShowGameSummary(false); onEndGame?.() }}
        />
      )}

      {pendingDoublePlaySelect && (
        <Modal title="Double Play: corredor eliminado" onClose={() => setPendingDoublePlaySelect(false)}>
          <div className="player-stats-block">
            <Select
              value={selectedDoublePlayRunnerBase}
              onChange={(event) => setSelectedDoublePlayRunnerBase(event.target.value)}
            >
              <option value="">Selecionar base</option>
              {doublePlayRunnerOptions.map((base) => (
                <option key={`dp-base-${base}`} value={base}>
                  {base.toUpperCase()}
                </option>
              ))}
            </Select>

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
                <Select
                  value={selectedOutFielderId}
                  onChange={(ev) => setSelectedOutFielderId(ev.target.value)}
                >
                  <option value="">-- nenhum --</option>
                  {errorDefenderOptions.map((opt) => (
                    <option key={`out-fielder-${opt.id}`} value={opt.id}>{opt.label}</option>
                  ))}
                </Select>
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
            <Select
              value={selectedErrorDefenderId}
              onChange={(event) => setSelectedErrorDefenderId(event.target.value)}
            >
              <option value="">Selecionar jogador</option>
              {errorDefenderOptions.map((option) => (
                <option key={`error-option-${option.id}`} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
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
            <Input
              placeholder="Nome"
              value={editForm.name}
              onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
            />
            <Input
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

            <Select
              value={editForm.activePosition}
              onChange={(event) => setEditForm((current) => ({ ...current, activePosition: event.target.value }))}
            >
              {editForm.positions.map((position) => (
                <option key={`edit-active-${position}`} value={position}>
                  Titular: {position}
                </option>
              ))}
            </Select>

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
