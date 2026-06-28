import { useCallback, useEffect, useState, lazy, Suspense } from 'react'
import StatsPage from './pages/StatsPage'

const FieldPage = lazy(() => import('./pages/FieldPage'))
const TrainingField = lazy(() => import('./pages/TrainingField'))
const JogadoresPage = lazy(() => import('./pages/JogadoresPage'))
import api, { gameStatsApi, gamesApi, syncWithServer, getSyncStatus, getAuth, logout } from './services/api'
import LoginPage from './pages/LoginPage'
import SettingsPage from './pages/SettingsPage'
import AdminPage from './pages/AdminPage'
import { addInningRuns } from './utils/stats'
import { VALID_POSITIONS } from './data/positions'
import './App.css'
import Button from './components/ui/Button'
import { getPlayerId } from './utils/player'

const GAME_STATE_STORAGE_KEY = 'baseball_game_state_v2'

function decodeRole(auth) {
  try {
    if (!auth?.token) return null
    return JSON.parse(atob(auth.token.split('.')[1])).role || null
  } catch {
    return null
  }
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

const INITIAL_GAME_STATE = {
  inning: 1,
  inningHalf: 'top',
  outs: 0,
  balls: 0,
  strikes: 0,
  pitchCount: 0,
  ourPitchCount: 0,
  opponentPitchCount: 0,
  pitchCounts: {},
  homeScore: 0,
  awayScore: 0,
  inningScores: { home: [], away: [] },
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
  gameLog: [],
  substitutions: [],
  currentOpponentBatter: { number: '', name: '' },
  opposingBatters: {},
  opponentLineup: [],
  opponentLineupIndex: 0,
  opposingPitcher: { number: '', name: '' },
  maxInnings: 0,
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
    pitchCountLimit: Number.isFinite(player?.pitchCountLimit) ? player.pitchCountLimit : null,
    x: Number.isFinite(player?.x) ? player.x : 50,
    y: Number.isFinite(player?.y) ? player.y : 50,
  }
}

