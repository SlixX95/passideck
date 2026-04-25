// `termdeck stack` — full-stack launcher.
//
// Node port of scripts/start.sh so users who installed TermDeck via npm
// (where scripts/ is excluded from the published `files` field) get the
// same "boot Mnestra → check Rumen → start TermDeck" experience without
// having to clone the repo.
//
// Numbered output (Step N/4) mirrors scripts/start.sh exactly so anyone
// who has been running the bash version sees identical behavior.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.termdeck');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml');
const SECRETS_FILE = path.join(CONFIG_DIR, 'secrets.env');
const DEFAULT_MNESTRA_PORT = parseInt(process.env.MNESTRA_PORT || '37778', 10);
const MNESTRA_LOG = path.join(os.tmpdir(), 'termdeck-mnestra.log');

const ANSI = {
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', blue: '\x1b[34m',
  dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m',
};

const LINE_WIDTH = 52;

function stepLine(step, label, status, detail) {
  const prefix = `Step ${step}: ${label} `;
  const padCount = Math.max(3, LINE_WIDTH - prefix.length);
  const dots = '.'.repeat(padCount);
  const tag = ({
    OK:   `${ANSI.green}OK${ANSI.reset}  `,
    WARN: `${ANSI.yellow}WARN${ANSI.reset}`,
    SKIP: `${ANSI.dim}SKIP${ANSI.reset}`,
    FAIL: `${ANSI.red}FAIL${ANSI.reset}`,
    BOOT: `${ANSI.green}BOOT${ANSI.reset}`,
  })[status] || status;
  if (detail) {
    process.stdout.write(`${prefix}${ANSI.dim}${dots}${ANSI.reset} ${tag}  ${ANSI.dim}${detail}${ANSI.reset}\n`);
  } else {
    process.stdout.write(`${prefix}${ANSI.dim}${dots}${ANSI.reset} ${tag}\n`);
  }
}

function subNote(msg) {
  process.stdout.write(`  ${ANSI.dim}└ ${msg}${ANSI.reset}\n`);
}

// ── Args ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { extra: [], port: null, noMnestra: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' && argv[i + 1]) { out.port = parseInt(argv[++i], 10); continue; }
    if (a.startsWith('--port=')) { out.port = parseInt(a.split('=')[1], 10); continue; }
    if (a === '--no-mnestra') { out.noMnestra = true; continue; }
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    out.extra.push(a);
  }
  return out;
}

function printHelp() {
  process.stdout.write(`
  termdeck stack — boot Mnestra (if installed) + check Rumen + start TermDeck

  Usage:
    termdeck stack                    Start whole stack on port 3000
    termdeck stack --port 8080        Custom TermDeck port
    termdeck stack --no-mnestra       Skip Mnestra autostart (Tier-1-only run)
    termdeck stack -- --no-open       Pass-through flags after -- go to termdeck

  Environment:
    MNESTRA_PORT=37778                Mnestra healthz port (default 37778)
    TERMDECK_PORT=3000                Default TermDeck port

  Config:
    ~/.termdeck/config.yaml          mnestra.autoStart: true|false controls Step 2
    ~/.termdeck/secrets.env          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
                                     DATABASE_URL, OPENAI_API_KEY
`);
}

// ── First-run bootstrap ─────────────────────────────────────────────

const FIRST_RUN_CONFIG = `# TermDeck config (auto-generated on first run by \`termdeck stack\`)
# Full reference: config/config.example.yaml in the TermDeck repo.

port: 3000
host: 127.0.0.1
shell: /bin/zsh

defaultTheme: tokyo-night

# Mnestra (pgvector memory store) — auto-start on stack launch
mnestra:
  autoStart: true

# Add your projects here to enable \`cc <project>\` shorthand + auto-cd.
projects:
  # my-project:
  #   path: ~/code/my-project
  #   defaultTheme: catppuccin-mocha
  #   defaultCommand: claude

rag:
  enabled: false
  syncIntervalMs: 10000

sessionLogs:
  enabled: false
`;

function ensureFirstRunConfig() {
  if (fs.existsSync(CONFIG_FILE)) return false;
  process.stdout.write(`  ${ANSI.blue}ⓘ${ANSI.reset} First run detected — creating ${CONFIG_FILE}\n`);
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, FIRST_RUN_CONFIG, { mode: 0o600 });
  subNote(`Edit ${CONFIG_FILE} to add projects or tweak defaults.`);
  subNote(`Open http://localhost:3000 and click 'config' to complete setup`);
  process.stdout.write('\n');
  return true;
}

