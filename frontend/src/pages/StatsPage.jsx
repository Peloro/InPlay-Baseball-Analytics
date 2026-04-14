import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameDetailPage from './GameDetailPage'
import { gameStatsApi, gamesApi, seasonStatsApi } from '../services/api'
import { VALID_POSITIONS } from '../data/positions'
import PlayerStatsModal from '../components/PlayerStatsModal'

function getPlayerId(player) {
  return player?._id || player?.id
}

function getMainPosition(player) {
  return player.activePosition || player.positions?.[0] || 'DH'
}

function formatAverage(atBats, hits) {
  if (!atBats) return '0.000'
  return (hits / atBats).toFixed(3)
}

const EMPTY_GAME_STAT = {
  type: 'hitter',
  hitting: { atBats: 0, hits: 0, strikeouts: 0, outs: 0 },
  pitching: { inningsPitched: 0, outsPitched: 0, earnedRuns: 0, strikeouts: 0, walks: 0, strikes: 0, balls: 0, pitchCount: 0 },
  defense: { errors: 0, doublePlays: 0, flyOuts: 0, groundOuts: 0, lineOuts: 0 },
}

function safeNumber(value) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function getAvg(entry) {
  const ab = safeNumber(entry?.hitting?.atBats)
  const hits = safeNumber(entry?.hitting?.hits)
  if (!ab) return '0.000'
  return (hits / ab).toFixed(3)
}

function getEra(entry) {
  const outs = safeNumber(entry?.pitching?.outsPitched)
  const er = safeNumber(entry?.pitching?.earnedRuns)
  if (outs) return ((er * 21) / outs).toFixed(3)

  const ip = safeNumber(entry?.pitching?.inningsPitched)
  if (!ip) return '0.000'
  return ((er * 7) / ip).toFixed(3)
}

