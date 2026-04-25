// TermDeck config loader with secrets.env support (F2.2).
//
// Secrets live in ~/.termdeck/secrets.env (dotenv format) so that
// ~/.termdeck/config.yaml can be committed / shared / reviewed without
// carrying plaintext API keys. Precedence (highest wins):
//
//   1. process.env (as it was at launch)
//   2. ~/.termdeck/secrets.env (loaded here, merged INTO process.env)
//   3. ${VAR} substitutions inside config.yaml
//   4. Inline values in config.yaml (legacy, triggers a deprecation warning)
//   5. Built-in defaults
//
// Never print secret values. The deprecation warning must not echo the leaked
// key — it just names the config.yaml field that still holds an inline secret.

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_DIR = path.join(os.homedir(), '.termdeck');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.yaml');
const SECRETS_PATH = path.join(CONFIG_DIR, 'secrets.env');

// Fields in config.yaml that historically held plaintext secrets. Used to
// emit the one-time deprecation warning on startup.
const LEGACY_SECRET_PATHS = [
  ['rag', 'supabaseKey'],
  ['rag', 'openaiApiKey'],
  ['rag', 'anthropicApiKey']
];

// Very small dotenv parser so we don't take on a dependency for 40 lines of code.
// Supports: KEY=value, KEY="quoted value", KEY='single', blank lines, #comments.
// Does NOT support variable expansion inside values (not needed here).
function parseDotenv(raw) {
  const out = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadSecretsEnv() {
  if (!fs.existsSync(SECRETS_PATH)) return { loaded: false, keys: [] };
  try {
    const raw = fs.readFileSync(SECRETS_PATH, 'utf-8');
    const parsed = parseDotenv(raw);
    const keys = [];
    for (const [k, v] of Object.entries(parsed)) {
      // Do not clobber pre-set process env; shell wins.
      if (process.env[k] === undefined) {
        process.env[k] = v;
      }
      keys.push(k);
    }
    return { loaded: true, keys };
  } catch (err) {
    console.warn('[config] Failed to read secrets.env:', err.message);
    return { loaded: false, keys: [] };
  }
}

// Walk a parsed YAML tree and replace ${VAR} / ${VAR:-default} tokens in any
// string leaf using process.env. Unknown vars → empty string (matches dotenv
// conventions), unless a default is supplied via :-.
function substituteEnv(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/gi, (_m, key, def) => {
      const v = process.env[key];
      if (v !== undefined && v !== '') return v;
      return def !== undefined ? def : '';
    });
  }
  if (Array.isArray(value)) return value.map(substituteEnv);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = substituteEnv(v);
    return out;
  }
  return value;
}

function getPath(obj, segs) {
  let cur = obj;
  for (const s of segs) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[s];
  }
  return cur;
}

// A "secret-shaped" inline value is a non-empty string that is NOT an ${ENV}
// reference. We treat `${FOO}` and `${FOO:-bar}` as safe (just a template).
function looksLikeInlineSecret(v) {
  if (typeof v !== 'string') return false;
  if (!v) return false;
  if (/^\$\{[A-Z0-9_]+(?::-[^}]*)?\}$/i.test(v.trim())) return false;
  return true;
}

function warnIfLegacyInlineSecrets(parsed, secretsLoaded) {
  if (secretsLoaded) return; // secrets.env exists — user has migrated, don't nag.
  const hits = [];
  for (const segs of LEGACY_SECRET_PATHS) {
    const v = getPath(parsed, segs);
    if (looksLikeInlineSecret(v)) hits.push(segs.join('.'));
  }
  if (hits.length > 0) {
    console.warn(
      `[config] WARNING: secrets in config.yaml are deprecated — move them to ~/.termdeck/secrets.env ` +
      `(see config/secrets.env.example). Fields still inline: ${hits.join(', ')}`
    );
  }
}

