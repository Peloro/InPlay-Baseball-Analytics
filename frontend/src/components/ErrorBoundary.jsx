import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f1117',
          color: '#f5f5f5',
          gap: '1.5rem',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Algo deu errado</h2>
          <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.9rem' }}>
            Reinicie o aplicativo para continuar.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.65rem 1.5rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#f59e0b',
              color: '#0f1117',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Reiniciar
          </button>
        </main>
      )
    }
    return this.props.children
  }
}
