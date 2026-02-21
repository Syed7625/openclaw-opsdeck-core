import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { Overview } from '../types'

function getRole(agentName: string) {
  const n = agentName.toLowerCase()
  if (n.includes('omar')) return 'Mission Lead'
  if (n.includes('opus') || n.includes('opie')) return 'Strategist'
  if (n.includes('sonnet') || n.includes('will')) return 'Writer'
  if (n.includes('grok') || n.includes('elon')) return 'Builder'
  if (n.includes('gemini') || n.includes('buzz')) return 'Rapid Ops'
  if (n.includes('kite')) return 'Generalist'
  return 'Agent'
}

function fmtTime(ms: number | null | undefined) {
  if (!ms) return 'n/a'
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function sanitizeChatText(input: string) {
  const text = String(input || '').trim()
  if (!text) return ''

  const pick = (obj: any) => obj?.payloads?.[0]?.text || obj?.result?.payloads?.[0]?.text || obj?.response?.text || obj?.text

  try {
    const parsed = JSON.parse(text)
    const c = pick(parsed)
    if (typeof c === 'string' && c.trim()) return c.trim()
  } catch {}

  const payloadMatch = text.match(/"payloads"\s*:\s*\[\s*\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/s)
  if (payloadMatch?.[1]) {
    try {
      return JSON.parse(`"${payloadMatch[1]}"`).trim()
    } catch {}
  }

  const jsonTail = text.match(/^(.*?)\s*\{[\s\S]*\}\s*$/)
  if (jsonTail?.[1]?.trim()) return jsonTail[1].trim()

  return text
}

export default function CommandPage() {
  const data = useOutletContext<Overview>()
  const [actionMsg, setActionMsg] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<{ id: string; role: 'user' | 'assistant'; text: string; status?: string }[]>([])
  const [viewStartIndex, setViewStartIndex] = useState(0)
  const chatLogRef = useRef<HTMLDivElement | null>(null)

  const runCron = async (name: string) => {
    const job = data.crons.find((c) => c.name === name)
    if (!job) return setActionMsg(`No cron found: ${name}`)
    setActionMsg(`Running ${name}...`)
    const res = await fetch('/api/action/run-cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id }),
    })
    setActionMsg(res.ok ? `Triggered: ${name}` : `Failed: ${name}`)
  }

  const [pendingJobs, setPendingJobs] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  // Poll chat history (always fast — reads from server memory)
  useEffect(() => {
    let mounted = true
    const load = () => {
      fetch('/api/chat').then((r) => r.json()).then((j) => {
        if (!mounted) return
        const cleaned = (j.messages || []).map((m: any) => ({ ...m, text: sanitizeChatText(m.text) }))
        setMessages(cleaned)
      }).catch(() => {})
    }
    load()
    const t = setInterval(load, 900)
    return () => { mounted = false; clearInterval(t) }
  }, [])

  // Poll pending jobs for completion
  useEffect(() => {
    if (pendingJobs.size === 0) return
    let mounted = true
    const poll = setInterval(() => {
      for (const jobId of pendingJobs) {
        fetch(`/api/chat/jobs/${jobId}`).then((r) => r.json()).then((j) => {
          if (!mounted) return
          if (j?.job?.status === 'done' || j?.job?.status === 'error') {
            setPendingJobs((prev) => { const next = new Set(prev); next.delete(jobId); return next })
          }
        }).catch(() => {})
      }
    }, 350)
    return () => { mounted = false; clearInterval(poll) }
  }, [pendingJobs])

  const sendChat = async () => {
    const text = chatInput.trim()
    if (!text || sending) return
    setChatInput('')
    setSending(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const json = await res.json()
      if (json?.jobId) {
        setPendingJobs((prev) => new Set(prev).add(json.jobId))
      }
    } catch {}
    setSending(false)
  }

  const clearChatView = () => {
    setViewStartIndex(messages.length)
    if (chatLogRef.current) chatLogRef.current.scrollTop = 0
  }

  const visibleMessages = messages.slice(Math.max(viewStartIndex, messages.length - 24))

  useEffect(() => {
    // Keep the chat pinned to the newest message so users don't have to
    // manually scroll after each send/receive cycle.
    if (!chatLogRef.current) return
    chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight
  }, [visibleMessages.length, pendingJobs.size])

  const positioned = useMemo(() => {
    const active = data.agents.filter((a) => a.state === 'active')
    const idle = data.agents.filter((a) => a.state !== 'active')

    const activePlaced = active.map((a, i) => {
      const angle = (i / Math.max(1, active.length)) * Math.PI * 2
      const r = 92
      return { ...a, role: getRole(a.name), x: Math.cos(angle) * r, y: Math.sin(angle) * r }
    })

    const idlePlaced = idle.map((a, i) => {
      const angle = (i / Math.max(1, idle.length)) * Math.PI * 2
      const r = 190
      return { ...a, role: getRole(a.name), x: Math.cos(angle) * r, y: Math.sin(angle) * r }
    })

    return [...activePlaced, ...idlePlaced]
  }, [data.agents])

  return (
    <div className="command-layout">
      <div className="panel alert-strip">
        <h2>What Needs You Now</h2>
        <div className="alert-cards">
          {(data.alerts || []).map((a, i) => <div key={`${i}-${a.text}`} className={`alert-card ${a.level}`}><span>{a.level}</span><p>{a.text}</p></div>)}
        </div>
      </div>

      <div className="command-main-grid">
        <div className="table-wrap compact">
          <div className="table-core compact"><div className="ring" /><div className="ring ring-2" /><div className="label">AGENT TABLE</div></div>
          {positioned.map(a => <div key={a.id} className={`agent ${a.state}`} style={{ transform: `translate(calc(-50% + ${a.x}px), calc(-50% + ${a.y}px))` }}><strong>{a.name}</strong><small>{a.role}</small></div>)}
        </div>

        <aside className="control-column">
          <div className="panel compact-score">
            <h2>Daily Score</h2>
            <div className="score">{Math.max(0, (data.metrics?.cronHealthyPct || 0) - (data.metrics?.dirtyProjects || 0) * 10)}</div>
            <div className="row"><span>Agents</span><em>{data.metrics?.activeAgents ?? 0}</em></div>
            <div className="row"><span>Dirty</span><em>{data.metrics?.dirtyProjects ?? 0}</em></div>
            <div className="row"><span>Cron %</span><em>{data.metrics?.cronHealthyPct ?? 0}%</em></div>
          </div>

          <div className="panel">
            <h2>Quick Actions</h2>
            <div className="quick-actions">
              {(data.crons || []).slice(0, 4).map((c) => (
                <button key={c.id} onClick={() => runCron(c.name)}>Run {c.name}</button>
              ))}
              {(!data.crons || data.crons.length === 0) && <div className="row"><span>No cron actions configured</span></div>}
            </div>
            {actionMsg && <div className="action-msg">{actionMsg}</div>}
          </div>

          <div className="panel">
            <h2>At a Glance</h2>
            {(data.projects || []).slice(0, 4).map((p) => <div className="row" key={p.key}><span>{p.name}</span><em className={p.status}>{p.status}</em></div>)}
            <div className="row"><span>Next Cron</span><em>{fmtTime(data.metrics?.nextCronAtMs)}</em></div>
          </div>

          <div className="panel timeline-panel">
            <h2>Timeline</h2>
            {(data.timeline || []).slice(0, 8).map((t, i) => <div className="row" key={`${i}-${t.label}`}><span>{t.label}</span><em>{fmtTime(t.atMs)}</em></div>)}
          </div>
        </aside>

        <aside className="chat-column panel chat-panel">
          <div className="chat-header-row">
            <h2>Local Chat</h2>
            <button className="chat-clear-btn" onClick={clearChatView}>Clear View</button>
          </div>
          <div className="chat-log full" ref={chatLogRef}>
            {visibleMessages.map((m) => (
              <div key={m.id} className={`chat-bubble ${m.role} ${m.status === 'error' ? 'error' : ''}`}>
                <strong>{m.role === 'user' ? 'You' : 'Omar'}</strong>
                <p>{sanitizeChatText(m.text)}</p>
                {m.status && m.status !== 'delivered' && <span className={`chat-status ${m.status}`}>{m.status}</span>}
              </div>
            ))}
            {pendingJobs.size > 0 && (
              <div className="chat-bubble assistant processing">
                <strong>Omar</strong>
                <p className="typing-indicator">Typing<span className="dots">...</span></p>
              </div>
            )}
          </div>
          <div className="chat-input-row">
            <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Talk to Omar from Mission Control..." onKeyDown={(e) => { if (e.key === 'Enter') sendChat() }} disabled={sending} />
            <button onClick={sendChat} disabled={sending}>{sending ? '...' : 'Send'}</button>
          </div>
        </aside>
      </div>
    </div>
  )
}
