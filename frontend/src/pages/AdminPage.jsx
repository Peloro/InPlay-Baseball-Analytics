import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'

const BILLING_LABELS = { trial: 'Trial', paid: 'Pago', unpaid: 'Inadimplente' }
const BILLING_COLORS = { trial: '#f59e0b', paid: '#22c55e', unpaid: '#ef4444' }
const STATUS_COLORS = { active: '#22c55e', blocked: '#ef4444' }

const inputStyle = {
  background: '#111827',
  border: '1px solid #374151',
  borderRadius: '0.5rem',
  color: '#e5e7eb',
  padding: '0.5rem 0.75rem',
  fontSize: '0.875rem',
  outline: 'none',
}

function btnStyle(color, fontSize = '0.875rem') {
  return {
    background: color,
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    padding: '0.4rem 0.85rem',
    fontSize,
    cursor: 'pointer',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  }
}

function badgeStyle(color) {
  return {
    background: color + '22',
    color,
    border: `1px solid ${color}55`,
    borderRadius: '9999px',
    padding: '0.2rem 0.6rem',
    fontSize: '0.75rem',
    fontWeight: 600,
  }
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
  padding: '1rem',
}

const modalStyle = {
  background: '#1f2937',
  borderRadius: '0.75rem',
  padding: '1.5rem',
  width: '100%',
  maxWidth: '420px',
  color: '#e5e7eb',
}

const labelStyle = {
  display: 'block',
  fontSize: '0.8125rem',
  color: '#9ca3af',
  marginBottom: '0.375rem',
}

