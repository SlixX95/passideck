// Targeted writer for ~/.termdeck/config.yaml that the `init --mnestra` wizard
// uses to flip `rag.enabled: true` and point secret fields at `${VAR}` refs
// instead of inline values.
//
// Uses the `yaml` package (already a dep) for a full parse + stringify round
// trip. Comments WILL be lost on rewrite — yaml.stringify doesn't preserve
// them. We back up the original to a timestamped `.bak` file first so the
// user can recover any hand-written comments.
//
// If config.yaml doesn't exist yet, this helper lets the server's own
// loadConfig() create the default template on next startup — it does NOT
// write a fresh template itself.

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_DIR = path.join(os.homedir(), '.termdeck');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.yaml');

function loadYaml() {
  const yaml = require('yaml');
  if (!fs.existsSync(CONFIG_PATH)) return { parsed: {}, existed: false };
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  try {
    const parsed = yaml.parse(raw) || {};
    return { parsed, existed: true };
  } catch (err) {
    throw new Error(`config.yaml exists but is not valid YAML — refusing to rewrite: ${err.message}`);
  }
}

function backup() {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `${CONFIG_PATH}.${ts}.bak`;
  fs.copyFileSync(CONFIG_PATH, bak);
  return bak;
}

// Update the `rag.*` section of config.yaml. Pass only fields you want to
// change — everything else (projects, themes, sessionLogs, etc.) is preserved.
// Secret fields should be `${VAR}` references, not raw keys.
function updateRagConfig(updates) {
  const yaml = require('yaml');
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

  const { parsed, existed } = loadYaml();
  const rag = (parsed.rag && typeof parsed.rag === 'object') ? parsed.rag : {};

  // Merge in a well-defined order so the output is readable.
  const merged = {
    enabled: updates.enabled != null ? updates.enabled : (rag.enabled != null ? rag.enabled : false),
    supabaseUrl: updates.supabaseUrl || rag.supabaseUrl || '${SUPABASE_URL}',
    supabaseKey: updates.supabaseKey || rag.supabaseKey || '${SUPABASE_SERVICE_ROLE_KEY}',
    openaiApiKey: updates.openaiApiKey || rag.openaiApiKey || '${OPENAI_API_KEY}',
    anthropicApiKey: updates.anthropicApiKey || rag.anthropicApiKey || '${ANTHROPIC_API_KEY}',
    syncIntervalMs: rag.syncIntervalMs != null ? rag.syncIntervalMs : 10000,
    mnestraMode: rag.mnestraMode || 'direct',
    mnestraWebhookUrl: rag.mnestraWebhookUrl || 'http://localhost:37778/mnestra'
  };

  // Preserve any fields we didn't explicitly handle (e.g. tables, developerId).
  for (const [k, v] of Object.entries(rag)) {
    if (!(k in merged)) merged[k] = v;
  }
  parsed.rag = merged;

  const bak = existed ? backup() : null;
  fs.writeFileSync(CONFIG_PATH, yaml.stringify(parsed), 'utf-8');
  return { path: CONFIG_PATH, backup: bak };
}

// Scan loaded parsed config for literal inline secrets in the rag section.
// Returns an array of dot-paths that still look like raw values (not ${VAR}).
function findInlineSecrets() {
  const { parsed, existed } = loadYaml();
  if (!existed) return [];
  const rag = parsed.rag || {};
  const hits = [];
  const fields = ['supabaseKey', 'openaiApiKey', 'anthropicApiKey', 'supabaseUrl'];
  for (const f of fields) {
    const v = rag[f];
    if (typeof v !== 'string') continue;
    if (!v) continue;
    const isEnvRef = /^\$\{[A-Z0-9_]+(?::-[^}]*)?\}$/i.test(v.trim());
    if (!isEnvRef) hits.push(`rag.${f}`);
  }
  return hits;
}

module.exports = {
  CONFIG_PATH,
  CONFIG_DIR,
  loadYaml,
  updateRagConfig,
  findInlineSecrets,
  _backup: backup
};
