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

async function getSessions() {
  const data = await runJson('openclaw sessions --json')
  const now = Date.now()
  const toAgentName = (s) => (s.model || 'unknown').replace(/^(.*\/)?.*?([a-z0-9-]+)$/i, '$2')
  return (data.sessions || [])
    .filter((s) => s.key?.includes(':subagent:') || s.key === 'agent:main:main')
    .slice(0, 12)
    .map((s, idx) => {
      const ageMin = (now - (s.updatedAt || now)) / 60000
      const state = ageMin < 15 ? 'active' : 'idle'
      return {
        id: s.key || String(idx),
        name: s.key === 'agent:main:main' ? 'Omar' : toAgentName(s),
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
