// OpsDeck Configuration
// Copy this file to opsdeck.config.js and customize.

export default {
  // API server settings (can also use env vars OPSDECK_API_PORT / OPSDECK_API_HOST)
  apiPort: 4174,
  apiHost: '0.0.0.0',

  // Agent roster — names shown in the round table.
  // Map model substring → display name. Order = display order.
  agents: [
    { model: 'gpt-5.3-codex', name: 'Omar', role: 'Mission Lead' },
    { model: 'claude-sonnet', name: 'Will', role: 'Writer' },
    { model: 'claude-opus', name: 'Opie', role: 'Strategist' },
    { model: 'gemini', name: 'Buzz', role: 'Rapid Ops' },
  ],

  // Chat session ID used for the local chat relay.
  // Change if you want a dedicated session separate from your main agent.
  chatSessionId: 'opsdeck-chat',

  // Projects to track (optional). Each needs a local git path.
  // projects: [
  //   { key: 'my-app', name: 'My App', path: '/path/to/my-app' },
  // ],

  // Map project keys to cron job names for the project detail view.
  // projectCronMap: {
  //   'my-app': ['deploy-my-app', 'test-my-app'],
  // },
}
