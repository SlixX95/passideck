#!/usr/bin/env node
// TermDeck Demo Script
// Creates 6 terminals with different themes and simulated activity
// for recording a GIF/screenshot. No personal data is exposed.
//
// Usage:
//   1. Start TermDeck:  npm run dev
//   2. Wait for browser to open
//   3. In another terminal:  node scripts/demo.js
//   4. Switch to 3x2 layout in the browser
//   5. Start recording your GIF
//   6. The script runs for ~20 seconds then exits

const WebSocket = require('ws');
const API = 'http://127.0.0.1:3000';

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function typeInto(ws, text, delay = 60) {
  return new Promise(resolve => {
    let i = 0;
    const iv = setInterval(() => {
      if (i < text.length) {
        ws.send(JSON.stringify({ type: 'input', data: text[i] }));
        i++;
      } else {
        clearInterval(iv);
        resolve();
      }
    }, delay);
  });
}

async function typeCommand(ws, cmd, enterDelay = 200) {
  await typeInto(ws, cmd);
  await sleep(enterDelay);
  ws.send(JSON.stringify({ type: 'input', data: '\r' }));
}

function connectWs(sessionId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:3000/ws?session=${sessionId}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

// Demo terminal scripts — each simulates realistic dev activity
const terminals = [
  {
    label: 'Claude Code',
    project: 'api-server',
    theme: 'tokyo-night',
    reason: 'refactoring auth module',
    commands: [
      { cmd: 'echo "\\033[1;35m⏺ Reading src/auth/middleware.ts\\033[0m"', wait: 1500 },
      { cmd: 'echo "\\033[1;33mEdit src/auth/middleware.ts\\033[0m"', wait: 2000 },
      { cmd: 'echo "  Added JWT refresh token rotation"', wait: 1000 },
      { cmd: 'echo "  Updated session expiry to 7 days"', wait: 1500 },
      { cmd: 'echo "\\033[1;35m⏺ Running tests\\033[0m"', wait: 2000 },
      { cmd: 'echo "\\033[32m✓ 23 tests passed\\033[0m"', wait: 1000 },
    ]
  },
  {
    label: 'Dev Server',
    project: 'api-server',
    theme: 'catppuccin-mocha',
    reason: 'running API server',
    commands: [
      { cmd: 'echo "\\033[36mStarting development server...\\033[0m"', wait: 800 },
      { cmd: 'echo "Serving HTTP on 0.0.0.0 port 8080 (http://0.0.0.0:8080/) ..."', wait: 1500 },
      { cmd: 'echo "\\033[32m200\\033[0m GET /api/users 12ms"', wait: 2000 },
      { cmd: 'echo "\\033[32m200\\033[0m POST /api/auth/login 45ms"', wait: 1500 },
      { cmd: 'echo "\\033[33m304\\033[0m GET /api/users/me 3ms"', wait: 1000 },
      { cmd: 'echo "\\033[32m201\\033[0m POST /api/projects 67ms"', wait: 2000 },
      { cmd: 'echo "\\033[32m200\\033[0m GET /api/projects?limit=20 8ms"', wait: 1500 },
    ]
  },
  {
    label: 'Tests',
    project: 'frontend',
    theme: 'dracula',
    reason: 'running test suite',
    commands: [
      { cmd: 'echo "\\033[1m RUNS \\033[0m src/components/__tests__/Dashboard.test.tsx"', wait: 1000 },
      { cmd: 'echo "\\033[42;30m PASS \\033[0m src/components/__tests__/Dashboard.test.tsx"', wait: 1500 },
      { cmd: 'echo "\\033[42;30m PASS \\033[0m src/hooks/__tests__/useAuth.test.ts"', wait: 800 },
      { cmd: 'echo "\\033[42;30m PASS \\033[0m src/utils/__tests__/format.test.ts"', wait: 600 },
      { cmd: 'echo "\\033[1m RUNS \\033[0m src/pages/__tests__/Settings.test.tsx"', wait: 2000 },
      { cmd: 'echo "\\033[42;30m PASS \\033[0m src/pages/__tests__/Settings.test.tsx"', wait: 1200 },
      { cmd: 'echo ""', wait: 200 },
      { cmd: 'echo "\\033[1mTest Suites:\\033[0m \\033[32m4 passed\\033[0m, 4 total"', wait: 500 },
      { cmd: 'echo "\\033[1mTests:      \\033[0m \\033[32m18 passed\\033[0m, 18 total"', wait: 300 },
    ]
  },
  {
    label: 'Git',
    project: 'api-server',
    theme: 'nord',
    reason: 'checking git status',
    commands: [
      { cmd: 'echo "On branch feature/auth-refresh"', wait: 800 },
      { cmd: 'echo "Changes not staged for commit:"', wait: 400 },
      { cmd: 'echo "\\033[31m  modified:   src/auth/middleware.ts\\033[0m"', wait: 300 },
      { cmd: 'echo "\\033[31m  modified:   src/auth/tokens.ts\\033[0m"', wait: 300 },
      { cmd: 'echo "\\033[32m  new file:   src/auth/refresh.ts\\033[0m"', wait: 300 },
      { cmd: 'echo ""', wait: 1500 },
      { cmd: 'echo "\\033[33mcommit abc1234\\033[0m (HEAD -> feature/auth-refresh)"', wait: 1000 },
      { cmd: 'echo "Author: dev <dev@example.com>"', wait: 200 },
      { cmd: 'echo "Date:   Wed Mar 19 2026 14:30:00"', wait: 200 },
      { cmd: 'echo ""', wait: 200 },
      { cmd: 'echo "    Add JWT refresh token rotation"', wait: 1000 },
    ]
  },
  {
    label: 'Logs',
    project: 'api-server',
    theme: 'gruvbox-dark',
    reason: 'tailing production logs',
    commands: [
      { cmd: 'echo "\\033[90m2026-03-19 14:30:01\\033[0m \\033[32mINFO\\033[0m  Request completed \\033[36mGET /api/health\\033[0m 200 2ms"', wait: 1200 },
      { cmd: 'echo "\\033[90m2026-03-19 14:30:03\\033[0m \\033[32mINFO\\033[0m  Request completed \\033[36mPOST /api/auth/login\\033[0m 200 120ms"', wait: 1800 },
      { cmd: 'echo "\\033[90m2026-03-19 14:30:05\\033[0m \\033[33mWARN\\033[0m  Rate limit approaching for IP 10.0.0.42 (85/100)"', wait: 2000 },
      { cmd: 'echo "\\033[90m2026-03-19 14:30:07\\033[0m \\033[32mINFO\\033[0m  Request completed \\033[36mGET /api/projects\\033[0m 200 15ms"', wait: 1500 },
      { cmd: 'echo "\\033[90m2026-03-19 14:30:09\\033[0m \\033[32mINFO\\033[0m  WebSocket connection established client=ws-8f3a"', wait: 1300 },
      { cmd: 'echo "\\033[90m2026-03-19 14:30:11\\033[0m \\033[32mINFO\\033[0m  Cache hit ratio: 94.2% (last 5m)"', wait: 2000 },
    ]
  },
  {
    label: 'Shell',
    project: 'frontend',
    theme: 'rose-pine-dawn',
    reason: 'building for production',
    commands: [
      { cmd: 'echo "\\033[1m> frontend@2.1.0 build\\033[0m"', wait: 800 },
      { cmd: 'echo "\\033[36mvite\\033[0m v5.2.0 building for production..."', wait: 1500 },
      { cmd: 'echo "transforming (142) src/main.tsx"', wait: 1000 },
      { cmd: 'echo "transforming (298) src/components/index.ts"', wait: 800 },
      { cmd: 'echo "\\033[32m✓\\033[0m 467 modules transformed."', wait: 1500 },
      { cmd: 'echo "\\033[36mdist/assets/index-3f8a2b1c.js\\033[0m   245.12 kB │ gzip: 78.34 kB"', wait: 500 },
      { cmd: 'echo "\\033[36mdist/assets/index-9d4e1f0a.css\\033[0m  18.67 kB  │ gzip: 4.21 kB"', wait: 500 },
      { cmd: 'echo "\\033[32m✓ built in 3.2s\\033[0m"', wait: 1000 },
    ]
  }
];

async function main() {
  console.log('\n  TermDeck Demo — Creating terminals...\n');

  // Create all sessions
  const sessions = [];
  for (const t of terminals) {
    const session = await api('POST', '/api/sessions', {
      project: t.project,
      theme: t.theme,
      reason: t.reason,
      label: t.label
    });
    const ws = await connectWs(session.id);
    sessions.push({ ...t, session, ws });
    console.log(`  Created: ${t.label} (${t.theme})`);
  }

  console.log(`\n  ${sessions.length} terminals ready.`);
  console.log('  Switch to 3x2 layout in the browser now.');
  console.log('  Activity starts in 3 seconds...\n');

  await sleep(3000);

  // Run commands in parallel across all terminals
  const runners = sessions.map(async (s) => {
    // Small initial delay per terminal so they don't all start at once
    await sleep(Math.random() * 1000);

    for (const c of s.commands) {
      await typeCommand(s.ws, c.cmd, 50);
      await sleep(c.wait);
    }
  });

  await Promise.all(runners);

  console.log('  Demo complete. Terminals will remain open.');
  console.log('  Record your GIF now if you haven\'t already.\n');

  // Close WebSockets but leave terminals running
  for (const s of sessions) {
    s.ws.close();
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Demo failed:', err.message);
  process.exit(1);
});
