import { useMemo, useState } from 'react'
import Button from '../components/ui/Button'
import StatLabel from '../components/ui/StatLabel'
import { safeNumber } from '../utils/number'
import { avgFromValues, formatEraFromOuts, formatIpFromOuts } from '../utils/stats'
import { getPlayerId, getMainPosition, detectPlayerType } from '../utils/player'
import { EMPTY_HITTING, EMPTY_PITCHING, EMPTY_DEFENSE } from '../constants/stats'

// ── Report generation ─────────────────────────────────────────────

function pad(str, len, right = false) {
  const s = String(str ?? '')
  if (right) return s.padEnd(len)
  return s.padStart(len)
}

function generateTextReport(game, rows) {
  const date = new Date(game.date).toLocaleDateString('pt-BR')
  const gs = game.gameState || {}
  const homeScore = safeNumber(gs.homeScore)
  const awayScore = safeNumber(gs.awayScore)
  const inningScores = gs.inningScores || { home: [], away: [] }
  const sep = '─'.repeat(56)

  const lines = [
    'RELATÓRIO DE JOGO',
    '═'.repeat(40),
    `vs ${game.opponentName || game.opponent}`,
    `Data: ${date}   Competição: ${game.competition || '—'}`,
    `Placar final: ${homeScore} x ${awayScore}`,
  ]

  const maxInning = Math.max(inningScores.home.length, inningScores.away.length)
  if (maxInning > 0) {
    const innings = Array.from({ length: maxInning }, (_, i) => i + 1)
    lines.push('')
    lines.push('PLACAR POR INNING')
    lines.push(`${'Inning'.padEnd(8)} ${innings.map((n) => pad(n, 3)).join('')}  | Tot`)
    lines.push(`${'Nós'.padEnd(8)} ${innings.map((_, i) => pad(inningScores.home[i] ?? 0, 3)).join('')}  | ${homeScore}`)
    lines.push(`${'Deles'.padEnd(8)} ${innings.map((_, i) => pad(inningScores.away[i] ?? 0, 3)).join('')}  | ${awayScore}`)
  }

  lines.push('')
  lines.push('BATTING')
  lines.push(sep)
  lines.push(
    `${pad('Jogador', 18, true)}${pad('AB', 4)}${pad('H', 4)}${pad('2B', 4)}${pad('3B', 4)}${pad('HR', 4)}${pad('R', 4)}${pad('RBI', 4)}${pad('BB', 4)}${pad('SO', 4)}${pad('SB', 4)}${pad('OUT', 4)}  AVG`
  )
  lines.push(sep)

  for (const row of rows) {
    const h = row.hitting
    const ab = safeNumber(h.atBats)
    const hits = safeNumber(h.hits)
    const avg = ab ? (hits / ab).toFixed(3) : '.000'
    lines.push(
      `${pad(row.player.name, 18, true)}${pad(ab, 4)}${pad(hits, 4)}${pad(safeNumber(h.doubles), 4)}${pad(safeNumber(h.triples), 4)}${pad(safeNumber(h.homeRuns), 4)}${pad(safeNumber(h.runs), 4)}${pad(safeNumber(h.rbi), 4)}${pad(safeNumber(h.walks), 4)}${pad(safeNumber(h.strikeouts), 4)}${pad(safeNumber(h.stolenBases), 4)}${pad(safeNumber(h.outs), 4)}  ${avg}`
    )
  }

  const pitchers = rows.filter((r) => r.type === 'pitcher')
  if (pitchers.length > 0) {
    lines.push('')
    lines.push('PITCHING')
    lines.push(sep)
    lines.push(
      `${pad('Pitcher', 18, true)}${pad('IP', 6)}${pad('ER', 4)}${pad('ERA', 6)}${pad('H', 4)}${pad('SO', 4)}${pad('BB', 4)}${pad('PC', 5)}`
    )
    lines.push(sep)
    for (const row of pitchers) {
      const p = row.pitching
      const outs = safeNumber(p.outsPitched)
      const ip = formatIpFromOuts(outs)
      const era = outs ? ((safeNumber(p.earnedRuns) * 27) / outs).toFixed(2) : '0.00'
      lines.push(
        `${pad(row.player.name, 18, true)}${pad(ip, 6)}${pad(safeNumber(p.earnedRuns), 4)}${pad(era, 6)}${pad(safeNumber(p.hitsAllowed), 4)}${pad(safeNumber(p.strikeouts), 4)}${pad(safeNumber(p.walks), 4)}${pad(safeNumber(p.pitchCount), 5)}`
      )
    }
  }

  const subs = gs.substitutions || []
  if (subs.length > 0) {
    lines.push('')
    lines.push('SUBSTITUIÇÕES')
    lines.push(sep)
    for (const sub of subs) {
      const half = sub.half === 'top' ? '▲' : '▼'
      const desc = sub.playerOutName
        ? `${sub.playerInName} → ${sub.playerOutName} (${sub.position})`
        : `${sub.playerInName} entrou (${sub.position})`
      lines.push(`${pad(`${sub.inning}º ${half}`, 8, true)} ${desc}`)
    }
  }

  const log = gs.gameLog || []
  if (log.length > 0) {
    lines.push('')
    lines.push('PLAY-BY-PLAY')
    lines.push(sep)
    for (const entry of log) {
      const half = entry.half === 'top' ? '▲' : '▼'
      lines.push(`${pad(`${entry.inning}º ${half}`, 8, true)} ${entry.description}`)
    }
  }

  lines.push('')
  lines.push(`Gerado em: ${new Date().toLocaleString('pt-BR')}`)
  return lines.join('\n')
}

