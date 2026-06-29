import { useState } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Select from '../ui/Select'
import { gameStatsApi } from '../../services/api'
import { safeNumber } from '../../utils/number'
import { detectPlayerType, getPlayerId } from '../../utils/player'

export default function GameSummaryModal({ snapshot, gameState, players, upsertPlayerStat, onClose }) {
  const [summaryWP, setSummaryWP] = useState('')
  const [summaryLP, setSummaryLP] = useState('')
  const [summarySV, setSummarySV] = useState('')

  const numInnings = Math.max(
    snapshot.inning,
    (snapshot.inningScores?.home || []).length,
    (snapshot.inningScores?.away || []).length,
    1
  )

  const participantIds = new Set(gameState.participantPlayerIds || [])
  const pitchers = players.filter(
    p => detectPlayerType(p) === 'pitcher' && (participantIds.size === 0 || participantIds.has(getPlayerId(p)))
  )

  const handleConfirm = async () => {
    const saves = [
      summaryWP ? { id: summaryWP, field: 'wins' }   : null,
      summaryLP ? { id: summaryLP, field: 'losses' } : null,
      summarySV ? { id: summarySV, field: 'saves' }  : null,
    ].filter(Boolean)
    for (const { id, field } of saves) {
      const found = await gameStatsApi.listByGame(gameState.currentGameId, id)
      const cur = found.data?.[0]
      await upsertPlayerStat(id, { pitching: { [field]: safeNumber(cur?.pitching?.[field]) + 1 } })
    }
    onClose()
  }

  return (
    <Modal title="Resumo do Jogo" onClose={onClose}>
      <div className="game-summary">
        <div className="game-summary-result">
          {snapshot.homeScore > snapshot.awayScore
            ? 'CAASO venceu!'
            : snapshot.homeScore < snapshot.awayScore
              ? `${snapshot.opponentName} venceu`
              : 'Empate'}
        </div>
        <div className="game-summary-box-wrap">
          <table className="game-summary-box">
            <thead>
              <tr>
                <th className="gsb-team"></th>
                {Array.from({ length: numInnings }, (_, i) => (
                  <th key={i} className="gsb-cell">{i + 1}</th>
                ))}
                <th className="gsb-total">R</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="gsb-team gsb-team-label">{snapshot.opponentName}</td>
                {Array.from({ length: numInnings }, (_, i) => (
                  <td key={i} className="gsb-cell">{(snapshot.inningScores?.away || [])[i] ?? 0}</td>
                ))}
                <td className="gsb-total">{snapshot.awayScore}</td>
              </tr>
              <tr>
                <td className="gsb-team gsb-team-label">CAASO</td>
                {Array.from({ length: numInnings }, (_, i) => (
                  <td key={i} className="gsb-cell">{(snapshot.inningScores?.home || [])[i] ?? 0}</td>
                ))}
                <td className="gsb-total">{snapshot.homeScore}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {pitchers.length > 0 && (
          <div className="game-summary-wlsv">
            <h4>Decisão (opcional)</h4>
            <div className="game-summary-wlsv-row">
              <label>
                W
                <Select value={summaryWP} onChange={e => setSummaryWP(e.target.value)}>
                  <option value="">—</option>
                  {pitchers.map(p => <option key={getPlayerId(p)} value={getPlayerId(p)}>{p.name}</option>)}
                </Select>
              </label>
              <label>
                L
                <Select value={summaryLP} onChange={e => setSummaryLP(e.target.value)}>
                  <option value="">—</option>
                  {pitchers.map(p => <option key={getPlayerId(p)} value={getPlayerId(p)}>{p.name}</option>)}
                </Select>
              </label>
              <label>
                SV
                <Select value={summarySV} onChange={e => setSummarySV(e.target.value)}>
                  <option value="">—</option>
                  {pitchers.map(p => <option key={getPlayerId(p)} value={getPlayerId(p)}>{p.name}</option>)}
                </Select>
              </label>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="primary" onClick={handleConfirm}>
            Ver Estatísticas
          </Button>
        </div>
      </div>
    </Modal>
  )
}
