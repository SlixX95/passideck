#!/usr/bin/env node

// @jhizzard/termdeck-stack — one-command installer for the TermDeck
// developer memory stack.
//
// Usage:
//   npx @jhizzard/termdeck-stack          interactive wizard
//   npx @jhizzard/termdeck-stack --tier 4 unattended (1|2|3|4)
//   npx @jhizzard/termdeck-stack --dry-run print plan, don't install
//
// The wizard:
//   1. Prints the four-layer overview so the user understands what
//      they're agreeing to.
//   2. Detects which pieces are already installed.
//   3. Asks (or accepts via --tier) which layers to install.
//   4. Runs `npm install -g` for missing pieces.
//   5. Merges entries into ~/.claude/mcp.json for Mnestra and
//      Supabase MCP — preserving any existing entries.
//   6. Prints next steps.
//
// Zero runtime deps beyond Node built-ins; readline/promises handles
// the prompt without bringing in inquirer or prompts as a dep.

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline/promises');
const { spawn, spawnSync } = require('node:child_process');

const ANSI = {
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', blue: '\x1b[34m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', dim: '\x1b[2m', bold: '\x1b[1m',
  reset: '\x1b[0m',
};

const HOME = os.homedir();
const MCP_CONFIG = path.join(HOME, '.claude', 'mcp.json');

const LAYERS = [
  {
    tier: 1,
    pkg: '@jhizzard/termdeck',
    bin: 'termdeck',
    label: 'TermDeck',
    role: 'Browser terminal multiplexer with metadata overlays, panel theming, and Flashback recall toasts. Tier-1 ready out of the box.',
    required: true,
  },
  {
    tier: 2,
    pkg: '@jhizzard/mnestra',
    bin: 'mnestra',
    label: 'Mnestra',
    role: 'pgvector memory store + MCP server. Lights up Flashback in TermDeck and provides memory_recall / memory_remember tools to Claude Code, Cursor, and Windsurf.',
  },
  {
    tier: 3,
    pkg: '@jhizzard/rumen',
    bin: null, // no global bin — used as library + tsx scripts
    label: 'Rumen',
    role: 'Async learning loop. Synthesizes insights across projects on a Supabase Edge Function cron. Surfaces patterns Flashback alone wouldn\'t catch.',
  },
  {
    tier: 4,
    pkg: '@supabase/mcp-server-supabase',
    bin: 'mcp-server-supabase',
    label: 'Supabase MCP',
    role: 'MCP server that lets the TermDeck setup wizard provision your Supabase project automatically — replaces the 4-credential paste step with a project picker.',
  },
];

// ── Args ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { tier: null, dryRun: false, help: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tier' && argv[i + 1]) { out.tier = parseInt(argv[++i], 10); continue; }
    if (a.startsWith('--tier=')) { out.tier = parseInt(a.split('=')[1], 10); continue; }
    if (a === '--dry-run') { out.dryRun = true; continue; }
    if (a === '--yes' || a === '-y') { out.yes = true; continue; }
    if (a === '--help' || a === '-h') { out.help = true; continue; }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`
  termdeck-stack — install the TermDeck developer memory stack

  Usage:
    npx @jhizzard/termdeck-stack          Interactive wizard
    npx @jhizzard/termdeck-stack --tier 4 Unattended install (1|2|3|4)
    npx @jhizzard/termdeck-stack --dry-run Print plan, don't install
    npx @jhizzard/termdeck-stack --yes    Accept all prompts (combine with --tier)

  Tiers:
    1  TermDeck only
    2  TermDeck + Mnestra (Flashback works)
    3  + Rumen (async learning)
    4  + Supabase MCP (one-click setup wizard)
`);
}

// ── Pretty output helpers ───────────────────────────────────────────

function box(title) {
  const inner = 65;
  const padded = ` ${title} `.padEnd(inner);
  process.stdout.write(`${ANSI.bold}╔${'═'.repeat(inner)}╗${ANSI.reset}\n`);
  process.stdout.write(`${ANSI.bold}║${padded}║${ANSI.reset}\n`);
  process.stdout.write(`${ANSI.bold}╚${'═'.repeat(inner)}╝${ANSI.reset}\n\n`);
}

function rule() {
  process.stdout.write(`${ANSI.dim}${'─'.repeat(67)}${ANSI.reset}\n`);
}

function statusLine(emoji, label, detail) {
  const padded = label.padEnd(38);
  process.stdout.write(`  ${emoji} ${padded}${ANSI.dim}${detail || ''}${ANSI.reset}\n`);
}

// ── Detection ───────────────────────────────────────────────────────

function nodeVersion() {
  return process.version.slice(1); // strip leading 'v'
}

function npmVersion() {
  const r = spawnSync('npm', ['--version'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return (r.stdout || '').trim() || null;
}

function detectGlobalPackage(pkg) {
  // `npm ls -g <pkg> --depth=0 --json` — robust across npm versions.
  const r = spawnSync('npm', ['ls', '-g', pkg, '--depth=0', '--json'], { encoding: 'utf8' });
  if (!r.stdout) return null;
  try {
    const parsed = JSON.parse(r.stdout);
    const found = parsed.dependencies && parsed.dependencies[pkg];
    if (found && found.version) return found.version;
  } catch (_e) { /* fall through */ }
  return null;
}

function detectAll() {
  const node = nodeVersion();
  const npm = npmVersion();
  const layers = LAYERS.map((l) => ({
    ...l,
    installedVersion: detectGlobalPackage(l.pkg),
  }));
  return { node, npm, layers };
}

// ── Layered overview ────────────────────────────────────────────────

function printOverview() {
  process.stdout.write(`${ANSI.cyan}The TermDeck stack is four packages that compose into a "stateless${ANSI.reset}\n`);
  process.stdout.write(`${ANSI.cyan}LLM, persistent everything else" memory layer for terminal work:${ANSI.reset}\n\n`);

  for (const l of LAYERS) {
    const tag = l.required ? `${ANSI.bold}required${ANSI.reset}` : 'optional';
    process.stdout.write(`  ${ANSI.bold}Layer ${l.tier} (${tag})${ANSI.reset}\n`);
    process.stdout.write(`    ${ANSI.green}${l.pkg}${ANSI.reset}\n`);

    // Word-wrap the role to ~62 cols, indented.
    const words = l.role.split(/\s+/);
    let line = '    ';
    for (const w of words) {
      if (line.length + w.length + 1 > 64) {
        process.stdout.write(`${ANSI.dim}${line}${ANSI.reset}\n`);
        line = '    ' + w;
      } else {
        line += (line.endsWith('    ') ? '' : ' ') + w;
      }
    }
    if (line.trim().length > 0) process.stdout.write(`${ANSI.dim}${line}${ANSI.reset}\n`);
    process.stdout.write('\n');
  }
}

function printDetectionTable(detection) {
  process.stdout.write(`${ANSI.bold}Detecting what's already on this machine...${ANSI.reset}\n\n`);

  if (detection.node) statusLine(`${ANSI.green}✓${ANSI.reset}`, 'Node', `v${detection.node}`);
  else statusLine(`${ANSI.red}✗${ANSI.reset}`, 'Node', 'not detected — install Node 18+ first');

  if (detection.npm) statusLine(`${ANSI.green}✓${ANSI.reset}`, 'npm', detection.npm);
  else statusLine(`${ANSI.red}✗${ANSI.reset}`, 'npm', 'not detected');

  process.stdout.write('\n');

  for (const l of detection.layers) {
    if (l.installedVersion) {
      statusLine(`${ANSI.green}✓${ANSI.reset}`, l.pkg, `v${l.installedVersion} already installed`);
    } else {
      statusLine(`${ANSI.dim}─${ANSI.reset}`, l.pkg, 'not installed');
    }
  }
  process.stdout.write('\n');
}

// ── Tier prompt ─────────────────────────────────────────────────────

async function promptTier({ defaultTier }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write(`${ANSI.bold}Which tier would you like to install?${ANSI.reset}\n`);
  process.stdout.write(`  1) TermDeck only\n`);
  process.stdout.write(`  2) + Mnestra            ${ANSI.dim}(Flashback works)${ANSI.reset}\n`);
  process.stdout.write(`  3) + Rumen              ${ANSI.dim}(async learning across projects)${ANSI.reset}\n`);
  process.stdout.write(`  4) + Supabase MCP       ${ANSI.dim}(one-click setup wizard)${ANSI.reset}\n\n`);
  while (true) {
    const ans = (await rl.question(`  Choice [default ${defaultTier}]: `)).trim();
    if (ans === '') { rl.close(); return defaultTier; }
    const n = parseInt(ans, 10);
    if (n >= 1 && n <= 4) { rl.close(); return n; }
    process.stdout.write(`  ${ANSI.red}Please enter 1, 2, 3, or 4.${ANSI.reset}\n`);
  }
}

// ── Install ─────────────────────────────────────────────────────────

function npmInstallGlobal(pkg) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['install', '-g', pkg], { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code === 0));
  });
}

