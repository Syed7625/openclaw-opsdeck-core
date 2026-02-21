# OpsDeck Expansion Plan

## 1. Information Architecture

```
┌─────────────────────────────────────────────┐
│  TOP NAV (persistent)                       │
│  [Command Center] [Sites] [Crons] [Forge]   │
│  ─────────────────────────── [⚙] [TERMINAL] │
└─────────────────────────────────────────────┘
```

### Pages

| Route | Purpose | One-liner |
|---|---|---|
| `/` | **Command Center** | The round table. Agents, alerts, heartbeat. What's happening *right now*. |
| `/sites` | **Sites Board** | Card grid of all sites. Deploy status, lighthouse scores, last commit, uptime. |
| `/sites/:slug` | **Site Detail** | Single-site deep view: git log, build status, lighthouse trend, content stats. |
| `/crons` | **Cron Timeline** | 24-hour radial clock showing all cron jobs. Run history heatmap. |
| `/forge` | **Forge** | Frameworks + scripts inventory. Dependency graph. Reusable tooling catalog. |
| `/log` | **Activity Log** | Filterable timeline of agent sessions, cron runs, deploys. Reverse-chrono. |

**No settings page.** Config stays in code/env. Terminal mode toggle lives in the nav.

---

## 2. Visual System Per Page

### Command Center (`/`)
- **Current round-table stays.** Enhance: pulse animation on active agents, glow intensity = load %.
- Add **alert ticker** bottom strip — one-line scrolling alerts (failed crons, dirty repos, stale sessions).
- Add **mini sparkline row** under the table: agent session count over last 24h.
- Background: subtle grid with slow drift animation. Cyber mode = blue grid. Terminal mode = green scanlines.

### Sites Board (`/sites`)
- **Hexagonal card grid.** Each site is a hex tile.
- Hex border color = health (green/amber/red). Interior shows: site name, last deploy time, Lighthouse perf score as radial gauge.
- Hover → expand with git dirty count + last commit message.
- Click → `/sites/:slug` detail page.

### Site Detail (`/sites/:slug`)
- **Left column:** Git log (last 10 commits) as vertical timeline dots.
- **Right column:** Lighthouse score trend (line chart, last 10 runs). Content stats (page count, word count if CMS).
- **Top bar:** Deploy button placeholder, branch name, dirty file count badge.

### Cron Timeline (`/crons`)
- **24-hour radial clock.** Each cron = arc segment at its scheduled hour(s).
- Inner ring = last 7 days run history as dot grid (green = ok, red = fail, gray = skip).
- Click a cron → slide-out panel with last 5 run logs (truncated).
- Micro Heartbeat shows as a pulsing ring segment across night hours.

### Forge (`/forge`)
- **Two columns:** Frameworks (left), Scripts (right).
- Each item = card with name, last-modified date, one-line description pulled from package.json or README first line.
- Optional: dependency arrows between items (e.g., omarcms-template → waypoint-cms). Static data initially, can automate later.

### Activity Log (`/log`)
- **Vertical infinite-scroll timeline.** Each entry = icon (agent/cron/deploy) + timestamp + one-line summary.
- Filter chips at top: `Agents` `Crons` `Deploys` `Errors`.
- No pagination — virtual scroll.

---

## 3. Data Model & API Expansion

### New Endpoints

| Endpoint | Source | Returns |
|---|---|---|
| `GET /api/overview` | (exists) | agents, crons, projects — **add `alerts[]`** |
| `GET /api/sites` | git status + lighthouse JSON + package.json per site | `{ sites: [{ slug, name, path, dirty, lastCommit, lighthousePerf, uptime }] }` |
| `GET /api/sites/:slug` | git log + lighthouse history + file stats | `{ commits[], lighthouseHistory[], contentStats }` |
| `GET /api/crons` | (exists as part of overview) | **Promote to standalone.** Add `runHistory[]` from `openclaw cron list --all --json` state. |
| `GET /api/crons/:id/runs` | openclaw cron logs or parsed state | `{ runs: [{ ts, status, durationMs }] }` |
| `GET /api/forge` | Scan `frameworks/` + `scripts/` dirs | `{ frameworks: [{ name, path, description, lastModified }], scripts: [...] }` |
| `GET /api/activity` | Merge sessions + cron runs + git commits | `{ events: [{ type, ts, summary }] }` (last 100) |
| `GET /api/alerts` | Derived: failed crons, stale agents, dirty repos | `{ alerts: [{ level, message, ts }] }` |

