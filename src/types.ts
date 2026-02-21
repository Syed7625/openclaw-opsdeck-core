export type AgentState = 'active' | 'idle' | 'error'

export type Agent = { id: string; name: string; state: AgentState; load: number }
export type Project = { name: string; status: string }
export type Cron = { id: string; name: string; enabled: boolean; nextRunAtMs: number | null; lastStatus: string }

export type Overview = { ok: boolean; ts?: number; agents: Agent[]; projects: Project[]; crons: Cron[] }