// ── Step 1: Load secrets ─────────────────────────────────────────────

function loadSecrets() {
  if (!fs.existsSync(SECRETS_FILE)) {
    stepLine('1/4', 'Loading secrets', 'SKIP', `(no ${SECRETS_FILE} — Tier 1 only)`);
    return 0;
  }
  const raw = fs.readFileSync(SECRETS_FILE, 'utf8');
  let count = 0;
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      // Strip surrounding quotes if present
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[m[1]] = val;
    }
    count++;
  }
  stepLine('1/4', 'Loading secrets', 'OK', `(${count} keys from ${SECRETS_FILE})`);
  return count;
}

// ── Port helpers ────────────────────────────────────────────────────

function isPortFree(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host || '0.0.0.0');
  });
}

function lsofPids(port) {
  // macOS/Linux only — Windows callers fall through to the busy-port branch
  // and get a manual remediation message.
  if (process.platform === 'win32') return [];
  const r = spawnSync('lsof', ['-ti', `TCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return [];
  return r.stdout.trim().split('\n').filter(Boolean).map((p) => parseInt(p, 10));
}

function isPidTermDeck(pid) {
  if (process.platform === 'win32') return false;
  const r = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
  if (r.status !== 0) return false;
  return /packages\/cli\/src\/index\.js|termdeck/.test(r.stdout || '');
}

async function reclaimPort(port) {
  const pids = lsofPids(port);
  if (pids.length === 0) return { reclaimed: false, blockerPids: [] };
  const termdeckPids = pids.filter(isPidTermDeck);
  if (termdeckPids.length === 0) return { reclaimed: false, blockerPids: pids };
  for (const pid of termdeckPids) {
    try { process.kill(pid, 'SIGTERM'); } catch (_e) { /* already dead */ }
  }
  await new Promise((r) => setTimeout(r, 1000));
  for (const pid of termdeckPids) {
    try { process.kill(pid, 'SIGKILL'); } catch (_e) { /* already dead */ }
  }
  subNote(`Killed stale TermDeck on port ${port} (PIDs: ${termdeckPids.join(' ')})`);
  return { reclaimed: true, blockerPids: [] };
}

// ── Step 2: Mnestra ─────────────────────────────────────────────────

function which(cmd) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(finder, [cmd], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const first = (r.stdout || '').split('\n')[0].trim();
  return first || null;
}

function resolveMnestraCommand() {
  const onPath = which('mnestra');
  if (onPath) return { kind: 'bin', cmd: 'mnestra', args: ['serve'] };
  const local = path.join(HOME, 'Documents', 'Graciella', 'engram', 'dist', 'mcp-server', 'index.js');
  if (fs.existsSync(local)) return { kind: 'node', cmd: process.execPath, args: [local, 'serve'] };
  return null;
}

function readMnestraAutoStart() {
  if (!fs.existsSync(CONFIG_FILE)) return 'unset';
  const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
  // Lightweight parse — full yaml.parse not needed and avoids loading the
  // server's yaml dep at this stage.
  const m = raw.match(/^mnestra:\s*\n((?:\s+[^\n]*\n)+)/m);
  if (!m) return 'unset';
  const block = m[1];
  const auto = block.match(/^\s+autoStart:\s*(true|false)\s*$/m);
  if (!auto) return 'unset';
  return auto[1];
}

async function httpJson(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      let body = ''; res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function mnestraHealth(port) {
  try {
    const j = await httpJson(`http://localhost:${port}/healthz`, 2000);
    const rows = (j.store && j.store.rows) ?? j.total ?? j.memories ?? j.count ?? null;
    return { up: true, rows: rows == null ? 0 : Number(rows) };
  } catch (_e) {
    return { up: false, rows: 0 };
  }
}

function spawnMnestraDetached(resolved) {
  const out = fs.openSync(MNESTRA_LOG, 'a');
  const err = fs.openSync(MNESTRA_LOG, 'a');
  const child = spawn(resolved.cmd, resolved.args, {
    detached: true,
    stdio: ['ignore', out, err],
    env: process.env,
  });
  child.unref();
  return child.pid;
}

async function waitForMnestra(port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const h = await mnestraHealth(port);
    if (h.up) return h;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { up: false, rows: 0 };
}

async function startMnestra({ skip }) {
  if (skip) {
    stepLine('2/4', 'Starting Mnestra', 'SKIP', '(--no-mnestra flag)');
    return { active: false };
  }
  const resolved = resolveMnestraCommand();
  const autoStart = readMnestraAutoStart();
  const port = DEFAULT_MNESTRA_PORT;

  // Already running?
  const existingPids = lsofPids(port);
  if (existingPids.length > 0) {
    const h = await mnestraHealth(port);
    if (h.up && h.rows > 0) {
      stepLine('2/4', 'Starting Mnestra', 'OK', `(already running, ${h.rows.toLocaleString()} memories)`);
      return { active: true, rows: h.rows, port };
    }
    if (h.up && h.rows === 0) {
      // Running but empty — kill and restart with secrets loaded
      for (const pid of existingPids) { try { process.kill(pid, 'SIGTERM'); } catch (_e) { /* dead */ } }
      await new Promise((r) => setTimeout(r, 1000));
      for (const pid of existingPids) { try { process.kill(pid, 'SIGKILL'); } catch (_e) { /* dead */ } }
      if (!resolved) {
        stepLine('2/4', 'Starting Mnestra', 'FAIL', '(0 memories, killed; mnestra binary not found to restart)');
        return { active: false };
      }
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        stepLine('2/4', 'Starting Mnestra', 'WARN', '(killed; SUPABASE_URL/SERVICE_ROLE_KEY missing in secrets.env)');
        return { active: false };
      }
      spawnMnestraDetached(resolved);
      const after = await waitForMnestra(port);
      if (after.up && after.rows > 0) {
        stepLine('2/4', 'Starting Mnestra', 'OK', `(restarted with secrets, ${after.rows.toLocaleString()} memories)`);
        return { active: true, rows: after.rows, port };
      }
      stepLine('2/4', 'Starting Mnestra', 'WARN', '(restarted but store empty — check Supabase connection)');
      return { active: false };
    }
    stepLine('2/4', 'Starting Mnestra', 'WARN', `(port ${port} held by non-Mnestra process)`);
    return { active: false };
  }

  if (!resolved) {
    stepLine('2/4', 'Starting Mnestra', 'SKIP', '(not installed — npm install -g @jhizzard/mnestra)');
    return { active: false };
  }
  if (autoStart === 'false') {
    stepLine('2/4', 'Starting Mnestra', 'SKIP', '(autoStart: false in config.yaml)');
    return { active: false };
  }
  if (autoStart === 'unset') {
    stepLine('2/4', 'Starting Mnestra', 'SKIP', `(set mnestra.autoStart: true in ${CONFIG_FILE})`);
    return { active: false };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    stepLine('2/4', 'Starting Mnestra', 'WARN', `(SUPABASE_URL/SERVICE_ROLE_KEY missing in ${SECRETS_FILE})`);
    return { active: false };
  }
  spawnMnestraDetached(resolved);
  const after = await waitForMnestra(port);
  if (after.up && after.rows > 0) {
    stepLine('2/4', 'Starting Mnestra', 'OK', `(${after.rows.toLocaleString()} memories on :${port})`);
    return { active: true, rows: after.rows, port };
  }
  if (after.up) {
    stepLine('2/4', 'Starting Mnestra', 'WARN', `(started on :${port} but store is empty)`);
    return { active: false };
  }
  stepLine('2/4', 'Starting Mnestra', 'FAIL', `(did not come up within 10s — ${MNESTRA_LOG})`);
  return { active: false };
}

