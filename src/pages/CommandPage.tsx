import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { Overview } from '../types'

export default function CommandPage() {
  const data = useOutletContext<Overview>()
  const positioned = useMemo(() => data.agents.map((a, i) => {
    const angle = (i / Math.max(1, data.agents.length)) * Math.PI * 2
    const r = a.state === 'active' ? 120 : a.state === 'error' ? 190 : 250
    return { ...a, x: Math.cos(angle) * r, y: Math.sin(angle) * r }
  }), [data.agents])

  return <div className="layout">
    <div className="table-wrap">
      <div className="table-core"><div className="ring" /><div className="ring ring-2" /><div className="label">AGENT TABLE</div></div>
      {positioned.map(a => <div key={a.id} className={`agent ${a.state}`} style={{ transform: `translate(calc(-50% + ${a.x}px), calc(-50% + ${a.y}px))` }}><strong>{a.name}</strong><small>{a.load}%</small></div>)}
    </div>
    <aside className="sidepanel">
      <div className="panel"><h2>Projects</h2>{data.projects.map(p => <div className="row" key={p.name}><span>{p.name}</span><em className={p.status}>{p.status}</em></div>)}</div>
      <div className="panel"><h2>Crons</h2>{data.crons.slice(0,6).map(c => <div className="row" key={c.id}><span>{c.name}</span><em className={c.lastStatus === 'ok' ? 'clean':'dirty'}>{c.lastStatus}</em></div>)}</div>
    </aside>
  </div>
}
