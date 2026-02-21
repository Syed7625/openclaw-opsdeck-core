import { useEffect, useState } from 'react'
import type { Overview } from './types'

export const fallback: Overview = {
  ok: true,
  agents: [
    { id: 'agent-1', name: 'Agent 1', state: 'idle', load: 0 },
  ],
  projects: [],
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
