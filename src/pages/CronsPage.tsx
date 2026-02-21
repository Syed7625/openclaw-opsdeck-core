import { useOutletContext } from 'react-router-dom'
import type { Overview } from '../types'

function fmt(ms: number | null) {
  if (!ms) return 'n/a'
  return new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

export default function CronsPage() {
  const data = useOutletContext<Overview>()
  const upcoming = [...data.crons].sort((a, b) => (a.nextRunAtMs || 0) - (b.nextRunAtMs || 0))

  return <div className="panel"><h2>Cron Timeline (Upcoming)</h2>{upcoming.map((c) => <div className="row" key={c.id}><span>{c.name}</span><em className={c.lastStatus === 'ok' ? 'clean' : 'dirty'}>{fmt(c.nextRunAtMs)}</em></div>)}</div>
}
