import { useOutletContext } from 'react-router-dom'
import type { Overview, RepoTile } from '../types'

function sub(r: RepoTile) {
  if (r.state === 'missing') return 'not cloned'
  if (r.state === 'synced') return `clean • synced${typeof r.ageDays === 'number' ? ` • ${r.ageDays}d` : ''}`
  const bits = []
  if (r.behind) bits.push(`behind ${r.behind}`)
  if (r.ahead) bits.push(`ahead ${r.ahead}`)
  if (r.dirty) bits.push(`dirty ${r.dirty}`)
  if (!bits.length) bits.push('outdated')
  return bits.join(' • ')
}

export default function ReposPage() {
  const data = useOutletContext<Overview>()
  const repos = data.repos || []

  return (
    <div className="repos-grid">
      {repos.map((r) => (
        <div key={r.fullName} className={`repo-tile ${r.state} heat-${r.heat}`}>
          <div className="repo-icon">▣</div>
          <h3>{r.name}</h3>
          <p>{sub(r)}</p>
        </div>
      ))}
    </div>
  )
}
