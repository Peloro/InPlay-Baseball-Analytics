import { useState } from 'react'
import { login, register } from '../services/api'

const fieldStyle = {
  padding: '0.6rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid #26263a',
  background: '#1e1e2a',
  color: '#eeeeff',
  fontSize: '0.9rem',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const labelStyle = { fontSize: '0.75rem', color: '#6b6b7e', fontWeight: 500 }

function Field({ label, type = 'text', value, onChange, placeholder, autoComplete, minLength }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        required
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        style={fieldStyle}
      />
    </div>
  )
}

export default function LoginPage({ onLogin }) {
  const [view, setView] = useState('login') // 'login' | 'register' | 'success'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [teamName, setTeamName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const switchTo = (v) => {
    setError('')
    setEmail('')
    setPassword('')
    setTeamName('')
    setView(v)
  }

  const handleLogin = async (e) => {
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

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(teamName.trim(), email.trim(), password)
      setView('success')
    } catch (err) {
      setError(err?.response?.data?.message || 'Erro ao criar conta.')
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
      background: 'linear-gradient(145deg, #09090f 0%, #0d0d1a 100%)',
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
            src="/IP_Square.png"
            alt="InPlay logo"
            style={{ width: '2.5rem', height: '2.5rem', objectFit: 'contain' }}
          />
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#eeeeff', lineHeight: 1.2, letterSpacing: '0.02em' }}>InPlay</div>
            <div style={{ fontSize: '0.68rem', color: '#6366f1', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>Baseball Analytics</div>
          </div>
        </div>

        <div style={{
          width: '100%',
          background: '#131320',
          border: '1px solid #26263a',
          borderRadius: '0.75rem',
          padding: '1.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}>
          {view === 'success' ? (
            <>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#eeeeff' }}>
                  Conta criada!
                </h2>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#6b6b7e', lineHeight: 1.5 }}>
                  Aguardando aprovação do administrador. Você receberá acesso em breve.
                </p>
              </div>
              <button
                type="button"
                onClick={() => switchTo('login')}
                style={{ padding: '0.65rem', borderRadius: '0.5rem', border: 'none', background: '#26263a', color: '#eeeeff', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}
              >
                Voltar ao login
              </button>
            </>
          ) : view === 'register' ? (
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#eeeeff', textAlign: 'center' }}>
                Criar conta
              </h2>
              <Field
                label="Nome do time"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="Ex: Tigres do Sul"
                autoComplete="organization"
              />
              <Field
                label="E-mail"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="coach@time.com"
                autoComplete="email"
              />
              <Field
                label="Senha"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={8}
              />
              {error && (
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#f87171', textAlign: 'center' }}>{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: '0.25rem',
                  padding: '0.65rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: loading ? '#3a3a5a' : 'linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)',
                  color: '#eeeeff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Enviando...' : 'Solicitar acesso'}
              </button>
              <button
                type="button"
                onClick={() => switchTo('login')}
                style={{ background: 'none', border: 'none', color: '#6b6b7e', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Já tenho conta
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#eeeeff', textAlign: 'center' }}>
                Entrar
              </h2>
              <Field
                label="E-mail"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="coach@time.com"
                autoComplete="email"
              />
              <Field
                label="Senha"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              {error && (
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#f87171', textAlign: 'center' }}>{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: '0.25rem',
                  padding: '0.65rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: loading ? '#3a3a5a' : 'linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)',
                  color: '#eeeeff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
              <button
                type="button"
                onClick={() => switchTo('register')}
                style={{ background: 'none', border: 'none', color: '#6b6b7e', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Criar conta
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
