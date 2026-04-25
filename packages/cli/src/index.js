#!/usr/bin/env node

// TermDeck CLI launcher
// Usage:
//   termdeck [--port 3000] [--no-open]
//   termdeck init --mnestra [flags]   # Tier 2 memory setup (wired to init-mnestra.js)
//   termdeck init --rumen  [flags]   # Tier 3 async learning deploy
//
// Note (Sprint 3): the `--mnestra` flag name matches the current init-mnestra.js
// filename. When the main orchestrator completes the Mnestra → Mnestra rename
// sweep over this repo, both the flag name and the filename should flip to
// `--mnestra` / `init-mnestra.js` together.

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

// Parse CLI args
const args = process.argv.slice(2);

// Subcommand dispatch — handle `termdeck init --mnestra|--rumen` before
// falling through to the default launcher's flag parsing. The `require` of
// init-*.js is lazy so users running the normal `termdeck` command never pay
// the cost of loading pg / supabase helpers at startup.
if (args[0] === 'init') {
  const mode = args[1];
  const rest = args.slice(2);
  const run = (modPath) => {
    const fn = require(modPath);
    return fn(rest).then((code) => process.exit(code || 0));
  };
  if (mode === '--mnestra') {
    run(path.join(__dirname, 'init-mnestra.js')).catch((err) => {
      console.error('[cli] init --mnestra failed:', err && err.stack || err);
      process.exit(1);
    });
    return;
  }
  if (mode === '--rumen') {
    run(path.join(__dirname, 'init-rumen.js')).catch((err) => {
      console.error('[cli] init --rumen failed:', err && err.stack || err);
      process.exit(1);
    });
    return;
  }
  console.error('Usage: termdeck init --mnestra | --rumen');
  console.error('  termdeck init --mnestra   Configure Tier 2 memory (Supabase + Mnestra)');
  console.error('  termdeck init --rumen    Deploy Tier 3 async learning (Rumen)');
  process.exit(1);
}

// `termdeck forge` — Sprint 20 SkillForge preview. Autonomously generates
// Claude Code skills from Mnestra memories. Lazy-loaded so the launcher
// startup path stays unaffected.
if (args[0] === 'forge') {
  const forge = require(path.join(__dirname, 'forge.js'));
  forge(args.slice(1)).then((code) => process.exit(code || 0)).catch((err) => {
    console.error('[cli] forge failed:', err && err.stack || err);
    process.exit(1);
  });
  return;
}

// `termdeck stack` — full-stack launcher (Node port of scripts/start.sh).
// Boots Mnestra (if installed + autoStart: true), checks Rumen, then
// starts TermDeck. Lives in the npm package so users who installed via
// `npm install -g @jhizzard/termdeck` don't need to clone the repo to
// get the start.sh experience.
if (args[0] === 'stack') {
  const stack = require(path.join(__dirname, 'stack.js'));
  stack(args.slice(1)).then((code) => process.exit(code || 0)).catch((err) => {
    console.error('[cli] stack failed:', err && err.stack || err);
    process.exit(1);
  });
  return;
}

// `termdeck doctor` — Sprint 28: version-check the whole stack.
if (args[0] === 'doctor') {
  const doctor = require(path.join(__dirname, 'doctor.js'));
  doctor(args.slice(1)).then((code) => process.exit(code || 0)).catch((err) => {
    console.error('[cli] doctor failed:', err && err.stack || err);
    process.exit(2);
  });
  return;
}

// Sprint 24: when `termdeck` is invoked with no subcommand AND a configured
// stack is detected, route through stack.js so users don't have to remember
// the `stack` subcommand. `--no-stack` is the explicit opt-out.
const { shouldAutoOrchestrate } = require(path.join(__dirname, 'auto-orchestrate.js'));

const KNOWN_SUBCOMMANDS = new Set(['init', 'forge', 'stack', 'doctor']);
const noStackIdx = args.indexOf('--no-stack');
const noStackRequested = noStackIdx !== -1;
if (noStackRequested) args.splice(noStackIdx, 1); // strip before flag parsing

