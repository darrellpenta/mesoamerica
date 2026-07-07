import { useState } from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import NavBar from './components/NavBar.jsx'
import App from './App.jsx'
import AdminPage from './pages/AdminPage.jsx'
import TimelinePage from './pages/TimelinePage.jsx'

// Change this string to update the admin password
const ADMIN_PW = 'mesoamerica2026'

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
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/admin" element={<AdminAuthGate />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  </StrictMode>,
)
