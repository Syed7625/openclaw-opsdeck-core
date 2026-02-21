import Fastify from 'fastify'
import cors from '@fastify/cors'
import { exec as _exec } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(_exec)
const app = Fastify({ logger: false })

await app.register(cors, { origin: true })

const TOOL_PATH = `/usr/local/Cellar/node@22/22.22.0/bin:${process.env.PATH || ''}`

async function runJson(command) {
  const { stdout } = await exec(`bash -lc ${JSON.stringify(command)}`, {
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, PATH: TOOL_PATH },
  })
  return JSON.parse(stdout)
}

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

function aliasNameFromModel(model = '') {
  const m = model.toLowerCase()
  if (m.includes('claude-opus')) return 'Opie'
  if (m.includes('claude-sonnet')) return 'Will'
  if (m.includes('grok-4') || m.includes('grok-4-1')) return 'Elon'
  if (m.includes('gemini')) return 'Buzz'
  if (m.includes('gpt-5.2-pro')) return 'Forge'
  if (m.includes('gpt-5.2')) return 'Atlas'
  if (m.includes('kimi')) return 'Kite'
  if (m.includes('grok-4')) return 'Grok'
  if (m.includes('gpt-5.3-codex')) return 'Omar'
  return model || 'Agent'
}

async function getSessions() {
  const data = await runJson('openclaw sessions --json')
  const now = Date.now()

  const roster = ['Omar', 'Will', 'Opie', 'Elon', 'Buzz', 'Kite']
  const byName = new Map(roster.map((name) => [name, { id: name.toLowerCase(), name, state: 'idle', load: 0 }]))

  const sessions = (data.sessions || [])
    .filter((s) => s.key?.includes(':subagent:') || s.key === 'agent:main:main')

  for (const s of sessions) {
    const name = s.key === 'agent:main:main' ? 'Omar' : aliasNameFromModel(s.modelOverride || s.model || '')
    if (!byName.has(name)) continue

    const ageMin = (now - (s.updatedAt || now)) / 60000
    const active = ageMin <= 2
    const current = byName.get(name)
    const sessionLoad = Math.min(100, Math.max(0, Math.round((s.totalTokens || 0) / 3000)))

    byName.set(name, {
      id: current.id,
      name,
      state: active ? 'active' : current.state,
      load: Math.max(current.load, sessionLoad),
    })
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

async function runText(command) {
  const { stdout } = await exec(`bash -lc ${JSON.stringify(command)}`, {
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, PATH: TOOL_PATH },
  })
  return stdout.trim()
}

async function getProjects() {
  const out = []
  for (const p of PROJECTS) {
    try {
      const dirty = Number(await runText(`cd ${JSON.stringify(p.path)} && git status --porcelain | wc -l | tr -d ' '`))
      out.push({ name: p.name, key: p.key, status: dirty > 0 ? 'dirty' : 'clean' })
    } catch {
      out.push({ name: p.name, key: p.key, status: 'unknown' })
    }
  }
  return out
}

async function getProjectDetails(crons) {
  const details = {}
  for (const p of PROJECTS) {
    let lastCommit = 'unknown'
    let recent = []
    let dirtyCount = null
    let changedPaths = []
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

    details[p.key] = {
      key: p.key,
      name: p.name,
      status: dirtyCount === null ? 'unknown' : dirtyCount > 0 ? 'dirty' : 'clean',
      lastCommit,
      recent,
      scheduled,
      inProgress,
      done,
      dirtyCount,
      changedPaths,
    }
  }
  return details
}

async function getSkillsOverview() {
  const paths = [
    '/Users/ewimsatt/openclaw/skills',
    '/Users/ewimsatt/.openclaw/workspace/skills',
  ]
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
  for (const c of crons) {
    items.push({ label: c.name, atMs: c.nextRunAtMs, kind: 'cron' })
  }
  for (const p of projects) {
    items.push({ label: `${p.name} status: ${p.status}`, atMs: Date.now(), kind: 'project' })
  }
  return items
    .filter((x) => x.atMs)
    .sort((a, b) => a.atMs - b.atMs)
    .slice(0, 10)
}

function buildMetrics(agents, projects, crons) {
  const activeAgents = agents.filter((a) => a.state === 'active').length
  const dirtyProjects = projects.filter((p) => p.status === 'dirty').length
  const healthy = crons.filter((c) => c.lastStatus === 'ok').length
  const cronHealthyPct = crons.length ? Math.round((healthy / crons.length) * 100) : 0
  const nextCronAtMs = [...crons].map((c) => c.nextRunAtMs).filter(Boolean).sort((a, b) => a - b)[0] || null
  return { activeAgents, dirtyProjects, cronHealthyPct, nextCronAtMs }
}

async function getLocalRepoIndex() {
  const now = Date.now()
  if (localRepoIndexCache.map.size && (now - localRepoIndexCache.ts) < 60000) return localRepoIndexCache.map
  const roots = ['/Users/ewimsatt/Sites', '/Users/ewimsatt/frameworks', '/Users/ewimsatt/.openclaw/workspace', '/Users/ewimsatt/openclaw']
  const found = new Map()
  for (const root of roots) {
    try {
      const raw = await runText(`find ${JSON.stringify(root)} -maxdepth 3 -type d -name .git -print | sed 's#/\\.git$##'`)
      const dirs = raw ? raw.split('\n').filter(Boolean) : []
      for (const d of dirs) {
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
    const raw = await runText('gh repo list ewimsatt --limit 200 --json name,nameWithOwner,isPrivate')
    repos = JSON.parse(raw)
  } catch {
    repos = []
  }

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
      behind = parts[0] || 0
      ahead = parts[1] || 0
      const ts = Number(await runText(`cd ${JSON.stringify(localPath)} && git log -1 --format=%ct 2>/dev/null || echo 0`))
      if (ts > 0) ageDays = Math.floor((Date.now() / 1000 - ts) / 86400)
    } catch {}

    const synced = dirty === 0 && ahead === 0 && behind === 0
    const state = synced ? 'synced' : 'outdated'
    const heat = ageDays === null ? 'cool' : ageDays > 30 ? 'hot' : ageDays > 14 ? 'warm' : 'cool'
    out.push({ name: r.name, fullName: r.nameWithOwner, localPath, state, ahead, behind, dirty, ageDays, heat })
  }

  repoCache.ts = now
  repoCache.data = out
  return out
}

const overviewCache = { ts: 0, data: null }
const repoCache = { ts: 0, data: [] }
const localRepoIndexCache = { ts: 0, map: new Map() }
const chatHistory = []

app.get('/api/overview', async () => {
  try {
    const now = Date.now()
    if (overviewCache.data && (now - overviewCache.ts) < 10000) {
      return overviewCache.data
    }

    const [agents, crons, projects, skills, repos] = await Promise.all([getSessions(), getCrons(), getProjects(), getSkillsOverview(), getRepoGrid()])
    const projectDetails = await getProjectDetails(crons)
    const alerts = deriveAlerts(agents, projects, crons)
    const timeline = buildTimeline(crons, projects)
    const metrics = buildMetrics(agents, projects, crons)
    const payload = { ok: true, ts: now, agents, crons, projects, projectDetails, skills, alerts, timeline, metrics, repos }
    overviewCache.ts = now
    overviewCache.data = payload
    return payload
  } catch (error) {
    return { ok: false, error: String(error) }
  }
})

app.get('/api/health', async () => ({ ok: true }))

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

app.get('/api/chat', async () => ({ ok: true, messages: chatHistory.slice(-80) }))

app.post('/api/chat', async (req, reply) => {
  const text = String(req.body?.text || '').trim()
  if (!text) return reply.code(400).send({ ok: false, error: 'text required' })

  const userMsg = { id: `u-${Date.now()}`, role: 'user', text, ts: Date.now() }
  chatHistory.push(userMsg)

  try {
    const cmd = `openclaw agent --agent main --message ${JSON.stringify(text)} --json`
    const raw = await runText(cmd)
    let replyText = 'No reply body returned.'
    try {
      const parsed = JSON.parse(raw)
      replyText = parsed?.response?.text || parsed?.text || parsed?.output || raw
    } catch {
      replyText = raw || 'No reply body returned.'
    }
    const aiMsg = { id: `a-${Date.now()}`, role: 'assistant', text: replyText, ts: Date.now() }
    chatHistory.push(aiMsg)
    return { ok: true, message: aiMsg }
  } catch (error) {
    const errText = `Local agent relay failed: ${String(error)}`
    const aiMsg = { id: `a-${Date.now()}`, role: 'assistant', text: errText, ts: Date.now() }
    chatHistory.push(aiMsg)
    return reply.code(200).send({ ok: true, message: aiMsg, degraded: true })
  }
})

app.get('/api/meta', async () => {
  return {
    ok: true,
    projects: PROJECTS.map((p) => ({ key: p.key, name: p.name, path: p.path })),
  }
})

const port = Number(process.env.OPSDECK_API_PORT || 4174)
const host = process.env.OPSDECK_API_HOST || '0.0.0.0'

app.listen({ port, host })
  .then(() => console.log(`opsdeck api listening on http://${host}:${port}`))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
