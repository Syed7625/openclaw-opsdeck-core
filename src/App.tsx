import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useOverview } from './data'
import './App.css'

export default function App() {
  const { data, apiState } = useOverview()
  const [terminalMode, setTerminalMode] = useState(false)

  return (
    <main className={terminalMode ? 'theme-terminal' : 'theme-cyber'}>
      <div className="scanlines" />
      <header className="topbar">
        <h1>Mission Control</h1>
        <div className="top-actions">
          <span className={`pill ${apiState}`}>{apiState}</span>
          <button className="theme-toggle" onClick={() => setTerminalMode((v) => !v)}>{terminalMode ? 'CYBER' : 'TERMINAL'}</button>
        </div>
      </header>

      <nav className="nav">
        <NavLink to="/">Command</NavLink>
        <NavLink to="/crons">Crons</NavLink>
      </nav>

      <section className="page-wrap">
        <Outlet context={data} />
      </section>
    </main>
  )
}