function getSavedGameState() {
  try {
    const raw = window.localStorage.getItem(GAME_STATE_STORAGE_KEY)
    if (!raw) return INITIAL_GAME_STATE

    const parsed = JSON.parse(raw)

    // No active game → discard any stale progress fields entirely
    if (!parsed?.currentGameId) return INITIAL_GAME_STATE

    return {
      ...INITIAL_GAME_STATE,
      ...parsed,
      // migrate legacy `pitchCount` to `ourPitchCount` when needed
      ourPitchCount: Number.isFinite(parsed?.ourPitchCount)
        ? parsed.ourPitchCount
        : Number.isFinite(parsed?.pitchCount)
          ? parsed.pitchCount
          : 0,
      opponentPitchCount: Number.isFinite(parsed?.opponentPitchCount) ? parsed.opponentPitchCount : 0,
      pitchCounts: parsed?.pitchCounts || {},
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
      inningScores: parsed?.inningScores || { home: [], away: [] },
      score: { ...INITIAL_GAME_STATE.score, ...(parsed?.score || {}) },
      runners: { ...INITIAL_GAME_STATE.runners, ...(parsed?.runners || {}) },
      onFieldPlayerIds: Array.isArray(parsed?.onFieldPlayerIds) ? parsed.onFieldPlayerIds : [],
      participantPlayerIds: Array.isArray(parsed?.participantPlayerIds) ?
        parsed.participantPlayerIds
        : [],
      battingOrder: Array.isArray(parsed?.battingOrder) ? parsed.battingOrder : [],
      lineup: Array.isArray(parsed?.lineup) ? parsed.lineup : [],
      bench: Array.isArray(parsed?.bench) ? parsed.bench : [],
      currentBatterIndex: Number.isFinite(parsed?.currentBatterIndex) ? parsed.currentBatterIndex : 0,
      inningHalf: parsed?.inningHalf === 'bottom' ? 'bottom' : 'top',
      isAttacking: typeof parsed?.isAttacking === 'boolean' ? parsed.isAttacking : true,
      preGameConfigured: Boolean(parsed?.preGameConfigured),
      gameLog: Array.isArray(parsed?.gameLog) ? parsed.gameLog : [],
      substitutions: Array.isArray(parsed?.substitutions) ? parsed.substitutions : [],
      currentOpponentBatter: parsed?.currentOpponentBatter || { number: '', name: '' },
      opposingBatters: (parsed?.opposingBatters && typeof parsed.opposingBatters === 'object' && !Array.isArray(parsed.opposingBatters)) ? parsed.opposingBatters : {},
      opponentLineup: Array.isArray(parsed?.opponentLineup) ? parsed.opponentLineup : [],
      opponentLineupIndex: typeof parsed?.opponentLineupIndex === 'number' ? parsed.opponentLineupIndex : 0,
      opposingPitcher: parsed?.opposingPitcher || { number: '', name: '' },
      maxInnings: typeof parsed?.maxInnings === 'number' ? parsed.maxInnings : 0,
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
      atBats:    Number(current?.hitting?.atBats    || 0),
      hits:      Number(current?.hitting?.hits      || 0),
      strikeouts:Number(current?.hitting?.strikeouts|| 0),
      outs:      Number(current?.hitting?.outs      || 0),
      walks:     Number(current?.hitting?.walks     || 0),
      runs:      Number(current?.hitting?.runs      || 0),
      rbi:       Number(current?.hitting?.rbi       || 0),
      homeRuns:  Number(current?.hitting?.homeRuns  || 0),
    },
    pitching: {
      inningsPitched: Number((patch?.inningsPitched ?? current?.pitching?.inningsPitched) || 0),
      outsPitched:    Number((patch?.outsPitched    ?? current?.pitching?.outsPitched)    || 0),
      earnedRuns:     Number((patch?.earnedRuns     ?? current?.pitching?.earnedRuns)     || 0),
      strikeouts:     Number((patch?.strikeouts     ?? current?.pitching?.strikeouts)     || 0),
      walks:          Number((patch?.walks          ?? current?.pitching?.walks)          || 0),
      strikes:        Number((patch?.strikes        ?? current?.pitching?.strikes)        || 0),
      balls:          Number((patch?.balls          ?? current?.pitching?.balls)          || 0),
      pitchCount:     Number((patch?.pitchCount     ?? current?.pitching?.pitchCount)     || 0),
      hitsAllowed:    Number((patch?.hitsAllowed    ?? current?.pitching?.hitsAllowed)    || 0),
      pitchTypes: (() => {
        const cur = current?.pitching?.pitchTypes || {}
        const type = patch?.pitchType || ''
        const TYPES = ['FB', 'CV', 'SL', 'CH', 'SI', 'CT', 'other']
        return Object.fromEntries(TYPES.map(t => [t, Number(cur[t] || 0) + (type === t ? 1 : 0)]))
      })(),
    },
    defense: {
      errors:      Number(current?.defense?.errors      || 0),
      doublePlays: Number(current?.defense?.doublePlays || 0),
      flyOuts:     Number(current?.defense?.flyOuts     || 0),
      groundOuts:  Number(current?.defense?.groundOuts  || 0),
      lineOuts:    Number(current?.defense?.lineOuts     || 0),
    },
  }

  gameStatsApi.upsert(gameId, pitcherId, payload)
}

