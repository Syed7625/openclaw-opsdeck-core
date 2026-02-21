# OpenClaw OpsDeck

A lightweight mission-control dashboard for [OpenClaw](https://openclaw.ai). Monitor your agent roster, cron jobs, and chat with your agents — all from one screen.

![Command view with round table, cron timeline, and local chat](https://img.shields.io/badge/status-alpha-orange)

## Features

- **Round Table** — live view of active/idle agents with role labels
- **Cron Dashboard** — health, next-run times, one-click manual triggers
- **Local Chat** — send messages to your main agent session directly from the UI
- **Project Tracking** — optional git-status monitoring for local repos

## Prerequisites

- **Node.js** ≥ 18
- **OpenClaw CLI** installed and running (`openclaw gateway status` should show running)

## Quick Start

```bash
# Clone and install
git clone https://github.com/your-org/openclaw-opsdeck.git
cd openclaw-opsdeck
npm install

# (Optional) Create your config
cp opsdeck.config.example.js opsdeck.config.js
# Edit opsdeck.config.js to customize agents, projects, ports, etc.

# Start both API server and dev UI
npm run dev:full
```

Open **http://localhost:4173** in your browser.

### Production Build

```bash
npm run build          # outputs to dist/
npm run api &          # start API server (port 4174)
npx vite preview       # serve built UI (port 4173)
```

## Configuration

Copy `opsdeck.config.example.js` → `opsdeck.config.js` and edit. The file is gitignored.

| Setting | Default | Description |
|---------|---------|-------------|
| `apiPort` | `4174` | API server port (or `OPSDECK_API_PORT` env) |
| `apiHost` | `0.0.0.0` | API bind address (or `OPSDECK_API_HOST` env) |
| `agents` | built-in roster | Array of `{ model, name, role }` for round table |
| `chatSessionId` | `opsdeck-chat` | OpenClaw session ID for local chat relay |
| `projects` | `[]` | Git repos to monitor: `{ key, name, path }` |
| `projectCronMap` | `{}` | Map project keys → cron job names |

## Architecture

```
Browser  ←→  Vite dev server (4173)  ←→  /api proxy  ←→  Fastify API (4174)
                                                            ↕
                                                      openclaw CLI
```

The API server calls `openclaw sessions --json` and `openclaw cron list --all --json` to populate the dashboard. Chat messages are relayed via `openclaw agent --message`.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "fallback" pill stays lit | API server isn't running. Check `npm run api` output. |
| Chat says "Relay error" | Ensure `openclaw gateway status` shows running. |
| No agents appear | Your config agents don't match running session models. Check `openclaw sessions --json`. |
| Port conflict | Set `OPSDECK_API_PORT=5000` or edit `opsdeck.config.js`. |
| `openclaw: command not found` | Add OpenClaw to your PATH or install globally. |

## Project Structure

```
server/index.mjs        — Fastify API (crons, sessions, chat relay)
src/
  App.tsx               — Shell with nav (Command, Crons)
  pages/CommandPage.tsx — Round table + alerts + chat
  pages/CronsPage.tsx   — Cron timeline
  data.ts               — React hook for /api/overview polling
  types.ts              — TypeScript types
opsdeck.config.example.js — Sample configuration
```

## License

MIT
