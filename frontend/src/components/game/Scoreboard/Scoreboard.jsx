import React from 'react'

export default function Scoreboard({ gameState, opponentName, visible = false }) {
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
    </div>
  )
}