// ── Step 3: Rumen ───────────────────────────────────────────────────

async function checkRumen() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    stepLine('3/4', 'Checking Rumen', 'SKIP', '(DATABASE_URL not set in secrets.env)');
    return { ago: null };
  }
  let pg;
  try { pg = require('pg'); } catch (_e) { pg = null; }
  if (!pg) {
    stepLine('3/4', 'Checking Rumen', 'SKIP', '(pg module not available)');
    return { ago: null };
  }
  const pool = new pg.Pool({ connectionString: dbUrl, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const r = await pool.query("SELECT to_char(NOW() - MAX(created_at), 'HH24:MI:SS') AS ago FROM rumen_jobs");
    const ago = r.rows[0] && r.rows[0].ago;
    if (ago) {
      stepLine('3/4', 'Checking Rumen', 'OK', `(last job ${ago} ago)`);
      return { ago };
    }
    stepLine('3/4', 'Checking Rumen', 'WARN', '(no jobs yet — try termdeck init --rumen)');
    return { ago: null };
  } catch (err) {
    if (/relation .*rumen_jobs.* does not exist/i.test(String(err.message))) {
      stepLine('3/4', 'Checking Rumen', 'SKIP', '(rumen_jobs table not present — run termdeck init --rumen)');
    } else {
      stepLine('3/4', 'Checking Rumen', 'WARN', `(query failed: ${err.message})`);
    }
    return { ago: null };
  } finally {
    await pool.end().catch(() => {});
  }
}

