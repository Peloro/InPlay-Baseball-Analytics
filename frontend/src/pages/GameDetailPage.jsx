import { useMemo, useState } from 'react'
import Button from '../components/ui/Button'
import { safeNumber } from '../utils/number'
import { avgFromValues, formatEraFromOuts, formatIpFromOuts } from '../utils/stats'
import { getPlayerId, getMainPosition, detectPlayerType } from '../utils/player'



function Stepper({ label, value, onMinus, onPlus }) {
  return (
    <div className="stat-stepper stat-box">
      <span>{label}</span>
      <button type="button" onClick={onMinus}>-</button>
      <strong>{safeNumber(value)}</strong>
      <button type="button" onClick={onPlus}>+</button>
    </div>
  )
}

function PitchingBlock({ row, onQuickEvent }) {
  return (
    <div className="pitching">
      <Stepper label="Outs" value={row.pitching.outsPitched}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'outsPitched', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'outsPitched', 1)} />
      <div className="pitcher-metric stat-box">IP: {formatIpFromOuts(row.pitching.outsPitched)}</div>
      <Stepper label="ER" value={row.pitching.earnedRuns}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'earnedRuns', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'earnedRuns', 1)} />
      <div className="pitcher-metric stat-box">ERA: {formatEraFromOuts(row.pitching.outsPitched, row.pitching.earnedRuns)}</div>
      <Stepper label="H" value={row.pitching.hitsAllowed}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'hitsAllowed', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'hitsAllowed', 1)} />
      <Stepper label="SO" value={row.pitching.strikeouts}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'strikeouts', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'strikeouts', 1)} />
      <Stepper label="BB" value={row.pitching.walks}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'walks', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'walks', 1)} />
      <Stepper label="PC" value={row.pitching.pitchCount}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'pitchCount', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'pitchCount', 1)} />
      <Stepper label="STR" value={row.pitching.strikes}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'strikes', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'strikes', 1)} />
      <Stepper label="BAL" value={row.pitching.balls}
        onMinus={() => onQuickEvent(row.playerId, 'pitching', 'balls', -1)}
        onPlus={() => onQuickEvent(row.playerId, 'pitching', 'balls', 1)} />
    </div>
  )
}

function DefenseRow({ playerId, defense, onQuickEvent }) {
  return (
    <div className="defense">
      <Stepper label="E" value={defense.errors}
        onMinus={() => onQuickEvent(playerId, 'defense', 'errors', -1)}
        onPlus={() => onQuickEvent(playerId, 'defense', 'errors', 1)} />
      <Stepper label="DP" value={defense.doublePlays}
        onMinus={() => onQuickEvent(playerId, 'defense', 'doublePlays', -1)}
        onPlus={() => onQuickEvent(playerId, 'defense', 'doublePlays', 1)} />
      <Stepper label="FO" value={defense.flyOuts}
        onMinus={() => onQuickEvent(playerId, 'defense', 'flyOuts', -1)}
        onPlus={() => onQuickEvent(playerId, 'defense', 'flyOuts', 1)} />
      <Stepper label="GO" value={defense.groundOuts}
        onMinus={() => onQuickEvent(playerId, 'defense', 'groundOuts', -1)}
        onPlus={() => onQuickEvent(playerId, 'defense', 'groundOuts', 1)} />
      <Stepper label="LO" value={defense.lineOuts}
        onMinus={() => onQuickEvent(playerId, 'defense', 'lineOuts', -1)}
        onPlus={() => onQuickEvent(playerId, 'defense', 'lineOuts', 1)} />
    </div>
  )
}

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

  // Inning-by-inning line score
  const maxInning = Math.max(inningScores.home.length, inningScores.away.length)
  if (maxInning > 0) {
    const innings = Array.from({ length: maxInning }, (_, i) => i + 1)
    lines.push('')
    lines.push('PLACAR POR INNING')
    lines.push(`${'Inning'.padEnd(8)} ${innings.map((n) => pad(n, 3)).join('')}  | Tot`)
    lines.push(`${'Nós'.padEnd(8)} ${innings.map((_, i) => pad(inningScores.home[i] ?? 0, 3)).join('')}  | ${homeScore}`)
    lines.push(`${'Deles'.padEnd(8)} ${innings.map((_, i) => pad(inningScores.away[i] ?? 0, 3)).join('')}  | ${awayScore}`)
  }

  // Batting
  lines.push('')
  lines.push('BATTING')
  lines.push(sep)
  lines.push(
    `${pad('Jogador', 18, true)}${pad('AB', 4)}${pad('H', 4)}${pad('HR', 4)}${pad('R', 4)}${pad('RBI', 4)}${pad('BB', 4)}${pad('SO', 4)}${pad('OUT', 4)}  AVG`
  )
  lines.push(sep)

  for (const row of rows) {
    const h = row.hitting
    const ab = safeNumber(h.atBats)
    const hits = safeNumber(h.hits)
    const avg = ab ? (hits / ab).toFixed(3) : '.000'
    lines.push(
      `${pad(row.player.name, 18, true)}${pad(ab, 4)}${pad(hits, 4)}${pad(safeNumber(h.homeRuns), 4)}${pad(safeNumber(h.runs), 4)}${pad(safeNumber(h.rbi), 4)}${pad(safeNumber(h.walks), 4)}${pad(safeNumber(h.strikeouts), 4)}${pad(safeNumber(h.outs), 4)}  ${avg}`
    )
  }

  // Pitching — pitchers only
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

  // Substitutions
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

  // Play-by-play
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
    return `<tr><td>${row.player.name}</td><td>#${row.player.number}</td><td>${getMainPosition(row.player)}</td><td>${ab}</td><td>${hits}</td><td>${safeNumber(h.homeRuns)}</td><td>${safeNumber(h.runs)}</td><td>${safeNumber(h.rbi)}</td><td>${safeNumber(h.walks)}</td><td>${safeNumber(h.strikeouts)}</td><td>${safeNumber(h.outs)}</td><td>${avg}</td></tr>`
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
  <thead><tr><th>Jogador</th><th>N</th><th>Pos</th><th>AB</th><th>H</th><th>HR</th><th>R</th><th>RBI</th><th>BB</th><th>SO</th><th>OUT</th><th>AVG</th></tr></thead>
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
    // Fallback: copy to clipboard
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

