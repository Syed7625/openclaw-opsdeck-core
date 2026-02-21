import Fastify from 'fastify'
import cors from '@fastify/cors'
import { exec as _exec, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// Load config file if present
let config = {}
const configPath = resolve(ROOT, 'opsdeck.config.js')
if (existsSync(configPath)) {
  try {
    const mod = await import(configPath)
    config = mod.default || mod
    console.log('Loaded opsdeck.config.js')
  } catch (err) {
    console.warn('Failed to load opsdeck.config.js:', err.message)
  }
}

const exec = promisify(_exec)
const app = Fastify({ logger: false })

await app.register(cors, { origin: true })

const TOOL_PATH = process.env.PATH || ''

// ─── Exec helpers ───────────────────────────────────────────────────────────

async function runCommand(cmd, args = [], options = {}) {
  const { timeout = 30000, json = false } = options
  
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, PATH: TOOL_PATH },
      shell: false,
      timeout
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => { stdout += data })
    child.stderr.on('data', (data) => { stderr += data })

    child.on('error', (err) => {
      reject(new Error(`Failed to start process: ${err.message}`))
    })

    child.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(`Command failed with exit code ${code}`)
        error.stdout = stdout
        error.stderr = stderr
        return reject(error)
      }
      
      if (json) {
        try {
          resolve(JSON.parse(stdout))
        } catch (err) {
          reject(new Error(`Failed to parse JSON output: ${err.message}`))
        }
      } else {
        resolve(stdout.trim())
      }
    })
  })
}

async function runJson(command, timeoutMs = 15000) {
  // Legacy support for shell strings, but prefer runCommand
  const { stdout } = await exec(`bash -lc ${JSON.stringify(command)}`, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: timeoutMs,
    env: { ...process.env, PATH: TOOL_PATH },
  })
  return JSON.parse(stdout)
}

async function runText(command, timeoutMs = 30000) {
  // Legacy support for shell strings, but prefer runCommand
  const { stdout } = await exec(`bash -lc ${JSON.stringify(command)}`, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: timeoutMs,
    env: { ...process.env, PATH: TOOL_PATH },
  })
  return stdout.trim()
}

// ─── Agent name mapping ─────────────────────────────────────────────────────

// Build model→name lookup from config or defaults
const DEFAULT_AGENT_MAP = [
  { model: 'claude-opus', name: 'Opie' },
  { model: 'claude-sonnet', name: 'Will' },
  { model: 'grok-4', name: 'Elon' },
  { model: 'gemini', name: 'Buzz' },
  { model: 'gpt-5.3-codex', name: 'Omar' },
]
const agentMapEntries = config.agents || DEFAULT_AGENT_MAP

function aliasNameFromModel(model = '') {
  const m = model.toLowerCase()
  for (const entry of agentMapEntries) {
    if (m.includes(entry.model.toLowerCase())) return entry.name
  }
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
  const roster = agentMapEntries.map((a) => a.name)
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

const PROJECTS = (config.projects || []).map((p) => ({
  key: p.key,
  name: p.name,
  path: p.path,
}))

const PROJECT_CRON_MAP = config.projectCronMap || {}

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
  return []
}

async function getLocalRepoIndex() {
  return new Map()
}

async function getRepoGrid() {
  return []
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
let chatQueue = Promise.resolve()

// Dedicated session key to avoid lock contention with main agent session
const CHAT_SESSION_ID = config.chatSessionId || 'opsdeck-chat'

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

async function executeRelay(text, retries = 2) {
  // Guardrails: Max input length handling
  const MAX_INPUT_LENGTH = 10000
  const normalizedText = text.length > MAX_INPUT_LENGTH 
    ? text.slice(0, MAX_INPUT_LENGTH) + '... [truncated]' 
    : text

  const args = [
    '--no-color',
    'agent',
    '--agent', 'main',
    '--message', normalizedText,
    '--session-id', CHAT_SESSION_ID,
    '--thinking', 'low',
    '--json',
    '--timeout', '35'
  ]

  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Use the new robust runCommand instead of bash string interpolation
      const raw = await runCommand('openclaw', args, {
        timeout: 45000,
        json: false,
      })
      return extractAgentText(raw)
    } catch (err) {
      lastErr = err
      // Enhanced error reporting
      const diag = err.stderr ? ` (stderr: ${err.stderr.slice(0, 50)})` : ''
      console.error(`Relay attempt ${attempt + 1}/${retries + 1} failed: ${err.message}${diag}`)
      
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

  // Process asynchronously in-order to avoid session lock contention
  chatQueue = chatQueue
    .then(() => processJob(jobId, text))
    .catch(() => {})

  return { jobId, userMsg }
}

async function processJob(jobId, text) {
  const job = chatJobs.get(jobId)
  if (!job) return
  job.status = 'running'

  // Handle simple health checks without relay
  if (/^(ping|test|testing)$/i.test(text.trim())) {
    const reply = text.trim().toLowerCase() === 'ping' ? 'pong' : 'Received - local chat is live ✅'
    const aiMsg = { id: `a-${Date.now()}`, role: 'assistant', text: reply, ts: Date.now(), status: 'delivered' }
    pushChatMsg(aiMsg)
    job.status = 'done'
    job.text = reply
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
    const diag = err.stderr ? ` [${err.stderr.slice(0, 40)}]` : ''
    const errText = `Relay error: ${String(err.message || err)}${diag}`
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

const port = Number(process.env.OPSDECK_API_PORT || config.apiPort || 4174)
const host = process.env.OPSDECK_API_HOST || config.apiHost || '0.0.0.0'

app.listen({ port, host })
  .then(() => console.log(`opsdeck api listening on http://${host}:${port}`))
  .catch((e) => { console.error(e); process.exit(1) })
