import { useCallback, useEffect, useState } from 'react'
import FieldPage from './pages/FieldPage'
import TrainingField from './pages/TrainingField'
import StatsPage from './pages/StatsPage'
import api, { gameStatsApi, gamesApi } from './services/api'
import { VALID_POSITIONS } from './data/positions'
import './App.css'

const TOOLS = [
  { id: 'pointer', label: 'Ponteiro' },
  { id: 'pen', label: 'Caneta' },
  { id: 'mouse', label: 'Mouse' },
]

const GAME_STATE_STORAGE_KEY = 'baseball_game_state_v2'

const INITIAL_GAME_STATE = {
  inning: 1,
  inningHalf: 'top',
  outs: 0,
  balls: 0,
  strikes: 0,
  pitchCount: 0,
  homeScore: 0,
  awayScore: 0,
  isAttacking: true,
  score: { home: 0, away: 0 },
  onFieldPlayerIds: [],
  participantPlayerIds: [],
  battingOrder: [],
  lineup: [],
  bench: [],
  currentBatterIndex: 0,
  runners: { first: false, second: false, third: false },
  currentPitcherId: null,
  currentGameId: null,
  preGameConfigured: false,
}

function getPlayerId(player) {
  return player?._id || player?.id
}

function normalizePlayer(player) {
  const rawPositions = Array.isArray(player?.positions)
    ? player.positions
    : player?.position
      ? [player.position]
      : []

  const positions = rawPositions
    .map((item) => String(item || '').trim().toUpperCase())
    .filter((item) => VALID_POSITIONS.includes(item))

  const safePositions = positions.length ? positions : ['DH']
  const activePosition = safePositions.includes(player?.activePosition)
    ? player.activePosition
    : safePositions[0]

  return {
    ...player,
    positions: safePositions,
    activePosition,
    x: Number.isFinite(player?.x) ? player.x : 50,
    y: Number.isFinite(player?.y) ? player.y : 50,
  }
}

function getSavedGameState() {
  try {
    const raw = window.localStorage.getItem(GAME_STATE_STORAGE_KEY)
    if (!raw) return INITIAL_GAME_STATE

    const parsed = JSON.parse(raw)
    return {
      ...INITIAL_GAME_STATE,
      ...parsed,
      homeScore: Number.isFinite(parsed?.homeScore)
        ? parsed.homeScore
        : Number.isFinite(parsed?.score?.home)
          ? parsed.score.home
          : 0,
      awayScore: Number.isFinite(parsed?.awayScore)
        ? parsed.awayScore
        : Number.isFinite(parsed?.score?.away)
          ? parsed.score.away
          : 0,
      score: { ...INITIAL_GAME_STATE.score, ...(parsed?.score || {}) },
      runners: { ...INITIAL_GAME_STATE.runners, ...(parsed?.runners || {}) },
      onFieldPlayerIds: Array.isArray(parsed?.onFieldPlayerIds) ? parsed.onFieldPlayerIds : [],
      participantPlayerIds: Array.isArray(parsed?.participantPlayerIds)
        ? parsed.participantPlayerIds
        : [],
      battingOrder: Array.isArray(parsed?.battingOrder) ? parsed.battingOrder : [],
      lineup: Array.isArray(parsed?.lineup) ? parsed.lineup : [],
      bench: Array.isArray(parsed?.bench) ? parsed.bench : [],
      currentBatterIndex: Number.isFinite(parsed?.currentBatterIndex) ? parsed.currentBatterIndex : 0,
      inningHalf: parsed?.inningHalf === 'bottom' ? 'bottom' : 'top',
      isAttacking: typeof parsed?.isAttacking === 'boolean' ? parsed.isAttacking : true,
      preGameConfigured: Boolean(parsed?.preGameConfigured),
    }
  } catch {
    return INITIAL_GAME_STATE
  }
}

