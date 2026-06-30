import { useState, useRef } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import { DEFENSIVE_POSITIONS } from '../../constants/fieldGame'
import { reorderList } from '../../utils/fieldGame'

const TODAY = new Date().toISOString().split('T')[0]

const INITIAL_FORM = { date: TODAY, opponentName: '', competition: '', location: '', maxInnings: '9' }
const INITIAL_STARTERS = DEFENSIVE_POSITIONS.map((position) => ({ position, playerId: '' }))

export default function PreGameSetupModal({
  gameState,
  playersById,
  setupAvailablePlayers,
  playerPrefersPosition,
  getPlayerId,
  onConfirm,
  onClose,
}) {
  const [pregameStep, setPregameStep] = useState(0)
  const [pregameForm, setPregameForm] = useState(INITIAL_FORM)
  const [setupAttacking, setSetupAttacking] = useState(true)
  const [setupStarters, setSetupStarters] = useState(INITIAL_STARTERS)
  const [setupBattingOrder, setSetupBattingOrder] = useState([])
  const [setupDraggingId, setSetupDraggingId] = useState(null)
  const [setupDhId, setSetupDhId] = useState('')

  const orderTouchRef = useRef({ dragging: null })
  const orderListRef = useRef(null)

  const assignStarter = (position, playerId) => {
    setSetupStarters((current) => {
      const next = current.map((item) => (item.position === position ? { ...item, playerId } : item))
      const defIds = next.map((item) => item.playerId).filter(Boolean)
      setSetupBattingOrder((order) => {
        const allIds = setupDhId ? [...defIds, setupDhId] : defIds
        const filtered = order.filter((id) => allIds.includes(id))
        for (const id of allIds) {
          if (!filtered.includes(id)) filtered.push(id)
        }
        return filtered
      })
      return next
    })
  }

  const assignDh = (playerId) => {
    setSetupBattingOrder((order) => {
      const defIds = setupStarters.map((item) => item.playerId).filter(Boolean)
      const allIds = playerId ? [...defIds, playerId] : defIds
      const filtered = order.filter((id) => allIds.includes(id))
      for (const id of allIds) {
        if (!filtered.includes(id)) filtered.push(id)
      }
      return filtered
    })
    setSetupDhId(playerId)
  }

  // ── Batting-order drag (unified pointer events: works for both mouse and touch) ──

  const onOrderPointerDown = (id, ev) => {
    ev.stopPropagation()
    orderTouchRef.current.dragging = id
    setSetupDraggingId(id)
    orderListRef.current?.setPointerCapture(ev.pointerId)
  }

  const onOrderPointerMove = (ev) => {
    if (!orderTouchRef.current.dragging) return
    ev.stopPropagation()
    const el = document.elementFromPoint(ev.clientX, ev.clientY)
    const targetId = el?.closest('[data-order-id]')?.dataset?.orderId
    if (targetId && targetId !== orderTouchRef.current.dragging) {
      setSetupBattingOrder((current) => {
        const from = current.indexOf(orderTouchRef.current.dragging)
        const to = current.indexOf(targetId)
        if (from < 0 || to < 0) return current
        orderTouchRef.current.dragging = targetId
        return reorderList(current, from, to)
      })
    }
  }

  const onOrderPointerUp = () => {
    orderTouchRef.current.dragging = null
    setSetupDraggingId(null)
  }

  // ── Derived state ──────────────────────────────────────────────────

  const defStarters = setupStarters.filter((item) => item.playerId)
  const starters = [...defStarters, ...(setupDhId ? [{ position: 'DH', playerId: setupDhId }] : [])]
  const step0Valid = !gameState.currentGameId
    ? Boolean(pregameForm.date && pregameForm.opponentName.trim() && pregameForm.competition.trim())
    : true
  const step1Valid = defStarters.length === 9
  const expectedBatters = setupDhId ? 10 : 9
  const step2Valid = setupBattingOrder.length === expectedBatters
  const allValid = step0Valid && step1Valid && step2Valid

  const stepLabels = ['Jogo', 'Defesa', 'Ordem']

  return (
    <Modal title="Configuração Inicial" onClose={onClose} closeLabel="Cancelar">
      {/* Step indicator */}
      <div className="pregame-steps">
        {stepLabels.map((label, i) => {
          const canJumpTo = i <= pregameStep
            || (i === 1 && step0Valid)
            || (i === 2 && step0Valid && step1Valid)
          return (
            <button
              key={i}
              type="button"
              className={`pregame-step-btn${pregameStep === i ? ' active' : ''}${i < pregameStep ? ' done' : ''}${!canJumpTo ? ' disabled' : ''}`}
              onClick={() => canJumpTo && setPregameStep(i)}
              disabled={!canJumpTo}
            >
              <span className="pregame-step-num">{i < pregameStep ? '✓' : i + 1}</span>
              <span className="pregame-step-label">{label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Step 0: Game info ── */}
      {pregameStep === 0 && (
        <div className="pregame-step-content">
          <label htmlFor="pregame-date" className="field-label">Data</label>
          <Input
            id="pregame-date"
            type="date"
            value={pregameForm.date}
            onChange={(e) => setPregameForm((c) => ({ ...c, date: e.target.value }))}
            style={{ marginBottom: 12 }}
          />
          <label htmlFor="pregame-opponent" className="field-label">Adversário *</label>
          <Input
            id="pregame-opponent"
            placeholder="Nome do adversário"
            value={pregameForm.opponentName}
            onChange={(e) => setPregameForm((c) => ({ ...c, opponentName: e.target.value }))}
            style={{ marginBottom: 12 }}
          />
          <label htmlFor="pregame-competition" className="field-label">Competição *</label>
          <Input
            id="pregame-competition"
            placeholder="Ex: Treino, Campeonato..."
            value={pregameForm.competition}
            onChange={(e) => setPregameForm((c) => ({ ...c, competition: e.target.value }))}
            style={{ marginBottom: 12 }}
          />
          <label htmlFor="pregame-location" className="field-label">Local (opcional)</label>
          <Input
            id="pregame-location"
            placeholder="Local (opcional)"
            value={pregameForm.location}
            onChange={(e) => setPregameForm((c) => ({ ...c, location: e.target.value }))}
            style={{ marginBottom: 12 }}
          />
          <label htmlFor="pregame-innings" className="field-label">Innings (0 = ilimitado)</label>
          <Input
            id="pregame-innings"
            type="number"
            min="0"
            max="20"
            placeholder="9"
            value={pregameForm.maxInnings}
            onChange={(e) => setPregameForm((c) => ({ ...c, maxInnings: e.target.value }))}
            style={{ marginBottom: 12 }}
          />
          <div className="pregame-radio-row">
            <label className={`pregame-radio-option${setupAttacking ? ' selected' : ''}`}>
              <input type="radio" name="setup-start" checked={setupAttacking} onChange={() => setSetupAttacking(true)} />
              Começar atacando
            </label>
            <label className={`pregame-radio-option${!setupAttacking ? ' selected' : ''}`}>
              <input type="radio" name="setup-start" checked={!setupAttacking} onChange={() => setSetupAttacking(false)} />
              Começar defendendo
            </label>
          </div>
        </div>
      )}

      {/* ── Step 1: Defensive positions (only ficha players from Jogadores page) ── */}
      {pregameStep === 1 && (
        <div className="pregame-step-content">
          <p className="pregame-step-hint">Atribua um jogador relacionado a cada posição defensiva.</p>
          <div className="pregame-lineup-grid">
            {setupStarters.map((slot) => {
              const selectedIds = setupStarters
                .filter((item) => item.position !== slot.position)
                .map((item) => item.playerId)
                .filter(Boolean)
              const selectedPlayer = playersById[slot.playerId]
              return (
                <div key={`setup-${slot.position}`} className="pregame-slot">
                  <strong>{slot.position}</strong>
                  <Select
                    value={slot.playerId}
                    onChange={(event) => assignStarter(slot.position, event.target.value)}
                  >
                    <option value="">— Selecionar —</option>
                    {selectedPlayer && (
                      <option value={slot.playerId}>
                        {selectedPlayer.name} #{selectedPlayer.number}
                      </option>
                    )}
                    {(() => {
                      const available = setupAvailablePlayers.filter(
                        (player) =>
                          !selectedIds.includes(getPlayerId(player)) &&
                          getPlayerId(player) !== setupDhId
                      )
                      const preferred = available.filter((p) =>
                        playerPrefersPosition(getPlayerId(p), slot.position)
                      )
                      const others = available.filter(
                        (p) => !playerPrefersPosition(getPlayerId(p), slot.position)
                      )
                      const makeOption = (player, prefix = '') => (
                        <option key={`setup-player-${slot.position}-${getPlayerId(player)}`} value={getPlayerId(player)}>
                          {prefix}{player.name} #{player.number}
                        </option>
                      )
                      return (
                        <>
                          {preferred.length > 0 && (
                            <optgroup label="Recomendados">
                              {preferred.map((p) => makeOption(p, '★ '))}
                            </optgroup>
                          )}
                          {others.length > 0 && (
                            <optgroup label="Outros">
                              {others.map((p) => makeOption(p))}
                            </optgroup>
                          )}
                        </>
                      )
                    })()}
                  </Select>
                </div>
              )
            })}
          </div>
          <p className="pregame-step-count">
            {defStarters.length}/9 posições preenchidas
          </p>

          <div className="pregame-dh-section">
            <label className="pregame-dh-label">DH — Designated Hitter (opcional)</label>
            <Select value={setupDhId} onChange={(e) => assignDh(e.target.value)}>
              <option value="">— Sem DH —</option>
              {setupAvailablePlayers
                .filter((p) => !defStarters.some((s) => s.playerId === getPlayerId(p)))
                .map((p) => (
                  <option key={`dh-${getPlayerId(p)}`} value={getPlayerId(p)}>
                    {p.name} #{p.number}
                  </option>
                ))}
            </Select>
            {setupDhId && (
              <p className="pregame-dh-hint">O DH rebate na ordem mas não joga defesa.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Batting order ── */}
      {pregameStep === 2 && (
        <div className="pregame-step-content">
          <p className="pregame-step-hint">Arraste pelo ⠿ para reordenar a ordem de rebatida.</p>
          <div
            ref={orderListRef}
            className="pregame-order-list"
            onPointerMove={onOrderPointerMove}
            onPointerUp={onOrderPointerUp}
            onPointerCancel={onOrderPointerUp}
            style={{ touchAction: 'none', userSelect: 'none' }}
          >
            {setupBattingOrder.map((id, index) => {
              const player = playersById[id]
              if (!player) return null
              return (
                <div
                  key={`order-${id}`}
                  data-order-id={id}
                  className={`pregame-order-item${setupDraggingId === id ? ' dragging' : ''}`}
                >
                  <span className="pregame-order-num">{index + 1}.</span>
                  <strong>{player.name}</strong>
                  <span>#{player.number}</span>
                  {id === setupDhId && <span className="pregame-dh-tag">DH</span>}
                  <span
                    className="pregame-order-handle"
                    style={{
                      touchAction: 'none',
                      cursor: setupDraggingId === id ? 'grabbing' : 'grab',
                    }}
                    onPointerDown={(ev) => onOrderPointerDown(id, ev)}
                  >
                    ⠿
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="pregame-nav">
        {pregameStep > 0 && (
          <Button type="button" variant="secondary" onClick={() => setPregameStep((s) => s - 1)}>
            ← Anterior
          </Button>
        )}
        {pregameStep < 2 && (
          <Button
            type="button"
            variant="primary"
            onClick={() => setPregameStep((s) => s + 1)}
            disabled={(pregameStep === 0 && !step0Valid) || (pregameStep === 1 && !step1Valid)}
            style={{ marginLeft: 'auto' }}
          >
            Próximo →
          </Button>
        )}
        {pregameStep === 2 && (
          <Button
            type="button"
            variant="primary"
            onClick={() =>
              allValid &&
              onConfirm({
                starters,
                battingOrder: setupBattingOrder,
                isAttacking: setupAttacking,
                pregameForm,
              })
            }
            disabled={!allValid}
            style={{ marginLeft: 'auto' }}
          >
            Iniciar jogo
          </Button>
        )}
      </div>
    </Modal>
  )
}
