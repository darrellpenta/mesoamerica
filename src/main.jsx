import { useState, Component, Suspense, lazy } from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import NavBar from './components/NavBar.jsx'

const App              = lazy(() => import('./App.jsx'))
const AdminPage        = lazy(() => import('./pages/AdminPage.jsx'))
const TimelinePage     = lazy(() => import('./pages/TimelinePage.jsx'))
const StoryViewerPage  = lazy(() => import('./pages/StoryViewerPage.jsx'))

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, textAlign: 'center', color: '#dc2626' }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {this.props.label ?? 'Something went wrong'}
          </div>
          <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 16 }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ fontSize: 13, padding: '6px 16px', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Set VITE_ADMIN_PASSWORD in .env (never commit the password)
const ADMIN_PW = import.meta.env.VITE_ADMIN_PASSWORD ?? ''

function AdminAuthGate() {
  const [authed, setAuthed] = useState(() => {
    try { return localStorage.getItem('admin-authed-v1') === 'yes' } catch { return false }
  })
  const [pw, setPw] = useState('')
  const [err, setErr] = useState(false)

  const submit = () => {
    if (pw === ADMIN_PW) {
      try { localStorage.setItem('admin-authed-v1', 'yes') } catch {}
      setAuthed(true)
    } else {
      setErr(true)
      setPw('')
    }
  }

  if (authed) return <AdminPage />

  return (
    <div className="admin-auth-gate">
      <div className="admin-auth-gate__card">
        <div className="admin-auth-gate__icon">🗺</div>
        <div className="admin-auth-gate__title">Knowledge Editor</div>
        <div className="admin-auth-gate__subtitle">Enter the admin password to access the entity browser and annotation tools</div>
        <input
          type="password"
          className="admin-auth-gate__input"
          value={pw}
          onChange={e => { setPw(e.target.value); setErr(false) }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Password"
          autoFocus
        />
        {err && <div className="admin-auth-gate__err">Incorrect password</div>}
        <button className="admin-auth-gate__btn" onClick={submit}>Enter Admin</button>
        <button className="admin-auth-gate__signout" onClick={() => {
          try { localStorage.removeItem('admin-authed-v1') } catch {}
          window.location.hash = '/'
        }}>← Back to Map</button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <div className="app-shell">
        <NavBar />
        <div className="app-shell__body">
          <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', opacity: 0.5 }}>Loading…</div>}>
            <Routes>
              <Route path="/" element={<ErrorBoundary label="Map failed to load"><App /></ErrorBoundary>} />
              <Route path="/timeline" element={<ErrorBoundary label="Timeline failed to load"><TimelinePage /></ErrorBoundary>} />
              <Route path="/admin" element={<ErrorBoundary label="Admin panel error"><AdminAuthGate /></ErrorBoundary>} />
              <Route path="/stories/:id" element={<ErrorBoundary label="Story failed to load"><StoryViewerPage /></ErrorBoundary>} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </HashRouter>
  </StrictMode>,
)
