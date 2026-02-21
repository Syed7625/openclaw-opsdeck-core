import { useOutletContext } from 'react-router-dom'
import type { Overview } from '../types'

export default function ForgePage() {
  const data = useOutletContext<Overview>()

  return (
    <div className="grid-page">
      {(data.skills || []).map((group) => (
        <div className="tile" key={group.base}>
          <h3>{group.base.includes('/workspace/') ? 'Workspace Skills' : 'Core Skills'}</h3>
          <p>{group.base}</p>
          <div className="skills-wrap">
            {group.skills.slice(0, 24).map((s) => <span className="skill-chip" key={s}>{s}</span>)}
          </div>
        </div>
      ))}
    </div>
  )
}
