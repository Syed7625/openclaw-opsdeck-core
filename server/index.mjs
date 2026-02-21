import Fastify from 'fastify'
import cors from '@fastify/cors'
import { exec as _exec, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import crypto from 'node:crypto'

const exec = promisify(_exec)
const app = Fastify({ logger: false })

await app.register(cors, { origin: true })

const TOOL_PATH = `/usr/local/Cellar/node@22/22.22.0/bin:${process.env.PATH || ''}`

// ─── Exec helpers ───────────────────────────────────────────────────────────

async function runJson(command, timeoutMs = 15000) {
  const { stdout } = await exec(`bash -lc ${JSON.stringify(command)}`, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: timeoutMs,
    env: { ...process.env, PATH: TOOL_PATH },
  })
  return JSON.parse(stdout)
}

async function runText(command, timeoutMs = 30000) {
  const { stdout } = await exec(`bash -lc ${JSON.stringify(command)}`, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: timeoutMs,
    env: { ...process.env, PATH: TOOL_PATH },
  })
  return stdout.trim()
}

// ─── Agent name mapping ─────────────────────────────────────────────────────

function aliasNameFromModel(model = '') {
  const m = model.toLowerCase()
  if (m.includes('claude-opus')) return 'Opie'
  if (m.includes('claude-sonnet')) return 'Will'
  if (m.includes('grok-4') || m.includes('grok-4-1')) return 'Elon'
  if (m.includes('gemini')) return 'Buzz'
  if (m.includes('gpt-5.2-pro')) return 'Forge'
  if (m.includes('gpt-5.2')) return 'Atlas'
  if (m.includes('kimi')) return 'Kite'
  if (m.includes('gpt-5.3-codex')) return 'Omar'
  return model || 'Agent'
}

// ─── Data fetchers ──────────────────────────────────────────────────────────

async function getCrons() {
  const data = await runJson('openclaw cron list --all --json')
  return (data.jobs || []).map((j) => ({
    id: j.id,
    name: j.name,
    enabled: j.enabled,
    nextRunAtMs: j.state?.nextRunAtMs ?? null,
    lastStatus: j.state?.lastStatus ?? 'unknown',
  }))
}

async function getSessions() {
  const data = await runJson('openclaw sessions --json')
  const now = Date.now()
  const roster = ['Omar', 'Will', 'Opie', 'Elon', 'Buzz', 'Kite']
  const byName = new Map(roster.map((name) => [name, { id: name.toLowerCase(), name, state: 'idle', load: 0 }]))

  const sessions = (data.sessions || []).filter((s) => s.key?.includes(':subagent:') || s.key === 'agent:main:main')

  for (const s of sessions) {
    const name = s.key === 'agent:main:main' ? 'Omar' : aliasNameFromModel(s.modelOverride || s.model || '')
    if (!byName.has(name)) continue
    const ageMin = (now - (s.updatedAt || now)) / 60000
    const active = ageMin <= 2
    const current = byName.get(name)
    const sessionLoad = Math.min(100, Math.max(0, Math.round((s.totalTokens || 0) / 3000)))
    byName.set(name, { id: current.id, name, state: active ? 'active' : current.state, load: Math.max(current.load, sessionLoad) })
  }

  return roster.map((name) => byName.get(name))
}

const PROJECTS = [
  { name: 'Ancient Travels', path: '/Users/ewimsatt/Sites/ancienttravel', key: 'ancienttravel' },
  { name: 'OmarCMS', path: '/Users/ewimsatt/Sites/omarcms', key: 'omarcms' },
  { name: 'LandingPageAI', path: '/Users/ewimsatt/Sites/landingpageai', key: 'landingpageai' },
  { name: 'OpenClaw Fork', path: '/Users/ewimsatt/openclaw', key: 'openclaw' },
]

const PROJECT_CRON_MAP = {
  ancienttravel: ['Micro Heartbeat (Night)'],
  omarcms: ['Night Owl: Writing & Reflection', 'Night Owl: Skill Building & Code', 'OmarCMS Daily Publish'],
  landingpageai: [],
  openclaw: ['Upstream OpenClaw Monitor'],
}

async function getProjects() {
  return Promise.all(PROJECTS.map(async (p) => {
    try {
      const dirty = Number(await runText(`cd ${JSON.stringify(p.path)} && git status --porcelain | wc -l | tr -d ' '`))
      return { name: p.name, key: p.key, status: dirty > 0 ? 'dirty' : 'clean' }
    } catch {
      return { name: p.name, key: p.key, status: 'unknown' }
    }
  }))
}

async function getProjectDetails(crons) {
  const details = {}
  for (const p of PROJECTS) {
    let lastCommit = 'unknown', recent = [], dirtyCount = null, changedPaths = []
    try {
      lastCommit = await runText(`cd ${JSON.stringify(p.path)} && git log -1 --pretty=format:%h' - '%s' ('%cr')`)
      const recentRaw = await runText(`cd ${JSON.stringify(p.path)} && git log -5 --pretty=format:%s`)
      recent = recentRaw ? recentRaw.split('\n').filter(Boolean) : []
      dirtyCount = Number(await runText(`cd ${JSON.stringify(p.path)} && git status --porcelain | wc -l | tr -d ' '`))
      const changedRaw = await runText(`cd ${JSON.stringify(p.path)} && git status --porcelain | awk '{print $2}' | head -n 8`)
      changedPaths = changedRaw ? changedRaw.split('\n').filter(Boolean) : []
    } catch {}

    const scheduled = (PROJECT_CRON_MAP[p.key] || []).map((name) => {
      const job = crons.find((c) => c.name === name)
      return job ? { name: job.name, nextRunAtMs: job.nextRunAtMs, status: job.lastStatus } : { name, nextRunAtMs: null, status: 'unknown' }
    })
    const done = scheduled.filter((s) => s.status === 'ok').map((s) => `${s.name}: last run ok`)
    const inProgress = dirtyCount && dirtyCount > 0 ? [`Working tree has ${dirtyCount} changed files`] : []

    details[p.key] = { key: p.key, name: p.name, status: dirtyCount === null ? 'unknown' : dirtyCount > 0 ? 'dirty' : 'clean', lastCommit, recent, scheduled, inProgress, done, dirtyCount, changedPaths }
  }
  return details
}

async function getSkillsOverview() {
  const paths = ['/Users/ewimsatt/openclaw/skills', '/Users/ewimsatt/.openclaw/workspace/skills']
  const groups = []
  for (const base of paths) {
    try {
      const list = await runText(`find ${JSON.stringify(base)} -maxdepth 1 -mindepth 1 -type d -exec basename {} \\; | sort`)
      groups.push({ base, skills: list ? list.split('\n').filter(Boolean) : [] })
    } catch {
      groups.push({ base, skills: [] })
    }
  }
  return groups
}

async function getLocalRepoIndex() {
  const now = Date.now()
  if (localRepoIndexCache.map.size && (now - localRepoIndexCache.ts) < 60000) return localRepoIndexCache.map
  const roots = ['/Users/ewimsatt/Sites', '/Users/ewimsatt/frameworks', '/Users/ewimsatt/.openclaw/workspace', '/Users/ewimsatt/openclaw']
  const found = new Map()
  for (const root of roots) {
    try {
      const raw = await runText(`find ${JSON.stringify(root)} -maxdepth 3 -type d -name .git -print | sed 's#/\\.git$##'`)
      for (const d of (raw ? raw.split('\n').filter(Boolean) : [])) {
        const name = d.split('/').pop()
        if (!found.has(name)) found.set(name, d)
      }
    } catch {}
  }
  localRepoIndexCache.ts = now
  localRepoIndexCache.map = found
  return found
}

