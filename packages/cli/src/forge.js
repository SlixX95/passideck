#!/usr/bin/env node

// `termdeck forge` — Tier 5 SkillForge: autonomous skill generation from
// Mnestra memories. This file is the CLI surface only; the Opus prompt
// template (T2) and skill installer (T3) land in packages/server/src/.
//
// Sprint 20 scope (T1):
//   1. Parse flags (--dry-run, --yes, --max-cost, --min-confidence)
//   2. Connect to Mnestra /healthz and read the memory count
//   3. Project cost based on memory count × avg tokens × Opus pricing
//   4. Prompt for confirmation (skip with --yes or --dry-run)
//
// Steps 5–7 (Opus call, skill parsing, install) print a "Coming in v0.5"
// stub so the command exits cleanly for anyone who tries it early.

const http = require('http');
const path = require('path');

// Opus pricing (per million tokens) — keep in sync with
// https://www.anthropic.com/pricing when it changes.
const OPUS_PRICE_INPUT_PER_M = 15;
const OPUS_PRICE_OUTPUT_PER_M = 75;
// Each memory expands to ~200 input tokens once formatted into the forge
// prompt. Output is roughly 20% of input (skills are compact markdown).
const AVG_TOKENS_PER_MEMORY = 200;
const OUTPUT_TO_INPUT_RATIO = 0.2;

const HELP = [
  '',
  'TermDeck SkillForge (experimental)',
  '',
  'Usage: termdeck forge [flags]',
  '',
  'Flags:',
  '  --help            Print this message and exit',
  '  --dry-run         Show the cost projection and exit without prompting',
  '  --yes             Skip the confirmation prompt (implies you accept the cost)',
  '  --max-cost <usd>  Abort if projected cost exceeds this dollar amount',
  '  --min-confidence  Minimum confidence score (0.0–1.0) for generated skills',
  '',
  'What this does (Sprint 20 preview):',
  '  1. Reads memory count from Mnestra',
  '  2. Projects the Opus cost for generating skills from those memories',
  '  3. Asks for confirmation',
  '  4. (v0.5) Calls Opus, parses skills, installs to ~/.claude/skills/',
  ''
].join('\n');

function parseFlags(argv) {
  const out = {
    help: false,
    dryRun: false,
    yes: false,
    maxCost: null,
    minConfidence: null
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      out.help = true;
    } else if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--yes' || a === '-y') {
      out.yes = true;
    } else if (a === '--max-cost' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`--max-cost must be a non-negative number, got: ${argv[i + 1]}`);
      }
      out.maxCost = n;
      i++;
    } else if (a === '--min-confidence' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        throw new Error(`--min-confidence must be between 0 and 1, got: ${argv[i + 1]}`);
      }
      out.minConfidence = n;
      i++;
    }
  }
  return out;
}

function httpGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Mnestra's /healthz returns one of several shapes depending on version; we
// probe all the documented keys and return the first numeric match. The same
// extraction logic lives in preflight.js — keep them in sync if the response
// format changes.
function extractMemoryCount(data) {
  if (!data || typeof data !== 'object') return null;
  const candidates = [
    data.store && data.store.rows,
    data.total,
    data.memories,
    data.count
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

async function fetchMemoryCount(config) {
  const rag = (config && config.rag) || {};
  const baseUrl = rag.mnestraWebhookUrl
    ? rag.mnestraWebhookUrl.replace(/\/mnestra\/?$/, '')
    : 'http://localhost:37778';
  const url = `${baseUrl}/healthz`;
  const body = await httpGet(url, 3000);
  let data;
  try { data = JSON.parse(body); } catch (err) {
    throw new Error(`Mnestra /healthz returned non-JSON: ${err.message}`);
  }
  const count = extractMemoryCount(data);
  if (count == null) {
    throw new Error(`Mnestra reachable at ${url} but no memory count in response`);
  }
  return { count, url };
}

function projectCost(memoryCount) {
  const inputTokens = memoryCount * AVG_TOKENS_PER_MEMORY;
  const outputTokens = Math.round(inputTokens * OUTPUT_TO_INPUT_RATIO);
  const inputCost = (inputTokens / 1_000_000) * OPUS_PRICE_INPUT_PER_M;
  const outputCost = (outputTokens / 1_000_000) * OPUS_PRICE_OUTPUT_PER_M;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost
  };
}

function formatUSD(n) {
  return `$${n.toFixed(2)}`;
}

function formatTokens(n) {
  return Number(n).toLocaleString();
}

function printProjection(count, mnestraUrl, cost, flags) {
  const dim = '\x1b[2m';
  const bold = '\x1b[1m';
  const reset = '\x1b[0m';
  process.stdout.write('\n');
  process.stdout.write(`  ${bold}TermDeck SkillForge (experimental)${reset}\n`);
  process.stdout.write(`  ${dim}Mnestra: ${mnestraUrl}${reset}\n\n`);
  process.stdout.write(`  Memories to analyze:  ${bold}${formatTokens(count)}${reset}\n`);
  process.stdout.write(`  Estimated input:      ${formatTokens(cost.inputTokens)} tokens  (${formatUSD(cost.inputCost)})\n`);
  process.stdout.write(`  Estimated output:     ${formatTokens(cost.outputTokens)} tokens  (${formatUSD(cost.outputCost)})\n`);
  process.stdout.write(`  ${bold}Estimated total:      ${formatUSD(cost.totalCost)}${reset}\n`);
  if (flags.minConfidence != null) {
    process.stdout.write(`  ${dim}Min confidence:       ${flags.minConfidence}${reset}\n`);
  }
  if (flags.maxCost != null) {
    process.stdout.write(`  ${dim}Max cost cap:         ${formatUSD(flags.maxCost)}${reset}\n`);
  }
  process.stdout.write('\n');
}

async function askYesNo(question) {
  // Lazy-require to avoid pulling readline until we actually prompt. Mirrors
  // the pattern used by init-mnestra.js.
  const setupDir = path.join(__dirname, '..', '..', 'server', 'src', 'setup');
  const { prompts } = require(setupDir);
  try {
    return await prompts.confirm(question, { defaultYes: false });
  } finally {
    prompts.closeRl();
  }
}

async function forge(argv) {
  let flags;
  try {
    flags = parseFlags(argv || []);
  } catch (err) {
    process.stderr.write(`[forge] ${err.message}\n`);
    return 1;
  }

  if (flags.help) {
    process.stdout.write(HELP);
    return 0;
  }

  // Load config lazily — loading it triggers the "[config] Loaded from …"
  // banner, which we only want when the command is actually running.
  const { loadConfig } = require(path.join(__dirname, '..', '..', 'server', 'src', 'config.js'));
  const config = loadConfig();

  let memoryInfo;
  try {
    memoryInfo = await fetchMemoryCount(config);
  } catch (err) {
    process.stderr.write(`[forge] Could not reach Mnestra: ${err.message}\n`);
    process.stderr.write(`[forge] Start Mnestra with \`mnestra serve\` and retry.\n`);
    return 1;
  }

  if (memoryInfo.count === 0) {
    process.stderr.write(`[forge] Mnestra has 0 memories — run \`mnestra ingest\` before forging skills.\n`);
    return 1;
  }

  const cost = projectCost(memoryInfo.count);
  printProjection(memoryInfo.count, memoryInfo.url, cost, flags);

  if (flags.maxCost != null && cost.totalCost > flags.maxCost) {
    process.stderr.write(`[forge] Projected cost ${formatUSD(cost.totalCost)} exceeds --max-cost ${formatUSD(flags.maxCost)}. Aborting.\n`);
    return 2;
  }

  if (flags.dryRun) {
    process.stdout.write('[forge] --dry-run: stopping before Opus call.\n');
    return 0;
  }

  if (!flags.yes) {
    const ok = await askYesNo(`  Proceed and spend ~${formatUSD(cost.totalCost)} on Opus?`);
    if (!ok) {
      process.stdout.write('[forge] Aborted by user.\n');
      return 0;
    }
  }

  // Steps 4–7 are deliberately stubbed for Sprint 20 — the Opus call, skill
  // parsing, and installer land in Sprint 21 (T2 + T3 ship the building
  // blocks).
  process.stdout.write('\n');
  process.stdout.write('[forge] Skill generation coming in v0.5.\n');
  process.stdout.write('[forge]   - Opus call:        wired in Sprint 21 (T2 forge-prompt.js)\n');
  process.stdout.write('[forge]   - Skill installer:  wired in Sprint 21 (T3 skill-installer.js)\n');
  return 0;
}

module.exports = forge;
module.exports.parseFlags = parseFlags;
module.exports.projectCost = projectCost;
module.exports.extractMemoryCount = extractMemoryCount;