async function installLayers(plan, opts) {
  process.stdout.write(`\n${ANSI.bold}Installing ${plan.length} package${plan.length === 1 ? '' : 's'}...${ANSI.reset}\n\n`);
  let failures = 0;
  for (let i = 0; i < plan.length; i++) {
    const l = plan[i];
    process.stdout.write(`${ANSI.bold}[${i + 1}/${plan.length}] ${l.pkg}${ANSI.reset}\n`);
    if (opts.dryRun) {
      statusLine(`${ANSI.yellow}↩${ANSI.reset}`, '(dry-run)', `would run: npm install -g ${l.pkg}`);
      continue;
    }
    const ok = await npmInstallGlobal(l.pkg);
    if (ok) statusLine(`${ANSI.green}✓${ANSI.reset}`, l.pkg, 'installed');
    else { statusLine(`${ANSI.red}✗${ANSI.reset}`, l.pkg, 'install failed (continuing)'); failures++; }
    process.stdout.write('\n');
  }
  return failures;
}

// ── ~/.claude/mcp.json wiring ───────────────────────────────────────

function readMcpConfig() {
  if (!fs.existsSync(MCP_CONFIG)) return { mcpServers: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(MCP_CONFIG, 'utf8'));
    if (!parsed.mcpServers) parsed.mcpServers = {};
    return parsed;
  } catch (_e) {
    return { mcpServers: {} };
  }
}