async function getRepoGrid() {
  const now = Date.now()
  if (repoCache.data.length && (now - repoCache.ts) < 60000) return repoCache.data

  let repos = []
  try {
    const raw = await runText('gh repo list ewimsatt --limit 40 --json name,nameWithOwner,isPrivate')
    repos = JSON.parse(raw)
  } catch { repos = [] }

  const localIndex = await getLocalRepoIndex()
  const out = []

  for (const r of repos) {
    const localPath = localIndex.get(r.name) || null
    if (!localPath) {
      out.push({ name: r.name, fullName: r.nameWithOwner, localPath: null, state: 'missing', ahead: 0, behind: 0, dirty: 0, ageDays: null, heat: 'cool' })
      continue
    }
    let ahead = 0, behind = 0, dirty = 0, ageDays = null
    try {
      dirty = Number(await runText(`cd ${JSON.stringify(localPath)} && git status --porcelain | wc -l | tr -d ' '`))
      const lr = await runText(`cd ${JSON.stringify(localPath)} && git rev-list --left-right --count @{u}...HEAD 2>/dev/null || echo "0 0"`)
      const parts = lr.split(/\s+/).map((x) => Number(x || 0))
      behind = parts[0] || 0; ahead = parts[1] || 0
      const ts = Number(await runText(`cd ${JSON.stringify(localPath)} && git log -1 --format=%ct 2>/dev/null || echo 0`))
      if (ts > 0) ageDays = Math.floor((Date.now() / 1000 - ts) / 86400)
    } catch {}

    const synced = dirty === 0 && ahead === 0 && behind === 0
    out.push({ name: r.name, fullName: r.nameWithOwner, localPath, state: synced ? 'synced' : 'outdated', ahead, behind, dirty, ageDays, heat: ageDays === null ? 'cool' : ageDays > 30 ? 'hot' : ageDays > 14 ? 'warm' : 'cool' })
  }

  repoCache.ts = now
  repoCache.data = out
  return out
}

// ─── Derived data ───────────────────────────────────────────────────────────

function deriveAlerts(agents, projects, crons) {
  const alerts = []
  const dirty = projects.filter((p) => p.status === 'dirty')
  const criticalCron = crons.filter((c) => c.lastStatus && c.lastStatus !== 'ok')
  const activeAgents = agents.filter((a) => a.state === 'active')
  if (criticalCron.length) alerts.push({ level: 'critical', text: `${criticalCron.length} cron job(s) not healthy` })
  if (dirty.length) alerts.push({ level: 'warn', text: `${dirty.length} project(s) have local changes` })
  if (!activeAgents.length) alerts.push({ level: 'info', text: 'No agents currently active' })
  if (!alerts.length) alerts.push({ level: 'info', text: 'All systems nominal' })
  return alerts.slice(0, 5)
}

function buildTimeline(crons, projects) {
  const items = []
  for (const c of crons) items.push({ label: c.name, atMs: c.nextRunAtMs, kind: 'cron' })
  for (const p of projects) items.push({ label: `${p.name} status: ${p.status}`, atMs: Date.now(), kind: 'project' })
  return items.filter((x) => x.atMs).sort((a, b) => a.atMs - b.atMs).slice(0, 10)
}

function buildMetrics(agents, projects, crons) {
  const activeAgents = agents.filter((a) => a.state === 'active').length
  const dirtyProjects = projects.filter((p) => p.status === 'dirty').length
  const healthy = crons.filter((c) => c.lastStatus === 'ok').length
  const cronHealthyPct = crons.length ? Math.round((healthy / crons.length) * 100) : 0
  const nextCronAtMs = [...crons].map((c) => c.nextRunAtMs).filter(Boolean).sort((a, b) => a - b)[0] || null
  return { activeAgents, dirtyProjects, cronHealthyPct, nextCronAtMs }
}

// ─── Caches ─────────────────────────────────────────────────────────────────

const overviewCache = { ts: 0, data: null }
const fastOverviewCache = { ts: 0, data: null, refreshing: false }
const heavyOverviewCache = { ts: 0, data: { projectDetails: {}, skills: [], repos: [] }, refreshing: false }
const repoCache = { ts: 0, data: [] }
const localRepoIndexCache = { ts: 0, map: new Map() }

// ─── Chat: Async job queue ──────────────────────────────────────────────────

const chatHistory = []     // { id, role, text, ts, status? }
const chatJobs = new Map() // jobId -> { id, status, text?, error?, ts, userMsgId }

// Dedicated session key to avoid lock contention with main agent session
const CHAT_SESSION_ID = 'mission-control-chat'