export default function AdminPage() {
  const [pending, setPending] = useState([])
  const [loadingPending, setLoadingPending] = useState(true)

  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [createForm, setCreateForm] = useState({ teamName: '', email: '', password: '' })
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  const [billingTeam, setBillingTeam] = useState(null)
  const [billingForm, setBillingForm] = useState({ billingStatus: 'trial', billingNotes: '' })
  const [savingBilling, setSavingBilling] = useState(false)

  const [deleteTeam, setDeleteTeam] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  const loadPending = useCallback(async () => {
    try {
      setLoadingPending(true)
      const res = await api.get('/admin/pending')
      setPending(res.data)
    } catch {
      setPending([])
    } finally {
      setLoadingPending(false)
    }
  }, [])

  const loadTeams = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/admin/teams')
      setTeams(res.data)
      setError('')
    } catch {
      setError('Erro ao carregar equipes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPending(); loadTeams() }, [loadPending, loadTeams])

  const handleApprove = async (user) => {
    try {
      await api.patch(`/admin/users/${user._id}/approve`)
      setPending(prev => prev.filter(u => u._id !== user._id))
      loadTeams()
    } catch {
      alert('Erro ao aprovar.')
    }
  }

  const handleReject = async (user) => {
    if (!window.confirm(`Rejeitar e deletar a conta de ${user.email}?`)) return
    try {
      await api.delete(`/admin/users/${user._id}`)
      setPending(prev => prev.filter(u => u._id !== user._id))
    } catch {
      alert('Erro ao rejeitar.')
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreateError('')
    setCreating(true)
    try {
      await api.post('/admin/teams', createForm)
      setCreateForm({ teamName: '', email: '', password: '' })
      await loadTeams()
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Erro ao criar equipe.')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleStatus = async (team) => {
    const next = team.status === 'active' ? 'blocked' : 'active'
    try {
      await api.patch(`/admin/teams/${team._id}/status`, { status: next })
      setTeams(prev => prev.map(t => t._id === team._id ? { ...t, status: next } : t))
    } catch {
      alert('Erro ao atualizar status.')
    }
  }

  const openBilling = (team) => {
    setBillingTeam(team)
    setBillingForm({ billingStatus: team.billingStatus, billingNotes: team.billingNotes })
  }

  const handleSaveBilling = async () => {
    if (!billingTeam) return
    setSavingBilling(true)
    try {
      await api.patch(`/admin/teams/${billingTeam._id}/billing`, billingForm)
      setTeams(prev => prev.map(t => t._id === billingTeam._id ? { ...t, ...billingForm } : t))
      setBillingTeam(null)
    } catch {
      alert('Erro ao salvar cobrança.')
    } finally {
      setSavingBilling(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTeam || deleteConfirm !== deleteTeam.name) return
    setDeleting(true)
    try {
      await api.delete(`/admin/teams/${deleteTeam._id}`)
      setTeams(prev => prev.filter(t => t._id !== deleteTeam._id))
      setDeleteTeam(null)
      setDeleteConfirm('')
    } catch {
      alert('Erro ao deletar equipe.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto', color: '#e5e7eb', paddingBottom: '4rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>Painel Administrativo</h2>

      {!loadingPending && pending.length > 0 && (
        <section style={{ background: '#1c1917', border: '1px solid #f59e0b44', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f59e0b', marginBottom: '0.75rem' }}>
            Aprovações pendentes ({pending.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pending.map(u => (
              <div key={u._id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', justifyContent: 'space-between', background: '#111827', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{u.teamName}</p>
                  <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{u.email}</p>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>{new Date(u.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => handleApprove(u)} style={btnStyle('#22c55e', '0.8rem')}>Aprovar</button>
                  <button onClick={() => handleReject(u)} style={btnStyle('#ef4444', '0.8rem')}>Rejeitar</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ background: '#1f2937', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Nova Equipe</h3>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <input
            placeholder="Nome do time"
            value={createForm.teamName}
            onChange={e => setCreateForm(f => ({ ...f, teamName: e.target.value }))}
            required
            style={inputStyle}
          />
          <input
            placeholder="Email do coach"
            type="email"
            value={createForm.email}
            onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
            required
            style={inputStyle}
          />
          <input
            placeholder="Senha (min 8 chars)"
            type="password"
            value={createForm.password}
            onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
            required
            minLength={8}
            style={inputStyle}
          />
          <button type="submit" disabled={creating} style={btnStyle('#3b82f6')}>
            {creating ? 'Criando...' : 'Criar'}
          </button>
        </form>
        {createError && <p style={{ color: '#ef4444', marginTop: '0.5rem', fontSize: '0.875rem' }}>{createError}</p>}
      </section>

      {loading ? (
        <p style={{ color: '#9ca3af' }}>Carregando...</p>
      ) : error ? (
        <p style={{ color: '#ef4444' }}>{error}</p>
      ) : teams.length === 0 ? (
        <p style={{ color: '#9ca3af' }}>Nenhuma equipe cadastrada.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {teams.map(team => (
            <div
              key={team._id}
              style={{
                background: '#1f2937',
                borderRadius: '0.75rem',
                padding: '1rem 1.25rem',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ flex: 1, minWidth: '160px' }}>
                <p style={{ fontWeight: 600 }}>{team.name || '(sem nome)'}</p>
                <p style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>{team.coachEmail || '—'}</p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  {team.createdAt ? new Date(team.createdAt).toLocaleDateString('pt-BR') : '—'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={badgeStyle(STATUS_COLORS[team.status] || '#6b7280')}>{team.status}</span>
                <span style={badgeStyle(BILLING_COLORS[team.billingStatus] || '#6b7280')}>
                  {BILLING_LABELS[team.billingStatus] || team.billingStatus}
                </span>
                <button
                  onClick={() => handleToggleStatus(team)}
                  style={btnStyle(team.status === 'active' ? '#ef4444' : '#22c55e', '0.75rem')}
                >
                  {team.status === 'active' ? 'Bloquear' : 'Desbloquear'}
                </button>
                <button onClick={() => openBilling(team)} style={btnStyle('#f59e0b', '0.75rem')}>
                  Cobrança
                </button>
                <button
                  onClick={() => { setDeleteTeam(team); setDeleteConfirm('') }}
                  style={btnStyle('#6b7280', '0.75rem')}
                >
                  Deletar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {billingTeam && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ fontWeight: 600, marginBottom: '1rem' }}>Cobrança — {billingTeam.name}</h3>
            <label style={labelStyle}>Status de cobrança</label>
            <select
              value={billingForm.billingStatus}
              onChange={e => setBillingForm(f => ({ ...f, billingStatus: e.target.value }))}
              style={{ ...inputStyle, width: '100%' }}
            >
              <option value="trial">Trial</option>
              <option value="paid">Pago</option>
              <option value="unpaid">Inadimplente</option>
            </select>
            <label style={{ ...labelStyle, marginTop: '0.75rem' }}>Notas</label>
            <textarea
              value={billingForm.billingNotes}
              onChange={e => setBillingForm(f => ({ ...f, billingNotes: e.target.value }))}
              rows={3}
              style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
              placeholder="ex: pago via PIX em 2026-07-01"
            />
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setBillingTeam(null)} style={btnStyle('#374151')}>Cancelar</button>
              <button onClick={handleSaveBilling} disabled={savingBilling} style={btnStyle('#3b82f6')}>
                {savingBilling ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTeam && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#ef4444' }}>Deletar equipe</h3>
            <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '1rem' }}>
              Esta ação é irreversível. Todos os jogadores, jogos e estatísticas serão deletados.
              {' '}Digite <strong style={{ color: '#e5e7eb' }}>{deleteTeam.name}</strong> para confirmar.
            </p>
            <input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={deleteTeam.name}
              style={{ ...inputStyle, width: '100%' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteTeam(null)} style={btnStyle('#374151')}>Cancelar</button>
              <button
                onClick={handleDelete}
                disabled={deleting || deleteConfirm !== deleteTeam.name}
                style={btnStyle('#ef4444')}
              >
                {deleting ? 'Deletando...' : 'Deletar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
