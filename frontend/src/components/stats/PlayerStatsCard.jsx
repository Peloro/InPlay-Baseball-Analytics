import React, {useState, memo} from 'react'
import Button from '../../components/ui/Button'

function safeNumber(v){
  const n = Number(v || 0)
  if(!Number.isFinite(n) || n < 0) return 0
  return n
}

function formatAvg(atBats, hits){
  const ab = safeNumber(atBats)
  const h = safeNumber(hits)
  if(!ab) return '0.000'
  return (h/ab).toFixed(3)
}

function PlayerStatsCard({player, entry, statsTab, onOpenPlayer, isLeader}){
  const [expanded, setExpanded] = useState(false)
  const name = player?.name || '—'
  const number = player?.number || ''

  const hitting = entry?.hitting || {}
  const pitching = entry?.pitching || {}
  const defense = entry?.defense || {}

  return (
    <article className={`player-stats-card ${expanded ? 'expanded' : ''} ${isLeader ? 'leader' : ''}`}>
      <header className="psc-head">
        <div className="psc-title">
          <strong>{name}</strong>
          <span className="psc-number">#{number}</span>
        </div>
        <div className="psc-actions">
          <Button type="button" variant="link" onClick={() => onOpenPlayer?.(player._id || player.id)}>
            Detalhes
          </Button>
          <Button type="button" onClick={() => setExpanded((s) => !s)}>
            {expanded ? 'Ver menos' : 'Ver mais'}
          </Button>
        </div>
      </header>

      <div className="psc-metrics">
        {statsTab === 'hitters' ? (
          <>
            <div className="psc-row">
              <div className="psc-metric important">AVG<div className="psc-value">{entry?.avg ? Number(entry.avg).toFixed(3) : formatAvg(hitting.atBats, hitting.hits)}</div></div>
              <div className="psc-metric">AB<div className="psc-value">{safeNumber(hitting.atBats)}</div></div>
              <div className="psc-metric">H<div className="psc-value">{safeNumber(hitting.hits)}</div></div>
            </div>
            <div className="psc-row">
              <div className="psc-metric">RBI<div className="psc-value">{safeNumber(hitting.rbi)}</div></div>
              <div className="psc-metric">BB<div className="psc-value">{safeNumber(hitting.walks)}</div></div>
              <div className="psc-metric">SO<div className="psc-value">{safeNumber(hitting.strikeouts)}</div></div>
            </div>
          </>
        ) : (
          <>
            <div className="psc-row">
              <div className="psc-metric important">IP<div className="psc-value">{safeNumber(pitching.inningsPitched)}</div></div>
              <div className="psc-metric">ERA<div className="psc-value">{entry?.era ? Number(entry.era).toFixed(3) : (pitching.earnedRuns ? ((safeNumber(pitching.earnedRuns)*7)/Math.max(1, safeNumber(pitching.inningsPitched))).toFixed(3) : '0.000')}</div></div>
              <div className="psc-metric">PC<div className="psc-value">{safeNumber(pitching.pitchCount)}</div></div>
            </div>
            <div className="psc-row">
              <div className="psc-metric">SO<div className="psc-value">{safeNumber(pitching.strikeouts)}</div></div>
              <div className="psc-metric">BB<div className="psc-value">{safeNumber(pitching.walks)}</div></div>
              <div className="psc-metric">ER<div className="psc-value">{safeNumber(pitching.earnedRuns)}</div></div>
            </div>
          </>
        )}
      </div>

      <div className={`psc-defense ${expanded ? '' : 'collapsed'}`}>
        <h4>Defesa</h4>
        <div className="psc-defense-grid">
          <div>Errors<div className="psc-value">{safeNumber(defense.errors)}</div></div>
          <div>DP<div className="psc-value">{safeNumber(defense.doublePlays)}</div></div>
          <div>FlyOut<div className="psc-value">{safeNumber(defense.flyOuts)}</div></div>
          <div>GroundOut<div className="psc-value">{safeNumber(defense.groundOuts)}</div></div>
          <div>LineOut<div className="psc-value">{safeNumber(defense.lineOuts)}</div></div>
        </div>
      </div>
    </article>
  )
}

export default memo(PlayerStatsCard)