function advanceOnWalk(runners) {
  const next = { ...(runners || { first: false, second: false, third: false }) }
  let runs = 0

  if (!next.first) {
    next.first = true
    return { runners: next, runs }
  }

  if (next.second && next.third) {
    runs += 1
  }

  next.third = next.second ? true : next.third
  next.second = true
  next.first = true

  return { runners: next, runs }
}

async function upsertPitcherStatRecord({ gameId, pitcherId, current, patch }) {
  const payload = {
    type: 'pitcher',
    hitting: {
      atBats: Number(current?.hitting?.atBats || 0),
      hits: Number(current?.hitting?.hits || 0),
      strikeouts: Number(current?.hitting?.strikeouts || 0),
      outs: Number(current?.hitting?.outs || 0),
    },
    pitching: {
      inningsPitched: Number((patch?.inningsPitched ?? current?.pitching?.inningsPitched) || 0),
      outsPitched: Number((patch?.outsPitched ?? current?.pitching?.outsPitched) || 0),
      earnedRuns: Number((patch?.earnedRuns ?? current?.pitching?.earnedRuns) || 0),
      strikeouts: Number((patch?.strikeouts ?? current?.pitching?.strikeouts) || 0),
      walks: Number((patch?.walks ?? current?.pitching?.walks) || 0),
      strikes: Number((patch?.strikes ?? current?.pitching?.strikes) || 0),
      balls: Number((patch?.balls ?? current?.pitching?.balls) || 0),
      pitchCount: Number((patch?.pitchCount ?? current?.pitching?.pitchCount) || 0),
    },
    defense: {
      errors: Number(current?.defense?.errors || 0),
      doublePlays: Number(current?.defense?.doublePlays || 0),
      flyOuts: Number(current?.defense?.flyOuts || 0),
      groundOuts: Number(current?.defense?.groundOuts || 0),
      lineOuts: Number(current?.defense?.lineOuts || 0),
    },
  }

  if (current?._id) {
    await gameStatsApi.update(current._id, payload)
  } else {
    await gameStatsApi.create({ gameId, playerId: pitcherId, ...payload })
  }
}

