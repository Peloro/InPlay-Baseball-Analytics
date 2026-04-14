import { useMemo } from 'react'

function getPlayerId(player) {
  return player?._id || player?.id
}

function getMainPosition(player) {
  return player.activePosition || player.positions?.[0] || 'DH'
}

function detectPlayerType(player) {
  return Array.isArray(player?.positions) && player.positions.includes('P') ? 'pitcher' : 'hitter'
}

function safeNumber(value) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function formatAverage(atBats, hits) {
  if (!atBats) return '0.000'
  return (hits / atBats).toFixed(3)
}

function formatEraFromOuts(outsPitched, er) {
  const outs = safeNumber(outsPitched)
  if (!outs) return '--'
  return ((safeNumber(er) * 21) / outs).toFixed(2)
}

function PitchingBlock({ row, onQuickEvent }) {
  return (
    <div className="pitching">
      <Stepper
        label="IP"
        value={row.pitching.inningsPitched}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'inningsPitched', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'inningsPitched', 1)}
      />
      <Stepper
        label="ER"
        value={row.pitching.earnedRuns}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'earnedRuns', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'earnedRuns', 1)}
      />
      <Stepper
        label="SO"
        value={row.pitching.strikeouts}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'strikeouts', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'strikeouts', 1)}
      />
      <Stepper
        label="BB"
        value={row.pitching.walks}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'walks', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'walks', 1)}
      />
      <div className="pitcher-metric stat-box">ERA: {formatEraFromOuts(row.pitching.outsPitched, row.pitching.earnedRuns)}</div>
      <Stepper
        label="PC"
        value={row.pitching.pitchCount}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'pitchCount', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'pitchCount', 1)}
      />
      <Stepper
        label="STR"
        value={row.pitching.strikes}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'strikes', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'strikes', 1)}
      />
      <Stepper
        label="BAL"
        value={row.pitching.balls}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'balls', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'balls', 1)}
      />
    </div>
  )
}

function Stepper({ label, value, onMinus, onPlus }) {
  return (
    <div className="stat-stepper stat-box">
      <span>{label}</span>
      <button type="button" onClick={onMinus}>
        -
      </button>
      <strong>{safeNumber(value)}</strong>
      <button type="button" onClick={onPlus}>
        +
      </button>
    </div>
  )
}

function DefenseRow({ playerId, defense, onQuickEvent }) {
  return (
    <div className="defense">
      <Stepper
        label="E"
        value={defense.errors}
        onMinus={() => onQuickEvent(playerId, 'defense', 'errors', -1)}
        onPlus={() => onQuickEvent(playerId, 'defense', 'errors', 1)}
      />
      <Stepper
        label="DP"
        value={defense.doublePlays}
        onMinus={() => onQuickEvent(playerId, 'defense', 'doublePlays', -1)}
        onPlus={() => onQuickEvent(playerId, 'defense', 'doublePlays', 1)}
      />
      <Stepper
        label="FO"
        value={defense.flyOuts}
        onMinus={() => onQuickEvent(playerId, 'defense', 'flyOuts', -1)}
        onPlus={() => onQuickEvent(playerId, 'defense', 'flyOuts', 1)}
      />
      <Stepper
        label="GO"
        value={defense.groundOuts}
        onMinus={() => onQuickEvent(playerId, 'defense', 'groundOuts', -1)}
        onPlus={() => onQuickEvent(playerId, 'defense', 'groundOuts', 1)}
      />
      <Stepper
        label="LO"
        value={defense.lineOuts}
        onMinus={() => onQuickEvent(playerId, 'defense', 'lineOuts', -1)}
        onPlus={() => onQuickEvent(playerId, 'defense', 'lineOuts', 1)}
      />
    </div>
  )
}

function GameDetailPage({ game, players, gameStats, onQuickEvent, onClose, onOpenPlayer }) {
  const rows = useMemo(() => {
    const byPlayer = {}
    for (const stat of gameStats) {
      byPlayer[stat.playerId?._id || stat.playerId] = stat
    }

    return players.map((player) => {
      const playerId = getPlayerId(player)
      const stat = byPlayer[playerId] || {
        _id: null,
        playerId,
        hitting: { atBats: 0, hits: 0, strikeouts: 0, outs: 0 },
        pitching: { inningsPitched: 0, outsPitched: 0, earnedRuns: 0, strikeouts: 0, walks: 0, strikes: 0, balls: 0, pitchCount: 0 },
        defense: { errors: 0, doublePlays: 0, flyOuts: 0, groundOuts: 0, lineOuts: 0 },
      }

      return {
        player,
        playerId,
        type: detectPlayerType(player),
        hitting: stat.hitting || { atBats: 0, hits: 0, strikeouts: 0, outs: 0 },
        pitching: stat.pitching || { inningsPitched: 0, outsPitched: 0, earnedRuns: 0, strikeouts: 0, walks: 0, strikes: 0, balls: 0, pitchCount: 0 },
        defense: stat.defense || { errors: 0, doublePlays: 0, flyOuts: 0, groundOuts: 0, lineOuts: 0 },
      }
    })
  }, [gameStats, players])

  return (
    <div className="game-detail card">
      <div className="game-detail-head">
        <h3>Detalhe do jogo</h3>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
      <p>
        {new Date(game.date).toLocaleDateString('pt-BR')} - {game.opponent} ({game.competition})
      </p>

      <h4>Planilha do jogo</h4>
      <div className="stats-container">
        <div className="player-row player-row-head">
          <strong>Jogador</strong>
          <strong>N</strong>
          <strong>Posicao</strong>
          <strong>Hitting</strong>
          <strong>Pitching</strong>
          <strong>Defesa</strong>
        </div>

        {rows.map((row) => (
          <div key={`h-${row.playerId}`} className="player-row">
            <div>
              <button type="button" className="link-btn" onClick={() => onOpenPlayer?.(row.playerId)}>
                {row.player.name}
              </button>
            </div>
            <div>{row.player.number}</div>
            <div>{getMainPosition(row.player)}</div>
            <div className="hitting">
              <Stepper
                label="AB"
                value={row.hitting.atBats}
                onMinus={() => onQuickEvent(row.playerId, 'hitting', 'atBats', -1)}
                onPlus={() => onQuickEvent(row.playerId, 'hitting', 'atBats', 1)}
              />
              <Stepper
                label="H"
                value={row.hitting.hits}
                onMinus={() => onQuickEvent(row.playerId, 'hitting', 'hits', -1)}
                onPlus={() => onQuickEvent(row.playerId, 'hitting', 'hits', 1)}
              />
              <Stepper
                label="SO"
                value={row.hitting.strikeouts}
                onMinus={() => onQuickEvent(row.playerId, 'hitting', 'strikeouts', -1)}
                onPlus={() => onQuickEvent(row.playerId, 'hitting', 'strikeouts', 1)}
              />
              <Stepper
                label="OUT"
                value={row.hitting.outs}
                onMinus={() => onQuickEvent(row.playerId, 'hitting', 'outs', -1)}
                onPlus={() => onQuickEvent(row.playerId, 'hitting', 'outs', 1)}
              />
              <div className="pitcher-metric stat-box">AVG: {formatAverage(row.hitting.atBats, row.hitting.hits)}</div>
            </div>
            <div>
              {row.type === 'pitcher' ? <PitchingBlock row={row} onQuickEvent={onQuickEvent} /> : <span>-</span>}
            </div>
            <div>
              <DefenseRow playerId={row.playerId} defense={row.defense} onQuickEvent={onQuickEvent} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default GameDetailPage
