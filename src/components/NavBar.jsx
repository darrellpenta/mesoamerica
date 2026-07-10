import { NavLink } from 'react-router-dom'

export default function NavBar() {
  return (
    <nav className="app-nav">
      <span className="app-nav__brand">Mesoamerica</span>
      <NavLink to="/" end className={({ isActive }) => `app-nav__link${isActive ? ' app-nav__link--active' : ''}`}>
        Map
      </NavLink>
      <NavLink to="/timeline" className={({ isActive }) => `app-nav__link${isActive ? ' app-nav__link--active' : ''}`}>
        Timeline
      </NavLink>
      <NavLink to="/admin" className={({ isActive }) => `app-nav__link${isActive ? ' app-nav__link--active' : ''}`}>
        Admin
      </NavLink>
      <NavLink to="/guide" className={({ isActive }) => `app-nav__link${isActive ? ' app-nav__link--active' : ''}`}>
        Guide
      </NavLink>
    </nav>
  )
}
