import React, { useState } from 'react'
import CountDots from '../CountDots'
import Button from '../ui/Button'

export default function GameHUD({
  invalidFeedback,
  gameState,
  currentBatter,
  onDeckBatter,
  inTheHoleBatter,
  pitchersOnField = [],
  livePitching = {},
  applyAttackCountAction = () => {},
  applyPlateAppearance = () => {},
  applyDefensiveHit = () => {},
  handleDoublePlayAction = () => {},
  applySacFly = () => {},
  applyErrorEvent = () => {},
  applyDeadBall = () => {},
  applyDefensiveOutEvent = () => {},
  advanceRunner = () => {},
  removeRunner = () => {},
  setZoom = () => {},
  zoom = 1,
  onEndGame = () => {},
  onUpdateGameState = () => {},
  isMobile = false,
  benchRef,
}) {
  const [activeTab, setActiveTab] = useState(1)

  const safeNumber = (value) => {
    const parsed = Number(value || 0)
    if (!Number.isFinite(parsed) || parsed < 0) return 0
    return parsed
  }

  const formatIpFromOuts = (outsPitched) => {
    const outs = safeNumber(outsPitched)
    const innings = Math.floor(outs / 3)
    const remainder = outs % 3
    return `${innings}.${remainder}`
  }

  const formatEraFromOuts = (outsPitched, earnedRuns) => {
    const outs = safeNumber(outsPitched)
    const runs = safeNumber(earnedRuns)
    if (!outs) return '--'
    return ((runs * 21) / outs).toFixed(2)
  }

  const renderMainContent = () => (
    <>
      <div className="field-hud-block">
        <h3>Jogo</h3>
        {invalidFeedback && <div className="drop-hint">{invalidFeedback}</div>}
        {gameState?.isAttacking && (
          <p>
            Rebatedor atual: <strong>{currentBatter ? `${currentBatter.name} #${currentBatter.number}` : 'Sem ordem de rebatedores'}</strong>
          </p>
        )}
        {gameState?.isAttacking && (
          <p>
            On Deck: <strong>{onDeckBatter ? `${onDeckBatter.name} #${onDeckBatter.number}` : '--'}</strong>
            {' | '}
            In the Hole: <strong>{inTheHoleBatter ? `${inTheHoleBatter.name} #${inTheHoleBatter.number}` : '--'}</strong>
          </p>
        )}

        <div className="count-dots-panel">
          <CountDots label="Balls" value={gameState?.balls || 0} max={4} color="#2f9d58" />
          <CountDots label="Strikes" value={gameState?.strikes || 0} max={3} color="#d2a100" />
          <CountDots label="Outs" value={gameState?.outs || 0} max={3} color="#c33b34" />
        </div>
      </div>

      <div className="field-hud-block">
        <h3>Corredores</h3>
        <div className="hud-grid">
          {['first', 'second', 'third'].map((base) => (
            <label key={base}>
              {base.toUpperCase()}
              <div className="hud-actions">
                <button type="button" onClick={() => advanceRunner(base)}>+</button>
                <button type="button" onClick={() => { /* Av */ }}>Av</button>
                <button type="button" onClick={() => removeRunner(base)}>Out</button>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="field-hud-block">
        <h3>Campo</h3>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button type="button" className="full-width-btn" onClick={() => onEndGame?.()}>Encerrar jogo</button>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Button type="button" variant="primary" onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}>-</Button>
            <div style={{ minWidth: 48, textAlign: 'center' }}>{(zoom * 100).toFixed(0)}%</div>
            <Button type="button" variant="primary" onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(2))))}>+</Button>
            <Button type="button" variant="primary" onClick={() => setZoom(1)}>Reset</Button>
          </div>
        </div>
      </div>
    </>
  )

  const renderActions = () => (
    <div style={{ marginTop: 8 }}>
      {gameState?.isAttacking ? (
        <div className="hud-actions attack-actions">
          <button type="button" onClick={() => applyAttackCountAction('strike')}>Strike</button>
          <button type="button" onClick={() => applyAttackCountAction('ball')}>Ball</button>
          <button type="button" onClick={() => applyAttackCountAction('foul')}>Foul</button>
          <button type="button" onClick={() => applyPlateAppearance('out')}>Out</button>
          <button type="button" onClick={() => applyPlateAppearance('single')}>Hit Simples</button>
          <button type="button" onClick={() => applyPlateAppearance('double')}>Hit Dupla</button>
          <button type="button" onClick={() => applyPlateAppearance('triple')}>Hit Tripla</button>
          <button type="button" onClick={() => applyPlateAppearance('homerun')}>Homerun</button>
          <button type="button" onClick={handleDoublePlayAction}>Double Play</button>
          <button type="button" onClick={applySacFly}>Sac Fly</button>
          <button type="button" onClick={() => applyErrorEvent('')}>Erro</button>
          <button type="button" onClick={applyDeadBall}>Dead Ball</button>
        </div>
      ) : (
        <div className="hud-actions defense-actions">
          <button type="button" onClick={() => applyDefensiveOutEvent('strike')}>Strike</button>
          <button type="button" onClick={() => applyDefensiveOutEvent('ball')}>Ball</button>
          <button type="button" onClick={() => applyDefensiveOutEvent('foul')}>Foul</button>
          <button type="button" onClick={() => applyDefensiveOutEvent('out')}>Out</button>
          <button type="button" onClick={() => applyDefensiveHit('single')}>Single</button>
          <button type="button" onClick={() => applyDefensiveHit('double')}>Double</button>
          <button type="button" onClick={() => applyDefensiveHit('triple')}>Triple</button>
          <button type="button" onClick={() => applyDefensiveHit('homerun')}>Homerun</button>
          <button type="button" onClick={handleDoublePlayAction}>Double Play</button>
          <button type="button" onClick={applySacFly}>Sac Fly</button>
          <button type="button" onClick={() => applyErrorEvent('')}>Erro</button>
          <button type="button" onClick={applyDeadBall}>Dead Ball</button>
        </div>
      )}
    </div>
  )

  const renderBenchTab = () => (
    <div style={{ marginTop: 8 }}>
      <button type="button" className="full-width-btn" onClick={() => benchRef?.current?.openDrawer?.()}>Abrir Banco</button>
    </div>
  )

  return (
    <aside className="field-hud" aria-label="HUD do jogo">
      {isMobile ? (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button type="button" className={`mode-toggle-btn ${activeTab === 1 ? 'active' : ''}`} onClick={() => setActiveTab(1)}>Info</button>
            <button type="button" className={`mode-toggle-btn ${activeTab === 2 ? 'active' : ''}`} onClick={() => setActiveTab(2)}>Ações</button>
            <button type="button" className={`mode-toggle-btn ${activeTab === 3 ? 'active' : ''}`} onClick={() => setActiveTab(3)}>Banco</button>
          </div>
          <div>
            {activeTab === 1 && renderMainContent()}
            {activeTab === 2 && renderActions()}
            {activeTab === 3 && renderBenchTab()}
          </div>
        </div>
      ) : (
        renderMainContent()
      )}
    </aside>
  )
}
