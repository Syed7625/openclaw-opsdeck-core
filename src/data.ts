import { useEffect, useState } from 'react'
import type { Overview } from './types'

export const fallback: Overview = {
  ok: true,
  agents: [
    { id: 'omar', name: 'Omar', state: 'active', load: 70 },
    { id: 'will', name: 'Will', state: 'active', load: 52 },
    { id: 'opie', name: 'Opie', state: 'idle', load: 10 },
    { id: 'buzz', name: 'Buzz', state: 'idle', load: 18 },
  ],
  projects: [{ name: 'Ancient Travels', key: 'ancienttravel', status: 'shipping' }, { name: 'OmarCMS', key: 'omarcms', status: 'stable' }],
  crons: [],
  projectDetails: {},
  skills: [],
}

export function useOverview() {
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
        } else setApiState('fallback')
      } catch {
        if (mounted) setApiState('fallback')
      }
    }
    pull()
    const timer = setInterval(pull, 10000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  return { data, apiState }
}
