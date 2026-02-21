import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { Overview } from '../types'

function getRole(agentName: string) {
  const n = agentName.toLowerCase()
  if (n.includes('omar')) return 'Mission Lead'
  if (n.includes('opus') || n.includes('opie')) return 'Strategist'
  if (n.includes('sonnet') || n.includes('will')) return 'Writer'
  if (n.includes('grok') || n.includes('elon')) return 'Builder'
  if (n.includes('gemini') || n.includes('buzz')) return 'Rapid Ops'
  if (n.includes('sage')) return 'Research'
  if (n.includes('forge')) return 'Heavy Lift'
  if (n.includes('kite')) return 'Generalist'
  return 'Agent'
}

export default function CommandPage() {
  const data = useOutletContext<Overview>()
  const positioned = useMemo(() => data.agents.map((a, i) => {
    const angle = (i / Math.max(1, data.agents.length)) * Math.PI * 2
    const r = a.state === 'active' ? 18 : 260
    return { ...a, role: getRole(a.name), x: Math.cos(angle) * r, y: Math.sin(angle) * r }
  }), [data.agents])

  return <div className="layout">
    <div className="table-wrap">
      <div className="table-core"><div className="ring" /><div className="ring ring-2" /><div className="label">AGENT TABLE</div></div>
      {positioned.map(a => <div key={a.id} className={`agent ${a.state}`} style={{ transform: `translate(calc(-50% + ${a.x}px), calc(-50% + ${a.y}px))` }}><strong>{a.name}</strong><small>{a.role}</small></div>)}
    </div>
    <aside className="sidepanel">
      <div className="panel"><h2>Projects</h2>{data.projects.map(p => <div className="row" key={p.name}><span>{p.name}</span><em className={p.status}>{p.status}</em></div>)}</div>
      <div className="panel"><h2>Crons</h2>{data.crons.slice(0,6).map(c => <div className="row" key={c.id}><span>{c.name}</span><em className={c.lastStatus === 'ok' ? 'clean':'dirty'}>{c.lastStatus}</em></div>)}</div>
    </aside>
  </div>
}
