import React from 'react'
import Button from '../../ui/Button'
import Input from '../../ui/Input'

const Bench = React.forwardRef(function Bench({
  benchPlayers,
  dropTarget,
  dropMessage,
  benchSearch,
  setBenchSearch,
  selectedId,
  setSelectedId,
  startDragPlayer,
  openPlayerDetails,
  openEditModal,
  getPlayerId,
  getMainPosition,
  playersById,
  setPlayers,
  gameState,
  onUpdateGameState,
  isMobile = false,
}, ref) {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  React.useImperativeHandle(ref, () => ({
    openDrawer: () => setDrawerOpen(true),
    closeDrawer: () => setDrawerOpen(false),
  }))
  if (isMobile) {
    return (
      <div>
        <button type="button" className="full-width-btn" onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen}>
          Abrir Banco
        </button>
        {drawerOpen && (
          <div className={`bench-panel bench-panel--drawer ${dropTarget === 'bench' ? 'drop-ready' : ''}`} role="dialog" aria-label="Banco de reservas">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div className="bench-head">
                <h3>Banco</h3>
                <Input placeholder="Buscar jogador" value={benchSearch} onChange={(event) => setBenchSearch(event.target.value)} />
              </div>
              <button type="button" className="mode-toggle-btn" onClick={() => setDrawerOpen(false)}>Fechar</button>
            </div>
            <div className="bench-list">
              {dropMessage && dropTarget === 'bench' && <div className="drop-hint">{dropMessage}</div>}
              {benchPlayers.map((player) => {
                const id = getPlayerId(player)
                return (
                  <div key={id} className={`bench-card ${selectedId === id ? 'selected' : ''}`}>
                    <button type="button" className="bench-player-btn" onClick={() => setSelectedId(id)} onPointerDown={(event) => startDragPlayer(event, id, 'bench')} draggable onDragStart={(event) => startDragPlayer(event, id, 'bench')}>
                      <strong>{player.name} #{player.number}</strong>
                      <span>{(player.positions || []).join(' / ')}</span>
                    </button>
                    <Button type="button" className="bench-info-btn" onClick={() => openPlayerDetails(id)}>Ver stats</Button>
                    <Button type="button" className="bench-info-btn" onClick={() => openEditModal(id)}>Editar</Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <aside
      ref={ref}
      className={`bench-panel ${dropTarget === 'bench' ? 'drop-ready' : ''}`}
      aria-label="Banco de reservas"
    >
      <div className="bench-head">
        <h3>Campo: {Object.keys(playersById || {}).length}</h3>
        <h3>Banco</h3>
        <Input
          placeholder="Buscar jogador"
          value={benchSearch}
          onChange={(event) => setBenchSearch(event.target.value)}
        />
      </div>

      <div className="bench-list">
        {dropMessage && dropTarget === 'bench' && <div className="drop-hint">{dropMessage}</div>}
        {benchPlayers.map((player) => {
          const id = getPlayerId(player)
          return (
            <div key={id} className={`bench-card ${selectedId === id ? 'selected' : ''}`}>
              <button
                type="button"
                className="bench-player-btn"
                onClick={() => setSelectedId(id)}
                onPointerDown={(event) => startDragPlayer(event, id, 'bench')}
                draggable
                onDragStart={(event) => startDragPlayer(event, id, 'bench')}
              >
                <strong>
                  {player.name} #{player.number}
                </strong>
                <span>{(player.positions || []).join(' / ')}</span>
              </button>
              <Button type="button" className="bench-info-btn" onClick={() => openPlayerDetails(id)}>
                Ver stats
              </Button>
              <Button type="button" className="bench-info-btn" onClick={() => openEditModal(id)}>
                Editar
              </Button>
              {(player.positions || []).length > 1 && (
                <select
                  value={getMainPosition(player)}
                  onChange={(event) => {
                    const nextPosition = event.target.value
                    const conflictId = (gameState.onFieldPlayerIds || [])
                      .filter((fieldId) => fieldId !== id)
                      .find((fieldId) => getMainPosition(playersById[fieldId]) === nextPosition)

                    setPlayers((current) =>
                      current.map((item) =>
                        getPlayerId(item) === id ? { ...item, activePosition: nextPosition } : item,
                      ),
                    )

                    if ((gameState.onFieldPlayerIds || []).includes(id) && conflictId) {
                      onUpdateGameState((current) => {
                        const nextOnField = (current.onFieldPlayerIds || []).filter((fieldId) => fieldId !== conflictId)
                        const battingOrder = (current.battingOrder || []).filter((fieldId) => fieldId !== conflictId)
                        const lineup = (current.lineup || [])
                          .filter((item) => item.playerId !== conflictId)
                          .map((item) => (item.playerId === id ? { ...item, position: nextPosition } : item))
                        const bench = playersById ? Object.keys(playersById) : []

                        return {
                          ...current,
                          onFieldPlayerIds: nextOnField,
                          battingOrder,
                          lineup,
                          bench,
                          participantPlayerIds: [...nextOnField, ...bench],
                        }
                      }, 'Conflito de posicao resolvido: jogador anterior enviado ao banco')
                    }
                  }}
                >
                  {(player.positions || []).map((position) => (
                    <option key={`${id}-${position}`} value={position}>
                      {position}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
})

export default Bench
