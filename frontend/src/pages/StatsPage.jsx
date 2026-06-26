import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameDetailPage from './GameDetailPage'
import { gameStatsApi, gamesApi, seasonStatsApi } from '../services/api'
import PlayerStatsModal from '../components/PlayerStatsModal'
import Button from '../components/ui/Button'
import ConfirmModal from '../components/ui/ConfirmModal'
import { safeNumber } from '../utils/number'
import { avgFromEntry, avgFromValues, eraFromEntry, formatIpFromOuts, obpFromHitting, whipFromPitching, k9FromPitching } from '../utils/stats'
import { getPlayerId, getMainPosition, detectPlayerType } from '../utils/player'



const EMPTY_GAME_STAT = {
  type: 'hitter',
  hitting: { atBats: 0, hits: 0, strikeouts: 0, outs: 0, walks: 0, runs: 0, rbi: 0, homeRuns: 0 },
  pitching: { inningsPitched: 0, outsPitched: 0, earnedRuns: 0, strikeouts: 0, walks: 0, strikes: 0, balls: 0, pitchCount: 0, hitsAllowed: 0 },
  defense: { errors: 0, doublePlays: 0, flyOuts: 0, groundOuts: 0, lineOuts: 0 },
}




function hasAnyStat(entry) {
  if (!entry) return false
  const role = entry.roleSummary || {}
  const games = safeNumber(role.hitterGames) + safeNumber(role.pitcherGames)
  if (games > 0) return true

  const h = entry.hitting || {}
  const p = entry.pitching || {}
  const d = entry.defense || {}

  const fields = [
    h.atBats, h.hits, h.strikeouts, h.outs, h.walks,
    p.inningsPitched, p.outsPitched, p.earnedRuns, p.strikeouts, p.walks, p.pitchCount,
    d.errors, d.doublePlays, d.flyOuts, d.groundOuts, d.lineOuts,
  ]

  return fields.some((v) => safeNumber(v) > 0)
}