function defaultConfig() {
  return {
    port: 3000,
    host: '127.0.0.1',
    shell: process.env.SHELL || '/bin/bash',
    defaultTheme: 'tokyo-night',
    projects: {},
    rag: {
      enabled: false,
      supabaseUrl: null,
      supabaseKey: null,
      openaiApiKey: null,
      anthropicApiKey: null,
      developerId: os.userInfo().username,
      syncIntervalMs: 10000,
      mnestraMode: 'direct',
      mnestraWebhookUrl: 'http://localhost:37778/mnestra',
      tables: {
        session: 'mnestra_session_memory',
        project: 'mnestra_project_memory',
        developer: 'mnestra_developer_memory',
        commands: 'mnestra_commands'
      }
    },
    sessionLogs: {
      enabled: false,
      summaryModel: 'claude-haiku-4-5'
    }
  };
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const secrets = loadSecretsEnv();
  if (secrets.loaded) {
    console.log(`[config] Loaded secrets from ${SECRETS_PATH} (${secrets.keys.length} key${secrets.keys.length === 1 ? '' : 's'})`);
  }

  const defaults = defaultConfig();

  // Auto-create default config.yaml on first run (unchanged behavior).
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultYaml = `# TermDeck Configuration
# Secrets belong in ~/.termdeck/secrets.env, not here.

port: 3000
host: 127.0.0.1

shell: ${process.env.SHELL || '/bin/bash'}
defaultTheme: tokyo-night

# projects:
#   my-project:
#     path: ~/code/my-project
#     defaultTheme: catppuccin-mocha
#     defaultCommand: claude

rag:
  enabled: false
  # supabaseUrl and secrets come from ~/.termdeck/secrets.env
  supabaseUrl: \${SUPABASE_URL}
  supabaseKey: \${SUPABASE_SERVICE_ROLE_KEY}
  openaiApiKey: \${OPENAI_API_KEY}
  anthropicApiKey: \${ANTHROPIC_API_KEY}
  syncIntervalMs: 10000
  mnestraMode: direct
  mnestraWebhookUrl: http://localhost:37778/mnestra

sessionLogs:
  enabled: false
  summaryModel: claude-haiku-4-5
`;
    fs.writeFileSync(CONFIG_PATH, defaultYaml, 'utf-8');
    console.log('[config] Created default config at', CONFIG_PATH);
  }

  let parsed = {};
  try {
    const yaml = require('yaml');
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    parsed = yaml.parse(raw) || {};
    console.log('[config] Loaded from', CONFIG_PATH);
  } catch (err) {
    console.warn('[config] Could not load config.yaml, using defaults:', err.message);
    parsed = {};
  }

  // Warn about inline secrets BEFORE substitution so the diagnostic matches
  // what the user actually has on disk.
  warnIfLegacyInlineSecrets(parsed, secrets.loaded);

  const substituted = substituteEnv(parsed);

  return {
    ...defaults,
    ...substituted,
    rag: { ...defaults.rag, ...(substituted?.rag || {}) },
    sessionLogs: { ...defaults.sessionLogs, ...(substituted?.sessionLogs || {}) }
  };
}

// Add a project to ~/.termdeck/config.yaml and return the updated projects map.
// Writes a timestamped .bak of the existing file before overwriting so the
// user can always recover manually. Comments in the original yaml WILL be lost
// on rewrite — yaml.stringify does not round-trip comments. That's acceptable
// for a v0.2 convenience feature; permanent editing still belongs in a text
// editor for users who care about file comments.
function addProject({ name, path: projectPath, defaultTheme, defaultCommand }) {
  if (!name || !/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new Error('Project name must be non-empty and contain only letters, digits, . _ or -');
  }
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('Project path is required');
  }

  // Expand ~ for validation but keep tilde form in the stored config so it
  // remains portable across machines.
  const expanded = projectPath.replace(/^~/, os.homedir());
  const resolved = path.resolve(expanded);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Project path does not exist: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Project path is not a directory: ${resolved}`);
  }

  const yaml = require('yaml');
  let parsed = {};
  if (fs.existsSync(CONFIG_PATH)) {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    try {
      parsed = yaml.parse(raw) || {};
    } catch (err) {
      throw new Error(`config.yaml is not valid YAML — cannot safely rewrite: ${err.message}`);
    }
  }

  if (!parsed.projects || typeof parsed.projects !== 'object') {
    parsed.projects = {};
  }
  if (parsed.projects[name]) {
    throw new Error(`Project "${name}" already exists`);
  }

  parsed.projects[name] = {
    path: projectPath,
    ...(defaultTheme ? { defaultTheme } : {}),
    ...(defaultCommand ? { defaultCommand } : {})
  };

  // Backup before overwrite.
  if (fs.existsSync(CONFIG_PATH)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const bak = `${CONFIG_PATH}.${ts}.bak`;
    try {
      fs.copyFileSync(CONFIG_PATH, bak);
    } catch (err) {
      console.warn('[config] Could not write backup before adding project:', err.message);
    }
  }

  const out = yaml.stringify(parsed);
  fs.writeFileSync(CONFIG_PATH, out, 'utf-8');
  console.log(`[config] Added project "${name}" → ${projectPath}`);

  return parsed.projects;
}

module.exports = {
  loadConfig,
  addProject,
  // exported for tests / introspection
  _parseDotenv: parseDotenv,
  _substituteEnv: substituteEnv,
  _paths: { CONFIG_DIR, CONFIG_PATH, SECRETS_PATH }
};
