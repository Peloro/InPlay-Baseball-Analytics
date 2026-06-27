import Modal from './ui/Modal'
import StatLabel from './ui/StatLabel'
import { safeNumber, toFixed3 } from '../utils/number'
import { avgFromHitting, eraFromPitching, obpFromHitting, whipFromPitching, k9FromPitching, formatIpFromOuts } from '../utils/stats'
import { detectPlayerType } from '../utils/player'

function renderBlock(title, rows) {
  return (
    <section className="player-stats-block">
      <h4>{title}</h4>
      <div className="player-stats-grid">
        {rows.map((row) => (
          <div key={`${title}-${row.label}`} className="player-stats-item">
            <span><StatLabel abbr={row.label} /></span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function PlayerStatsModal({ player, seasonEntry, gameEntry, onClose }) {
  if (!player) return null

  const isPitcher = detectPlayerType(player) === 'pitcher'

  const seasonHitting = seasonEntry?.hitting || {}
  const seasonPitching = seasonEntry?.pitching || {}
  const seasonDefense = seasonEntry?.defense || {}

  const gameHitting = gameEntry?.hitting || {}
  const gamePitching = gameEntry?.pitching || {}
  const gameDefense = gameEntry?.defense || {}

  const buildHittingRows = (hitting, entry) => [
    { label: 'AB', value: safeNumber(hitting.atBats) },
    { label: 'H', value: safeNumber(hitting.hits) },
    { label: 'HR', value: safeNumber(hitting.homeRuns) },
    { label: 'R', value: safeNumber(hitting.runs) },
    { label: 'RBI', value: safeNumber(hitting.rbi) },
    { label: 'BB', value: safeNumber(hitting.walks) },
    { label: 'SO', value: safeNumber(hitting.strikeouts) },
    { label: 'OUT', value: safeNumber(hitting.outs) },
    { label: 'AVG', value: entry?.avg ? toFixed3(entry.avg) : avgFromHitting(hitting) },
    { label: 'OBP', value: obpFromHitting(hitting) },
  ]

  const buildPitchingRows = (pitching, entry) => {
    const rows = [
      { label: 'IP', value: formatIpFromOuts(pitching.outsPitched) },
      { label: 'ERA', value: entry?.era ? toFixed3(entry.era) : eraFromPitching(pitching) },
      { label: 'WHIP', value: whipFromPitching(pitching) },
      { label: 'K/9', value: k9FromPitching(pitching) },
      { label: 'SO', value: safeNumber(pitching.strikeouts) },
      { label: 'BB', value: safeNumber(pitching.walks) },
      { label: 'ER', value: safeNumber(pitching.earnedRuns) },
      { label: 'H', value: safeNumber(pitching.hitsAllowed) },
      { label: 'PC', value: safeNumber(pitching.pitchCount) },
      { label: 'STR', value: safeNumber(pitching.strikes) },
      { label: 'BAL', value: safeNumber(pitching.balls) },
    ]
    const typeKeys = ['FB', 'CV', 'SL', 'CH', 'SI', 'CT']
    if (typeKeys.some(t => safeNumber(pitching.pitchTypes?.[t]) > 0)) {
      typeKeys.forEach(t => {
        const v = safeNumber(pitching.pitchTypes?.[t])
        if (v > 0) rows.push({ label: t, value: v })
      })
    }
    return rows
  }

  const buildDefenseRows = (defense) => [
    { label: 'E', value: safeNumber(defense.errors) },
    { label: 'DP', value: safeNumber(defense.doublePlays) },
    { label: 'FO', value: safeNumber(defense.flyOuts) },
    { label: 'GO', value: safeNumber(defense.groundOuts) },
    { label: 'LO', value: safeNumber(defense.lineOuts) },
  ]

  return (
    <Modal title={`${player.name} #${player.number}`} onClose={onClose}>
      <div className="player-stats-two-col">
        <div>
          <h4>Temporada</h4>
          {renderBlock('Hitting', buildHittingRows(seasonHitting, seasonEntry))}
          {isPitcher && renderBlock('Pitching', buildPitchingRows(seasonPitching, seasonEntry))}
          {renderBlock('Defense', buildDefenseRows(seasonDefense))}
        </div>

        <div>
          <h4>Jogo Atual</h4>
          {renderBlock('Hitting', buildHittingRows(gameHitting, gameEntry))}
          {isPitcher && renderBlock('Pitching', buildPitchingRows(gamePitching, gameEntry))}
          {renderBlock('Defense', buildDefenseRows(gameDefense))}
        </div>
      </div>
    </Modal>
  )
}

export default PlayerStatsModal
