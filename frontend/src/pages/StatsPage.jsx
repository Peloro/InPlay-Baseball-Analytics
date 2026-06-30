import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import StatLabel from '../components/ui/StatLabel'
import GameDetailPage from './GameDetailPage'
import { gameStatsApi, gamesApi, seasonStatsApi } from '../services/api'
import PlayerStatsModal from '../components/PlayerStatsModal'
import Button from '../components/ui/Button'
import ConfirmModal from '../components/ui/ConfirmModal'
import Select from '../components/ui/Select'
import { safeNumber } from '../utils/number'
import { avgFromValues, eraFromEntry, formatIpFromOuts, whipFromPitching, k9FromPitching } from '../utils/stats'
import { getPlayerId, getMainPosition, detectPlayerType } from '../utils/player'
import { EMPTY_GAME_STAT } from '../constants/stats'
import { HITTER_COLS } from '../constants/statColumns'




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
  const [pendingResetSeason, setPendingResetSeason] = useState(false)

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
    // For historical games: combine lineup, bench, and participantPlayerIds saved in
    // the nested gameState (the periodic save writes participantPlayerIds there).
    const lineupIds = (viewingGame.lineup || []).map((item) => item.playerId)
    const benchIds = viewingGame.bench || []
    const savedParticipants = viewingGame.gameState?.participantPlayerIds || []
    const gameParticipantIds = new Set([...lineupIds, ...benchIds, ...savedParticipants])
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
            ...EMPTY_GAME_STAT,
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
    // Hitters tab: all players. Pitchers tab: pitchers only. Defense tab: all players.
    const rows = seasonRows.filter(({ player }) =>
      statsTab === 'pitchers' ? detectPlayerType(player) === 'pitcher' : true
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
      wins:           (e) => safeNumber(e.pitching?.wins),
      losses:         (e) => safeNumber(e.pitching?.losses),
      saves:          (e) => safeNumber(e.pitching?.saves),
      inningsPitched: (e) => safeNumber(e.pitching?.inningsPitched),
      era:            (e) => safeNumber(e.era),
      whip:           (e) => { const o = safeNumber(e.pitching?.outsPitched); return o ? (safeNumber(e.pitching?.walks) + safeNumber(e.pitching?.hitsAllowed)) / (o / 3) : 0 },
      k9:             (e) => { const o = safeNumber(e.pitching?.outsPitched); return o ? (safeNumber(e.pitching?.strikeouts) * 9) / (o / 3) : 0 },
      strikeouts_p:   (e) => safeNumber(e.pitching?.strikeouts),
      walks_p:        (e) => safeNumber(e.pitching?.walks),
      hitsAllowed:    (e) => safeNumber(e.pitching?.hitsAllowed),
      pitchCount:     (e) => safeNumber(e.pitching?.pitchCount),
      strikes:        (e) => safeNumber(e.pitching?.strikes),
      balls:          (e) => safeNumber(e.pitching?.balls),
    }

    const defenseMetrics = {
      errors:      (e) => safeNumber(e.defense?.errors),
      doublePlays: (e) => safeNumber(e.defense?.doublePlays),
      flyOuts:     (e) => safeNumber(e.defense?.flyOuts),
      groundOuts:  (e) => safeNumber(e.defense?.groundOuts),
      lineOuts:    (e) => safeNumber(e.defense?.lineOuts),
      totalChances:(e) => safeNumber(e.defense?.flyOuts) + safeNumber(e.defense?.groundOuts) + safeNumber(e.defense?.lineOuts) + safeNumber(e.defense?.errors),
      fieldingPct: (e) => {
        const tc = safeNumber(e.defense?.flyOuts) + safeNumber(e.defense?.groundOuts) + safeNumber(e.defense?.lineOuts) + safeNumber(e.defense?.errors)
        return tc ? (tc - safeNumber(e.defense?.errors)) / tc : 1
      },
    }

    const metrics = statsTab === 'hitters' ? hitterMetrics : statsTab === 'defense' ? defenseMetrics : pitcherMetrics
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
      doubles: acc.doubles + safeNumber(item.entry.hitting?.doubles),
      triples: acc.triples + safeNumber(item.entry.hitting?.triples),
      homeRuns: acc.homeRuns + safeNumber(item.entry.hitting?.homeRuns),
      runs: acc.runs + safeNumber(item.entry.hitting?.runs),
      rbi: acc.rbi + safeNumber(item.entry.hitting?.rbi),
      hittingStrikeouts: acc.hittingStrikeouts + safeNumber(item.entry.hitting?.strikeouts),
      walks: acc.walks + safeNumber(item.entry.hitting?.walks),
      stolenBases: acc.stolenBases + safeNumber(item.entry.hitting?.stolenBases),
      // Sum raw outs so IP is computed correctly (decimal IP values can't be added directly)
      outsPitched: acc.outsPitched + safeNumber(item.entry.pitching?.outsPitched),
      earnedRuns: acc.earnedRuns + safeNumber(item.entry.pitching?.earnedRuns),
      hitsAllowed: acc.hitsAllowed + safeNumber(item.entry.pitching?.hitsAllowed),
      pitchingStrikeouts: acc.pitchingStrikeouts + safeNumber(item.entry.pitching?.strikeouts),
      pitchingWalks: acc.pitchingWalks + safeNumber(item.entry.pitching?.walks),
      wins: acc.wins + safeNumber(item.entry.pitching?.wins),
      losses: acc.losses + safeNumber(item.entry.pitching?.losses),
      saves: acc.saves + safeNumber(item.entry.pitching?.saves),
      defErrors:      acc.defErrors      + safeNumber(item.entry.defense?.errors),
      defDoublePlays: acc.defDoublePlays + safeNumber(item.entry.defense?.doublePlays),
      defFlyOuts:     acc.defFlyOuts     + safeNumber(item.entry.defense?.flyOuts),
      defGroundOuts:  acc.defGroundOuts  + safeNumber(item.entry.defense?.groundOuts),
      defLineOuts:    acc.defLineOuts    + safeNumber(item.entry.defense?.lineOuts),
    }), {
      atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0,
      runs: 0, rbi: 0, hittingStrikeouts: 0, walks: 0, stolenBases: 0,
      outsPitched: 0, earnedRuns: 0, hitsAllowed: 0,
      pitchingStrikeouts: 0, pitchingWalks: 0,
      wins: 0, losses: 0, saves: 0,
      defErrors: 0, defDoublePlays: 0, defFlyOuts: 0, defGroundOuts: 0, defLineOuts: 0,
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

  // Writes a complete stat record for one player in the viewed game.
  // Uses (gameId, playerId) as the composite key so it never fails due to
  // stale React-state _ids after a background server sync replaces local ids.
  const upsertGameStat = useCallback((playerId, fullPayload) => {
    if (!viewingGameId) return
    const player = players.find((p) => getPlayerId(p) === playerId)
    const payload = { type: detectPlayerType(player), ...fullPayload }

    setSaveStatus('saving')
    gameStatsApi.upsert(viewingGameId, playerId, payload)

    // Refresh React state from localStorage so it stays in sync with any
    // background server-sync that may have replaced local ids since the last read.
    setGameStats(gameStatsApi.listByGame(viewingGameId).data)
    loadSeasonStats().catch(() => {})
    setSaveStatus('saved')
    window.setTimeout(() => setSaveStatus('idle'), 900)
  }, [viewingGameId, players, loadSeasonStats])

  const resetCurrentGameStats = () => {
    if (!viewingGameId) return
    setSaveStatus('saving')
    for (const player of detailRosterPlayers) {
      const playerId = getPlayerId(player)
      gameStatsApi.upsert(viewingGameId, playerId, { ...EMPTY_GAME_STAT, type: detectPlayerType(player) })
    }
    setGameStats(gameStatsApi.listByGame(viewingGameId).data)
    loadSeasonStats().catch(() => {})
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

  const confirmResetSeason = async () => {
    setPendingResetSeason(false)
    gamesApi.clearSeason()
    setGames([])
    setGameStats([])
    setSeasonStats([])
    setViewingGameId(null)
    setShowGameDetail(false)
  }

  const hitterColCount = 16   // Jogador, AB, H, 2B, 3B, HR, R, RBI, BB, SO, SB, OUT, AVG, OBP, SLG, OPS
  const pitcherColCount = 14  // Jogador, W, L, SV, IP, ERA, WHIP, K/9, SO, BB, H, PC, STR, BAL
  const defenseColCount = 8   // Jogador, E, DP, FO, GO, LO, TC, FLD%

  return (
    <section className="stats-page stats-page-full">
      <div className="stats-main">
      <div className="card">
        <div className="stats-page-header">
          <h2>Estatisticas da temporada</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button type="button" variant="secondary" onClick={handleRefresh} title="Recarregar dados">
              Atualizar
            </Button>
            <Button type="button" variant="danger" onClick={() => setPendingResetSeason(true)}>
              Resetar temporada
            </Button>
          </div>
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
          <button
            type="button"
            className={statsTab === 'defense' ? 'active' : ''}
            onClick={() => setStatsTab('defense')}
          >
            Defesa
          </button>
        </div>
        <div className="season-toolbar">
          <label>
            Filtro jogador
            <Select
              value={playerFilter}
              onChange={(event) => setPlayerFilter(event.target.value)}
            >
              <option value="all">Todos</option>
              {players.map((player) => (
                <option key={getPlayerId(player)} value={getPlayerId(player)}>
                  {player.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="season-kpis">
          {statsTab === 'hitters' ? (
            <>
              <div className="kpi">
                <strong><StatLabel abbr="AVG" /></strong>
                <span>{avgFromValues(seasonTotals.atBats, seasonTotals.hits)}</span>
              </div>
              <div className="kpi">
                <strong><StatLabel abbr="OBP" /></strong>
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
                <strong><StatLabel abbr="RBI" /></strong>
                <span>{seasonTotals.rbi}</span>
              </div>
              <div className="kpi">
                <strong><StatLabel abbr="BB" /></strong>
                <span>{seasonTotals.walks}</span>
              </div>
              <div className="kpi">
                <strong>SO</strong>
                <span>{seasonTotals.hittingStrikeouts}</span>
              </div>
            </>
          ) : statsTab === 'pitchers' ? (
            <>
              <div className="kpi">
                <strong>W-L</strong>
                <span>{seasonTotals.wins}-{seasonTotals.losses}</span>
              </div>
              <div className="kpi">
                <strong>SV</strong>
                <span>{seasonTotals.saves}</span>
              </div>
              <div className="kpi">
                <strong><StatLabel abbr="IP" /></strong>
                <span>{formatIpFromOuts(seasonTotals.outsPitched)}</span>
              </div>
              <div className="kpi">
                <strong><StatLabel abbr="ERA" /></strong>
                <span>{seasonTotals.outsPitched ? ((seasonTotals.earnedRuns * 27) / seasonTotals.outsPitched).toFixed(2) : '--'}</span>
              </div>
              <div className="kpi">
                <strong><StatLabel abbr="WHIP" /></strong>
                <span>{seasonTotals.outsPitched ? (((seasonTotals.pitchingWalks + seasonTotals.hitsAllowed) / (seasonTotals.outsPitched / 3)).toFixed(2)) : '--'}</span>
              </div>
              <div className="kpi">
                <strong><StatLabel abbr="K/9" /></strong>
                <span>{seasonTotals.outsPitched ? (((seasonTotals.pitchingStrikeouts * 9) / (seasonTotals.outsPitched / 3)).toFixed(1)) : '--'}</span>
              </div>
              <div className="kpi">
                <strong>SO</strong>
                <span>{seasonTotals.pitchingStrikeouts}</span>
              </div>
              <div className="kpi">
                <strong><StatLabel abbr="BB" /></strong>
                <span>{seasonTotals.pitchingWalks}</span>
              </div>
            </>
          ) : statsTab === 'defense' ? (
            <>
              {(() => {
                const tc = seasonTotals.defFlyOuts + seasonTotals.defGroundOuts + seasonTotals.defLineOuts + seasonTotals.defErrors
                const fldPct = tc ? ((tc - seasonTotals.defErrors) / tc).toFixed(3) : '1.000'
                return (
                  <>
                    <div className="kpi"><strong><StatLabel abbr="FLD%" /></strong><span>{fldPct}</span></div>
                    <div className="kpi"><strong><StatLabel abbr="E" /></strong><span>{seasonTotals.defErrors}</span></div>
                    <div className="kpi"><strong><StatLabel abbr="DP" /></strong><span>{seasonTotals.defDoublePlays}</span></div>
                    <div className="kpi"><strong><StatLabel abbr="TC" /></strong><span>{tc}</span></div>
                    <div className="kpi"><strong><StatLabel abbr="FO" /></strong><span>{seasonTotals.defFlyOuts}</span></div>
                    <div className="kpi"><strong><StatLabel abbr="GO" /></strong><span>{seasonTotals.defGroundOuts}</span></div>
                    <div className="kpi"><strong><StatLabel abbr="LO" /></strong><span>{seasonTotals.defLineOuts}</span></div>
                  </>
                )
              })()}
            </>
          ) : null}
        </div>
        <div className="stats-table-wrap">
          {seasonLoading && <div className="stats-loading">Carregando estatísticas...</div>}
          <table className={`stats-table ${seasonLoading ? 'stats-pulse' : ''}`}>
            <thead>
              <tr>
                <th>Jogador</th>
                {statsTab === 'hitters' ? (
                  <>
                    {HITTER_COLS.map(({ label, sortKey }) => (
                      <th key={sortKey} className={`sortable-th${colSort.col === sortKey ? ' sort-active' : ''}`} onClick={() => handleColSort(sortKey)}>
                        {label}{colSort.col === sortKey ? (colSort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
                      </th>
                    ))}
                  </>
                ) : statsTab === 'pitchers' ? (
                  <>
                    {[['wins','W'],['losses','L'],['saves','SV'],['inningsPitched','IP'],['era','ERA'],['whip','WHIP'],['k9','K/9'],['strikeouts_p','SO'],['walks_p','BB'],['hitsAllowed','H'],['pitchCount','PC'],['strikes','STR'],['balls','BAL']].map(([col, label]) => (
                      <th key={col} className={`sortable-th${colSort.col === col ? ' sort-active' : ''}`} onClick={() => handleColSort(col)}>
                        {label}{colSort.col === col ? (colSort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
                      </th>
                    ))}
                  </>
                ) : (
                  <>
                    {[['errors','E'],['doublePlays','DP'],['flyOuts','FO'],['groundOuts','GO'],['lineOuts','LO'],['totalChances','TC'],['fieldingPct','FLD%']].map(([col, label]) => (
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
                  <td colSpan={statsTab === 'hitters' ? hitterColCount : statsTab === 'pitchers' ? pitcherColCount : defenseColCount} style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                    {statsTab === 'pitchers' ? 'Nenhum pitcher cadastrado.' : 'Nenhum jogador cadastrado.'}
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
                    {statsTab === 'hitters' ? (
                      <>
                        {HITTER_COLS.map(({ sortKey, get }) => (
                          <td key={sortKey}>{get(entry)}</td>
                        ))}
                      </>
                    ) : statsTab === 'pitchers' ? (
                      <>
                        <td>{safeNumber(entry.pitching?.wins)}</td>
                        <td>{safeNumber(entry.pitching?.losses)}</td>
                        <td>{safeNumber(entry.pitching?.saves)}</td>
                        <td>{formatIpFromOuts(entry.pitching?.outsPitched)}</td>
                        <td>{entry.era ? Number(entry.era).toFixed(2) : eraFromEntry(entry)}</td>
                        <td>{whipFromPitching(entry.pitching)}</td>
                        <td>{k9FromPitching(entry.pitching)}</td>
                        <td>{safeNumber(entry.pitching?.strikeouts)}</td>
                        <td>{safeNumber(entry.pitching?.walks)}</td>
                        <td>{safeNumber(entry.pitching?.hitsAllowed)}</td>
                        <td>{safeNumber(entry.pitching?.pitchCount)}</td>
                        <td>{safeNumber(entry.pitching?.strikes)}</td>
                        <td>{safeNumber(entry.pitching?.balls)}</td>
                      </>
                    ) : (() => {
                      const tc = safeNumber(entry.defense?.flyOuts) + safeNumber(entry.defense?.groundOuts) + safeNumber(entry.defense?.lineOuts) + safeNumber(entry.defense?.errors)
                      const fldPct = tc ? ((tc - safeNumber(entry.defense?.errors)) / tc).toFixed(3) : '1.000'
                      return (
                        <>
                          <td>{safeNumber(entry.defense?.errors)}</td>
                          <td>{safeNumber(entry.defense?.doublePlays)}</td>
                          <td>{safeNumber(entry.defense?.flyOuts)}</td>
                          <td>{safeNumber(entry.defense?.groundOuts)}</td>
                          <td>{safeNumber(entry.defense?.lineOuts)}</td>
                          <td>{tc}</td>
                          <td>{fldPct}</td>
                        </>
                      )
                    })()}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="stats-cards">
            {!seasonLoading && !visibleSeasonRows.length && (
              <p className="stats-empty">
                {statsTab === 'pitchers' ? 'Nenhum pitcher cadastrado.' : 'Nenhum jogador cadastrado.'}
              </p>
            )}
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
                        {HITTER_COLS.map(({ label, get }) => (
                          <div key={label}>
                            <strong><StatLabel abbr={label} /></strong>
                            <div>{get(entry)}</div>
                          </div>
                        ))}
                      </div>
                    ) : statsTab === 'pitchers' ? (
                      <div className="stat-grid">
                        <div><strong>W</strong><div>{safeNumber(entry.pitching?.wins)}</div></div>
                        <div><strong>L</strong><div>{safeNumber(entry.pitching?.losses)}</div></div>
                        <div><strong>SV</strong><div>{safeNumber(entry.pitching?.saves)}</div></div>
                        <div><strong><StatLabel abbr="IP" /></strong><div>{formatIpFromOuts(entry.pitching?.outsPitched)}</div></div>
                        <div><strong><StatLabel abbr="ERA" /></strong><div>{entry.era ? Number(entry.era).toFixed(2) : eraFromEntry(entry)}</div></div>
                        <div><strong><StatLabel abbr="WHIP" /></strong><div>{whipFromPitching(entry.pitching)}</div></div>
                        <div><strong><StatLabel abbr="K/9" /></strong><div>{k9FromPitching(entry.pitching)}</div></div>
                        <div><strong>SO</strong><div>{safeNumber(entry.pitching?.strikeouts)}</div></div>
                        <div><strong><StatLabel abbr="BB" /></strong><div>{safeNumber(entry.pitching?.walks)}</div></div>
                        <div><strong>H</strong><div>{safeNumber(entry.pitching?.hitsAllowed)}</div></div>
                        <div><strong><StatLabel abbr="PC" /></strong><div>{safeNumber(entry.pitching?.pitchCount)}</div></div>
                        <div><strong><StatLabel abbr="STR" /></strong><div>{safeNumber(entry.pitching?.strikes)}</div></div>
                        <div><strong><StatLabel abbr="BAL" /></strong><div>{safeNumber(entry.pitching?.balls)}</div></div>
                      </div>
                    ) : (() => {
                      const tc = safeNumber(entry.defense?.flyOuts) + safeNumber(entry.defense?.groundOuts) + safeNumber(entry.defense?.lineOuts) + safeNumber(entry.defense?.errors)
                      const fldPct = tc ? ((tc - safeNumber(entry.defense?.errors)) / tc).toFixed(3) : '1.000'
                      return (
                        <div className="stat-grid">
                          <div><strong><StatLabel abbr="E" /></strong><div>{safeNumber(entry.defense?.errors)}</div></div>
                          <div><strong><StatLabel abbr="DP" /></strong><div>{safeNumber(entry.defense?.doublePlays)}</div></div>
                          <div><strong><StatLabel abbr="FO" /></strong><div>{safeNumber(entry.defense?.flyOuts)}</div></div>
                          <div><strong><StatLabel abbr="GO" /></strong><div>{safeNumber(entry.defense?.groundOuts)}</div></div>
                          <div><strong><StatLabel abbr="LO" /></strong><div>{safeNumber(entry.defense?.lineOuts)}</div></div>
                          <div><strong><StatLabel abbr="TC" /></strong><div>{tc}</div></div>
                          <div><strong><StatLabel abbr="FLD%" /></strong><div>{fldPct}</div></div>
                        </div>
                      )
                    })()}
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
            <Select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="date">Por data</option>
              <option value="competition">Por competicao</option>
            </Select>
          </label>
        </div>

        {!sortedGames.length && (
          <div className="empty-state-card">
            <div className="empty-state-icon"></div>
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
              onQuickEvent={(playerId, category, fieldKey, delta) => {
                // Read FRESH from localStorage — avoids stale React state after background server sync
                const freshStats = gameStatsApi.listByGame(viewingGameId).data
                const current = freshStats.find((entry) => {
                  const entryPlayerId = entry.playerId?._id || entry.playerId
                  return entryPlayerId === playerId
                }) || { ...EMPTY_GAME_STAT }

                const currentCategory = current[category] || EMPTY_GAME_STAT[category]
                const currentValue = safeNumber(currentCategory[fieldKey])
                const newValue = Math.max(0, currentValue + delta)
                const updatedCategory = { ...currentCategory, [fieldKey]: newValue }

                if (category === 'pitching' && fieldKey === 'outsPitched') {
                  updatedCategory.inningsPitched = Math.floor(newValue / 3) + ((newValue % 3) / 10)
                }

                upsertGameStat(playerId, {
                  hitting: current.hitting || EMPTY_GAME_STAT.hitting,
                  pitching: current.pitching || EMPTY_GAME_STAT.pitching,
                  defense: current.defense || EMPTY_GAME_STAT.defense,
                  [category]: updatedCategory,
                })
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

      {pendingResetSeason && (
        <ConfirmModal
          message="Isso apagará TODOS os jogos e estatísticas da temporada. Esta ação não pode ser desfeita. Continuar?"
          confirmLabel="Resetar temporada"
          danger
          onConfirm={confirmResetSeason}
          onCancel={() => setPendingResetSeason(false)}
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