// ── Step 4: TermDeck ────────────────────────────────────────────────

function execTermDeck({ port, extra }) {
  // Spawn a fresh node process for the CLI rather than require()-ing it
  // in-process. Two reasons:
  //   1. require() hits Node's module cache after stack.js → index.js →
  //      stack.js bounces (the v0.5.0 auto-orchestrate path), so the
  //      cached index.js is a no-op and the server never starts. This
  //      manifested in `scripts/start.sh` which already exec'd node, then
  //      v0.5.0's auto-orchestrate routed it back through stack.js, then
  //      stack.js tried to re-require the (cached) CLI — silent exit.
  //   2. Pass --no-stack on the way back so index.js definitively skips
  //      the auto-orchestrate detection. Defensive even with the spawn.
  const cliPath = path.join(__dirname, 'index.js');
  const argv = [cliPath, '--no-stack'];
  if (port) argv.push('--port', String(port));
  argv.push(...extra);
  const child = spawn(process.execPath, argv, {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code == null ? 0 : code);
  });
  // Forward Ctrl+C cleanly so the spawned server can shut down.
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => { try { child.kill(sig); } catch (_e) { /* gone */ } });
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main(rawArgs) {
  const args = parseArgs(rawArgs);
  if (args.help) { printHelp(); return 0; }

  const port = args.port || parseInt(process.env.TERMDECK_PORT || '3000', 10);

  process.stdout.write(`\n${ANSI.bold}TermDeck Stack Launcher${ANSI.reset}\n`);
  process.stdout.write(`${ANSI.dim}─────────────────────────────────────────────────${ANSI.reset}\n\n`);

  // Node 18+ check
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor < 18) {
    process.stderr.write(`  ${ANSI.red}✗ Node ${nodeMajor} detected — TermDeck requires Node 18+. Current: ${process.version}${ANSI.reset}\n`);
    return 1;
  }

  ensureFirstRunConfig();

  loadSecrets();

  // Port reclaim — kill stale TermDeck on the port; refuse if held by something else
  const free = await isPortFree(port, '127.0.0.1');
  if (!free) {
    const claim = await reclaimPort(port);
    if (!claim.reclaimed) {
      const blockers = claim.blockerPids.length ? ` (PIDs: ${claim.blockerPids.join(' ')})` : '';
      process.stderr.write(`  ${ANSI.red}✗${ANSI.reset} Port ${port} is in use by a non-TermDeck process${blockers}\n`);
      subNote(`Try a different port: termdeck stack --port ${port + 1}`);
      return 1;
    }
  }

  const mnestra = await startMnestra({ skip: args.noMnestra });

  // MCP config hint
  if (mnestra.active) {
    const mcpPath = path.join(HOME, '.claude', 'mcp.json');
    let needsHint = !fs.existsSync(mcpPath);
    if (!needsHint) {
      try {
        const j = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
        if (!JSON.stringify(j).includes('mnestra')) needsHint = true;
      } catch (_e) { needsHint = true; }
    }
    if (needsHint) subNote(`Hint: add a 'mnestra' entry to ~/.claude/mcp.json for Claude Code`);
  }

  const rumen = await checkRumen();

  // Stack summary
  const summary = [`TermDeck :${port}`];
  if (mnestra.active) summary.push(`Mnestra :${mnestra.port} (${mnestra.rows.toLocaleString()})`);
  if (rumen.ago) summary.push(`Rumen (${rumen.ago} ago)`);

  stepLine('4/4', 'Starting TermDeck', 'BOOT', `(port ${port})`);
  process.stdout.write(`\n  ${ANSI.bold}Stack:${ANSI.reset} ${ANSI.green}${summary.join(' | ')}${ANSI.reset}\n\n`);

  execTermDeck({ port, extra: args.extra });
  return 0;
}

module.exports = function (argv) {
  return main(argv).catch((err) => {
    process.stderr.write(`[stack] failed: ${err && err.stack || err}\n`);
    return 1;
  });
};