function detectPlayerType(player) {
  return Array.isArray(player?.positions) && player.positions.includes('P') ? 'pitcher' : 'hitter'
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function StatsPage({
  players,
  onAddPlayer,
  onDeletePlayer,
  onDeleteGame,
  onOpenGame,
  onSelectGame,
  gameState,
  onUpdateGameState,
  onGoField,
}) {
  const [form, setForm] = useState({ name: '', number: '', positions: ['DH'], activePosition: 'DH' })
  const [gameForm, setGameForm] = useState({ date: '', opponentName: '', competition: '', location: '' })
  const [games, setGames] = useState([])
  const [gameStats, setGameStats] = useState([])
  const [seasonStats, setSeasonStats] = useState([])
  const [sortBy, setSortBy] = useState('date')
  const [playerFilter, setPlayerFilter] = useState('all')
  const [statsTab, setStatsTab] = useState('hitters')
  const [seasonSortBy, setSeasonSortBy] = useState('hits')
  const [focusedPlayerId, setFocusedPlayerId] = useState(null)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [isStatsLeaving, setIsStatsLeaving] = useState(false)
  const gameDetailsRef = useRef(null)

  const selectedGameId = gameState.currentGameId
  const participantIds = useMemo(
    () => gameState.participantPlayerIds || [],
    [gameState.participantPlayerIds],
  )

  const rosterPlayers = useMemo(() => {
    const ids = participantIds.length ? new Set(participantIds) : null
    return players.filter((player) => (ids ? ids.has(getPlayerId(player)) : true))
  }, [players, participantIds])

  const loadGames = useCallback(async () => {
    const response = await gamesApi.list()
    setGames(response.data || [])
  }, [])

  const loadSeasonStats = useCallback(async () => {
    const response = await seasonStatsApi.list(playerFilter === 'all' ? null : playerFilter)
    setSeasonStats(response.data || [])
  }, [playerFilter])

  const loadGameStats = useCallback(async (gameId) => {
    if (!gameId) {
      setGameStats([])
      return
    }

    const response = await gameStatsApi.listByGame(gameId)
    setGameStats(response.data || [])
  }, [])

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadSeasonStats().catch(() => {})
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadSeasonStats])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadGameStats(selectedGameId).catch(() => {})
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadGameStats, selectedGameId])

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
            hitting: { atBats: 0, hits: 0, strikeouts: 0, outs: 0 },
            pitching: { inningsPitched: 0, outsPitched: 0, earnedRuns: 0, strikeouts: 0, walks: 0, strikes: 0, balls: 0, pitchCount: 0 },
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
    const rows = seasonRows.filter(({ player }) => {
      if (statsTab === 'hitters') return true
      return detectPlayerType(player) === 'pitcher'
    })

    const byMetric = {
      hits: (entry) => safeNumber(entry.hitting?.hits),
      avg: (entry) => {
        const ab = safeNumber(entry.hitting?.atBats)
        if (!ab) return 0
        return safeNumber(entry.hitting?.hits) / ab
      },
      strikeouts: (entry) => safeNumber(entry.hitting?.strikeouts),
    }

    const metricFn = byMetric[seasonSortBy] || byMetric.hits
    return [...rows].sort((a, b) => metricFn(b.entry) - metricFn(a.entry))
  }, [seasonRows, statsTab, seasonSortBy])

  const leaders = useMemo(() => {
    if (!visibleSeasonRows.length) {
      return { topHitsId: null, topAvgId: null }
    }

    let topHitsId = null
    let topHitsValue = -1
    let topAvgId = null
    let topAvgValue = -1

    for (const row of visibleSeasonRows) {
      const id = getPlayerId(row.player)
      const hits = safeNumber(row.entry.hitting?.hits)
      const ab = safeNumber(row.entry.hitting?.atBats)
      const avg = ab ? hits / ab : 0

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
    return visibleSeasonRows.reduce((acc, item) => {
      return {
        atBats: acc.atBats + safeNumber(item.entry.hitting?.atBats),
        hits: acc.hits + safeNumber(item.entry.hitting?.hits),
        hittingStrikeouts: acc.hittingStrikeouts + safeNumber(item.entry.hitting?.strikeouts),
        inningsPitched: acc.inningsPitched + safeNumber(item.entry.pitching?.inningsPitched),
        earnedRuns: acc.earnedRuns + safeNumber(item.entry.pitching?.earnedRuns),
        pitchingStrikeouts: acc.pitchingStrikeouts + safeNumber(item.entry.pitching?.strikeouts),
        walks: acc.walks + safeNumber(item.entry.pitching?.walks),
      }
    }, {
      atBats: 0,
      hits: 0,
      hittingStrikeouts: 0,
      inningsPitched: 0,
      earnedRuns: 0,
      pitchingStrikeouts: 0,
      walks: 0,
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

  const selectedGame = useMemo(
    () => games.find((game) => game._id === selectedGameId) || null,
    [games, selectedGameId],
  )

  const openPlayerDetails = useCallback((playerId) => {
    setFocusedPlayerId(null)
    window.requestAnimationFrame(() => setFocusedPlayerId(playerId))
  }, [])

  const upsertGameStat = async (playerId, patch = {}) => {
    const found = gameStats.find((item) => {
      const itemPlayerId = item.playerId?._id || item.playerId
      return itemPlayerId === playerId
    })

    const fallback = found || {
      _id: null,
      gameId: selectedGameId,
      playerId,
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
        gameId: selectedGameId,
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
    if (!selectedGameId) return

    setSaveStatus('saving')
    for (const player of rosterPlayers) {
      const playerId = getPlayerId(player)
      await upsertGameStat(playerId, {
        hitting: { atBats: 0, hits: 0, strikeouts: 0, outs: 0 },
        pitching: { inningsPitched: 0, outsPitched: 0, earnedRuns: 0, strikeouts: 0, walks: 0, strikes: 0, balls: 0, pitchCount: 0 },
        defense: { errors: 0, doublePlays: 0, flyOuts: 0, groundOuts: 0, lineOuts: 0 },
      })
    }

    await loadGameStats(selectedGameId)
    setSaveStatus('saved')
    window.setTimeout(() => setSaveStatus('idle'), 900)
  }

  const handleAddPlayer = async (event) => {
    event.preventDefault()

    if (!form.name.trim() || !form.number || form.positions.length === 0) {
      return
    }

    await onAddPlayer({
      name: form.name.trim(),
      number: Number(form.number),
      positions: form.positions,
      activePosition: form.activePosition,
    })

    setForm({ name: '', number: '', positions: ['DH'], activePosition: 'DH' })
  }

  const toggleFormPosition = (position) => {
    setForm((current) => {
      const has = current.positions.includes(position)
      const positions = has
        ? current.positions.filter((item) => item !== position)
        : [...current.positions, position]

      const safePositions = positions.length ? positions : ['DH']
      const activePosition = safePositions.includes(current.activePosition)
        ? current.activePosition
        : safePositions[0]

      return { ...current, positions: safePositions, activePosition }
    })
  }

  const toggleParticipant = (playerId) => {
    const current = gameState.participantPlayerIds || players.map((player) => getPlayerId(player))
    const has = current.includes(playerId)
    const next = has ? current.filter((id) => id !== playerId) : [...current, playerId]
    onUpdateGameState((state) => {
      const currentOrder = state.battingOrder || []
      const validOrder = currentOrder.filter((id) => next.includes(id))
      const battingOrder = has ? validOrder : [...validOrder, playerId]
      const currentBatterIndex = battingOrder.length
        ? Math.min(state.currentBatterIndex || 0, battingOrder.length - 1)
        : 0

      return {
        ...state,
        participantPlayerIds: next,
        battingOrder,
        currentBatterIndex,
      }
    }, 'Participantes da ficha atualizados')
  }

  const handleCreateGame = async (event) => {
    event.preventDefault()

    if (!gameForm.date || !gameForm.opponentName.trim() || !gameForm.competition.trim()) return

    const response = await gamesApi.create({
      date: gameForm.date,
      opponent: gameForm.opponentName.trim(),
      opponentName: gameForm.opponentName.trim(),
      competition: gameForm.competition.trim(),
      location: gameForm.location.trim(),
    })

    const createdGame = response.data
    setGameForm({ date: '', opponentName: '', competition: '', location: '' })
    await loadGames()
    onSelectGame?.(createdGame)

    setIsStatsLeaving(true)
    await wait(240)
    onOpenGame?.(createdGame)
  }

  const handleDeletePlayerItem = async (player) => {
    const playerId = getPlayerId(player)
    if (!playerId) return

    const confirmed = window.confirm(`Apagar jogador ${player.name} #${player.number}?`)
    if (!confirmed) return

    await onDeletePlayer?.(playerId)

    if (focusedPlayerId === playerId) {
      setFocusedPlayerId(null)
    }

    await loadSeasonStats()
    if (selectedGameId) {
      await loadGameStats(selectedGameId)
    }
  }

  const handleDeleteGameItem = async (game) => {
    if (!game?._id) return

    const confirmed = window.confirm(
      `Apagar jogo ${new Date(game.date).toLocaleDateString('pt-BR')} vs ${game.opponentName || game.opponent}?`,
    )
    if (!confirmed) return

    await onDeleteGame?.(game._id)
    await loadGames()
    await loadSeasonStats()

    if (selectedGameId === game._id) {
      setGameStats([])
    } else if (selectedGameId) {
      await loadGameStats(selectedGameId)
    }
  }

  const handleSelectGameCard = (game) => {
    onSelectGame?.(game)
  }

  const handleOpenGame = (game) => {
    onOpenGame?.(game)
  }

  const handleViewGameStats = (game) => {
    onSelectGame?.(game)
    window.setTimeout(() => {
      gameDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 20)
  }

  return (
    <section className={`stats-page ${isStatsLeaving ? 'stats-page-leaving' : ''}`}>
      <div className="card">
        <h2>Adicionar jogador</h2>
        <form className="player-form" onSubmit={handleAddPlayer}>
          <input
            placeholder="Nome"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
          <input
            placeholder="Numero"
            type="number"
            value={form.number}
            onChange={(event) =>
              setForm((current) => ({ ...current, number: event.target.value }))
            }
          />
          <div className="positions-picker">
            {VALID_POSITIONS.map((position) => (
              <label key={position}>
                <input
                  type="checkbox"
                  checked={form.positions.includes(position)}
                  onChange={() => toggleFormPosition(position)}
                />
                {position}
              </label>
            ))}
          </div>
          <select
            value={form.activePosition}
            onChange={(event) => setForm((current) => ({ ...current, activePosition: event.target.value }))}
          >
            {form.positions.map((position) => (
              <option key={`active-${position}`} value={position}>
                Titular: {position}
              </option>
            ))}
          </select>
          <button type="submit">Salvar jogador</button>
        </form>

        <div className="managed-list">
          {players.map((player) => {
            const id = getPlayerId(player)
            return (
              <div key={`managed-player-${id}`} className="managed-list-item">
                <span>
                  {player.name} #{player.number} ({getMainPosition(player)})
                </span>
                <button type="button" className="danger-btn" onClick={() => handleDeletePlayerItem(player)}>
                  Apagar
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <h2>Lineup da ficha</h2>
        <div className="lineup-picker">
          {players.map((player) => {
            const id = getPlayerId(player)
            const selected = participantIds.length ? participantIds.includes(id) : true
            return (
              <label key={`lineup-${id}`}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleParticipant(id)}
                />
                {player.name} #{player.number} ({getMainPosition(player)})
              </label>
            )
          })}
        </div>
      </div>

      <div className="card">
        <h2>Estatisticas da temporada</h2>
        <div className="season-toolbar inline-tools">
          <label>
            Ordenar por
            <select value={seasonSortBy} onChange={(event) => setSeasonSortBy(event.target.value)}>
              <option value="hits">Hits</option>
              <option value="avg">AVG</option>
              <option value="strikeouts">Strikeouts</option>
            </select>
          </label>
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
                <strong>AVG geral</strong>
                <span>{formatAverage(seasonTotals.atBats, seasonTotals.hits)}</span>
              </div>
              <div className="kpi">
                <strong>Hits</strong>
                <span>{seasonTotals.hits}</span>
              </div>
              <div className="kpi">
                <strong>AB</strong>
                <span>{seasonTotals.atBats}</span>
              </div>
              <div className="kpi">
                <strong>SO</strong>
                <span>{seasonTotals.hittingStrikeouts}</span>
              </div>
              <div className="kpi">
                <strong>OUT</strong>
                <span>{visibleSeasonRows.reduce((acc, item) => acc + safeNumber(item.entry.hitting?.outs), 0)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="kpi">
                <strong>IP</strong>
                <span>{seasonTotals.inningsPitched}</span>
              </div>
              <div className="kpi">
                <strong>ER</strong>
                <span>{seasonTotals.earnedRuns}</span>
              </div>
              <div className="kpi">
                <strong>SO</strong>
                <span>{seasonTotals.pitchingStrikeouts}</span>
              </div>
              <div className="kpi">
                <strong>BB</strong>
                <span>{seasonTotals.walks}</span>
              </div>
            </>
          )}
        </div>
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Jogador</th>
                <th>N</th>
                <th>Posicao</th>
                {statsTab === 'hitters' ? (
                  <>
                    <th>AB</th>
                    <th>H</th>
                    <th>SO</th>
                    <th>OUT</th>
                    <th>AVG</th>
                  </>
                ) : (
                  <>
                    <th>Pitching</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {visibleSeasonRows.map(({ player, entry }) => {
                const id = getPlayerId(player)

                return (
                  <tr
                    key={id}
                    className={id === leaders.topHitsId || id === leaders.topAvgId ? 'season-leader-row' : ''}
                  >
                    <td>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => openPlayerDetails(id)}
                      >
                        {player.name}
                      </button>
                    </td>
                    <td>{player.number}</td>
                    <td>{getMainPosition(player)}</td>
                    {statsTab === 'hitters' ? (
                      <>
                        <td>{safeNumber(entry.hitting?.atBats)}</td>
                        <td>{safeNumber(entry.hitting?.hits)}</td>
                        <td>{safeNumber(entry.hitting?.strikeouts)}</td>
                        <td>{safeNumber(entry.hitting?.outs)}</td>
                        <td>{entry.avg ? Number(entry.avg).toFixed(3) : getAvg(entry)}</td>
                      </>
                    ) : (
                      <>
                        <td>
                          <div className="pitcher-stat-grid">
                            <span>IP: {safeNumber(entry.pitching?.inningsPitched)}</span>
                            <span>ERA: {entry.era ? Number(entry.era).toFixed(3) : getEra(entry)}</span>
                            <span>SO: {safeNumber(entry.pitching?.strikeouts)}</span>
                            <span>BB: {safeNumber(entry.pitching?.walks)}</span>
                            <span>PC: {safeNumber(entry.pitching?.pitchCount)}</span>
                            <span>STR: {safeNumber(entry.pitching?.strikes)}</span>
                            <span>BAL: {safeNumber(entry.pitching?.balls)}</span>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Jogos individuais</h2>
        <div className="game-state-indicator">
          {selectedGame
            ? `Jogo selecionado: ${new Date(selectedGame.date).toLocaleDateString('pt-BR')} - ${selectedGame.opponentName || selectedGame.opponent}`
            : 'Nenhum jogo selecionado'}
        </div>
        <div className="autosave-indicator">
          {saveStatus === 'saving' ? 'Salvando automaticamente...' : saveStatus === 'saved' ? 'Salvo automaticamente' : ''}
        </div>
        <form className="game-form" onSubmit={handleCreateGame}>
          <input
            type="date"
            value={gameForm.date}
            onChange={(event) => setGameForm((current) => ({ ...current, date: event.target.value }))}
          />
          <input
            placeholder="Nome do adversario"
            value={gameForm.opponentName}
            onChange={(event) =>
              setGameForm((current) => ({ ...current, opponentName: event.target.value }))
            }
          />
          <input
            placeholder="Competicao (treino/campeonato)"
            value={gameForm.competition}
            onChange={(event) =>
              setGameForm((current) => ({ ...current, competition: event.target.value }))
            }
          />
          <input
            placeholder="Local (opcional)"
            value={gameForm.location}
            onChange={(event) =>
              setGameForm((current) => ({ ...current, location: event.target.value }))
            }
          />
          <button type="submit">Criar jogo</button>
        </form>

        <div className="season-toolbar">
          <label>
            Ordenacao
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="date">Por data</option>
              <option value="competition">Por competicao</option>
            </select>
          </label>
        </div>

        <ul className="game-list">
          {sortedGames.map((game) => {
            const score = game?.gameState
              ? `${Number(game.gameState.homeScore || 0)} x ${Number(game.gameState.awayScore || 0)}`
              : '-- x --'

            return (
              <li key={game._id}>
                <article
                  className={`game-card ${selectedGameId === game._id ? 'selected' : ''}`}
                  onClick={() => handleSelectGameCard(game)}
                >
                  <div className="game-card-head">
                    <strong>{game.opponentName || game.opponent}</strong>
                    <span>{new Date(game.date).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="game-card-meta">
                    <span>{game.competition}</span>
                    <span>Placar: {score}</span>
                  </div>
                  <div className="game-card-actions">
                    <button
                      type="button"
                      className="action-btn"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleOpenGame(game)
                      }}
                    >
                      Abrir jogo
                    </button>
                    <button
                      type="button"
                      className="action-btn"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleViewGameStats(game)
                      }}
                    >
                      Ver estatisticas
                    </button>
                    <button
                      type="button"
                      className="action-btn danger-btn"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDeleteGameItem(game)
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>

        {selectedGame && (
          <div ref={gameDetailsRef}>
            <div className="detail-actions">
              <button type="button" className="action-btn" onClick={() => handleOpenGame(selectedGame)}>
                Abrir jogo
              </button>
              <button type="button" className="action-btn" onClick={onGoField}>
                Ir para campo
              </button>
              <button type="button" className="action-btn" onClick={resetCurrentGameStats}>
                Resetar stats do jogo
              </button>
            </div>
            <GameDetailPage
              game={selectedGame}
              players={rosterPlayers}
              gameStats={gameStats}
              onClose={() => onUpdateGameState({ currentGameId: null }, 'Detalhe do jogo fechado')}
              onOpenPlayer={openPlayerDetails}
              onQuickEvent={async (playerId, category, fieldKey, delta) => {
                const current = gameStats.find((entry) => {
                  const entryPlayerId = entry.playerId?._id || entry.playerId
                  return entryPlayerId === playerId
                }) || { ...EMPTY_GAME_STAT }

                const currentCategory = current?.[category] || EMPTY_GAME_STAT[category]
                const currentValue = safeNumber(currentCategory?.[fieldKey])

                await upsertGameStat(
                  playerId,
                  {
                    hitting: current.hitting || EMPTY_GAME_STAT.hitting,
                    pitching: current.pitching || EMPTY_GAME_STAT.pitching,
                    defense: {
                      ...(current.defense || EMPTY_GAME_STAT.defense),
                    },
                    [category]: {
                      ...currentCategory,
                      [fieldKey]: Math.max(0, currentValue + delta),
                    },
                  },
                )
              }}
            />
          </div>
        )}
      </div>

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
