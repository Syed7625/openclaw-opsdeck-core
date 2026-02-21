import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { Overview } from '../types'

function fmtNext(ms: number | null) {
  if (!ms) return 'n/a'
  return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function SitesPage() {
  const data = useOutletContext<Overview>()
  const [selectedKey, setSelectedKey] = useState<string>(data.projects[0]?.key || '')
  const detail = selectedKey ? data.projectDetails?.[selectedKey] : undefined

  return (
    <div className="sites-layout">
      <div className="grid-page">
        {data.projects.map((p) => (
          <button className={`tile site-tile ${selectedKey === p.key ? 'selected' : ''}`} key={p.key} onClick={() => setSelectedKey(p.key)}>
            <h3>{p.name}</h3>
            <p className={p.status}>{p.status}</p>
          </button>
        ))}
      </div>

      <div className="panel project-detail">
        <h2>{detail?.name || 'Project'} - Breakdown</h2>
        <div className="detail-grid">
          <div>
            <h4>In Progress</h4>
            {(detail?.inProgress?.length ? detail.inProgress : ['No active edits detected']).map((x) => <div className="row" key={x}><span>{x}</span></div>)}
          </div>
          <div>
            <h4>Scheduled</h4>
            {(detail?.scheduled || []).map((s) => <div className="row" key={s.name}><span>{s.name}</span><em>{fmtNext(s.nextRunAtMs)}</em></div>)}
            {(!detail?.scheduled || detail.scheduled.length === 0) && <div className="row"><span>No linked cron jobs</span></div>}
          </div>
          <div>
            <h4>Done</h4>
            {(detail?.done?.length ? detail.done : ['No recent completed run mapping']).map((x) => <div className="row" key={x}><span>{x}</span></div>)}
          </div>
          <div>
            <h4>Recently Done</h4>
            {(detail?.recent?.length ? detail.recent : ['No commit history available']).map((x, i) => <div className="row" key={`${i}-${x}`}><span>{x}</span></div>)}
            {detail?.lastCommit && <div className="row"><span>Last commit</span><em>{detail.lastCommit}</em></div>}
          </div>
        </div>
      </div>
    </div>
  )
}
