import Fastify from 'fastify'
import cors from '@fastify/cors'
import { exec as _exec } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(_exec)
const app = Fastify({ logger: false })

await app.register(cors, { origin: true })

const SHELL_PREFIX = 'export PATH=/usr/local/Cellar/node@22/22.22.0/bin:$PATH; '

async function runJson(command) {
  const full = `${SHELL_PREFIX}${command}`
  const { stdout } = await exec(`bash -lc ${JSON.stringify(full)}`, { maxBuffer: 10 * 1024 * 1024 })
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
  const list = (data.sessions || [])
    .filter((s) => s.key?.includes(':subagent:') || s.key === 'agent:main:main')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 12)

  const counts = new Map()

  return list.map((s, idx) => {
    const ageMin = (now - (s.updatedAt || now)) / 60000
    const state = ageMin <= 2 ? 'active' : 'idle'
    const base = s.key === 'agent:main:main' ? 'Omar' : aliasNameFromModel(s.modelOverride || s.model || '')
    const n = (counts.get(base) || 0) + 1
    counts.set(base, n)
    const short = (s.key || '').split(':').pop()?.slice(0, 4) || String(idx)
    const name = n === 1 ? base : `${base}-${short}`

    return {
      id: s.key || String(idx),
      name,
      state,
      load: Math.min(100, Math.max(0, Math.round((s.totalTokens || 0) / 3000))),
    }
  })
}

async function getProjects() {
  const projects = [
    { name: 'Ancient Travels', path: '/Users/ewimsatt/Sites/ancienttravel' },
    { name: 'OmarCMS', path: '/Users/ewimsatt/Sites/omarcms' },
    { name: 'OpenClaw Fork', path: '/Users/ewimsatt/openclaw' },
  ]
  const out = []
  for (const p of projects) {
    try {
      const cmd = `${SHELL_PREFIX}cd ${JSON.stringify(p.path)} && git status --porcelain | wc -l | tr -d ' '`
      const { stdout } = await exec(`bash -lc ${JSON.stringify(cmd)}`)
      const dirty = Number(stdout.trim() || '0')
      out.push({ name: p.name, status: dirty > 0 ? 'dirty' : 'clean' })
    } catch {
      out.push({ name: p.name, status: 'unknown' })
    }
  }
  return out
}

app.get('/api/overview', async () => {
  try {
    const [agents, crons, projects] = await Promise.all([getSessions(), getCrons(), getProjects()])
    return { ok: true, ts: Date.now(), agents, crons, projects }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
})

app.get('/api/health', async () => ({ ok: true }))

const port = Number(process.env.OPSDECK_API_PORT || 4174)
const host = process.env.OPSDECK_API_HOST || '0.0.0.0'

app.listen({ port, host })
  .then(() => console.log(`opsdeck api listening on http://${host}:${port}`))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
