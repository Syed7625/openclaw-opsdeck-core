import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { Overview } from '../types'

function getRole(agentName: string) {
  const n = agentName.toLowerCase()
  if (n.includes('omar')) return 'Mission Lead'
  if (n.includes('opus') || n.includes('opie')) return 'Strategist'
  if (n.includes('sonnet') || n.includes('will')) return 'Writer'
  if (n.includes('grok') || n.includes('elon')) return 'Builder'
  if (n.includes('gemini') || n.includes('buzz')) return 'Rapid Ops'
  if (n.includes('kite')) return 'Generalist'
  return 'Agent'
}

function fmtTime(ms: number | null | undefined) {
  if (!ms) return 'n/a'
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function CommandPage() {
  const data = useOutletContext<Overview>()
  const [actionMsg, setActionMsg] = useState('')

  const runCron = async (name: string) => {
    const job = data.crons.find((c) => c.name === name)
    if (!job) return setActionMsg(`No cron found: ${name}`)
    setActionMsg(`Running ${name}...`)
    const res = await fetch('/api/action/run-cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id }),
    })
    setActionMsg(res.ok ? `Triggered: ${name}` : `Failed: ${name}`)
  }

  const positioned = useMemo(() => {
    const active = data.agents.filter((a) => a.state === 'active')
    const idle = data.agents.filter((a) => a.state !== 'active')

    const activePlaced = active.map((a, i) => {
      const angle = (i / Math.max(1, active.length)) * Math.PI * 2
      const r = 92
      return { ...a, role: getRole(a.name), x: Math.cos(angle) * r, y: Math.sin(angle) * r }
    })

    const idlePlaced = idle.map((a, i) => {
      const angle = (i / Math.max(1, idle.length)) * Math.PI * 2
      const r = 190
      return { ...a, role: getRole(a.name), x: Math.cos(angle) * r, y: Math.sin(angle) * r }
    })

    return [...activePlaced, ...idlePlaced]
  }, [data.agents])

  return (
    <div className="command-layout">
      <div className="panel alert-strip">
        <h2>What Needs You Now</h2>
        <div className="alert-cards">
          {(data.alerts || []).map((a, i) => <div key={`${i}-${a.text}`} className={`alert-card ${a.level}`}><span>{a.level}</span><p>{a.text}</p></div>)}
        </div>
      </div>

      <div className="command-main-grid">
        <div className="table-wrap compact">
          <div className="table-core compact"><div className="ring" /><div className="ring ring-2" /><div className="label">AGENT TABLE</div></div>
          {positioned.map(a => <div key={a.id} className={`agent ${a.state}`} style={{ transform: `translate(calc(-50% + ${a.x}px), calc(-50% + ${a.y}px))` }}><strong>{a.name}</strong><small>{a.role}</small></div>)}
        </div>

        <aside className="score-column">
          <div className="panel compact-score">
            <h2>Daily Score</h2>
            <div className="score">{Math.max(0, (data.metrics?.cronHealthyPct || 0) - (data.metrics?.dirtyProjects || 0) * 10)}</div>
            <div className="row"><span>Agents</span><em>{data.metrics?.activeAgents ?? 0}</em></div>
            <div className="row"><span>Dirty</span><em>{data.metrics?.dirtyProjects ?? 0}</em></div>
            <div className="row"><span>Cron %</span><em>{data.metrics?.cronHealthyPct ?? 0}%</em></div>
          </div>
        </aside>

        <aside className="sidepanel">
          <div className="panel">
            <h2>Quick Actions</h2>
            <div className="quick-actions">
              <button onClick={() => runCron('Client Context Brief (Weekday Morning)')}>Run Morning Brief</button>
              <button onClick={() => runCron('OmarCMS Daily Publish')}>Run Publish</button>
              <button onClick={() => runCron('Micro Heartbeat (Night)')}>Run Heartbeat</button>
              <button onClick={() => runCron('Night Owl: Skill Building & Code')}>Run 3AM Code</button>
            </div>
            {actionMsg && <div className="action-msg">{actionMsg}</div>}
          </div>

          <div className="panel">
            <h2>At a Glance</h2>
            {(data.projects || []).slice(0, 4).map((p) => <div className="row" key={p.key}><span>{p.name}</span><em className={p.status}>{p.status}</em></div>)}
            <div className="row"><span>Next Cron</span><em>{fmtTime(data.metrics?.nextCronAtMs)}</em></div>
          </div>
        </aside>
      </div>

      <div className="panel timeline-panel">
        <h2>Timeline (Upcoming + Recent)</h2>
        {(data.timeline || []).map((t, i) => <div className="row" key={`${i}-${t.label}`}><span>{t.label}</span><em>{fmtTime(t.atMs)}</em></div>)}
      </div>
    </div>
  )
}
