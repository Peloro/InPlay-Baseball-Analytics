import { getAuth } from '../services/api'

const APP_VERSION = '1.0.0'

export default function SettingsPage({ onLogout }) {
  const auth = getAuth()

  return (
    <main style={{
      padding: '1.5rem',
      maxWidth: '480px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
    }}>
      <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f5f5f5' }}>Ajustes</h2>

      <section style={{
        background: '#1a1f2e',
        border: '1px solid #2a2f3e',
        borderRadius: '0.75rem',
        overflow: 'hidden',
      }}>
        <SettingsRow label="Time" value={auth?.teamName || '—'} />
        <SettingsRow label="Coach" value={auth?.email || '—'} border />
        <SettingsRow label="Versão" value={APP_VERSION} border />
      </section>

      <button
        type="button"
        onClick={onLogout}
        style={{
          padding: '0.65rem',
          borderRadius: '0.5rem',
          border: '1px solid #dc2626',
          background: 'transparent',
          color: '#f87171',
          fontWeight: 600,
          fontSize: '0.9rem',
          cursor: 'pointer',
        }}
      >
        Sair da conta
      </button>
    </main>
  )
}

function SettingsRow({ label, value, border }) {
  return (
    <div style={{
      padding: '0.85rem 1rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTop: border ? '1px solid #2a2f3e' : 'none',
    }}>
      <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', color: '#f5f5f5', fontWeight: 500 }}>{value}</span>
    </div>
  )
}
