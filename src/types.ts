export type AgentState = 'active' | 'idle' | 'error'

export type Agent = { id: string; name: string; state: AgentState; load: number }
export type Project = { name: string; key: string; status: string }
export type Cron = { id: string; name: string; enabled: boolean; nextRunAtMs: number | null; lastStatus: string }
export type ScheduledItem = { name: string; nextRunAtMs: number | null; status: string }
export type ProjectDetail = {
  key: string
  name: string
  status: string
  lastCommit: string
  recent: string[]
  scheduled: ScheduledItem[]
  inProgress: string[]
  done: string[]
  dirtyCount?: number | null
  changedPaths?: string[]
}
export type SkillsGroup = { base: string; skills: string[] }

export type AlertItem = { level: 'critical' | 'warn' | 'info'; text: string }
export type TimelineItem = { label: string; atMs: number | null; kind: 'cron' | 'project' | 'agent' }
export type Metrics = {
  activeAgents: number
  dirtyProjects: number
  cronHealthyPct: number
  nextCronAtMs: number | null
}

export type RepoTile = {
  name: string
  fullName: string
  localPath: string | null
  state: 'synced' | 'outdated' | 'missing'
  ahead: number
  behind: number
  dirty: number
  ageDays: number | null
  heat: 'cool' | 'warm' | 'hot'
}

export type Overview = {
  ok: boolean
  ts?: number
  agents: Agent[]
  projects: Project[]
  crons: Cron[]
  projectDetails?: Record<string, ProjectDetail>
  skills?: SkillsGroup[]
  alerts?: AlertItem[]
  timeline?: TimelineItem[]
  metrics?: Metrics
  repos?: RepoTile[]
}
