import { useEffect, useMemo, useState } from 'react'
import './App.css'

type AgentState = 'active' | 'idle' | 'error'

type Agent = { id: string; name: string; state: AgentState; load: number }
type Project = { name: string; status: string }
type Cron = { id: string; name: string; enabled: boolean; nextRunAtMs: number | null; lastStatus: string }

type Overview = { ok: boolean; ts?: number; agents: Agent[]; projects: Project[]; crons: Cron[] }

const fallback: Overview = {
  ok: true,
  agents: [
    { id: 'omar', name: 'Omar', state: 'active', load: 70 },
    { id: 'will', name: 'Will', state: 'active', load: 52 },
    { id: 'opie', name: 'Opie', state: 'idle', load: 10 },
    { id: 'buzz', name: 'Buzz', state: 'idle', load: 18 },
  ],
  projects: [
    { name: 'Ancient Travels', status: 'shipping' },
    { name: 'OmarCMS', status: 'stable' },
  ],
  crons: [],
}

function fmtNext(ms: number | null) {
  if (!ms) return 'n/a'
  const d = new Date(ms)
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function App() {
  const [terminalMode, setTerminalMode] = useState(false)
  const [data, setData] = useState<Overview>(fallback)
  const [apiState, setApiState] = useState<'live' | 'fallback'>('fallback')

  useEffect(() => {
    let mounted = true
    const pull = async () => {
      try {
        const res = await fetch('/api/overview')
        const json = await res.json()
        if (!mounted) return
        if (json?.ok) {
          setData(json)
          setApiState('live')
        } else {
          setApiState('fallback')
        }
      } catch {
        if (mounted) setApiState('fallback')
      }
    }
    pull()
    const timer = setInterval(pull, 15000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  const positionedAgents = useMemo(() => {
    return data.agents.map((agent, index) => {
      const angle = (index / Math.max(1, data.agents.length)) * Math.PI * 2
      const radius = agent.state === 'active' ? 130 : agent.state === 'error' ? 190 : 250
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      return { ...agent, x, y }
    })
  }, [data.agents])

  return (
    <main className={terminalMode ? 'theme-terminal' : 'theme-cyber'}>
      <div className="scanlines" />

      <header className="topbar">
        <h1>Ops Deck</h1>
        <div className="top-actions">
          <span className={`pill ${apiState}`}>{apiState}</span>
          <button onClick={() => setTerminalMode((v) => !v)}>{terminalMode ? 'CYBER' : 'TERMINAL'}</button>
        </div>
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
            {data.projects.map((p) => (
              <div className="row" key={p.name}>
                <span>{p.name}</span>
                <em className={p.status}>{p.status}</em>
              </div>
            ))}
          </div>

          <div className="panel">
            <h2>Crons</h2>
            {data.crons.slice(0, 6).map((c) => (
              <div className="row" key={c.id}>
                <span>{c.name}</span>
                <em className={c.lastStatus === 'ok' ? 'clean' : 'dirty'}>{fmtNext(c.nextRunAtMs)}</em>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
