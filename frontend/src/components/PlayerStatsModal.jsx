function toFixed3(value) {
  return Number(value || 0).toFixed(3)
}

function safeNumber(value) {
  return Number(value || 0)
}

function calculateAvg(hitting) {
  const ab = safeNumber(hitting?.atBats)
  const h = safeNumber(hitting?.hits)
  if (!ab) return '0.000'
  return (h / ab).toFixed(3)
}

function calculateEra(pitching) {
  const outs = safeNumber(pitching?.outsPitched)
  if (outs) return ((safeNumber(pitching?.earnedRuns) * 21) / outs).toFixed(3)

  const ip = safeNumber(pitching?.inningsPitched)
  const er = safeNumber(pitching?.earnedRuns)
  if (!ip) return '0.000'
  return ((er * 7) / ip).toFixed(3)
}

function renderBlock(title, rows) {
  return (
    <section className="player-stats-block">
      <h4>{title}</h4>
      <div className="player-stats-grid">
        {rows.map((row) => (
          <div key={`${title}-${row.label}`} className="player-stats-item">
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function PlayerStatsModal({ player, seasonEntry, gameEntry, onClose }) {
  if (!player) return null

  const isPitcher = Array.isArray(player.positions) && player.positions.includes('P')

  const seasonHitting = seasonEntry?.hitting || {}
  const seasonPitching = seasonEntry?.pitching || {}
  const seasonDefense = seasonEntry?.defense || {}

  const gameHitting = gameEntry?.hitting || {}
  const gamePitching = gameEntry?.pitching || {}
  const gameDefense = gameEntry?.defense || {}

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="player-stats-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="player-stats-head">
          <h3>
            {player.name} #{player.number}
          </h3>
          <button type="button" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="player-stats-two-col">
          <div>
            <h4>Temporada</h4>
            {renderBlock('Hitting', [
              { label: 'AB', value: safeNumber(seasonHitting.atBats) },
              { label: 'H', value: safeNumber(seasonHitting.hits) },
              { label: 'SO', value: safeNumber(seasonHitting.strikeouts) },
              { label: 'OUT', value: safeNumber(seasonHitting.outs) },
              { label: 'AVG', value: seasonEntry?.avg ? toFixed3(seasonEntry.avg) : calculateAvg(seasonHitting) },
            ])}
            {isPitcher && renderBlock('Pitching', [
              { label: 'IP', value: safeNumber(seasonPitching.inningsPitched) },
              { label: 'ER', value: safeNumber(seasonPitching.earnedRuns) },
              { label: 'SO', value: safeNumber(seasonPitching.strikeouts) },
              { label: 'BB', value: safeNumber(seasonPitching.walks) },
              { label: 'ERA', value: seasonEntry?.era ? toFixed3(seasonEntry.era) : calculateEra(seasonPitching) },
            ])}
            {renderBlock('Defense', [
              { label: 'E', value: safeNumber(seasonDefense.errors) },
              { label: 'DP', value: safeNumber(seasonDefense.doublePlays) },
              { label: 'FO', value: safeNumber(seasonDefense.flyOuts) },
              { label: 'GO', value: safeNumber(seasonDefense.groundOuts) },
              { label: 'LO', value: safeNumber(seasonDefense.lineOuts) },
            ])}
          </div>

          <div>
            <h4>Jogo Atual</h4>
            {renderBlock('Hitting', [
              { label: 'AB', value: safeNumber(gameHitting.atBats) },
              { label: 'H', value: safeNumber(gameHitting.hits) },
              { label: 'SO', value: safeNumber(gameHitting.strikeouts) },
              { label: 'OUT', value: safeNumber(gameHitting.outs) },
              { label: 'AVG', value: calculateAvg(gameHitting) },
            ])}
            {isPitcher && renderBlock('Pitching', [
              { label: 'IP', value: safeNumber(gamePitching.inningsPitched) },
              { label: 'ER', value: safeNumber(gamePitching.earnedRuns) },
              { label: 'SO', value: safeNumber(gamePitching.strikeouts) },
              { label: 'BB', value: safeNumber(gamePitching.walks) },
              { label: 'ERA', value: calculateEra(gamePitching) },
            ])}
            {renderBlock('Defense', [
              { label: 'E', value: safeNumber(gameDefense.errors) },
              { label: 'DP', value: safeNumber(gameDefense.doublePlays) },
              { label: 'FO', value: safeNumber(gameDefense.flyOuts) },
              { label: 'GO', value: safeNumber(gameDefense.groundOuts) },
              { label: 'LO', value: safeNumber(gameDefense.lineOuts) },
            ])}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlayerStatsModal
