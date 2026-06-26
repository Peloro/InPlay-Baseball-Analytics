import { useCallback, useEffect, useState } from 'react'
import PlayerStatsModal from '../components/PlayerStatsModal'
import Modal from '../components/ui/Modal'
import ConfirmModal from '../components/ui/ConfirmModal'
import Button from '../components/ui/Button'
import { gameStatsApi, seasonStatsApi } from '../services/api'
import { VALID_POSITIONS } from '../data/positions'
import { getPlayerId, getMainPosition } from '../utils/player'

function JogadoresPage({ players, onAddPlayer, onDeletePlayer, onUpdatePlayer, gameState, onUpdateGameState }) {
  const [form, setForm] = useState({ name: '', number: '', positions: ['DH'], activePosition: 'DH' })
  const [editingPlayerId, setEditingPlayerId] = useState(null)
  const [editingForm, setEditingForm] = useState({ name: '', number: '', positions: ['DH'], activePosition: 'DH' })
  const [focusedPlayerId, setFocusedPlayerId] = useState(null)
  const [pendingDeletePlayer, setPendingDeletePlayer] = useState(null)
  const [focusedSeasonEntry, setFocusedSeasonEntry] = useState(null)
  const [focusedGameEntry, setFocusedGameEntry] = useState(null)

  const participantIds = gameState?.participantPlayerIds || []

  useEffect(() => {
    if (!focusedPlayerId) {
      setFocusedSeasonEntry(null)
      setFocusedGameEntry(null)
      return
    }
    const load = async () => {
      try {
        const [seasonRes, gameRes] = await Promise.all([
          seasonStatsApi.list(focusedPlayerId),
          gameState?.currentGameId
            ? gameStatsApi.listByGame(gameState.currentGameId, focusedPlayerId)
            : Promise.resolve({ data: [] }),
        ])
        setFocusedSeasonEntry(seasonRes.data?.[0] || null)
        setFocusedGameEntry(gameRes.data?.[0] || null)
      } catch {
        setFocusedSeasonEntry(null)
        setFocusedGameEntry(null)
      }
    }
    load()
  }, [focusedPlayerId, gameState?.currentGameId])

  const openPlayerDetails = useCallback((playerId) => {
    setFocusedPlayerId(null)
    window.requestAnimationFrame(() => setFocusedPlayerId(playerId))
  }, [])

  const handleAddPlayer = async (event) => {
    event.preventDefault()
    if (!form.name.trim() || !form.number || !form.positions.length) return
    await onAddPlayer({
      name: form.name.trim(),
      number: Number(form.number),
      positions: form.positions,
      activePosition: form.activePosition,
    })
    setForm({ name: '', number: '', positions: ['DH'], activePosition: 'DH' })
  }

  const toggleFormPosition = (position) => {
    setForm((current) => {
      const has = current.positions.includes(position)
      const positions = has ? current.positions.filter((p) => p !== position) : [...current.positions, position]
      const safePositions = positions.length ? positions : ['DH']
      const activePosition = safePositions.includes(current.activePosition) ? current.activePosition : safePositions[0]
      return { ...current, positions: safePositions, activePosition }
    })
  }

  const openEditModal = (playerId) => {
    const player = players.find((p) => getPlayerId(p) === playerId)
    if (!player) return
    setEditingPlayerId(playerId)
    setEditingForm({
      name: player.name || '',
      number: String(player.number || ''),
      positions: Array.isArray(player.positions) && player.positions.length ? player.positions : ['DH'],
      activePosition: player.activePosition || player.positions?.[0] || 'DH',
    })
  }

  const toggleEditPosition = (position) => {
    setEditingForm((current) => {
      const has = current.positions.includes(position)
      const positions = has ? current.positions.filter((p) => p !== position) : [...current.positions, position]
      const safePositions = positions.length ? positions : ['DH']
      const activePosition = safePositions.includes(current.activePosition) ? current.activePosition : safePositions[0]
      return { ...current, positions: safePositions, activePosition }
    })
  }

  const handleSaveEdit = async () => {
    if (!editingPlayerId) return
    await onUpdatePlayer?.(editingPlayerId, {
      name: (editingForm.name || '').trim(),
      number: Number(editingForm.number) || 0,
      positions: editingForm.positions,
      activePosition: editingForm.activePosition,
    })
    setEditingPlayerId(null)
  }

  const handleDeletePlayerItem = (player) => {
    if (!getPlayerId(player)) return
    setPendingDeletePlayer(player)
  }

  const confirmDeletePlayer = async () => {
    const player = pendingDeletePlayer
    setPendingDeletePlayer(null)
    if (!player) return
    const playerId = getPlayerId(player)
    if (focusedPlayerId === playerId) setFocusedPlayerId(null)
    await onDeletePlayer?.(playerId)
  }

  const toggleParticipant = (playerId) => {
    const current = participantIds.length ? participantIds : players.map((p) => getPlayerId(p))
    const has = current.includes(playerId)
    const next = has ? current.filter((id) => id !== playerId) : [...current, playerId]
    onUpdateGameState?.((state) => {
      const currentOrder = state.battingOrder || []
      const validOrder = currentOrder.filter((id) => next.includes(id))
      const battingOrder = has ? validOrder : [...validOrder, playerId]
      const currentBatterIndex = battingOrder.length
        ? Math.min(state.currentBatterIndex || 0, battingOrder.length - 1)
        : 0
      return { ...state, participantPlayerIds: next, battingOrder, currentBatterIndex }
    }, 'Participantes da ficha atualizados')
  }

  return (
    <section className="jogadores-page">
      <div className="jogadores-col">
        <div className="card">
          <h2>Adicionar jogador</h2>
          <form className="player-form" onSubmit={handleAddPlayer}>
            <label htmlFor="add-player-name" className="field-label">Nome</label>
            <input
              id="add-player-name"
              placeholder="Nome"
              value={form.name}
              onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
            />
            <label htmlFor="add-player-number" className="field-label">Número</label>
            <input
              id="add-player-number"
              placeholder="Numero"
              type="number"
              value={form.number}
              onChange={(e) => setForm((c) => ({ ...c, number: e.target.value }))}
            />
            <div className="positions-picker">
              {VALID_POSITIONS.map((position) => (
                <label key={position}>
                  <input
                    type="checkbox"
                    checked={form.positions.includes(position)}
                    onChange={() => toggleFormPosition(position)}
                  />
                  {position}
                </label>
              ))}
            </div>
            <select
              value={form.activePosition}
              onChange={(e) => setForm((c) => ({ ...c, activePosition: e.target.value }))}
            >
              {form.positions.map((position) => (
                <option key={`active-${position}`} value={position}>
                  Titular: {position}
                </option>
              ))}
            </select>
            <Button type="submit">Salvar jogador</Button>
          </form>
        </div>

        <div className="card">
          <h2>Lineup da ficha</h2>
          <p className="jogadores-hint">Selecione quem participa do jogo atual.</p>
          <div className="lineup-picker">
            {players.map((player) => {
              const id = getPlayerId(player)
              const selected = participantIds.length ? participantIds.includes(id) : true
              return (
                <label key={`lineup-${id}`}>
                  <input type="checkbox" checked={selected} onChange={() => toggleParticipant(id)} />
                  {player.name} #{player.number} ({getMainPosition(player)})
                </label>
              )
            })}
            {!players.length && <p className="empty-state">Nenhum jogador cadastrado.</p>}
          </div>
        </div>
      </div>

      <div className="jogadores-col">
        <div className="card">
          <h2>Elenco ({players.length})</h2>
          <div className="managed-list">
            {players.map((player) => {
              const id = getPlayerId(player)
              return (
                <div key={`managed-player-${id}`} className="managed-list-item">
                  <div className="managed-player-info">
                    <strong>{player.name} #{player.number}</strong>
                    <span className="managed-player-pos">{(player.positions || []).join(' / ')}</span>
                  </div>
                  <div className="managed-player-actions">
                    <Button type="button" variant="primary" onClick={() => openPlayerDetails(id)}>
                      Stats
                    </Button>
                    <Button type="button" variant="primary" onClick={() => openEditModal(id)}>
                      Editar
                    </Button>
                    <Button type="button" variant="danger" onClick={() => handleDeletePlayerItem(player)}>
                      Apagar
                    </Button>
                  </div>
                </div>
              )
            })}
            {!players.length && <p className="empty-state">Nenhum jogador cadastrado.</p>}
          </div>
        </div>
      </div>

      {pendingDeletePlayer && (
        <ConfirmModal
          message={`Apagar jogador ${pendingDeletePlayer.name} #${pendingDeletePlayer.number}?`}
          confirmLabel="Apagar"
          danger
          onConfirm={confirmDeletePlayer}
          onCancel={() => setPendingDeletePlayer(null)}
        />
      )}

      <PlayerStatsModal
        player={focusedPlayerId ? players.find((p) => getPlayerId(p) === focusedPlayerId) || null : null}
        seasonEntry={focusedSeasonEntry}
        gameEntry={focusedGameEntry}
        onClose={() => setFocusedPlayerId(null)}
      />

      {editingPlayerId && (
        <Modal title="Editar jogador" onClose={() => setEditingPlayerId(null)}>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit() }}>
            <label htmlFor="edit-player-name" className="field-label">Nome</label>
            <input
              id="edit-player-name"
              placeholder="Nome"
              value={editingForm.name}
              onChange={(e) => setEditingForm((c) => ({ ...c, name: e.target.value }))}
            />
            <label htmlFor="edit-player-number" className="field-label">Número</label>
            <input
              id="edit-player-number"
              placeholder="Numero"
              value={editingForm.number}
              onChange={(e) => setEditingForm((c) => ({ ...c, number: e.target.value }))}
            />
            <div className="positions-picker">
              {VALID_POSITIONS.map((position) => (
                <label key={`edit-pos-${position}`}>
                  <input
                    type="checkbox"
                    checked={editingForm.positions.includes(position)}
                    onChange={() => toggleEditPosition(position)}
                  />
                  {position}
                </label>
              ))}
            </div>
            <select
              value={editingForm.activePosition}
              onChange={(e) => setEditingForm((c) => ({ ...c, activePosition: e.target.value }))}
            >
              {editingForm.positions.map((position) => (
                <option key={`edit-active-${position}`} value={position}>
                  Titular: {position}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button type="button" variant="primary" onClick={handleSaveEdit}>
                Salvar
              </Button>
              <Button type="button" variant="danger" onClick={() => setEditingPlayerId(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

export default JogadoresPage
