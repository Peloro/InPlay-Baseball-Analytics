import Modal from './ui/Modal'
import StatLabel from './ui/StatLabel'
import { safeNumber, toFixed3 } from '../utils/number'
import { eraFromPitching, whipFromPitching, k9FromPitching, formatIpFromOuts } from '../utils/stats'
import { detectPlayerType } from '../utils/player'
import { HITTER_COLS, DEFENSE_COLS } from '../constants/statColumns'

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

  const buildHittingRows = (hitting, entry) =>
    HITTER_COLS.map(({ label, get }) => ({ label, value: get({ hitting, avg: entry?.avg }) }))

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

  const buildDefenseRows = (defense) =>
    DEFENSE_COLS.map(({ label, get }) => ({ label, value: get({ defense }) }))

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