function App() {
  const [page, setPage] = useState('stats')
  const [activeTool, setActiveTool] = useState('mouse')
  const [clearDrawVersion, setClearDrawVersion] = useState(0)
  const [players, setPlayers] = useState([])
  const [gameState, setGameState] = useState(getSavedGameState)
  const [activeGame, setActiveGame] = useState(null)
  const [gameAccessNotice, setGameAccessNotice] = useState('')
  const [isClosingGame, setIsClosingGame] = useState(false)
  const [isGameEntering, setIsGameEntering] = useState(false)
  const [isPortraitOnMobile, setIsPortraitOnMobile] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(GAME_STATE_STORAGE_KEY, JSON.stringify(gameState))
  }, [gameState])

  useEffect(() => {
    const loadData = async () => {
      try {
        const playersResponse = await api.get('/players')

        const fetchedPlayers = playersResponse.data || []
        const normalizedPlayers = fetchedPlayers.map((player) => normalizePlayer(player))
        const ids = normalizedPlayers.map((item) => getPlayerId(item))

        setPlayers(normalizedPlayers)
        setGameState((current) => {
          const validOnField = (current.onFieldPlayerIds || []).filter((id) => ids.includes(id))
          const validParticipants = (current.participantPlayerIds || []).filter((id) => ids.includes(id))
          const safeParticipants = validParticipants.length ? validParticipants : ids
          const validBattingOrder = (current.battingOrder || []).filter((id) => safeParticipants.includes(id))
          const battingOrder = validBattingOrder.length ? validBattingOrder : safeParticipants
          const currentBatterIndex = battingOrder.length
            ? Math.min(current.currentBatterIndex || 0, battingOrder.length - 1)
            : 0

          return {
            ...current,
            onFieldPlayerIds: validOnField,
            participantPlayerIds: safeParticipants,
            battingOrder,
            lineup: (current.lineup || []).filter((item) => ids.includes(item?.playerId)),
            bench: (current.bench || []).filter((id) => ids.includes(id)),
            currentBatterIndex,
          }
        })
      } catch {
        setPlayers([])
        setGameState((current) => ({
          ...current,
          onFieldPlayerIds: [],
          participantPlayerIds: [],
        }))
      }
    }

    loadData()
  }, [])

  useEffect(() => {
    const isTouchDevice = () => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
    const mq = window.matchMedia('(orientation: portrait)')
    const checkOrientation = () => {
      const smallScreen = window.innerWidth <= 1024
      const isPortrait = mq.matches
      setIsPortraitOnMobile(isTouchDevice() && smallScreen && isPortrait)
    }

    checkOrientation()

    const handler = () => checkOrientation()
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else if (mq.addListener) mq.addListener(handler)
    window.addEventListener('resize', handler)

    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else if (mq.removeListener) mq.removeListener(handler)
      window.removeEventListener('resize', handler)
    }
  }, [])

  // Keyboard shortcuts for training mode:
  // 1 = ponteiro, 2 = caneta, 3 = mouse, C = limpar desenhos
  useEffect(() => {
    const onKeyDown = (e) => {
      // ignore when typing in inputs or contenteditable
      const tag = e.target && e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
      if (page !== 'training') return

      if (e.key === '1') {
        setActiveTool('pointer')
      } else if (e.key === '2') {
        setActiveTool('pen')
      } else if (e.key === '3') {
        setActiveTool('mouse')
      } else if (e.key.toLowerCase() === 'c') {
        setClearDrawVersion((current) => current + 1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [page])

  useEffect(() => {
    if (gameState.isAttacking) {
      if (gameState.currentPitcherId) {
        const timer = window.setTimeout(() => {
          setGameState((current) => ({ ...current, currentPitcherId: null }))
        }, 0)
        return () => window.clearTimeout(timer)
      }
      return undefined
    }

    const onFieldPitchers = players.filter((player) =>
      (gameState.onFieldPlayerIds || []).includes(getPlayerId(player))
      && player.activePosition === 'P',
    )

    const selectedStillValid = onFieldPitchers.some(
      (player) => getPlayerId(player) === gameState.currentPitcherId,
    )

    const nextPitcherId = selectedStillValid
      ? gameState.currentPitcherId
      : onFieldPitchers[0]
        ? getPlayerId(onFieldPitchers[0])
        : null

    if (nextPitcherId !== gameState.currentPitcherId) {
      const timer = window.setTimeout(() => {
        setGameState((current) => ({ ...current, currentPitcherId: nextPitcherId }))
      }, 0)
      return () => window.clearTimeout(timer)
    }

    return undefined
  }, [players, gameState.isAttacking, gameState.onFieldPlayerIds, gameState.currentPitcherId])

  useEffect(() => {
    const gameId = gameState.currentGameId
    if (!gameId) {
      const timer = window.setTimeout(() => setActiveGame(null), 0)
      return () => window.clearTimeout(timer)
    }

    const loadGameSetup = async () => {
      try {
        const response = await gamesApi.getById(gameId)
        const game = response.data
        setActiveGame(game)
        const lineup = Array.isArray(game?.lineup) ? game.lineup : []
        const battingOrder = Array.isArray(game?.battingOrder) ? game.battingOrder : []
        const bench = Array.isArray(game?.bench) ? game.bench : []
        const persistedState = game?.gameState || {}

        const hasSetup = lineup.length === 9 && battingOrder.length === 9

        if (hasSetup) {
          const lineupByPlayer = {}
          for (const item of lineup) {
            lineupByPlayer[item.playerId] = item.position
          }

          setPlayers((current) =>
            current.map((player) => {
              const id = getPlayerId(player)
              const position = lineupByPlayer[id]
              if (!position) return player
              const next = normalizePlayer({ ...player, activePosition: position })
              return next
            }),
          )

          setGameState((current) => ({
            ...current,
            isAttacking: typeof game?.isAttacking === 'boolean' ? game.isAttacking : current.isAttacking,
            inning: Number.isFinite(persistedState?.inning) ? persistedState.inning : current.inning,
            inningHalf: persistedState?.inningHalf === 'bottom' ? 'bottom' : current.inningHalf,
            outs: Number.isFinite(persistedState?.outs) ? persistedState.outs : current.outs,
            balls: Number.isFinite(persistedState?.balls) ? persistedState.balls : current.balls,
            strikes: Number.isFinite(persistedState?.strikes) ? persistedState.strikes : current.strikes,
            pitchCount: Number.isFinite(persistedState?.pitchCount) ? persistedState.pitchCount : current.pitchCount,
            homeScore: Number.isFinite(persistedState?.homeScore) ? persistedState.homeScore : current.homeScore,
            awayScore: Number.isFinite(persistedState?.awayScore) ? persistedState.awayScore : current.awayScore,
            battingOrder,
            lineup,
            bench,
            onFieldPlayerIds: lineup.map((item) => item.playerId),
            participantPlayerIds: [...new Set([...lineup.map((item) => item.playerId), ...bench])],
            currentBatterIndex: Math.min(current.currentBatterIndex || 0, Math.max(0, battingOrder.length - 1)),
            preGameConfigured: true,
          }))
        } else {
          setGameState((current) => ({
            ...current,
            inning: Number.isFinite(persistedState?.inning) ? persistedState.inning : current.inning,
            inningHalf: persistedState?.inningHalf === 'bottom' ? 'bottom' : current.inningHalf,
            outs: Number.isFinite(persistedState?.outs) ? persistedState.outs : current.outs,
            balls: Number.isFinite(persistedState?.balls) ? persistedState.balls : current.balls,
            strikes: Number.isFinite(persistedState?.strikes) ? persistedState.strikes : current.strikes,
            pitchCount: Number.isFinite(persistedState?.pitchCount) ? persistedState.pitchCount : current.pitchCount,
            homeScore: Number.isFinite(persistedState?.homeScore) ? persistedState.homeScore : current.homeScore,
            awayScore: Number.isFinite(persistedState?.awayScore) ? persistedState.awayScore : current.awayScore,
            lineup: [],
            bench: [],
            onFieldPlayerIds: [],
            battingOrder: [],
            currentPitcherId: null,
            preGameConfigured: false,
          }))
        }
      } catch {
        setActiveGame(null)
        setGameState((current) => ({
          ...current,
          lineup: [],
          bench: [],
          onFieldPlayerIds: [],
          battingOrder: [],
          currentPitcherId: null,
          preGameConfigured: false,
        }))
      }
    }

    loadGameSetup()
  }, [gameState.currentGameId])

  useEffect(() => {
    if (!gameState.currentGameId || !activeGame) return

    const timer = window.setTimeout(() => {
      gamesApi.update(gameState.currentGameId, {
        gameState: {
          inning: gameState.inning,
          inningHalf: gameState.inningHalf,
          outs: gameState.outs,
          balls: gameState.balls,
          strikes: gameState.strikes,
          pitchCount: gameState.pitchCount,
          homeScore: gameState.homeScore,
          awayScore: gameState.awayScore,
          isAttacking: gameState.isAttacking,
          onFieldPlayerIds: gameState.onFieldPlayerIds,
          participantPlayerIds: gameState.participantPlayerIds,
          currentBatterIndex: gameState.currentBatterIndex,
          currentPitcherId: gameState.currentPitcherId,
          runners: gameState.runners,
          preGameConfigured: gameState.preGameConfigured,
        },
      }).catch(() => {})
    }, 250)

    return () => window.clearTimeout(timer)
  }, [activeGame, gameState])

  const handleAddPlayer = async (newPlayer) => {
    try {
      const response = await api.post('/players', newPlayer)
      const saved = response.data

      setPlayers((current) => [...current, normalizePlayer({ ...saved, x: 50, y: 50 })])
      setGameState((current) => {
        const newId = getPlayerId(saved)
        const participantPlayerIds = [...new Set([...(current.participantPlayerIds || []), newId])]
        const battingOrder = [...new Set([...(current.battingOrder || []), ...participantPlayerIds])]
        return {
          ...current,
          participantPlayerIds,
          battingOrder,
        }
      })
    } catch {
      const fallbackId = `fallback-${Date.now()}`
      const fallbackPlayer = normalizePlayer({ ...newPlayer, id: fallbackId, x: 50, y: 50 })
      setPlayers((current) => [...current, fallbackPlayer])
      setGameState((current) => ({
        ...current,
        participantPlayerIds: [...new Set([...(current.participantPlayerIds || []), fallbackId])],
        battingOrder: [...new Set([...(current.battingOrder || []), fallbackId])],
      }))
    }
  }

  const handleUpdatePlayer = async (playerId, patch) => {
    try {
      const response = await api.put(`/players/${playerId}`, patch)
      const saved = normalizePlayer(response.data)
      setPlayers((current) =>
        current.map((player) => (getPlayerId(player) === playerId ? { ...player, ...saved } : player)),
      )
    } catch {
      setPlayers((current) =>
        current.map((player) => {
          if (getPlayerId(player) !== playerId) return player
          return normalizePlayer({
            ...player,
            ...patch,
          })
        }),
      )
    }
  }

  const handleDeletePlayer = async (playerId) => {
    if (!playerId) return

    try {
      await api.delete(`/players/${playerId}`)
    } catch {
      // Mantem remocao local mesmo se backend indisponivel.
    }

    setPlayers((current) => current.filter((player) => getPlayerId(player) !== playerId))

    setGameState((current) => {
      const participantPlayerIds = (current.participantPlayerIds || []).filter((id) => id !== playerId)
      const onFieldPlayerIds = (current.onFieldPlayerIds || []).filter((id) => id !== playerId)
      const battingOrder = (current.battingOrder || []).filter((id) => id !== playerId)
      const lineup = (current.lineup || []).filter((item) => item.playerId !== playerId)
      const bench = (current.bench || []).filter((id) => id !== playerId)
      const currentBatterIndex = battingOrder.length
        ? Math.min(Number(current.currentBatterIndex || 0), battingOrder.length - 1)
        : 0

      return {
        ...current,
        participantPlayerIds,
        onFieldPlayerIds,
        battingOrder,
        lineup,
        bench,
        currentBatterIndex,
        currentPitcherId: current.currentPitcherId === playerId ? null : current.currentPitcherId,
      }
    })
  }

  const handleDeleteGame = async (gameId) => {
    if (!gameId) return

    try {
      await gamesApi.remove(gameId)
    } catch {
      // Mantem fluxo local mesmo se backend indisponivel.
    }

    if (gameState.currentGameId !== gameId) return

    setActiveGame(null)
    setGameAccessNotice('')
    setPage('stats')
    setGameState((current) => ({
      ...current,
      currentGameId: null,
      inning: 1,
      inningHalf: 'top',
      outs: 0,
      balls: 0,
      strikes: 0,
      pitchCount: 0,
      homeScore: 0,
      awayScore: 0,
      isAttacking: true,
      lineup: [],
      bench: [],
      onFieldPlayerIds: [],
      battingOrder: [],
      currentPitcherId: null,
      preGameConfigured: false,
      currentBatterIndex: 0,
      runners: { first: false, second: false, third: false },
    }))
  }

  const updateGameState = useCallback((updater) => {
    setGameState((current) => {
      const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater }
      return next
    })
  }, [])

  const syncPitchToPitcher = useCallback(async (kind, flags = {}) => {
    if (gameState.isAttacking) return

    const pitcher = players.find((player) => getPlayerId(player) === gameState.currentPitcherId)

    if (!pitcher || !gameState.currentGameId) return

    const pitcherId = getPlayerId(pitcher)
    const found = await gameStatsApi.listByGame(gameState.currentGameId, pitcherId)
    const current = found.data?.[0]

    const pitching = {
      inningsPitched: Number(current?.pitching?.inningsPitched || 0),
      outsPitched: Number(current?.pitching?.outsPitched || 0),
      earnedRuns: Number(current?.pitching?.earnedRuns || 0),
      strikeouts: Number(current?.pitching?.strikeouts || 0),
      walks: Number(current?.pitching?.walks || 0),
      strikes: Number(current?.pitching?.strikes || 0),
      balls: Number(current?.pitching?.balls || 0),
      pitchCount: Number(current?.pitching?.pitchCount || 0),
    }

    if (kind === 'strike') pitching.strikes += 1
    if (kind === 'foul' && flags.countAsStrike) pitching.strikes += 1
    if (kind === 'ball') pitching.balls += 1
    if (flags.didStrikeout) pitching.strikeouts += 1
    if (flags.didWalk) pitching.walks += 1
    if (Number(flags.outsDelta || 0) > 0) {
      pitching.outsPitched += Number(flags.outsDelta)
      pitching.inningsPitched = Math.floor(pitching.outsPitched / 3) + ((pitching.outsPitched % 3) / 10)
    }
    if (Number(flags.earnedRunsDelta || 0) > 0) {
      pitching.earnedRuns += Number(flags.earnedRunsDelta)
    }
    pitching.pitchCount += 1

    await upsertPitcherStatRecord({
      gameId: gameState.currentGameId,
      pitcherId,
      current,
      patch: pitching,
    })
  }, [gameState.currentGameId, gameState.currentPitcherId, gameState.isAttacking, players])

  const updatePitcherDefenseContribution = useCallback(async ({ outsDelta = 0, earnedRunsDelta = 0 }) => {
    if (gameState.isAttacking) return

    const pitcherId = gameState.currentPitcherId
    if (!gameState.currentGameId || !pitcherId) return

    const found = await gameStatsApi.listByGame(gameState.currentGameId, pitcherId)
    const current = found.data?.[0]
    const nextOutsPitched = Number(current?.pitching?.outsPitched || 0) + Number(outsDelta || 0)
    const patch = {
      outsPitched: nextOutsPitched,
      inningsPitched: Math.floor(nextOutsPitched / 3) + ((nextOutsPitched % 3) / 10),
      earnedRuns: Number(current?.pitching?.earnedRuns || 0) + Number(earnedRunsDelta || 0),
    }

    await upsertPitcherStatRecord({ gameId: gameState.currentGameId, pitcherId, current, patch })
  }, [gameState.currentGameId, gameState.currentPitcherId, gameState.isAttacking])

  const handlePitchAction = useCallback(async (kind) => {
    const current = gameState
    if (current.isAttacking) return

    const beforeStrikes = Number(current.strikes || 0)
    const beforeBalls = Number(current.balls || 0)
    const countAsStrike = kind === 'strike' || (kind === 'foul' && beforeStrikes < 2)
    const nextStrikesRaw = kind === 'strike'
      ? beforeStrikes + 1
      : kind === 'foul'
        ? Math.min(2, beforeStrikes + 1)
        : beforeStrikes
    const nextBallsRaw = kind === 'ball' ? beforeBalls + 1 : beforeBalls

    const didStrikeout = nextStrikesRaw >= 3
    const didWalk = !didStrikeout && nextBallsRaw >= 4

    updateGameState((state) => {
      let nextOuts = Number(state.outs || 0)
      let nextInning = Number(state.inning || 1)
      let nextHalf = state.inningHalf || 'top'
      let nextIsAttacking = state.isAttacking
      let nextRunners = { ...(state.runners || { first: false, second: false, third: false }) }
      let scoredRuns = 0
      const order = state.battingOrder || []
      const shouldAdvanceBatter = state.isAttacking && order.length > 0 && (didStrikeout || didWalk)
      const currentBatterIndex = Math.min(Number(state.currentBatterIndex || 0), Math.max(0, order.length - 1))
      const nextBatterIndex = shouldAdvanceBatter
        ? (currentBatterIndex + 1) % order.length
        : Number(state.currentBatterIndex || 0)

      if (didStrikeout) {
        nextOuts += 1

        if (nextOuts >= 3) {
          nextOuts = 0
          nextIsAttacking = true
          nextHalf = state.inningHalf === 'top' ? 'bottom' : 'top'
          if (state.inningHalf === 'bottom') nextInning = Math.max(1, nextInning + 1)
          nextRunners = { first: false, second: false, third: false }
        }
      }

      if (didWalk) {
        const walkResult = advanceOnWalk(nextRunners)
        nextRunners = walkResult.runners
        scoredRuns = walkResult.runs
      }

      return {
        ...state,
        pitchCount: Number(state.pitchCount || 0) + 1,
        strikes: didStrikeout || didWalk ? 0 : nextStrikesRaw,
        balls: didStrikeout || didWalk ? 0 : nextBallsRaw,
        currentBatterIndex: nextBatterIndex,
        outs: nextOuts,
        inning: nextInning,
        inningHalf: nextHalf,
        isAttacking: nextIsAttacking,
        runners: nextRunners,
        homeScore: Number(state.homeScore || 0) + (state.isAttacking ? scoredRuns : 0),
        awayScore: Number(state.awayScore || 0) + (!state.isAttacking ? scoredRuns : 0),
      }
    }, kind === 'foul' ? 'Foul adicionada' : kind === 'ball' ? 'Ball adicionada' : 'Strike adicionada')

    try {
      await syncPitchToPitcher(kind, {
        didStrikeout,
        didWalk,
        countAsStrike,
        outsDelta: didStrikeout ? 1 : 0,
        earnedRunsDelta: didWalk ? Number((advanceOnWalk({ ...(current.runners || {}) }).runs) || 0) : 0,
      })
    } catch {
      // Mantem jogo local mesmo se backend indisponivel.
    }
  }, [gameState, syncPitchToPitcher, updateGameState])

  const handleEndGame = useCallback(() => {
    const currentGameId = gameState.currentGameId
    if (!currentGameId) return

    setIsClosingGame(true)

    window.setTimeout(async () => {
      try {
        await gamesApi.update(currentGameId, {
          isFinished: true,
          finishedAt: new Date().toISOString(),
        })
      } catch {
        // Segue fluxo local mesmo sem backend.
      }

      setActiveGame(null)
      setGameAccessNotice('')
      setPage('stats')

      updateGameState(
        (current) => ({
          ...current,
          currentGameId: null,
          inning: 1,
          inningHalf: 'top',
          outs: 0,
          balls: 0,
          strikes: 0,
          pitchCount: 0,
          homeScore: 0,
          awayScore: 0,
          isAttacking: true,
          lineup: [],
          bench: [],
          preGameConfigured: false,
          currentBatterIndex: 0,
          runners: { first: false, second: false, third: false },
        }),
        'Jogo encerrado',
      )

      window.setTimeout(() => setIsClosingGame(false), 40)
    }, 260)
  }, [gameState.currentGameId, updateGameState])

  const openGameFromStats = useCallback((game) => {
    if (!game?._id) return

    setActiveGame(game)
    setGameAccessNotice('')
    setGameState((current) => ({
      ...current,
      currentGameId: game._id,
    }))
    setIsGameEntering(true)
    setPage('game')
    window.setTimeout(() => setIsGameEntering(false), 280)
  }, [])

  return (
    <main className={`app-shell ${isClosingGame ? 'app-closing' : ''} ${isGameEntering ? 'app-entering-game' : ''}`}>
      {isPortraitOnMobile && (
        <div className="orientation-lock-overlay" role="dialog" aria-modal="true">
          <div className="orientation-lock-inner">
            <h2>Por favor, gire seu dispositivo</h2>
            <p>Use o modo paisagem (horizontal) para continuar.</p>
            <div className="orientation-icon" aria-hidden>🔁</div>
          </div>
        </div>
      )}
      <header className="top-nav">
        <div className="nav-brand" aria-label="Beisebol CAASO">
          <img className="nav-brand-logo" src="/Ativo 1Cporcotransparente.png" alt="Logo C com porco" />
          <div className="nav-brand-text">
            <h1>Beisebol CAASO</h1>
            <span>RAÇA CAASO</span>
          </div>
        </div>
        <div className="nav-actions">
          <button
            type="button"
            className={page === 'game' ? 'active' : ''}
            disabled={!activeGame}
            onClick={() => {
              if (!activeGame) {
                setGameAccessNotice('Crie ou carregue um jogo primeiro')
                return
              }
              setGameAccessNotice('')
              setPage('game')
            }}
          >
            Modo Jogo
          </button>
          <button
            type="button"
            className={page === 'training' ? 'active' : ''}
            onClick={() => setPage('training')}
          >
            Modo Treino
          </button>
          <button
            type="button"
            className={page === 'stats' ? 'active' : ''}
            onClick={() => {
              setGameAccessNotice('')
              setPage('stats')
            }}
          >
            Estatisticas
          </button>
        </div>
      </header>

      {gameAccessNotice && <div className="game-access-warning">{gameAccessNotice}</div>}

      {page === 'game' ? (
        <FieldPage
          players={players}
          setPlayers={setPlayers}
          activeTool="mouse"
          clearDrawVersion={0}
          gameState={gameState}
          onUpdateGameState={updateGameState}
          onUpdatePlayer={handleUpdatePlayer}
          onPitchAction={handlePitchAction}
          onDefensiveOut={async (count = 1) => {
            try {
              await updatePitcherDefenseContribution({ outsDelta: Number(count || 0), earnedRunsDelta: 0 })
            } catch {
              // Mantem jogo local mesmo sem backend.
            }
          }}
          onDefensiveEarnedRun={async (count = 1) => {
            try {
              await updatePitcherDefenseContribution({ outsDelta: 0, earnedRunsDelta: Number(count || 0) })
            } catch {
              // Mantem jogo local mesmo sem backend.
            }
          }}
          activeGame={activeGame}
          onEndGame={handleEndGame}
        />
      ) : page === 'training' ? (
        <TrainingField activeTool={activeTool} clearDrawVersion={clearDrawVersion} />
      ) : (
        <StatsPage
          players={players}
          onAddPlayer={handleAddPlayer}
          onDeletePlayer={handleDeletePlayer}
          onDeleteGame={handleDeleteGame}
          onOpenGame={openGameFromStats}
          onSelectGame={(game) => {
            if (!game?._id) return
            updateGameState({ currentGameId: game._id }, 'Jogo selecionado na lista')
          }}
          gameState={gameState}
          onUpdateGameState={updateGameState}
          onGoField={() => setPage('game')}
        />
      )}

      {page === 'training' && (
        <aside className="tool-dock" aria-label="Ferramentas do campo">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={activeTool === tool.id ? 'active' : ''}
              onClick={() => setActiveTool(tool.id)}
            >
              {tool.label}
            </button>
          ))}
          <button
            type="button"
            className="clear-btn"
            onClick={() => setClearDrawVersion((current) => current + 1)}
          >
            Limpar desenhos
          </button>
        </aside>
      )}
    </main>
  )
}

export default App