function extractAgentText(raw = '') {
  const text = String(raw || '').trim()
  if (!text) return 'No reply body returned.'

  const pickCandidate = (parsed) => {
    if (!parsed || typeof parsed !== 'object') return null
    const candidate =
      parsed?.payloads?.[0]?.text ||
      parsed?.result?.payloads?.[0]?.text ||
      parsed?.response?.text ||
      parsed?.result?.response?.text ||
      parsed?.text ||
      parsed?.output
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
  }

  // Try parsing as JSON and extracting known fields
  try {
    const parsed = JSON.parse(text)
    const candidate = pickCandidate(parsed)
    if (candidate) return candidate
  } catch {}

  // Try extracting embedded JSON object from mixed text like: "prefix { ...json... }"
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1))
      const candidate = pickCandidate(parsed)
      if (candidate) return candidate
    } catch {}
  }

  // Heuristic: extract payload text directly from JSON-like blobs
  const payloadTextMatch = text.match(/"payloads"\s*:\s*\[\s*\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/s)
  if (payloadTextMatch?.[1]) {
    try {
      const decoded = JSON.parse(`"${payloadTextMatch[1]}"`)
      if (typeof decoded === 'string' && decoded.trim()) return decoded.trim().slice(0, 3000)
    } catch {}
  }

  // If line contains inline JSON tail, strip it
  const noInlineJson = text.replace(/\s*\{[\s\S]*\}\s*$/, '').trim()
  if (noInlineJson && noInlineJson !== text) return noInlineJson.slice(0, 3000)

  // Filter out lines that look like raw JSON
  const lines = text.split('\n')
  const clean = lines.filter((l) => {
    const t = l.trim()
    if (!t) return false
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { JSON.parse(t); return false } catch { return true }
    }
    return !/^\s*"?(runId|status|summary|result|meta|payloads)"?\s*:/.test(t)
  })

  return (clean.join('\n') || 'Relay returned non-text payload.').slice(0, 3000)
}

function pushChatMsg(msg) {
  chatHistory.push(msg)
  // Keep history bounded
  if (chatHistory.length > 200) chatHistory.splice(0, chatHistory.length - 200)
}

async function executeRelay(text, retries = 0) {
  const cmd = `openclaw --no-color agent --agent main --message ${JSON.stringify(text)} --session-id ${CHAT_SESSION_ID} --json --timeout 12`
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await runText(cmd, 14000)
      return extractAgentText(raw)
    } catch (err) {
      lastErr = err
      // Wait briefly before retry
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500))
    }
  }
  throw lastErr
}

function enqueueChat(text) {
  const jobId = crypto.randomUUID()
  const userMsg = { id: `u-${Date.now()}-${jobId.slice(0, 4)}`, role: 'user', text, ts: Date.now(), status: 'delivered' }
  pushChatMsg(userMsg)

  const job = { id: jobId, status: 'queued', text: null, error: null, ts: Date.now(), userMsgId: userMsg.id }
  chatJobs.set(jobId, job)

  // Process asynchronously — never blocks the request
  processJob(jobId, text)
  return { jobId, userMsg }
}

