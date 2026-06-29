import React, { useEffect, useRef, useState } from 'react'
import Button from '../../ui/Button'
import Input from '../../ui/Input'
import Select from '../../ui/Select'

// Memoized individual card — re-renders only when this specific player's data changes,
// not when other cards are selected/deselected.
const BenchCard = React.memo(function BenchCard({
  player,
  id,
  isSelected,
  startDragPlayer,
  openPlayerDetails,
  openEditModal,
  getPlayerId,
  getMainPosition,
  playersById,
  setPlayers,
  gameState,
  onUpdateGameState,
  setSelectedId,
}) {
  return (
    <div className={`bench-card ${isSelected ? 'selected' : ''}`}>
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
        <Select
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
        </Select>
      )}
    </div>
  )
})

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
  collapsed = false,
  onToggleCollapse,
}, ref) {
  const [localSearch, setLocalSearch] = useState(benchSearch)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => setBenchSearch(localSearch), 200)
    return () => clearTimeout(debounceRef.current)
  }, [localSearch, setBenchSearch])

  const fieldCount = (gameState.onFieldPlayerIds || []).length

  return (
    <aside
      ref={ref}
      className={`bench-panel ${dropTarget === 'bench' ? 'drop-ready' : ''} ${collapsed ? 'bench-panel--collapsed' : ''}`}
      aria-label="Banco de reservas"
    >
      <button
        type="button"
        className="bench-collapse-tab"
        onClick={() => onToggleCollapse?.()}
        aria-label={collapsed ? 'Expandir banco' : 'Recolher banco'}
        title={collapsed ? 'Expandir banco' : 'Recolher banco'}
      >
        {collapsed ? '◀' : '▶'}
        {collapsed && <span className="bench-collapse-count">{benchPlayers.length}</span>}
      </button>

      {!collapsed && (
        <>
          <div className="bench-head">
            <div className="bench-head-row">
              <h3>Banco</h3>
              <span className="bench-field-count">{fieldCount} em campo</span>
            </div>
            <Input
              placeholder="Buscar jogador"
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              aria-label="Buscar jogador no banco"
            />
          </div>

          <div className="bench-list">
            {dropMessage && dropTarget === 'bench' && <div className="drop-hint">{dropMessage}</div>}
            {benchPlayers.map((player) => {
              const id = getPlayerId(player)
              return (
                <BenchCard
                  key={id}
                  player={player}
                  id={id}
                  isSelected={selectedId === id}
                  startDragPlayer={startDragPlayer}
                  openPlayerDetails={openPlayerDetails}
                  openEditModal={openEditModal}
                  getPlayerId={getPlayerId}
                  getMainPosition={getMainPosition}
                  playersById={playersById}
                  setPlayers={setPlayers}
                  gameState={gameState}
                  onUpdateGameState={onUpdateGameState}
                  setSelectedId={setSelectedId}
                />
              )
            })}
          </div>
        </>
      )}
    </aside>
  )
})

export default Bench