### Sites Config (server-side)
```js
const SITES = [
  { slug: 'opsdeck', name: 'OpsDeck', path: '/Users/ewimsatt/Sites/openclaw-opsdeck' },
  { slug: 'ancienttravel', name: 'Ancient Travels', path: '/Users/ewimsatt/Sites/ancienttravel' },
  { slug: 'omarcms', name: 'OmarCMS', path: '/Users/ewimsatt/Sites/omarcms' },
  { slug: 'landingpageai', name: 'Landing Page AI', path: '/Users/ewimsatt/Sites/landingpageai' },
]

const FRAMEWORKS = [
  { slug: 'waypoint-cms', path: '/Users/ewimsatt/frameworks/waypoint-cms' },
  { slug: 'omarcms-template', path: '/Users/ewimsatt/frameworks/omarcms-template' },
  { slug: 'seo-audit-hub', path: '/Users/ewimsatt/frameworks/seo-audit-hub' },
]
```

---

## 4. Priority Roadmap

### v1.1 — Multi-Page + Router (1-2 sessions)
- Add React Router. Restructure into pages.
- Move current dashboard to `/` (Command Center).
- Build `/crons` with radial clock.
- Build `/sites` with hex grid.
- Add alert ticker to Command Center.
- Expand API: `/api/sites`, `/api/alerts`.

### v1.2 — Depth + Polish (2-3 sessions)
- Site detail pages (`/sites/:slug`) with git log + lighthouse trends.
- `/forge` inventory page.
- `/log` activity timeline.
- Cron run history in `/crons`.
- Expand API: `/api/crons/:id/runs`, `/api/forge`, `/api/activity`.
- Add WebSocket or SSE for live updates (replace polling).

### v2 — Intelligence Layer
- Agent session drill-down (click agent → see conversation summary, token usage, tool calls).
- Lighthouse auto-runs via cron, stored locally, trended.
- Deploy triggers from the UI (git pull + build).
- Notification rules (alert → Telegram push if cron fails 2x).
- Optional: D3 force graph for agent ↔ project relationships.

---

## 5. Libraries (Only What's Needed)

| Library | Why | Page |
|---|---|---|
| `react-router-dom` | Multi-page routing | All |
| `recharts` | Sparklines, line charts, radial charts | Crons, Sites detail |
| `@tanstack/react-virtual` | Virtual scroll for activity log | Log |
| `framer-motion` | Agent pulse, page transitions, hex hover | Command Center, Sites |

**Do NOT add:** UI component library (build custom, it's a visual product), state management (React state + fetch is enough), CSS framework (custom CSS is the whole point).

---

## 6. Daily Metrics & Alerts

### What Matters Every Morning

| Metric | Source | Alert If |
|---|---|---|
| Cron health | Last run status per cron | Any cron failed or missed |
| Agent activity | Session timestamps | Main agent offline > 30min during work hours |
| Repo cleanliness | `git status --porcelain` | Any site > 10 dirty files |
| Lighthouse perf | Stored scores | Any site drops below 80 |
| Night owl output | Session logs 22:00-06:00 | Nothing ran (heartbeat silent) |
| Build freshness | Last commit date per site | Any site stale > 7 days |

### Alert Levels
- 🔴 **Critical:** Cron failed, agent down during work hours
- 🟡 **Warning:** Dirty repos, stale sites, perf drops
- 🔵 **Info:** Deploy completed, new session started

---

## 7. First 7 Build Tickets

| # | Ticket | Scope | Est |
|---|---|---|---|
| 1 | **Add react-router-dom, create page shell with nav** | Scaffold `/`, `/sites`, `/crons` routes. Shared layout with top nav. Move current App.tsx content into `pages/CommandCenter.tsx`. | 30min |
| 2 | **Build `/api/sites` endpoint** | Add SITES config to server. Return slug, name, dirty count, last commit hash+message+date per site. | 20min |
| 3 | **Build `/api/alerts` endpoint** | Derive alerts from cron status (failed/missed), dirty repos (>5 files), stale agents. Return `[{level, message, ts}]`. | 20min |
| 4 | **Alert ticker on Command Center** | Horizontal scrolling strip at bottom of command center. Fetch `/api/alerts`. Color-coded by level. | 30min |
| 5 | **Sites hex grid page** | `/sites` page with hex card per site. Border color = health. Show name + dirty count + last commit age. Link to detail (placeholder). | 45min |
| 6 | **Cron radial clock page** | `/crons` page. 24h circle. Each cron = colored arc at its hour. Legend sidebar. Enabled/disabled opacity. | 60min |
| 7 | **Add `framer-motion` agent pulse + page transitions** | Animate agent nodes (pulse when active, breathe when idle). Fade/slide page transitions on route change. | 30min |

**Total estimate: ~4 hours of focused build time.**

Tickets are ordered by dependency — 1 unblocks everything, 2-3 feed into 4-5, 6-7 are independent.