function App() {
  const [auth, setAuth] = useState(getAuth)
  const role = decodeRole(auth)
  const [page, setPage] = useState('stats')
  const [activeTool, setActiveTool] = useState('mouse')
  const [showTrainingHud, setShowTrainingHud] = useState(true)
  const [clearDrawVersion, setClearDrawVersion] = useState(0)
  const [players, setPlayers] = useState([])
  const [gameState, setGameState] = useState(getSavedGameState)
  const [activeGame, setActiveGame] = useState(null)
  const [gameAccessNotice, setGameAccessNotice] = useState('')
  const [isGameEntering, setIsGameEntering] = useState(false)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [syncStatus, setSyncStatus] = useState(getSyncStatus)
  // Incremented after each pitcher stat write so useGameState re-fetches the live HUD
  const [statsRefreshKey, setStatsRefreshKey] = useState(0)
  const notifyStatsUpdated = useCallback(() => setStatsRefreshKey((k) => k + 1), [])

  const isOffline = syncStatus === 'offline'

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(GAME_STATE_STORAGE_KEY, JSON.stringify(gameState))
      } catch {
        // QuotaExceededError — state remains in memory; localStorage full
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [gameState])

  // Load players from local storage into React state
  const loadPlayers = useCallback(() => {
    try {
      const playersResponse = api.get('/players')
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
  }, [])

  // On mount (and after login): load local data immediately, then sync with server
  useEffect(() => {
    if (!auth) return
    loadPlayers()
    syncWithServer().catch(() => {})
  }, [loadPlayers, auth])

  // Handle forced logout from 401 interceptor
  useEffect(() => {
    const onLogout = () => {
      setAuth(null)
      setPlayers([])
      setGameState(INITIAL_GAME_STATE)
      setActiveGame(null)
      setPage('stats')
    }
    window.addEventListener('baseball:logout', onLogout)
    return () => window.removeEventListener('baseball:logout', onLogout)
  }, [])

  // React to sync events: update status indicator and re-load players after sync
  useEffect(() => {
    const onStatus = (e) => setSyncStatus(e.detail.status)
    const onSynced = () => loadPlayers()
    window.addEventListener('baseball:syncstatus', onStatus)
    window.addEventListener('baseball:synced', onSynced)
    return () => {
      window.removeEventListener('baseball:syncstatus', onStatus)
      window.removeEventListener('baseball:synced', onSynced)
    }
  }, [loadPlayers])

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
        setGameState((current) => {
          const nextPitchCounts = { ...(current.pitchCounts || {}) }
          if (nextPitcherId && !Number.isFinite(nextPitchCounts[nextPitcherId])) nextPitchCounts[nextPitcherId] = 0
          return { ...current, currentPitcherId: nextPitcherId, pitchCounts: nextPitchCounts }
        })
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
            ourPitchCount: Number.isFinite(persistedState?.ourPitchCount)
              ? persistedState.ourPitchCount
              : Number.isFinite(persistedState?.pitchCount)
                ? persistedState.pitchCount
                : current.ourPitchCount || 0,
            opponentPitchCount: Number.isFinite(persistedState?.opponentPitchCount) ? persistedState.opponentPitchCount : current.opponentPitchCount || 0,
            pitchCounts: persistedState?.pitchCounts || current.pitchCounts || {},
            homeScore: Number.isFinite(persistedState?.homeScore) ? persistedState.homeScore : current.homeScore,
            awayScore: Number.isFinite(persistedState?.awayScore) ? persistedState.awayScore : current.awayScore,
            battingOrder,
            lineup,
            bench,
            onFieldPlayerIds: lineup.map((item) => item.playerId),
            participantPlayerIds: [...new Set([...lineup.map((item) => item.playerId), ...bench])],
            currentBatterIndex: Math.min(current.currentBatterIndex || 0, Math.max(0, battingOrder.length - 1)),
            preGameConfigured: true,
            gameLog: Array.isArray(persistedState?.gameLog) ? persistedState.gameLog : current.gameLog || [],
            substitutions: Array.isArray(persistedState?.substitutions) ? persistedState.substitutions : current.substitutions || [],
            opposingBatters: persistedState?.opposingBatters || current.opposingBatters || {},
            opponentLineup: Array.isArray(persistedState?.opponentLineup) ? persistedState.opponentLineup : current.opponentLineup || [],
            opponentLineupIndex: typeof persistedState?.opponentLineupIndex === 'number' ? persistedState.opponentLineupIndex : current.opponentLineupIndex || 0,
            opposingPitcher: persistedState?.opposingPitcher || current.opposingPitcher || { number: '', name: '' },
            maxInnings: typeof persistedState?.maxInnings === 'number' ? persistedState.maxInnings : (typeof game?.maxInnings === 'number' ? game.maxInnings : current.maxInnings || 0),
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
            ourPitchCount: Number.isFinite(persistedState?.ourPitchCount)
              ? persistedState.ourPitchCount
              : Number.isFinite(persistedState?.pitchCount)
                ? persistedState.pitchCount
                : current.ourPitchCount || 0,
            opponentPitchCount: Number.isFinite(persistedState?.opponentPitchCount) ? persistedState.opponentPitchCount : current.opponentPitchCount || 0,
            pitchCounts: persistedState?.pitchCounts || current.pitchCounts || {},
            homeScore: Number.isFinite(persistedState?.homeScore) ? persistedState.homeScore : current.homeScore,
            awayScore: Number.isFinite(persistedState?.awayScore) ? persistedState.awayScore : current.awayScore,
            lineup: [],
            bench: [],
            onFieldPlayerIds: [],
            battingOrder: [],
            currentPitcherId: null,
            preGameConfigured: false,
            gameLog: Array.isArray(persistedState?.gameLog) ? persistedState.gameLog : current.gameLog || [],
            substitutions: Array.isArray(persistedState?.substitutions) ? persistedState.substitutions : current.substitutions || [],
            opposingBatters: persistedState?.opposingBatters || current.opposingBatters || {},
            opponentLineup: Array.isArray(persistedState?.opponentLineup) ? persistedState.opponentLineup : current.opponentLineup || [],
            opponentLineupIndex: typeof persistedState?.opponentLineupIndex === 'number' ? persistedState.opponentLineupIndex : current.opponentLineupIndex || 0,
            opposingPitcher: persistedState?.opposingPitcher || current.opposingPitcher || { number: '', name: '' },
            maxInnings: typeof persistedState?.maxInnings === 'number' ? persistedState.maxInnings : (typeof game?.maxInnings === 'number' ? game.maxInnings : current.maxInnings || 0),
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
          // keep legacy `pitchCount` for backwards compatibility (reflect ourPitchCount)
          pitchCount: gameState.ourPitchCount,
          ourPitchCount: gameState.ourPitchCount,
          opponentPitchCount: gameState.opponentPitchCount,
          pitchCounts: gameState.pitchCounts || {},
          homeScore: gameState.homeScore,
          awayScore: gameState.awayScore,
          isAttacking: gameState.isAttacking,
          onFieldPlayerIds: gameState.onFieldPlayerIds,
          participantPlayerIds: gameState.participantPlayerIds,
          currentBatterIndex: gameState.currentBatterIndex,
          currentPitcherId: gameState.currentPitcherId,
          runners: gameState.runners,
          preGameConfigured: gameState.preGameConfigured,
          gameLog: gameState.gameLog || [],
          substitutions: gameState.substitutions || [],
          opposingBatters: gameState.opposingBatters || {},
          opponentLineup: gameState.opponentLineup || [],
          opponentLineupIndex: gameState.opponentLineupIndex || 0,
          opposingPitcher: gameState.opposingPitcher || { number: '', name: '' },
          maxInnings: gameState.maxInnings || 0,
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
        const battingOrder = [...new Set([...(current.battingOrder || []), newId])]
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
      ourPitchCount: 0,
      opponentPitchCount: 0,
      pitchCounts: {},
      homeScore: 0,
      awayScore: 0,
      inningScores: { home: [], away: [] },
      isAttacking: true,
      lineup: [],
      bench: [],
      onFieldPlayerIds: [],
      battingOrder: [],
      currentPitcherId: null,
      preGameConfigured: false,
      currentBatterIndex: 0,
      runners: { first: false, second: false, third: false },
      gameLog: [],
      substitutions: [],
      currentOpponentBatter: { number: '', name: '' },
      opposingBatters: {},
      opponentLineup: [],
      opponentLineupIndex: 0,
      opposingPitcher: { number: '', name: '' },
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
      hitsAllowed: Number(current?.pitching?.hitsAllowed || 0),
      // pitchType is a string like 'FB' — upsertPitcherStatRecord increments the right counter
      pitchType: flags.pitchType || '',
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

  const handlePitchAction = useCallback(async (kind, opts = {}) => {
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
        // Defensive pitch increment: update our team pitch counts and per-pitcher mapping
        ourPitchCount: Number(state.ourPitchCount || 0) + 1,
        pitchCounts: (() => {
          const next = { ...(state.pitchCounts || {}) }
          const pid = state.currentPitcherId
          if (pid) next[pid] = Number(next[pid] || 0) + 1
          return next
        })(),
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
        inningScores: scoredRuns > 0
          ? addInningRuns(state.inningScores, state.inning, state.isAttacking ? scoredRuns : 0, state.isAttacking ? 0 : scoredRuns)
          : (state.inningScores || { home: [], away: [] }),
        ...((didStrikeout || didWalk) ? advanceOpponentLineup(state) : {}),
      }
    }, kind === 'foul' ? 'Foul adicionada' : kind === 'ball' ? 'Ball adicionada' : 'Strike adicionada')

    try {
      await syncPitchToPitcher(kind, {
        didStrikeout,
        didWalk,
        countAsStrike,
        outsDelta: didStrikeout ? 1 : 0,
        earnedRunsDelta: didWalk ? Number((advanceOnWalk({ ...(current.runners || {}) }).runs) || 0) : 0,
        pitchType: opts.pitchType || '',
      })
      setStatsRefreshKey((k) => k + 1)
    } catch {
      // Mantem jogo local mesmo se backend indisponivel.
    }
  }, [gameState, syncPitchToPitcher, updateGameState])

  const handleEndGame = useCallback(async () => {
    const currentGameId = gameState.currentGameId
    if (!currentGameId) return

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
    updateGameState((current) => ({
      ...current,
      currentGameId: null,
      inning: 1,
      inningHalf: 'top',
      outs: 0,
      balls: 0,
      strikes: 0,
      pitchCount: 0,
      ourPitchCount: 0,
      opponentPitchCount: 0,
      pitchCounts: {},
      homeScore: 0,
      awayScore: 0,
      inningScores: { home: [], away: [] },
      isAttacking: true,
      lineup: [],
      bench: [],
      preGameConfigured: false,
      currentBatterIndex: 0,
      runners: { first: false, second: false, third: false },
      gameLog: [],
      substitutions: [],
      currentOpponentBatter: { number: '', name: '' },
      opposingBatters: {},
      opponentLineup: [],
      opponentLineupIndex: 0,
      opposingPitcher: { number: '', name: '' },
    }))
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

  const handleLogout = useCallback(() => {
    logout()
    try { window.localStorage.removeItem(GAME_STATE_STORAGE_KEY) } catch {}
    setAuth(null)
    setPlayers([])
    setGameState(INITIAL_GAME_STATE)
    setActiveGame(null)
    setPage('stats')
  }, [])

  if (!auth) return <LoginPage onLogin={(a) => setAuth(a)} />

  return (
    <main className={`app-shell ${isGameEntering ? 'app-entering-game' : ''} ${navCollapsed ? 'nav-collapsed' : ''}`}>
      {navCollapsed && (
        <button type="button" className="nav-restore-btn" onClick={() => setNavCollapsed(false)} aria-label="Mostrar navegação">▼</button>
      )}
      <header className={`top-nav${navCollapsed ? ' nav-hidden' : ''}`}>
        <div className="nav-brand" aria-label="Beisebol CAASO">
          <img className="nav-brand-logo" src="/Ativo 1Cporcotransparente.png" alt="Logo C com porco" />
          <div className="nav-brand-text">
            <h1>Beisebol CAASO</h1>
            <span>RAÇA CAASO</span>
          </div>
          {syncStatus !== 'no-backend' && (
            <span
              className={`sync-dot sync-dot--${syncStatus}`}
              title={
                syncStatus === 'synced'  ? 'Sincronizado'
                : syncStatus === 'syncing' ? 'Sincronizando...'
                : syncStatus === 'offline' ? 'Sem conexão'
                : syncStatus === 'pending' ? 'Pendente'
                : syncStatus === 'error'   ? 'Erro de sync'
                : ''
              }
            />
          )}
        </div>
        <nav className="nav-actions" role="navigation" aria-label="Navegação principal">
          <button
            type="button"
            className={`${page === 'game' ? 'active' : ''} ${!gameState.currentGameId ? 'nav-no-game' : ''}`}
            aria-selected={page === 'game'}
            onClick={() => {
              setGameAccessNotice('')
              setPage('game')
            }}
          >
            <span className="nav-label-full">{gameState.currentGameId ? 'Jogo' : 'Novo Jogo'}</span>
            <span className="nav-label-short">{gameState.currentGameId ? 'Jogo' : 'Novo'}</span>
          </button>
          <button
            type="button"
            className={page === 'training' ? 'active' : ''}
            aria-selected={page === 'training'}
            onClick={() => setPage('training')}
          >
            <span className="nav-label-full">Treino</span>
            <span className="nav-label-short">Treino</span>
          </button>
          <button
            type="button"
            className={page === 'jogadores' ? 'active' : ''}
            aria-selected={page === 'jogadores'}
            onClick={() => setPage('jogadores')}
          >
            <span className="nav-label-full">Jogadores</span>
            <span className="nav-label-short">Jogadores</span>
          </button>
          <button
            type="button"
            className={page === 'stats' ? 'active' : ''}
            aria-selected={page === 'stats'}
            onClick={() => {
              setGameAccessNotice('')
              setPage('stats')
            }}
          >
            <span className="nav-label-full">Stats</span>
            <span className="nav-label-short">Stats</span>
          </button>
          <button
            type="button"
            className={page === 'settings' ? 'active' : ''}
            aria-selected={page === 'settings'}
            onClick={() => setPage('settings')}
          >
            <span className="nav-label-full">Ajustes</span>
            <span className="nav-label-short">Ajustes</span>
          </button>
          {role === 'admin' && (
            <button
              type="button"
              className={page === 'admin' ? 'active' : ''}
              aria-selected={page === 'admin'}
              onClick={() => setPage('admin')}
            >
              <span className="nav-label-full">Admin</span>
              <span className="nav-label-short">Admin</span>
            </button>
          )}
        </nav>
        <button
          type="button"
          className="nav-logout-btn"
          onClick={handleLogout}
          aria-label="Sair"
          title="Sair"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '0.375rem' }}
        >
          Sair
        </button>
        <button type="button" className="nav-toggle-btn" onClick={() => setNavCollapsed(true)} aria-label="Ocultar navegação">▲</button>
      </header>

      {syncStatus !== 'no-backend' && syncStatus !== 'synced' && syncStatus !== 'unknown' && (
        <div className={`sync-banner sync-banner--${syncStatus}`} role="status" aria-live="polite">
          {syncStatus === 'offline'  && 'Sem conexão — usando dados locais'}
          {syncStatus === 'syncing'  && 'Sincronizando com servidor...'}
          {syncStatus === 'pending'  && 'Dados pendentes de sincronização'}
          {syncStatus === 'error'    && 'Erro de sincronização — dados salvos localmente'}
        </div>
      )}
      {gameAccessNotice && <div className="game-access-warning">{gameAccessNotice}</div>}

      <Suspense fallback={null}>
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
              setStatsRefreshKey((k) => k + 1)
            } catch {
              // Mantem jogo local mesmo sem backend.
            }
          }}
          onDefensiveEarnedRun={async (count = 1) => {
            try {
              await updatePitcherDefenseContribution({ outsDelta: 0, earnedRunsDelta: Number(count || 0) })
              setStatsRefreshKey((k) => k + 1)
            } catch {
              // Mantem jogo local mesmo sem backend.
            }
          }}
          statsRefreshKey={statsRefreshKey}
          onStatsUpdated={notifyStatsUpdated}
          activeGame={activeGame}
          onEndGame={handleEndGame}
          allowPregameWithoutGame={true}
          onCancelPreGame={() => setPage('stats')}
        />
      ) : page === 'training' ? (
        <TrainingField
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          clearDrawVersion={clearDrawVersion}
          triggerClearDraw={() => setClearDrawVersion((c) => c + 1)}
          showHud={showTrainingHud}
          setShowHud={setShowTrainingHud}
        />
      ) : page === 'jogadores' ? (
        <JogadoresPage
          players={players}
          onAddPlayer={handleAddPlayer}
          onDeletePlayer={handleDeletePlayer}
          onUpdatePlayer={handleUpdatePlayer}
          gameState={gameState}
          onUpdateGameState={updateGameState}
        />
      ) : page === 'settings' ? (
        <SettingsPage onLogout={handleLogout} />
      ) : page === 'admin' && role === 'admin' ? (
        <AdminPage />
      ) : (
        <StatsPage
          players={players}
          onDeleteGame={handleDeleteGame}
          onOpenGame={openGameFromStats}
          gameState={gameState}
          onGoField={() => setPage('game')}
        />
      )}

      </Suspense>
      {/* tool-dock removed: controls moved into bottom HUD for mobile/tablet */}
    </main>
  )
}

export default App
