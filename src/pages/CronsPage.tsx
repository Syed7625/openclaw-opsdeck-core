import { useOutletContext } from 'react-router-dom'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import type { Overview } from '../types'

export default function CronsPage() {
  const data = useOutletContext<Overview>()
  const chart = data.crons.slice(0, 8).map((c, i) => ({ name: c.name.slice(0, 10), val: c.enabled ? 80 - i * 6 : 20 }))
  return <div className="chart-page"><div className="panel chart-panel"><h2>Cron Radar</h2><div style={{ width: '100%', height: 420 }}><ResponsiveContainer><RadarChart data={chart}><PolarGrid /><PolarAngleAxis dataKey="name" /><Radar dataKey="val" stroke="#00f0ff" fill="#00f0ff" fillOpacity={0.35} /></RadarChart></ResponsiveContainer></div></div></div>
}
