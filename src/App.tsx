import { useMemo, useState } from 'react'
import './App.css'

type AgentState = 'active' | 'idle' | 'error'

type Agent = {
  id: string
  name: string
  state: AgentState
  load: number
}

const agents: Agent[] = [
  { id: 'omar', name: 'Omar', state: 'active', load: 78 },
  { id: 'will', name: 'Will', state: 'active', load: 64 },
  { id: 'opie', name: 'Opie', state: 'idle', load: 8 },
  { id: 'buzz', name: 'Buzz', state: 'active', load: 56 },
  { id: 'elon', name: 'Elon', state: 'idle', load: 12 },
  { id: 'sage', name: 'Sage', state: 'idle', load: 21 },
  { id: 'forge', name: 'Forge', state: 'error', load: 0 },
  { id: 'kite', name: 'Kite', state: 'idle', load: 17 },
]

const projects = [
  { name: 'Ancient Travels', status: 'shipping', glow: 'var(--cyan)' },
  { name: 'OmarCMS', status: 'stable', glow: 'var(--green)' },
  { name: 'OpenClaw Fork', status: 'drift', glow: 'var(--magenta)' },
]

const crons = [
  { name: 'Morning Brief', next: 'Mon 7:00', state: 'ready' },
  { name: 'Night Heartbeat', next: 'Tonight 22:00', state: 'ready' },
  { name: 'OmarCMS Publish', next: 'Daily 4:00', state: 'ready' },
]

function App() {
  const [terminalMode, setTerminalMode] = useState(false)

  const positionedAgents = useMemo(() => {
    return agents.map((agent, index) => {
      const angle = (index / agents.length) * Math.PI * 2
      const radius = agent.state === 'active' ? 130 : agent.state === 'error' ? 190 : 250
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      return { ...agent, x, y }
    })
  }, [])

  return (
    <main className={terminalMode ? 'theme-terminal' : 'theme-cyber'}>
      <div className="scanlines" />

      <header className="topbar">
        <h1>Ops Deck</h1>
        <button onClick={() => setTerminalMode((v) => !v)}>
          {terminalMode ? 'CYBER' : 'TERMINAL'}
        </button>
      </header>

      <section className="layout">
        <div className="table-wrap">
          <div className="table-core">
            <div className="ring" />
            <div className="ring ring-2" />
            <div className="label">AGENT TABLE</div>
          </div>

          {positionedAgents.map((agent) => (
            <div
              key={agent.id}
              className={`agent ${agent.state}`}
              style={{ transform: `translate(calc(-50% + ${agent.x}px), calc(-50% + ${agent.y}px))` }}
            >
              <strong>{agent.name}</strong>
              <small>{agent.load}%</small>
            </div>
          ))}
        </div>

        <aside className="sidepanel">
          <div className="panel">
            <h2>Projects</h2>
            {projects.map((p) => (
              <div className="row" key={p.name}>
                <span>{p.name}</span>
                <em style={{ color: p.glow }}>{p.status}</em>
              </div>
            ))}
          </div>

          <div className="panel">
            <h2>Crons</h2>
            {crons.map((c) => (
              <div className="row" key={c.name}>
                <span>{c.name}</span>
                <em>{c.next}</em>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
