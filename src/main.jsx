import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import NavBar from './components/NavBar.jsx'
import App from './App.jsx'
import AdminPage from './pages/AdminPage.jsx'
import TimelinePage from './pages/TimelinePage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <div className="app-shell">
        <NavBar />
        <div className="app-shell__body">
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  </StrictMode>,
)
