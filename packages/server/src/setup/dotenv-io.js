// Merge-aware reader/writer for ~/.termdeck/secrets.env.
//
// The existing config.js module already parses the file at load time, but for
// the `init` wizards we need to UPDATE the file without clobbering values the
// user has already set. This helper preserves unknown keys, preserves order
// of existing keys, and appends new keys at the bottom.
//
// File format (same subset as config.js parseDotenv):
//   KEY=value
//   KEY="quoted"
//   KEY='single'
//   # comments are preserved
//   blank lines are preserved

const fs = require('fs');
const os = require('os');
const path = require('path');

const SECRETS_PATH = path.join(os.homedir(), '.termdeck', 'secrets.env');

function readSecretsRaw(filepath = SECRETS_PATH) {
  if (!fs.existsSync(filepath)) return { exists: false, lines: [], keys: {} };
  const raw = fs.readFileSync(filepath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  const keys = {};
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    keys[key] = { value: val, lineIndex: idx };
  });
  return { exists: true, lines, keys };
}

// Escape a value for safe re-serialization. Wraps in double quotes if the
// value contains whitespace, `#`, or `"`. Always safe to wrap — we wrap when
// in doubt to avoid ambiguity with the dotenv parser.
function formatValue(value) {
  if (value == null) return '';
  const str = String(value);
  if (str === '') return '';
  const needsQuoting = /[\s#"'=]/.test(str);
  if (!needsQuoting) return str;
  const escaped = str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

// Write a merged secrets.env. `updates` is an object of key→value pairs. Pass
// null/undefined value to delete a key. Existing lines are preserved for keys
// not listed in `updates`. New keys get appended to the bottom with a header.
function writeSecrets(updates, filepath = SECRETS_PATH) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const { exists, lines, keys } = readSecretsRaw(filepath);
  const originalLines = exists ? lines.slice() : [
    '# TermDeck secrets — loaded on server startup.',
    '# Never commit this file.',
    ''
  ];
  const workingLines = originalLines.slice();
  const toAppend = [];

  for (const [key, rawVal] of Object.entries(updates)) {
    if (rawVal == null || rawVal === '') {
      // Delete existing line (by overwriting with blank). Safer to mark for
      // deletion than splice (splice shifts indices of subsequent keys).
      if (keys[key]) workingLines[keys[key].lineIndex] = '';
      continue;
    }
    const formatted = `${key}=${formatValue(rawVal)}`;
    if (keys[key]) {
      workingLines[keys[key].lineIndex] = formatted;
    } else {
      toAppend.push(formatted);
    }
  }

  let out = workingLines.join('\n');
  if (toAppend.length > 0) {
    if (out.length > 0 && !out.endsWith('\n')) out += '\n';
    // Add a header for the first append-pass on an empty file.
    if (!exists) out = originalLines.join('\n') + toAppend.join('\n') + '\n';
    else out = out.replace(/\n+$/, '') + '\n' + toAppend.join('\n') + '\n';
  } else if (!out.endsWith('\n')) {
    out += '\n';
  }

  // chmod 600 for secrets — owner read/write only.
  fs.writeFileSync(filepath, out, { encoding: 'utf-8', mode: 0o600 });
  try { fs.chmodSync(filepath, 0o600); } catch (_err) { /* best-effort */ }

  return { path: filepath, wrote: Object.keys(updates).length, appended: toAppend.length };
}

// Convenience read — returns `{ SUPABASE_URL, ... }` object, no metadata.
function readSecrets(filepath = SECRETS_PATH) {
  const { keys } = readSecretsRaw(filepath);
  const out = {};
  for (const [k, v] of Object.entries(keys)) out[k] = v.value;
  return out;
}

module.exports = {
  SECRETS_PATH,
  readSecrets,
  writeSecrets,
  _formatValue: formatValue
};
