import React from 'react'

export default function Scoreboard({ gameState, opponentName, visible = false }) {
  const inningScores = gameState.inningScores || { home: [], away: [] }
  const totalInnings = Math.max(
    9,
    inningScores.home.length,
    inningScores.away.length,
    gameState.inning || 1
  )
  const innings = Array.from({ length: totalInnings }, (_, i) => i)

  return (
    <div className={`game-scoreboard ${visible ? 'visible' : 'hidden'}`} role="region" aria-label="Placar do jogo">
      <div className="game-score-main">
        <strong className="team-name">CAASO</strong>
        <span key={`score-home-${gameState.homeScore || 0}`} className="score-value score-pulse">{gameState.homeScore || 0}</span>
        <span className="score-separator">x</span>
        <span key={`score-away-${gameState.awayScore || 0}`} className="score-value score-pulse">{gameState.awayScore || 0}</span>
        <strong className="team-name">{opponentName}</strong>
      </div>

      <div className="game-score-meta">
        <span>Inning: {gameState.inning}</span>
        <span>{(gameState.inningHalf || 'top') === 'top' ? 'Topo' : 'Parte baixa'}</span>
        <span>Outs: {gameState.outs}</span>
        <span>{gameState.isAttacking ? 'ATACANDO' : 'DEFENDENDO'}</span>
      </div>

      <div className="box-score-wrap">
        <table className="box-score">
          <thead>
            <tr>
              <th className="box-score-team"></th>
              {innings.map(i => (
                <th
                  key={i}
                  className={`box-score-cell${i + 1 === gameState.inning ? ' box-score-current' : ''}`}
                >
                  {i + 1}
                </th>
              ))}
              <th className="box-score-total">R</th>
            </tr>
          </thead>
          <tbody>
            <tr className={!gameState.isAttacking ? 'box-score-batting' : ''}>
              <td className="box-score-team box-score-team--away">
                {!gameState.isAttacking && <span className="box-score-bat-indicator"></span>}
                <span className="box-score-team-label">▲ ADV</span>
              </td>
              {innings.map(i => (
                <td key={i} className={`box-score-cell${i + 1 === gameState.inning ? ' box-score-current' : ''}`}>
                  {inningScores.away[i] != null ? inningScores.away[i] : (i + 1 < gameState.inning ? 0 : '–')}
                </td>
              ))}
              <td className="box-score-total">{gameState.awayScore || 0}</td>
            </tr>
            <tr className={gameState.isAttacking ? 'box-score-batting' : ''}>
              <td className="box-score-team box-score-team--home">
                {gameState.isAttacking && <span className="box-score-bat-indicator"></span>}
                <span className="box-score-team-label">▼ NÓS</span>
              </td>
              {innings.map(i => (
                <td key={i} className={`box-score-cell${i + 1 === gameState.inning ? ' box-score-current' : ''}`}>
                  {inningScores.home[i] != null ? inningScores.home[i] : (i + 1 < gameState.inning ? 0 : '–')}
                </td>
              ))}
              <td className="box-score-total">{gameState.homeScore || 0}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