function StatsPage({
  players,
  onDeleteGame,
  onOpenGame,
  gameState,
  onGoField,
}) {
  const [games, setGames] = useState([])
  const [gameStats, setGameStats] = useState([])
  const [seasonStats, setSeasonStats] = useState([])
  const [seasonLoading, setSeasonLoading] = useState(false)
  const [sortBy, setSortBy] = useState('date')
  const [, setGamesLoading] = useState(false)
  const [gameStatsLoading, setGameStatsLoading] = useState(false)
  const [playerFilter, setPlayerFilter] = useState('all')
  const [statsTab, setStatsTab] = useState('hitters')
  const [colSort, setColSort] = useState({ col: null, dir: 'desc' })
  const [focusedPlayerId, setFocusedPlayerId] = useState(null)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [pendingDeleteGame, setPendingDeleteGame] = useState(null)
  const [pendingResetGame, setPendingResetGame] = useState(false)

  // viewingGameId: which game is currently displayed in the detail panel.
  // Completely independent from gameState.currentGameId (the active/live game).
  const [viewingGameId, setViewingGameId] = useState(() => gameState.currentGameId)
  const [showGameDetail, setShowGameDetail] = useState(() => Boolean(gameState.currentGameId))

  const gameDetailsRef = useRef(null)

  const loadGames = useCallback(async () => {
    setGamesLoading(true)
    try {
      const response = await gamesApi.list()
      setGames(response.data || [])
    } finally {
      setGamesLoading(false)
    }
  }, [])

  const loadSeasonStats = useCallback(async () => {
    setSeasonLoading(true)
    try {
      const response = await seasonStatsApi.list(playerFilter === 'all' ? null : playerFilter)
      setSeasonStats(response.data || [])
    } finally {
      setSeasonLoading(false)
    }
  }, [playerFilter])

  const loadGameStats = useCallback(async (gameId) => {
    if (!gameId) {
      setGameStats([])
      return
    }

    setGameStatsLoading(true)
    try {
      const response = await gameStatsApi.listByGame(gameId)
      setGameStats(response.data || [])
    } finally {
      setGameStatsLoading(false)
    }
  }, [])

  // Bootstrap: load games and season stats on mount
  useEffect(() => {
    const bootstrap = async () => {
      try {
        await loadGames()
        await loadSeasonStats()
      } catch {
        // Mantem pagina funcional mesmo sem backend.
      }
    }
    bootstrap()
  }, [loadGames, loadSeasonStats])

  // Reload season stats when playerFilter changes
  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadSeasonStats().catch(() => {})
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadSeasonStats])

  // Reload game stats when viewingGameId changes
  useEffect(() => {
    if (!viewingGameId) {
      setGameStats([])
      return
    }
    const timer = window.setTimeout(() => {
      loadGameStats(viewingGameId).catch(() => {})
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadGameStats, viewingGameId])

  const viewingGame = useMemo(
    () => games.find((g) => g._id === viewingGameId) || null,
    [games, viewingGameId],
  )

  // Players shown in the game detail: use the viewed game's own lineup/bench,
  // OR live participants when viewing the active game.
  const detailRosterPlayers = useMemo(() => {
    if (!viewingGame) return []
    if (viewingGameId === gameState.currentGameId) {
      const ids = new Set(gameState.participantPlayerIds || [])
      return ids.size ? players.filter((p) => ids.has(getPlayerId(p))) : players
    }
    const gameParticipantIds = new Set([
      ...(viewingGame.lineup || []).map((item) => item.playerId),
      ...(viewingGame.bench || []),
    ])
    return gameParticipantIds.size
      ? players.filter((p) => gameParticipantIds.has(getPlayerId(p)))
      : players
  }, [viewingGame, viewingGameId, gameState.currentGameId, gameState.participantPlayerIds, players])

  const seasonMap = useMemo(() => {
    const map = {}
    for (const entry of seasonStats) {
      map[String(entry.playerId)] = entry
    }
    return map
  }, [seasonStats])

  const seasonRows = useMemo(
    () =>
      players
        .map((player) => {
          const id = getPlayerId(player)
          const entry = seasonMap[id] || {
            hitting: { atBats: 0, hits: 0, strikeouts: 0, outs: 0, walks: 0, runs: 0, rbi: 0, homeRuns: 0 },
            pitching: { inningsPitched: 0, outsPitched: 0, earnedRuns: 0, strikeouts: 0, walks: 0, strikes: 0, balls: 0, pitchCount: 0, hitsAllowed: 0 },
            defense: { errors: 0, doublePlays: 0, flyOuts: 0, groundOuts: 0, lineOuts: 0 },
            roleSummary: { hitterGames: 0, pitcherGames: 0 },
            avg: 0,
            era: 0,
          }
          return { player, entry }
        })
        .filter(({ player }) => playerFilter === 'all' || getPlayerId(player) === playerFilter),
      [players, seasonMap, playerFilter],
  )

  const visibleSeasonRows = useMemo(() => {
    // Hitters tab: all players. Pitchers tab: pitchers only.
    const rows = seasonRows.filter(({ player }) =>
      statsTab === 'hitters' ? true : detectPlayerType(player) === 'pitcher'
    )

    if (!colSort.col) return rows

    const hitterMetrics = {
      atBats:      (e) => safeNumber(e.hitting?.atBats),
      hits:        (e) => safeNumber(e.hitting?.hits),
      homeRuns:    (e) => safeNumber(e.hitting?.homeRuns),
      runs:        (e) => safeNumber(e.hitting?.runs),
      rbi:         (e) => safeNumber(e.hitting?.rbi),
      walks:       (e) => safeNumber(e.hitting?.walks),
      strikeouts:  (e) => safeNumber(e.hitting?.strikeouts),
      outs:        (e) => safeNumber(e.hitting?.outs),
      avg:         (e) => { const ab = safeNumber(e.hitting?.atBats); return ab ? safeNumber(e.hitting?.hits) / ab : 0 },
      obp:         (e) => { const ab = safeNumber(e.hitting?.atBats); const bb = safeNumber(e.hitting?.walks); const h = safeNumber(e.hitting?.hits); return (ab + bb) ? (h + bb) / (ab + bb) : 0 },
    }
    const pitcherMetrics = {
      inningsPitched: (e) => safeNumber(e.pitching?.inningsPitched),
      era:            (e) => safeNumber(e.era),
      strikeouts_p:   (e) => safeNumber(e.pitching?.strikeouts),
      walks_p:        (e) => safeNumber(e.pitching?.walks),
      hitsAllowed:    (e) => safeNumber(e.pitching?.hitsAllowed),
      pitchCount:     (e) => safeNumber(e.pitching?.pitchCount),
      strikes:        (e) => safeNumber(e.pitching?.strikes),
      balls:          (e) => safeNumber(e.pitching?.balls),
    }

    const metrics = statsTab === 'hitters' ? hitterMetrics : pitcherMetrics
    const metricFn = metrics[colSort.col]
    if (!metricFn) return rows

    return [...rows].sort((a, b) => {
      const va = metricFn(a.entry)
      const vb = metricFn(b.entry)
      return colSort.dir === 'desc' ? vb - va : va - vb
    })
  }, [seasonRows, statsTab, colSort])

  const leaders = useMemo(() => {
    if (!visibleSeasonRows.length) {
      return { topHitsId: null, topAvgId: null }
    }

    let topHitsId = null
    let topHitsValue = 0
    let topAvgId = null
    let topAvgValue = 0

    for (const row of visibleSeasonRows) {
      const id = getPlayerId(row.player)
      const hits = safeNumber(row.entry.hitting?.hits)
      const ab = safeNumber(row.entry.hitting?.atBats)
      const avg = ab ? hits / ab : 0

      // Only crown a leader if they actually have meaningful stats (>0)
      if (hits > topHitsValue) {
        topHitsValue = hits
        topHitsId = id
      }
      if (avg > topAvgValue) {
        topAvgValue = avg
        topAvgId = id
      }
    }

    return { topHitsId, topAvgId }
  }, [visibleSeasonRows])

  const seasonTotals = useMemo(() => {
    return visibleSeasonRows.reduce((acc, item) => ({
      atBats: acc.atBats + safeNumber(item.entry.hitting?.atBats),
      hits: acc.hits + safeNumber(item.entry.hitting?.hits),
      homeRuns: acc.homeRuns + safeNumber(item.entry.hitting?.homeRuns),
      runs: acc.runs + safeNumber(item.entry.hitting?.runs),
      rbi: acc.rbi + safeNumber(item.entry.hitting?.rbi),
      hittingStrikeouts: acc.hittingStrikeouts + safeNumber(item.entry.hitting?.strikeouts),
      walks: acc.walks + safeNumber(item.entry.hitting?.walks),
      // Sum raw outs so IP is computed correctly (decimal IP values can't be added directly)
      outsPitched: acc.outsPitched + safeNumber(item.entry.pitching?.outsPitched),
      earnedRuns: acc.earnedRuns + safeNumber(item.entry.pitching?.earnedRuns),
      hitsAllowed: acc.hitsAllowed + safeNumber(item.entry.pitching?.hitsAllowed),
      pitchingStrikeouts: acc.pitchingStrikeouts + safeNumber(item.entry.pitching?.strikeouts),
      pitchingWalks: acc.pitchingWalks + safeNumber(item.entry.pitching?.walks),
    }), {
      atBats: 0,
      hits: 0,
      homeRuns: 0,
      runs: 0,
      rbi: 0,
      hittingStrikeouts: 0,
      walks: 0,
      outsPitched: 0,
      earnedRuns: 0,
      hitsAllowed: 0,
      pitchingStrikeouts: 0,
      pitchingWalks: 0,
    })
  }, [visibleSeasonRows])

  const sortedGames = useMemo(() => {
    const list = [...games]
    if (sortBy === 'competition') {
      list.sort((a, b) => String(a.competition).localeCompare(String(b.competition)))
      return list
    }

    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return list
  }, [games, sortBy])

  const openPlayerDetails = useCallback((playerId) => {
    setFocusedPlayerId(null)
    window.requestAnimationFrame(() => setFocusedPlayerId(playerId))
  }, [])

  const handleColSort = useCallback((col) => {
    setColSort((prev) => {
      if (prev.col !== col) return { col, dir: 'desc' }
      if (prev.dir === 'desc') return { col, dir: 'asc' }
      return { col: null, dir: 'desc' }
    })
  }, [])

  useEffect(() => {
    setColSort({ col: null, dir: 'desc' })
  }, [statsTab])

  const upsertGameStat = async (playerId, patch = {}) => {
    const found = gameStats.find((item) => {
      const itemPlayerId = item.playerId?._id || item.playerId
      return itemPlayerId === playerId
    })

    const fallback = found || {
      _id: null,
      gameId: viewingGameId,
      ...EMPTY_GAME_STAT,
    }

    const player = players.find((item) => getPlayerId(item) === playerId)
    const detectedType = detectPlayerType(player)

    const payload = {
      type: detectedType,
      hitting: {
        atBats: safeNumber(patch.hitting?.atBats ?? fallback.hitting?.atBats),
        hits: safeNumber(patch.hitting?.hits ?? fallback.hitting?.hits),
        strikeouts: safeNumber(patch.hitting?.strikeouts ?? fallback.hitting?.strikeouts),
        outs: safeNumber(patch.hitting?.outs ?? fallback.hitting?.outs),
        walks: safeNumber(patch.hitting?.walks ?? fallback.hitting?.walks),
        runs: safeNumber(patch.hitting?.runs ?? fallback.hitting?.runs),
        rbi: safeNumber(patch.hitting?.rbi ?? fallback.hitting?.rbi),
        homeRuns: safeNumber(patch.hitting?.homeRuns ?? fallback.hitting?.homeRuns),
      },
      pitching: {
        inningsPitched: safeNumber(
          patch.pitching?.inningsPitched ?? fallback.pitching?.inningsPitched,
        ),
        outsPitched: safeNumber(patch.pitching?.outsPitched ?? fallback.pitching?.outsPitched),
        earnedRuns: safeNumber(patch.pitching?.earnedRuns ?? fallback.pitching?.earnedRuns),
        strikeouts: safeNumber(patch.pitching?.strikeouts ?? fallback.pitching?.strikeouts),
        walks: safeNumber(patch.pitching?.walks ?? fallback.pitching?.walks),
        strikes: safeNumber(patch.pitching?.strikes ?? fallback.pitching?.strikes),
        balls: safeNumber(patch.pitching?.balls ?? fallback.pitching?.balls),
        pitchCount: safeNumber(patch.pitching?.pitchCount ?? fallback.pitching?.pitchCount),
        hitsAllowed: safeNumber(patch.pitching?.hitsAllowed ?? fallback.pitching?.hitsAllowed),
      },
      defense: {
        errors: safeNumber(patch.defense?.errors ?? fallback.defense?.errors),
        doublePlays: safeNumber(patch.defense?.doublePlays ?? fallback.defense?.doublePlays),
        flyOuts: safeNumber(patch.defense?.flyOuts ?? fallback.defense?.flyOuts),
        groundOuts: safeNumber(patch.defense?.groundOuts ?? fallback.defense?.groundOuts),
        lineOuts: safeNumber(patch.defense?.lineOuts ?? fallback.defense?.lineOuts),
      },
    }

    let response

    setSaveStatus('saving')

    if (found?._id) {
      response = await gameStatsApi.update(found._id, payload)
    } else {
      response = await gameStatsApi.create({
        gameId: viewingGameId,
        playerId,
        ...payload,
      })
    }

    const saved = response.data
    setGameStats((current) => {
      const index = current.findIndex((item) => item._id === saved._id)
      if (index < 0) return [saved, ...current]
      const next = [...current]
      next[index] = saved
      return next
    })
    await loadSeasonStats()
    setSaveStatus('saved')
    window.setTimeout(() => setSaveStatus('idle'), 900)
  }

  const resetCurrentGameStats = async () => {
    if (!viewingGameId) return

    setSaveStatus('saving')
    for (const player of detailRosterPlayers) {
      const playerId = getPlayerId(player)
      await upsertGameStat(playerId, {
        hitting: { atBats: 0, hits: 0, strikeouts: 0, outs: 0, walks: 0 },
        pitching: { inningsPitched: 0, outsPitched: 0, earnedRuns: 0, strikeouts: 0, walks: 0, strikes: 0, balls: 0, pitchCount: 0 },
        defense: { errors: 0, doublePlays: 0, flyOuts: 0, groundOuts: 0, lineOuts: 0 },
      })
    }

    await loadGameStats(viewingGameId)
    setSaveStatus('saved')
    window.setTimeout(() => setSaveStatus('idle'), 900)
  }

  const handleDeleteGameItem = (game) => {
    if (!game?._id) return
    setPendingDeleteGame(game)
  }

  const confirmDeleteGame = async () => {
    const game = pendingDeleteGame
    setPendingDeleteGame(null)
    if (!game?._id) return

    await onDeleteGame?.(game._id)
    await loadGames()
    await loadSeasonStats()

    if (viewingGameId === game._id) {
      setViewingGameId(null)
      setShowGameDetail(false)
      setGameStats([])
    } else if (viewingGameId) {
      await loadGameStats(viewingGameId)
    }
  }

  const handleSelectGameCard = (game) => {
    setViewingGameId(game._id)
    setShowGameDetail(true)
  }

  const handleOpenGame = (game) => {
    onOpenGame?.(game)
  }

  const handleViewGameStats = (game) => {
    setViewingGameId(game._id)
    setShowGameDetail(true)
    window.setTimeout(() => {
      gameDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 20)
  }

  const handleRefresh = async () => {
    await loadGames()
    await loadSeasonStats()
    if (viewingGameId) await loadGameStats(viewingGameId)
  }

  const hitterColCount = 13  // Jogador, N, Pos, AB, H, HR, R, RBI, BB, SO, OUT, AVG, OBP
  const pitcherColCount = 11 // Jogador, N, Pos, IP, ERA, SO, BB, H, PC, STR, BAL

  return (
    <section className="stats-page stats-page-full">
      <div className="stats-main">
      <div className="card">
        <div className="stats-page-header">
          <h2>Estatisticas da temporada</h2>
          <Button type="button" variant="secondary" onClick={handleRefresh} title="Recarregar dados">
            Atualizar
          </Button>
        </div>
        <div className="stats-tabs">
          <button
            type="button"
            className={statsTab === 'hitters' ? 'active' : ''}
            onClick={() => setStatsTab('hitters')}
          >
            Hitters
          </button>
          <button
            type="button"
            className={statsTab === 'pitchers' ? 'active' : ''}
            onClick={() => setStatsTab('pitchers')}
          >
            Pitchers
          </button>
        </div>
        <div className="season-toolbar">
          <label>
            Filtro jogador
            <select
              value={playerFilter}
              onChange={(event) => setPlayerFilter(event.target.value)}
            >
              <option value="all">Todos</option>
              {players.map((player) => (
                <option key={getPlayerId(player)} value={getPlayerId(player)}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="season-kpis">
          {statsTab === 'hitters' ? (
            <>
              <div className="kpi">
                <strong>AVG</strong>
                <span>{avgFromValues(seasonTotals.atBats, seasonTotals.hits)}</span>
              </div>
              <div className="kpi">
                <strong>OBP</strong>
                <span>{(seasonTotals.atBats + seasonTotals.walks) ? (((seasonTotals.hits + seasonTotals.walks) / (seasonTotals.atBats + seasonTotals.walks)).toFixed(3)) : '---'}</span>
              </div>
              <div className="kpi">
                <strong>H</strong>
                <span>{seasonTotals.hits}</span>
              </div>
              <div className="kpi">
                <strong>HR</strong>
                <span>{seasonTotals.homeRuns}</span>
              </div>
              <div className="kpi">
                <strong>R</strong>
                <span>{seasonTotals.runs}</span>
              </div>
              <div className="kpi">
                <strong>RBI</strong>
                <span>{seasonTotals.rbi}</span>
              </div>
              <div className="kpi">
                <strong>BB</strong>
                <span>{seasonTotals.walks}</span>
              </div>
              <div className="kpi">
                <strong>SO</strong>
                <span>{seasonTotals.hittingStrikeouts}</span>
              </div>
            </>
          ) : (
            <>
              <div className="kpi">
                <strong>IP</strong>
                <span>{formatIpFromOuts(seasonTotals.outsPitched)}</span>
              </div>
              <div className="kpi">
                <strong>ERA</strong>
                <span>{seasonTotals.outsPitched ? ((seasonTotals.earnedRuns * 27) / seasonTotals.outsPitched).toFixed(2) : '--'}</span>
              </div>
              <div className="kpi">
                <strong>WHIP</strong>
                <span>{seasonTotals.outsPitched ? (((seasonTotals.pitchingWalks + seasonTotals.hitsAllowed) / (seasonTotals.outsPitched / 3)).toFixed(2)) : '--'}</span>
              </div>
              <div className="kpi">
                <strong>K/9</strong>
                <span>{seasonTotals.outsPitched ? (((seasonTotals.pitchingStrikeouts * 9) / (seasonTotals.outsPitched / 3)).toFixed(1)) : '--'}</span>
              </div>
              <div className="kpi">
                <strong>SO</strong>
                <span>{seasonTotals.pitchingStrikeouts}</span>
              </div>
              <div className="kpi">
                <strong>BB</strong>
                <span>{seasonTotals.pitchingWalks}</span>
              </div>
              <div className="kpi">
                <strong>ER</strong>
                <span>{seasonTotals.earnedRuns}</span>
              </div>
            </>
          )}
        </div>
        <div className="stats-table-wrap">
          {seasonLoading && <div className="stats-loading">Carregando estatísticas...</div>}
          <table className={`stats-table ${seasonLoading ? 'stats-pulse' : ''}`}>
            <thead>
              <tr>
                <th>Jogador</th>
                <th>N</th>
                <th>Posicao</th>
                {statsTab === 'hitters' ? (
                  <>
                    {[['atBats','AB'],['hits','H'],['homeRuns','HR'],['runs','R'],['rbi','RBI'],['walks','BB'],['strikeouts','SO'],['outs','OUT'],['avg','AVG'],['obp','OBP']].map(([col, label]) => (
                      <th key={col} className={`sortable-th${colSort.col === col ? ' sort-active' : ''}`} onClick={() => handleColSort(col)}>
                        {label}{colSort.col === col ? (colSort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
                      </th>
                    ))}
                  </>
                ) : (
                  <>
                    {[['inningsPitched','IP'],['era','ERA'],['strikeouts_p','SO'],['walks_p','BB'],['hitsAllowed','H'],['pitchCount','PC'],['strikes','STR'],['balls','BAL']].map(([col, label]) => (
                      <th key={col} className={`sortable-th${colSort.col === col ? ' sort-active' : ''}`} onClick={() => handleColSort(col)}>
                        {label}{colSort.col === col ? (colSort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
                      </th>
                    ))}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {!seasonLoading && !visibleSeasonRows.length && (
                <tr>
                  <td colSpan={statsTab === 'hitters' ? hitterColCount : pitcherColCount} style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                    {statsTab === 'hitters' ? 'Nenhum jogador cadastrado.' : 'Nenhum pitcher cadastrado.'}
                  </td>
                </tr>
              )}
              {visibleSeasonRows.map(({ player, entry }) => {
                const id = getPlayerId(player)

                return (
                  <tr
                    key={id}
                    className={id === leaders.topHitsId || id === leaders.topAvgId ? 'season-leader-row' : ''}
                  >
                    <td>
                      <Button type="button" variant="link" onClick={() => openPlayerDetails(id)}>
                        {player.name}
                      </Button>
                    </td>
                    <td>{player.number}</td>
                    <td>{getMainPosition(player)}</td>
                    {statsTab === 'hitters' ? (
                      <>
                        <td>{safeNumber(entry.hitting?.atBats)}</td>
                        <td>{safeNumber(entry.hitting?.hits)}</td>
                        <td>{safeNumber(entry.hitting?.homeRuns)}</td>
                        <td>{safeNumber(entry.hitting?.runs)}</td>
                        <td>{safeNumber(entry.hitting?.rbi)}</td>
                        <td>{safeNumber(entry.hitting?.walks)}</td>
                        <td>{safeNumber(entry.hitting?.strikeouts)}</td>
                        <td>{safeNumber(entry.hitting?.outs)}</td>
                        <td>{entry.avg ? Number(entry.avg).toFixed(3) : avgFromEntry(entry)}</td>
                        <td>{obpFromHitting(entry.hitting)}</td>
                      </>
                    ) : (
                      <>
                        <td>{formatIpFromOuts(entry.pitching?.outsPitched)}</td>
                        <td>{entry.era ? Number(entry.era).toFixed(2) : eraFromEntry(entry)}</td>
                        <td>{safeNumber(entry.pitching?.strikeouts)}</td>
                        <td>{safeNumber(entry.pitching?.walks)}</td>
                        <td>{safeNumber(entry.pitching?.hitsAllowed)}</td>
                        <td>{safeNumber(entry.pitching?.pitchCount)}</td>
                        <td>{safeNumber(entry.pitching?.strikes)}</td>
                        <td>{safeNumber(entry.pitching?.balls)}</td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="stats-cards">
            {visibleSeasonRows.map(({ player, entry }) => {
              const id = getPlayerId(player)
              return (
                <article key={`card-${id}`} className={`stat-card ${id === leaders.topHitsId || id === leaders.topAvgId ? 'season-leader-row' : ''}`}>
                  <div className="stat-card-head">
                    <div>
                      <Button type="button" variant="link" onClick={() => openPlayerDetails(id)}>
                        {player.name}
                      </Button>
                      <div className="stat-card-sub">#{player.number} • {getMainPosition(player)}</div>
                    </div>
                  </div>
                  <div className="stat-card-body">
                    {statsTab === 'hitters' ? (
                      <div className="stat-grid">
                        <div><strong>AB</strong><div>{safeNumber(entry.hitting?.atBats)}</div></div>
                        <div><strong>H</strong><div>{safeNumber(entry.hitting?.hits)}</div></div>
                        <div><strong>HR</strong><div>{safeNumber(entry.hitting?.homeRuns)}</div></div>
                        <div><strong>R</strong><div>{safeNumber(entry.hitting?.runs)}</div></div>
                        <div><strong>RBI</strong><div>{safeNumber(entry.hitting?.rbi)}</div></div>
                        <div><strong>BB</strong><div>{safeNumber(entry.hitting?.walks)}</div></div>
                        <div><strong>SO</strong><div>{safeNumber(entry.hitting?.strikeouts)}</div></div>
                        <div><strong>OUT</strong><div>{safeNumber(entry.hitting?.outs)}</div></div>
                        <div><strong>AVG</strong><div>{entry.avg ? Number(entry.avg).toFixed(3) : avgFromEntry(entry)}</div></div>
                        <div><strong>OBP</strong><div>{obpFromHitting(entry.hitting)}</div></div>
                      </div>
                    ) : (
                      <div className="stat-grid">
                        <div><strong>IP</strong><div>{formatIpFromOuts(entry.pitching?.outsPitched)}</div></div>
                        <div><strong>ERA</strong><div>{entry.era ? Number(entry.era).toFixed(2) : eraFromEntry(entry)}</div></div>
                        <div><strong>WHIP</strong><div>{whipFromPitching(entry.pitching)}</div></div>
                        <div><strong>K/9</strong><div>{k9FromPitching(entry.pitching)}</div></div>
                        <div><strong>SO</strong><div>{safeNumber(entry.pitching?.strikeouts)}</div></div>
                        <div><strong>BB</strong><div>{safeNumber(entry.pitching?.walks)}</div></div>
                        <div><strong>H</strong><div>{safeNumber(entry.pitching?.hitsAllowed)}</div></div>
                        <div><strong>PC</strong><div>{safeNumber(entry.pitching?.pitchCount)}</div></div>
                        <div><strong>STR</strong><div>{safeNumber(entry.pitching?.strikes)}</div></div>
                        <div><strong>BAL</strong><div>{safeNumber(entry.pitching?.balls)}</div></div>
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Jogos individuais</h2>
        <div className="game-state-indicator">
          {viewingGame
            ? `Jogo selecionado: ${new Date(viewingGame.date).toLocaleDateString('pt-BR')} - ${viewingGame.opponentName || viewingGame.opponent}`
            : 'Nenhum jogo selecionado'}
        </div>
        <div className="autosave-indicator">
          {saveStatus === 'saving' ? 'Salvando automaticamente...' : saveStatus === 'saved' ? 'Salvo automaticamente' : ''}
        </div>

        <div className="season-toolbar">
          <label>
            Ordenacao
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="date">Por data</option>
              <option value="competition">Por competicao</option>
            </select>
          </label>
        </div>

        {!sortedGames.length && (
          <div className="empty-state-card">
            <div className="empty-state-icon">⚾</div>
            <p>Nenhum jogo registrado ainda.</p>
            <p className="empty-state-hint">Vá para <strong>Jogo</strong> para iniciar uma partida.</p>
          </div>
        )}
        <ul className="game-list">
          {sortedGames.map((game) => {
            const isLive = game._id === gameState.currentGameId
            // For the active game show live score; for historical games show stored score
            const score = isLive
              ? `${Number(gameState.homeScore || 0)} x ${Number(gameState.awayScore || 0)}`
              : game?.gameState
                ? `${Number(game.gameState.homeScore || 0)} x ${Number(game.gameState.awayScore || 0)}`
                : '-- x --'

            return (
              <li key={game._id}>
                <article
                  className={`game-card ${viewingGameId === game._id ? 'selected' : ''}`}
                  onClick={() => handleSelectGameCard(game)}
                >
                  <div className="game-card-head">
                    <strong>{game.opponentName || game.opponent}</strong>
                    <div className="game-card-head-right">
                      {isLive && <span className="live-badge">AO VIVO</span>}
                      <span>{new Date(game.date).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                  <div className="game-card-meta">
                    <span>{game.competition}</span>
                    <span>Placar: {score}</span>
                  </div>
                    <div className="game-card-actions">
                      <Button
                        type="button"
                        variant="primary"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleOpenGame(game)
                        }}
                      >
                        Abrir jogo
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleViewGameStats(game)
                        }}
                      >
                        Ver estatisticas
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleDeleteGameItem(game)
                        }}
                      >
                        Excluir
                      </Button>
                    </div>
                </article>
              </li>
            )
          })}
        </ul>

        {viewingGame && showGameDetail && (
          <div ref={gameDetailsRef}>
            {gameStatsLoading && <div className="stats-loading">Carregando estatísticas do jogo...</div>}
            <div className="detail-actions">
              <Button type="button" variant="primary" onClick={() => handleOpenGame(viewingGame)}>
                Abrir jogo
              </Button>
              <Button type="button" variant="primary" onClick={onGoField}>
                Ir para campo
              </Button>
              <Button type="button" variant="danger" onClick={() => setPendingResetGame(true)}>
                Resetar stats do jogo
              </Button>
            </div>
            <GameDetailPage
              game={viewingGame}
              players={detailRosterPlayers}
              gameStats={gameStats}
              onClose={() => setShowGameDetail(false)}
              onOpenPlayer={openPlayerDetails}
              onQuickEvent={async (playerId, category, fieldKey, delta) => {
                const current = gameStats.find((entry) => {
                  const entryPlayerId = entry.playerId?._id || entry.playerId
                  return entryPlayerId === playerId
                }) || { ...EMPTY_GAME_STAT }

                const currentCategory = current?.[category] || EMPTY_GAME_STAT[category]
                const currentValue = safeNumber(currentCategory?.[fieldKey])
                const newValue = Math.max(0, currentValue + delta)

                const updatedCategory = {
                  ...currentCategory,
                  [fieldKey]: newValue,
                }

                // Auto-recompute inningsPitched from outsPitched so they stay in sync
                if (category === 'pitching' && fieldKey === 'outsPitched') {
                  updatedCategory.inningsPitched = Math.floor(newValue / 3) + ((newValue % 3) / 10)
                }

                await upsertGameStat(
                  playerId,
                  {
                    hitting: current.hitting || EMPTY_GAME_STAT.hitting,
                    pitching: current.pitching || EMPTY_GAME_STAT.pitching,
                    defense: { ...(current.defense || EMPTY_GAME_STAT.defense) },
                    [category]: updatedCategory,
                  },
                )
              }}
            />
          </div>
        )}
      </div>
      </div>{/* /stats-main */}

      {pendingDeleteGame && (
        <ConfirmModal
          message={`Apagar jogo ${new Date(pendingDeleteGame.date).toLocaleDateString('pt-BR')} vs ${pendingDeleteGame.opponentName || pendingDeleteGame.opponent}?`}
          confirmLabel="Apagar"
          danger
          onConfirm={confirmDeleteGame}
          onCancel={() => setPendingDeleteGame(null)}
        />
      )}

      {pendingResetGame && (
        <ConfirmModal
          message="Isso apagará todos os stats do jogo selecionado. Continuar?"
          confirmLabel="Resetar"
          danger
          onConfirm={async () => { setPendingResetGame(false); await resetCurrentGameStats() }}
          onCancel={() => setPendingResetGame(false)}
        />
      )}

      <PlayerStatsModal
        player={players.find((player) => getPlayerId(player) === focusedPlayerId) || null}
        seasonEntry={seasonMap[focusedPlayerId]}
        gameEntry={
          gameStats.find((item) => {
            const itemPlayerId = item.playerId?._id || item.playerId
            return itemPlayerId === focusedPlayerId
          }) || null
        }
        onClose={() => setFocusedPlayerId(null)}
      />
    </section>
  )
}

export default StatsPage