const wantsHelp = args.includes('--help') || args.includes('-h');

if (!KNOWN_SUBCOMMANDS.has(args[0]) && !noStackRequested && !wantsHelp && shouldAutoOrchestrate()) {
  const stack = require(path.join(__dirname, 'stack.js'));
  stack(args).then((code) => process.exit(code || 0)).catch((err) => {
    console.error('[cli] auto-stack failed:', err && err.stack || err);
    process.exit(1);
  });
  return;
}

const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    flags.port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--no-open') {
    flags.noOpen = true;
  } else if (args[i] === '--session-logs') {
    flags.sessionLogs = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
  TermDeck - Web-based terminal multiplexer

  Usage:
    termdeck                    Auto-orchestrate stack if configured, else Tier-1-only
    termdeck stack              Force boot Mnestra + check Rumen + start TermDeck
    termdeck --no-stack         Skip orchestrator (force Tier-1-only boot)
    termdeck --port 8080        Start on custom port
    termdeck --no-open          Don't auto-open browser
    termdeck --session-logs     Write per-session markdown logs to ~/.termdeck/sessions/
    termdeck init --mnestra     Configure Tier 2 memory (Supabase + Mnestra)
    termdeck init --rumen       Deploy Tier 3 async learning (Rumen)
    termdeck forge              Generate Claude skills from memories (experimental)
    termdeck doctor             Check whether the stack packages are up to date

  Keyboard shortcuts (in browser):
    Ctrl+Shift+N                Focus prompt bar
    Ctrl+Shift+1-6              Switch layout (1x1 → 4x2)
    Ctrl+Shift+] / [            Next / previous terminal
    Escape                      Exit focus/half mode

  Config:
    ~/.termdeck/config.yaml     Server + project + RAG configuration
    ~/.termdeck/secrets.env     API keys (OpenAI, Anthropic, Supabase)
    ~/.termdeck/termdeck.db     Session history (SQLite)
`);
    process.exit(0);
  }
}

// Load and start server
const { createServer, loadConfig } = require(path.join(__dirname, '..', '..', 'server', 'src', 'index.js'));
const { runPreflight, printHealthBanner } = require(path.join(__dirname, '..', '..', 'server', 'src', 'preflight'));

// Flag-driven env vars must be set BEFORE loadConfig() so any module that
// reads process.env at require-time sees them.
if (flags.sessionLogs) {
  process.env.TERMDECK_SESSION_LOGS = '1';
}

// First-run detection (Sprint 19 T3): surface a one-line hint pointing at
// the setup wizard when no config.yaml exists yet. Check happens before
// loadConfig() so the message reflects on-disk state, not defaults.
const firstRun = !fs.existsSync(path.join(os.homedir(), '.termdeck', 'config.yaml'));

const config = loadConfig();
if (flags.port) config.port = flags.port;
if (flags.sessionLogs) {
  config.sessionLogs = { ...(config.sessionLogs || {}), enabled: true };
  console.log('[cli] session logs enabled — writing to ~/.termdeck/sessions/ on panel exit');
}

const { server } = createServer(config);
const port = config.port || 3000;
const host = config.host || '127.0.0.1';
const url = `http://${host}:${port}`;

// Bind guardrail: refuse non-loopback without auth token
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
if (!LOOPBACK.has(host)) {
  const authToken = config.auth?.token || process.env.TERMDECK_AUTH_TOKEN;
  if (!authToken) {
    console.error('[security] Refusing to bind to ' + host + ' without auth.token set.');
    console.error('[security] Set auth.token in ~/.termdeck/config.yaml or TERMDECK_AUTH_TOKEN env var.');
    console.error('[security] To bind locally only, set host: 127.0.0.1 in config.yaml');
    process.exit(1);
  }
}

// Sprint 25 T4: non-blocking nudge when RAG is configured but the Supabase MCP
// (T1's `@supabase/mcp-server-supabase` detection) isn't installed. Lazy-loads
// T1's module so Tier 1 users with no RAG never pay the require cost. Silent
// when RAG is off, when the MCP is detected, when ~/.claude/mcp.json already
// declares a `supabase` server, or when anything below throws.
async function checkSupabaseMcpHint(cfg) {
  if (!cfg || !cfg.rag || cfg.rag.enabled !== true) return null;
  try {
    const claudeMcpPath = path.join(os.homedir(), '.claude', 'mcp.json');
    if (fs.existsSync(claudeMcpPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(claudeMcpPath, 'utf8'));
        if (parsed && parsed.mcpServers && parsed.mcpServers.supabase) return null;
      } catch (_e) { /* malformed JSON — fall through and let detectMcp decide */ }
    }
    const { detectMcp } = require(path.join(__dirname, '..', '..', 'server', 'src', 'setup', 'supabase-mcp.js'));
    const result = await detectMcp();
    if (result && result.available) return null;
    return 'Supabase MCP not installed — wizard auto-fill unavailable. Install with: npx @jhizzard/termdeck-stack --tier 4';
  } catch (_e) {
    return null;
  }
}

