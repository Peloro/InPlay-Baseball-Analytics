import { useState } from 'react'
import { login } from '../services/api'

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const auth = await login(email.trim(), password)
      onLogin(auth)
    } catch (err) {
      setError(err?.response?.data?.message || 'Credenciais inválidas.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f1117',
      padding: '1.5rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '360px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img
            src="/Ativo 1Cporcotransparente.png"
            alt="Logo"
            style={{ width: '2.5rem', height: '2.5rem', objectFit: 'contain' }}
          />
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f5f5f5', lineHeight: 1.2 }}>Beisebol CAASO</div>
            <div style={{ fontSize: '0.7rem', color: '#f59e0b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>RAÇA CAASO</div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            width: '100%',
            background: '#1a1f2e',
            border: '1px solid #2a2f3e',
            borderRadius: '0.75rem',
            padding: '1.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f5f5f5', textAlign: 'center' }}>
            Entrar
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500 }}>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="coach@time.com"
              style={{
                padding: '0.6rem 0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid #2a2f3e',
                background: '#0f1117',
                color: '#f5f5f5',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500 }}>Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              style={{
                padding: '0.6rem 0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid #2a2f3e',
                background: '#0f1117',
                color: '#f5f5f5',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#f87171', textAlign: 'center' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '0.25rem',
              padding: '0.65rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: loading ? '#6b7280' : '#f59e0b',
              color: '#0f1117',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}
