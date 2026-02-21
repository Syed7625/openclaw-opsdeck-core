import { useOutletContext } from 'react-router-dom'
import type { Overview } from '../types'

export default function SitesPage() {
  const data = useOutletContext<Overview>()
  return <div className="grid-page">{data.projects.map((p) => <div className="tile" key={p.name}><h3>{p.name}</h3><p className={p.status}>{p.status}</p></div>)}</div>
}