server.listen(port, host, async () => {
  // Box inner width is 38 (count of ═ between ╔ and ╗). Center the title
  // dynamically so the right border stays aligned regardless of version length.
  const innerWidth = 38;
  const version = require(path.join(__dirname, '..', '..', '..', 'package.json')).version;
  const title = `TermDeck v${version}`;
  const leftPad = Math.max(0, Math.floor((innerWidth - title.length) / 2));
  const titleLine = ' '.repeat(leftPad) + title + ' '.repeat(Math.max(0, innerWidth - leftPad - title.length));

  console.log(`
  ╔══════════════════════════════════════╗
  ║${titleLine}║
  ╠══════════════════════════════════════╣
  ║  ${url.padEnd(34)}  ║
  ║                                      ║
  ║  Ctrl+C to stop                      ║
  ╚══════════════════════════════════════╝
  `);

  if (firstRun) {
    console.log("  First run detected. Open http://localhost:3000 and click 'config' to set up.\n");
  }

  // Run preflight health checks (non-blocking — warn but don't prevent startup)
  runPreflight(config).then((result) => {
    printHealthBanner(result);
  }).catch((err) => {
    console.error(`  \x1b[31m[health] Preflight failed: ${err.message}\x1b[0m\n`);
  });

  // Sprint 28 T3: fire-and-forget update-check banner. Lazy-required so users
  // who never start the server don't pay the require cost. Errors are swallowed
  // inside the module; never blocks startup. Double-protected (try/catch around
  // the require + swallowed .catch on the promise) so a missing or broken T3
  // module can never break startup.
  try {
    const { checkAndPrintHint } = require(path.join(__dirname, 'update-check.js'));
    checkAndPrintHint(config).catch(() => { /* swallowed inside the module too */ });
  } catch (_e) { /* never block startup on a hint module load failure */ }

  // Sprint 25 T4: Supabase MCP install nudge — runs alongside (not inside)
  // runPreflight. Silent unless RAG is on AND the MCP is missing AND the
  // user hasn't already declared it in ~/.claude/mcp.json.
  checkSupabaseMcpHint(config).then((msg) => {
    if (msg) console.log(`  \x1b[33m[hint]\x1b[0m ${msg}`);
  }).catch(() => { /* silent */ });

  // Skip auto-open in Codespaces/CI (port forwarding handles it)
  const isCodespaces = !!process.env.CODESPACES || !!process.env.GITHUB_CODESPACE_TOKEN;
  const isCI = !!process.env.CI;

  if (!flags.noOpen && !isCodespaces && !isCI) {
    try {
      const { platform } = require('os');
      const cmd = platform() === 'darwin' ? 'open'
        : platform() === 'win32' ? 'start'
        : 'xdg-open';
      execSync(`${cmd} ${url}`, { stdio: 'ignore' });
    } catch (err) {
      console.error('[cli] auto-open browser failed:', err.message);
      console.log(`  Open ${url} in your browser\n`);
    }
  } else if (isCodespaces) {
    console.log(`  Codespaces detected — use the Ports tab to open the browser\n`);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n  Shutting down TermDeck...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000);
});