async function processJob(jobId, text) {
  const job = chatJobs.get(jobId)
  if (!job) return
  job.status = 'running'

  // Handle simple pings without relay
  if (text.toLowerCase() === 'ping') {
    const aiMsg = { id: `a-${Date.now()}`, role: 'assistant', text: 'pong', ts: Date.now(), status: 'delivered' }
    pushChatMsg(aiMsg)
    job.status = 'done'
    job.text = 'pong'
    job.aiMsgId = aiMsg.id
    return
  }

  try {
    const replyText = await executeRelay(text)
    const aiMsg = { id: `a-${Date.now()}`, role: 'assistant', text: replyText, ts: Date.now(), status: 'delivered' }
    pushChatMsg(aiMsg)
    job.status = 'done'
    job.text = replyText
    job.aiMsgId = aiMsg.id
  } catch (err) {
    const errText = `Relay error after retry. (${String(err).slice(0, 120)})`
    const aiMsg = { id: `a-${Date.now()}`, role: 'assistant', text: errText, ts: Date.now(), status: 'error' }
    pushChatMsg(aiMsg)
    job.status = 'error'
    job.error = errText
    job.aiMsgId = aiMsg.id
  }

  // Prune old jobs (keep last 100)
  if (chatJobs.size > 100) {
    const sorted = [...chatJobs.entries()].sort((a, b) => a[1].ts - b[1].ts)
    for (let i = 0; i < sorted.length - 100; i++) chatJobs.delete(sorted[i][0])
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/health', async () => ({ ok: true }))

async function refreshFastOverview() {
  if (fastOverviewCache.refreshing) return
  fastOverviewCache.refreshing = true
  try {
    const [agents, crons, projects] = await Promise.all([getSessions(), getCrons(), getProjects()])
    const alerts = deriveAlerts(agents, projects, crons)
    const timeline = buildTimeline(crons, projects)
    const metrics = buildMetrics(agents, projects, crons)
    fastOverviewCache.data = { agents, crons, projects, alerts, timeline, metrics }
    fastOverviewCache.ts = Date.now()
  } finally {
    fastOverviewCache.refreshing = false
  }
}

async function refreshHeavyOverview(crons = []) {
  if (heavyOverviewCache.refreshing) return
  heavyOverviewCache.refreshing = true
  try {
    const [projectDetails, skills, repos] = await Promise.all([
      getProjectDetails(crons),
      getSkillsOverview(),
      getRepoGrid(),
    ])
    heavyOverviewCache.data = { projectDetails, skills, repos }
    heavyOverviewCache.ts = Date.now()
  } finally {
    heavyOverviewCache.refreshing = false
  }
}

app.get('/api/overview', async () => {
  const now = Date.now()

  if (overviewCache.data && (now - overviewCache.ts) < 1500) {
    return overviewCache.data
  }

  const fast = fastOverviewCache.data || { agents: [], crons: [], projects: [], alerts: [{ level: 'info', text: 'Refreshing mission state...' }], timeline: [], metrics: { activeAgents: 0, dirtyProjects: 0, cronHealthyPct: 0, nextCronAtMs: null } }
  const heavy = heavyOverviewCache.data || { projectDetails: {}, skills: [], repos: [] }

  const payload = {
    ok: true,
    ts: now,
    ...fast,
    ...heavy,
    fastStale: !fastOverviewCache.ts || (now - fastOverviewCache.ts) > 20000,
    heavyStale: !heavyOverviewCache.ts || (now - heavyOverviewCache.ts) > 90000,
  }

  overviewCache.ts = now
  overviewCache.data = payload
  return payload
})

// Chat history — always fast
app.get('/api/chat', async () => ({ ok: true, messages: chatHistory.slice(-80) }))

// Chat send — enqueue + immediate ack
app.post('/api/chat', async (req, reply) => {
  const text = String(req.body?.text || '').trim()
  if (!text) return reply.code(400).send({ ok: false, error: 'text required' })

  const { jobId, userMsg } = enqueueChat(text)
  return { ok: true, jobId, userMsg }
})

// Chat job status polling
app.get('/api/chat/jobs/:id', async (req) => {
  const job = chatJobs.get(req.params.id)
  if (!job) return { ok: false, error: 'job not found' }
  return { ok: true, job: { id: job.id, status: job.status, text: job.text, error: job.error } }
})

app.post('/api/action/run-cron', async (req, reply) => {
  try {
    const { jobId } = req.body || {}
    if (!jobId) return reply.code(400).send({ ok: false, error: 'jobId required' })
    await runText(`openclaw cron run ${JSON.stringify(jobId)}`)
    overviewCache.ts = 0
    return { ok: true }
  } catch (error) {
    return reply.code(500).send({ ok: false, error: String(error) })
  }
})

app.get('/api/meta', async () => {
  return { ok: true, projects: PROJECTS.map((p) => ({ key: p.key, name: p.name, path: p.path })) }
})

// ─── Start ──────────────────────────────────────────────────────────────────

// Background refresh loops keep /api/overview fast and non-blocking.
setTimeout(() => {
  refreshFastOverview().catch(() => {})
  refreshHeavyOverview((fastOverviewCache.data?.crons) || []).catch(() => {})
}, 200)
setInterval(() => { refreshFastOverview().catch(() => {}) }, 10000).unref()
setInterval(() => { refreshHeavyOverview((fastOverviewCache.data?.crons) || []).catch(() => {}) }, 90000).unref()

const port = Number(process.env.OPSDECK_API_PORT || 4174)
const host = process.env.OPSDECK_API_HOST || '0.0.0.0'

app.listen({ port, host })
  .then(() => console.log(`opsdeck api listening on http://${host}:${port}`))
  .catch((e) => { console.error(e); process.exit(1) })