// ── Main component ────────────────────────────────────────────────

function GameDetailPage({ game, players, gameStats, onQuickEvent, onClose, onOpenPlayer, onPrint }) {
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
        hitting: stat.hitting || { atBats: 0, hits: 0, strikeouts: 0, outs: 0, walks: 0, runs: 0, rbi: 0, homeRuns: 0 },
        pitching: stat.pitching || { inningsPitched: 0, outsPitched: 0, earnedRuns: 0, strikeouts: 0, walks: 0, strikes: 0, balls: 0, pitchCount: 0, hitsAllowed: 0 },
        defense: stat.defense || { errors: 0, doublePlays: 0, flyOuts: 0, groundOuts: 0, lineOuts: 0 },
      }
    })
  }, [gameStats, players])

  const handlePrintReport = () => {
    const html = generateHtmlReport(game, rows)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.addEventListener('load', () => URL.revokeObjectURL(url))
    else URL.revokeObjectURL(url)
  }

  const exportText = useMemo(() => generateTextReport(game, rows), [game, rows])

  return (
    <div className="game-detail card">
      <div className="game-detail-head">
        <h3>Detalhe do jogo</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button type="button" variant="primary" onClick={() => setShowExport(true)}>
            Gerar Resumo
          </Button>
          <Button type="button" variant="secondary" onClick={handlePrintReport}>
            Imprimir / PDF
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
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
              <Button type="button" variant="link" onClick={() => onOpenPlayer?.(row.playerId)}>
                {row.player.name}
              </Button>
            </div>
            <div>{row.player.number}</div>
            <div>{getMainPosition(row.player)}</div>
            <div className="hitting">
              <Stepper label="AB" value={row.hitting.atBats}
                onMinus={() => onQuickEvent(row.playerId, 'hitting', 'atBats', -1)}
                onPlus={() => onQuickEvent(row.playerId, 'hitting', 'atBats', 1)} />
              <Stepper label="H" value={row.hitting.hits}
                onMinus={() => onQuickEvent(row.playerId, 'hitting', 'hits', -1)}
                onPlus={() => onQuickEvent(row.playerId, 'hitting', 'hits', 1)} />
              <Stepper label="HR" value={row.hitting.homeRuns || 0}
                onMinus={() => onQuickEvent(row.playerId, 'hitting', 'homeRuns', -1)}
                onPlus={() => onQuickEvent(row.playerId, 'hitting', 'homeRuns', 1)} />
              <Stepper label="R" value={row.hitting.runs || 0}
                onMinus={() => onQuickEvent(row.playerId, 'hitting', 'runs', -1)}
                onPlus={() => onQuickEvent(row.playerId, 'hitting', 'runs', 1)} />
              <Stepper label="RBI" value={row.hitting.rbi || 0}
                onMinus={() => onQuickEvent(row.playerId, 'hitting', 'rbi', -1)}
                onPlus={() => onQuickEvent(row.playerId, 'hitting', 'rbi', 1)} />
              <Stepper label="BB" value={row.hitting.walks || 0}
                onMinus={() => onQuickEvent(row.playerId, 'hitting', 'walks', -1)}
                onPlus={() => onQuickEvent(row.playerId, 'hitting', 'walks', 1)} />
              <Stepper label="SO" value={row.hitting.strikeouts}
                onMinus={() => onQuickEvent(row.playerId, 'hitting', 'strikeouts', -1)}
                onPlus={() => onQuickEvent(row.playerId, 'hitting', 'strikeouts', 1)} />
              <Stepper label="OUT" value={row.hitting.outs}
                onMinus={() => onQuickEvent(row.playerId, 'hitting', 'outs', -1)}
                onPlus={() => onQuickEvent(row.playerId, 'hitting', 'outs', 1)} />
              <div className="pitcher-metric stat-box">AVG: {avgFromValues(row.hitting.atBats, row.hitting.hits)}</div>
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

      {showExport && (
        <ExportModal text={exportText} onClose={() => setShowExport(false)} />
      )}
    </div>
  )
}

export default GameDetailPage
