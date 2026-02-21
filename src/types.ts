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
}
export type SkillsGroup = { base: string; skills: string[] }

export type Overview = {
  ok: boolean
  ts?: number
  agents: Agent[]
  projects: Project[]
  crons: Cron[]
  projectDetails?: Record<string, ProjectDetail>
  skills?: SkillsGroup[]
}