function writeMcpConfig(cfg) {
  fs.mkdirSync(path.dirname(MCP_CONFIG), { recursive: true });
  fs.writeFileSync(MCP_CONFIG, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
}

function wireMcpEntries(plan, opts) {
  if (opts.dryRun) {
    process.stdout.write(`${ANSI.bold}Would wire ~/.claude/mcp.json (dry-run skipped)${ANSI.reset}\n\n`);
    return;
  }
  const cfg = readMcpConfig();
  const installedTiers = new Set(plan.map((l) => l.tier));
  const additions = [];
  const keptExisting = [];

  if (installedTiers.has(2) && !cfg.mcpServers.mnestra) {
    cfg.mcpServers.mnestra = {
      command: 'mnestra',
      env: {
        SUPABASE_URL: '${SUPABASE_URL}',
        SUPABASE_SERVICE_ROLE_KEY: '${SUPABASE_SERVICE_ROLE_KEY}',
        OPENAI_API_KEY: '${OPENAI_API_KEY}',
      },
    };
    additions.push('mnestra');
  } else if (cfg.mcpServers.mnestra) {
    keptExisting.push('mnestra');
  }

  if (installedTiers.has(4) && !cfg.mcpServers.supabase) {
    cfg.mcpServers.supabase = {
      command: 'npx',
      args: ['-y', '@supabase/mcp-server-supabase@latest'],
      env: {
        SUPABASE_ACCESS_TOKEN: 'SUPABASE_PAT_HERE',
      },
    };
    additions.push('supabase');
  } else if (cfg.mcpServers.supabase) {
    keptExisting.push('supabase');
  }

  if (additions.length === 0 && keptExisting.length === 0) return;

  process.stdout.write(`${ANSI.bold}Wiring ~/.claude/mcp.json...${ANSI.reset}\n`);
  for (const name of additions) statusLine(`${ANSI.green}+${ANSI.reset}`, `${name} entry`, 'added');
  for (const name of keptExisting) statusLine(`${ANSI.dim}=${ANSI.reset}`, `${name} entry`, 'already present, kept as-is');
  if (additions.length > 0) writeMcpConfig(cfg);
  process.stdout.write('\n');
}

// ── Next steps ──────────────────────────────────────────────────────

function printNextSteps(plan, opts) {
  rule();
  process.stdout.write(`${ANSI.bold}${ANSI.green}Stack installed.${ANSI.reset}\n\n`);

  const tiers = new Set(plan.map((l) => l.tier));
  let stepNum = 1;

  if (tiers.has(4)) {
    process.stdout.write(`  ${ANSI.bold}${stepNum++}.${ANSI.reset} Mint a Supabase Personal Access Token at:\n`);
    process.stdout.write(`     ${ANSI.cyan}https://supabase.com/dashboard/account/tokens${ANSI.reset}\n`);
    process.stdout.write(`     Then edit ${ANSI.dim}${MCP_CONFIG}${ANSI.reset} and replace ${ANSI.yellow}SUPABASE_PAT_HERE${ANSI.reset}.\n\n`);
  }

  if (tiers.has(2) && !tiers.has(4)) {
    process.stdout.write(`  ${ANSI.bold}${stepNum++}.${ANSI.reset} Configure Tier 2 (Mnestra) credentials. Two options:\n`);
    process.stdout.write(`     • In-browser: run ${ANSI.green}termdeck${ANSI.reset}, click ${ANSI.bold}config${ANSI.reset}, paste credentials in the wizard\n`);
    process.stdout.write(`     • CLI: ${ANSI.green}termdeck init --mnestra${ANSI.reset}\n\n`);
  }

  if (tiers.has(3)) {
    process.stdout.write(`  ${ANSI.bold}${stepNum++}.${ANSI.reset} Deploy Rumen to your Supabase project:\n`);
    process.stdout.write(`     ${ANSI.green}termdeck init --rumen${ANSI.reset}\n\n`);
  }

  process.stdout.write(`  ${ANSI.bold}${stepNum++}.${ANSI.reset} Start the stack:\n`);
  process.stdout.write(`     ${ANSI.green}termdeck${ANSI.reset}\n`);
  if (tiers.has(2)) {
    process.stdout.write(`     ${ANSI.dim}(auto-orchestrates Mnestra and surfaces Rumen status from v0.5.0)${ANSI.reset}\n`);
  }
  process.stdout.write('\n');

  if (opts.dryRun) {
    process.stdout.write(`  ${ANSI.yellow}(--dry-run was set; nothing was actually installed.)${ANSI.reset}\n\n`);
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) { printHelp(); return 0; }

  process.stdout.write('\n');
  box('TermDeck Stack Installer');

  printOverview();
  rule();
  process.stdout.write('\n');

  const detection = detectAll();
  printDetectionTable(detection);

  if (!detection.node) {
    process.stdout.write(`${ANSI.red}Node 18+ is required. Install Node and re-run this script.${ANSI.reset}\n`);
    return 1;
  }
  if (!detection.npm) {
    process.stdout.write(`${ANSI.red}npm is required. Install npm and re-run this script.${ANSI.reset}\n`);
    return 1;
  }

  let tier = args.tier;
  if (!tier) {
    if (args.yes) tier = 4;
    else tier = await promptTier({ defaultTier: 4 });
  }
  if (tier < 1 || tier > 4) {
    process.stdout.write(`${ANSI.red}Invalid tier ${tier}. Must be 1, 2, 3, or 4.${ANSI.reset}\n`);
    return 1;
  }

  const wantedLayers = detection.layers.filter((l) => l.tier <= tier);
  const missingLayers = wantedLayers.filter((l) => !l.installedVersion);

  process.stdout.write(`${ANSI.bold}Plan:${ANSI.reset} install tier ${tier} `);
  if (missingLayers.length === 0) {
    process.stdout.write(`${ANSI.green}— all layers already present.${ANSI.reset}\n\n`);
  } else {
    process.stdout.write(`${ANSI.dim}(${missingLayers.length} of ${wantedLayers.length} layer${wantedLayers.length === 1 ? '' : 's'} missing)${ANSI.reset}\n\n`);
    for (const l of missingLayers) statusLine(`${ANSI.cyan}+${ANSI.reset}`, l.pkg, l.role.split('. ')[0] + '.');
    process.stdout.write('\n');
  }

  let failures = 0;
  if (missingLayers.length > 0) failures = await installLayers(missingLayers, { dryRun: args.dryRun });

  // Wire MCP entries even when nothing was installed — covers the
  // "already had everything but never set up Claude Code MCP" case.
  wireMcpEntries(wantedLayers, { dryRun: args.dryRun });

  printNextSteps(wantedLayers, { dryRun: args.dryRun });

  if (failures > 0) {
    process.stdout.write(`${ANSI.yellow}${failures} package${failures === 1 ? '' : 's'} failed to install — re-run after fixing the underlying npm issue.${ANSI.reset}\n\n`);
    return 1;
  }
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code || 0)).catch((err) => {
    process.stderr.write(`[termdeck-stack] failed: ${err && err.stack || err}\n`);
    process.exit(1);
  });
}

module.exports = main;
