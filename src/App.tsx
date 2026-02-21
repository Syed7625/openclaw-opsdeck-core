import { NavLink, Outlet } from 'react-router-dom'
import { useOverview } from './data'
import './App.css'

export default function App() {
  const { data, apiState } = useOverview()

  return (
    <main className="theme-cyber">
      <div className="scanlines" />
      <header className="topbar">
        <h1>Mission Control</h1>
        <span className={`pill ${apiState}`}>{apiState}</span>
      </header>

      <nav className="nav">
        <NavLink to="/">Command</NavLink>
        <NavLink to="/sites">Sites</NavLink>
        <NavLink to="/crons">Crons</NavLink>
        <NavLink to="/forge">Forge</NavLink>
      </nav>

      <section className="page-wrap">
        <Outlet context={data} />
      </section>
    </main>
  )
}