function generateHtmlReport(game, rows) {
  const date = new Date(game.date).toLocaleDateString('pt-BR')
  const gs = game.gameState || {}
  const homeScore = safeNumber(gs.homeScore)
  const awayScore = safeNumber(gs.awayScore)
  const inningScores = gs.inningScores || { home: [], away: [] }
  const maxInning = Math.max(inningScores.home.length, inningScores.away.length)

  const battingRows = rows.map((row) => {
    const h = row.hitting
    const ab = safeNumber(h.atBats)
    const hits = safeNumber(h.hits)
    const avg = ab ? (hits / ab).toFixed(3) : '.000'
    return `<tr><td>${row.player.name}</td><td>#${row.player.number}</td><td>${getMainPosition(row.player)}</td><td>${ab}</td><td>${hits}</td><td>${safeNumber(h.doubles)}</td><td>${safeNumber(h.triples)}</td><td>${safeNumber(h.homeRuns)}</td><td>${safeNumber(h.runs)}</td><td>${safeNumber(h.rbi)}</td><td>${safeNumber(h.walks)}</td><td>${safeNumber(h.strikeouts)}</td><td>${safeNumber(h.stolenBases)}</td><td>${safeNumber(h.outs)}</td><td>${avg}</td></tr>`
  }).join('')

  const pitchers = rows.filter((r) => r.type === 'pitcher')
  const pitchingRows = pitchers.map((row) => {
    const p = row.pitching
    const outs = safeNumber(p.outsPitched)
    const ip = formatIpFromOuts(outs)
    const era = outs ? ((safeNumber(p.earnedRuns) * 27) / outs).toFixed(2) : '0.00'
    return `<tr><td>${row.player.name}</td><td>${ip}</td><td>${safeNumber(p.earnedRuns)}</td><td>${era}</td><td>${safeNumber(p.hitsAllowed)}</td><td>${safeNumber(p.strikeouts)}</td><td>${safeNumber(p.walks)}</td><td>${safeNumber(p.pitchCount)}</td></tr>`
  }).join('')

  let linescoreHtml = ''
  if (maxInning > 0) {
    const innings = Array.from({ length: maxInning }, (_, i) => i + 1)
    const thCells = innings.map((n) => `<th>${n}</th>`).join('')
    const homeCells = innings.map((_, i) => `<td>${inningScores.home[i] ?? 0}</td>`).join('')
    const awayCells = innings.map((_, i) => `<td>${inningScores.away[i] ?? 0}</td>`).join('')
    linescoreHtml = `
      <h2>Placar por Inning</h2>
      <table><thead><tr><th>Time</th>${thCells}<th>Total</th></tr></thead>
      <tbody>
        <tr><td><strong>Nós</strong></td>${homeCells}<td><strong>${homeScore}</strong></td></tr>
        <tr><td><strong>Deles</strong></td>${awayCells}<td><strong>${awayScore}</strong></td></tr>
      </tbody></table>`
  }

  const subs = gs.substitutions || []
  const subsHtml = subs.length > 0 ? `
    <h2>Substituições</h2>
    <table><thead><tr><th>Inning</th><th>Entrou</th><th>Saiu</th><th>Pos.</th></tr></thead><tbody>
    ${subs.map((s) => {
      const half = s.half === 'top' ? '▲' : '▼'
      return `<tr><td>${s.inning}º ${half}</td><td>${s.playerInName || '—'}</td><td>${s.playerOutName || '—'}</td><td>${s.position || '—'}</td></tr>`
    }).join('')}
    </tbody></table>` : ''

  const gameLog = gs.gameLog || []
  const logHtml = gameLog.length > 0 ? `
    <h2>Play-by-play</h2>
    <table><thead><tr><th>Inning</th><th>Evento</th></tr></thead><tbody>
    ${gameLog.map((e) => {
      const half = e.half === 'top' ? '▲' : '▼'
      return `<tr><td>${e.inning}º ${half}</td><td>${e.description}</td></tr>`
    }).join('')}
    </tbody></table>` : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório — ${game.opponentName || game.opponent} (${date})</title>
<style>
  body{font-family:Arial,sans-serif;margin:2em;color:#111}
  h1{font-size:1.3em;margin-bottom:.2em}
  h2{font-size:1em;margin:1.2em 0 .4em;border-bottom:2px solid #333}
  .meta{color:#555;font-size:.9em;margin-bottom:1em}
  table{border-collapse:collapse;width:100%;margin-bottom:1.2em;font-size:.85em}
  th,td{border:1px solid #aaa;padding:4px 8px;text-align:right;white-space:nowrap}
  th:first-child,td:first-child{text-align:left}
  th{background:#f0f0f0}
  .print-btn{display:block;margin-bottom:1.2em;padding:8px 16px;font-size:.95em;cursor:pointer;background:#1a56db;color:#fff;border:none;border-radius:4px}
  @media print{.print-btn{display:none}}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Imprimir / Salvar como PDF</button>
<h1>RELATÓRIO DE JOGO</h1>
<div class="meta">
  <strong>vs ${game.opponentName || game.opponent}</strong> &nbsp;|&nbsp;
  ${date} &nbsp;|&nbsp;
  ${game.competition || ''} &nbsp;|&nbsp;
  Placar: <strong>${homeScore} x ${awayScore}</strong>
</div>
${linescoreHtml}
<h2>Batting</h2>
<table>
  <thead><tr><th>Jogador</th><th>N</th><th>Pos</th><th>AB</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>R</th><th>RBI</th><th>BB</th><th>SO</th><th>SB</th><th>OUT</th><th>AVG</th></tr></thead>
  <tbody>${battingRows}</tbody>
</table>
${pitchers.length ? `<h2>Pitching</h2><table><thead><tr><th>Pitcher</th><th>IP</th><th>ER</th><th>ERA</th><th>H</th><th>SO</th><th>BB</th><th>PC</th></tr></thead><tbody>${pitchingRows}</tbody></table>` : ''}
${subsHtml}
${logHtml}
<p style="font-size:.8em;color:#777;margin-top:1.5em">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
</body>
</html>`
}

// ── Export modal ──────────────────────────────────────────────────

function ExportModal({ text, onClose }) {
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Relatório de Jogo', text })
        setShared(true)
        return
      } catch (err) {
        if (err.name === 'AbortError') return
      }
    }
    handleCopy()
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="export-modal-head">
          <h3>Resumo do jogo</h3>
          <button type="button" className="export-modal-close" onClick={onClose}>✕</button>
        </div>
        <pre className="export-preview">{text}</pre>
        <div className="export-actions">
          <Button type="button" variant="primary" onClick={handleShare}>
            {shared ? 'Compartilhado!' : (navigator.share ? 'Compartilhar' : 'Copiar')}
          </Button>
          {navigator.share && (
            <Button type="button" variant="secondary" onClick={handleCopy}>
              {copied ? 'Copiado!' : 'Copiar texto'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Stat cell ─────────────────────────────────────────────────────

function StatCell({ label, value, onMinus, onPlus }) {
  return (
    <div className="gd-stat-cell">
      <div className="gd-stat-label"><StatLabel abbr={label} /></div>
      <div className="gd-stat-controls">
        <button type="button" className="gd-stat-btn" onClick={onMinus}>−</button>
        <span className="gd-stat-value">{safeNumber(value)}</span>
        <button type="button" className="gd-stat-btn" onClick={onPlus}>+</button>
      </div>
    </div>
  )
}

function ComputedCell({ label, value }) {
  return (
    <div className="gd-stat-cell gd-stat-cell--computed">
      <div className="gd-stat-label"><StatLabel abbr={label} /></div>
      <div className="gd-stat-computed">{value}</div>
    </div>
  )
}

// ── Stat sections ─────────────────────────────────────────────────

function HittingSection({ row, onQuickEvent }) {
  const h = row.hitting
  const avg = avgFromValues(h.atBats, h.hits)
  const q = (field, delta) => onQuickEvent(row.playerId, 'hitting', field, delta)
  return (
    <div className="gd-stats-grid">
      <StatCell label="AB"  value={h.atBats}          onMinus={() => q('atBats', -1)}       onPlus={() => q('atBats', 1)} />
      <StatCell label="H"   value={h.hits}             onMinus={() => q('hits', -1)}          onPlus={() => q('hits', 1)} />
      <ComputedCell label="AVG" value={avg} />
      <StatCell label="2B"  value={h.doubles || 0}     onMinus={() => q('doubles', -1)}       onPlus={() => q('doubles', 1)} />
      <StatCell label="3B"  value={h.triples || 0}     onMinus={() => q('triples', -1)}       onPlus={() => q('triples', 1)} />
      <StatCell label="HR"  value={h.homeRuns || 0}    onMinus={() => q('homeRuns', -1)}      onPlus={() => q('homeRuns', 1)} />
      <StatCell label="R"   value={h.runs || 0}        onMinus={() => q('runs', -1)}           onPlus={() => q('runs', 1)} />
      <StatCell label="RBI" value={h.rbi || 0}         onMinus={() => q('rbi', -1)}            onPlus={() => q('rbi', 1)} />
      <StatCell label="BB"  value={h.walks || 0}       onMinus={() => q('walks', -1)}          onPlus={() => q('walks', 1)} />
      <StatCell label="SO"  value={h.strikeouts}       onMinus={() => q('strikeouts', -1)}     onPlus={() => q('strikeouts', 1)} />
      <StatCell label="SB"  value={h.stolenBases || 0} onMinus={() => q('stolenBases', -1)}   onPlus={() => q('stolenBases', 1)} />
      <StatCell label="OUT" value={h.outs}             onMinus={() => q('outs', -1)}           onPlus={() => q('outs', 1)} />
    </div>
  )
}

function PitchingSection({ row, onQuickEvent }) {
  const p = row.pitching
  const ip  = formatIpFromOuts(p.outsPitched)
  const era = formatEraFromOuts(p.outsPitched, p.earnedRuns)
  const q = (field, delta) => onQuickEvent(row.playerId, 'pitching', field, delta)
  return (
    <div className="gd-stats-grid">
      <StatCell label="Outs" value={p.outsPitched}      onMinus={() => q('outsPitched', -1)}  onPlus={() => q('outsPitched', 1)} />
      <ComputedCell label="IP"  value={ip} />
      <StatCell label="ER"   value={p.earnedRuns}       onMinus={() => q('earnedRuns', -1)}   onPlus={() => q('earnedRuns', 1)} />
      <ComputedCell label="ERA" value={era} />
      <StatCell label="H"    value={p.hitsAllowed}      onMinus={() => q('hitsAllowed', -1)}  onPlus={() => q('hitsAllowed', 1)} />
      <StatCell label="SO"   value={p.strikeouts}       onMinus={() => q('strikeouts', -1)}   onPlus={() => q('strikeouts', 1)} />
      <StatCell label="BB"   value={p.walks}            onMinus={() => q('walks', -1)}         onPlus={() => q('walks', 1)} />
      <StatCell label="PC"   value={p.pitchCount}       onMinus={() => q('pitchCount', -1)}   onPlus={() => q('pitchCount', 1)} />
      <StatCell label="STR"  value={p.strikes}          onMinus={() => q('strikes', -1)}       onPlus={() => q('strikes', 1)} />
      <StatCell label="BAL"  value={p.balls}            onMinus={() => q('balls', -1)}         onPlus={() => q('balls', 1)} />
      <StatCell label="W"    value={p.wins || 0}        onMinus={() => q('wins', -1)}          onPlus={() => q('wins', 1)} />
      <StatCell label="L"    value={p.losses || 0}      onMinus={() => q('losses', -1)}        onPlus={() => q('losses', 1)} />
      <StatCell label="SV"   value={p.saves || 0}       onMinus={() => q('saves', -1)}         onPlus={() => q('saves', 1)} />
    </div>
  )
}

function DefenseSection({ row, onQuickEvent }) {
  const d = row.defense
  const q = (field, delta) => onQuickEvent(row.playerId, 'defense', field, delta)
  return (
    <div className="gd-stats-grid">
      <StatCell label="E"  value={d.errors}       onMinus={() => q('errors', -1)}       onPlus={() => q('errors', 1)} />
      <StatCell label="DP" value={d.doublePlays}  onMinus={() => q('doublePlays', -1)}  onPlus={() => q('doublePlays', 1)} />
      <StatCell label="FO" value={d.flyOuts}      onMinus={() => q('flyOuts', -1)}      onPlus={() => q('flyOuts', 1)} />
      <StatCell label="GO" value={d.groundOuts}   onMinus={() => q('groundOuts', -1)}   onPlus={() => q('groundOuts', 1)} />
      <StatCell label="LO" value={d.lineOuts}     onMinus={() => q('lineOuts', -1)}     onPlus={() => q('lineOuts', 1)} />
    </div>
  )
}

// ── Player card ────────────────────────────────────────────────────

function PlayerDetailCard({ row, onQuickEvent, onOpenPlayer }) {
  const isPitcher = row.type === 'pitcher'
  const tabs = ['Batting', ...(isPitcher ? ['Pitching'] : []), 'Defesa']
  const [activeTab, setActiveTab] = useState('Batting')

  return (
    <article className="gd-player-card">
      <header className="gd-player-header">
        <div>
          <button type="button" className="gd-player-name" onClick={() => onOpenPlayer?.(row.playerId)}>
            {row.player.name}
          </button>
          <div className="gd-player-meta">
            #{row.player.number} · {getMainPosition(row.player)}
            {isPitcher && <span className="gd-pitcher-badge">P</span>}
          </div>
        </div>
      </header>

      <div className="gd-tabs">
        {tabs.map((tab) => (
          <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Batting'  && <HittingSection  row={row} onQuickEvent={onQuickEvent} />}
      {activeTab === 'Pitching' && <PitchingSection row={row} onQuickEvent={onQuickEvent} />}
      {activeTab === 'Defesa'   && <DefenseSection  row={row} onQuickEvent={onQuickEvent} />}
    </article>
  )
}

// ── Main component ────────────────────────────────────────────────

function GameDetailPage({ game, players, gameStats, onQuickEvent, onClose, onOpenPlayer }) {
  const [showExport, setShowExport] = useState(false)

  const rows = useMemo(() => {
    const byPlayer = {}
    for (const stat of gameStats) {
      byPlayer[String(stat.playerId?._id || stat.playerId)] = stat
    }
    return players.map((player) => {
      const playerId = getPlayerId(player)
      const stat = byPlayer[playerId] || {}
      return {
        player,
        playerId,
        type: detectPlayerType(player),
        hitting: stat.hitting || EMPTY_HITTING,
        pitching: stat.pitching || EMPTY_PITCHING,
        defense: stat.defense || EMPTY_DEFENSE,
      }
    })
  }, [gameStats, players])

  const handlePrintReport = async () => {
    const html = generateHtmlReport(game, rows)
    const isNative = Boolean(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.isNative)

    if (isNative) {
      // Android WebView does not support window.print(); share the HTML file instead.
      try {
        const blob = new Blob([html], { type: 'text/html' })
        const file = new File([blob], 'relatorio-jogo.html', { type: 'text/html' })
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ title: 'Relatório de Jogo', files: [file] })
          return
        }
      } catch (err) {
        if (err?.name === 'AbortError') return
      }
      // Fallback: share as plain text
      const text = generateTextReport(game, rows)
      if (navigator.share) {
        try { await navigator.share({ title: 'Relatório de Jogo', text }) } catch {}
      }
      return
    }

    // Desktop/browser: use hidden iframe + window.print()
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument || iframe.contentWindow.document
    doc.open()
    doc.write(html)
    doc.close()
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
    setTimeout(() => document.body.removeChild(iframe), 2000)
  }

  const exportText = useMemo(() => generateTextReport(game, rows), [game, rows])
  const gs = game.gameState || {}
  const homeScore = safeNumber(gs.homeScore)
  const awayScore = safeNumber(gs.awayScore)
  const hasScore = gs.homeScore != null || gs.awayScore != null
  const isNative = Boolean(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.isNative)

  return (
    <div className="game-detail card">
      {/* ── Header ── */}
      <div className="gd-header">
        <div className="gd-header-info">
          <h3 className="gd-title">vs {game.opponentName || game.opponent}</h3>
          <p className="gd-meta">
            {new Date(game.date).toLocaleDateString('pt-BR')}
            {game.competition ? ` · ${game.competition}` : ''}
          </p>
          {hasScore && (
            <div className="gd-score">
              <span className="gd-score-team">Nós</span>
              <strong className="gd-score-num">{homeScore}</strong>
              <span className="gd-score-sep">×</span>
              <strong className="gd-score-num">{awayScore}</strong>
              <span className="gd-score-team">Adversário</span>
            </div>
          )}
        </div>
        <div className="gd-head-actions">
          <Button type="button" variant="primary" onClick={() => setShowExport(true)}>
            Resumo
          </Button>
          <Button type="button" variant="secondary" onClick={handlePrintReport}>
            {isNative ? 'Compartilhar' : 'PDF'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            ✕
          </Button>
        </div>
      </div>

      {/* ── Player cards ── */}
      <div className="gd-players">
        {rows.map((row) => (
          <PlayerDetailCard
            key={row.playerId}
            row={row}
            onQuickEvent={onQuickEvent}
            onOpenPlayer={onOpenPlayer}
          />
        ))}
      </div>

      {showExport && <ExportModal text={exportText} onClose={() => setShowExport(false)} />}
    </div>
  )
}

export default GameDetailPage
