const fs = require('fs');
const os = require('os');
const path = require('path');

function configDir() {
  return path.resolve(String(process.env.PASSIDECK_HOME || path.join(os.homedir(), '.passideck')).replace(/^~/, os.homedir()));
}

function configPath() {
  return path.join(configDir(), 'config.yaml');
}

function defaultConfig() {
  return {
    host: '127.0.0.1',
    port: 8791,
    shell: '/bin/bash',
    titleGenLlm: 'host_aux_title'
  };
}

function normalizeTitleGenLlm(value) {
  const mode = String(value ?? '').trim().toLowerCase();
  if (!mode) return 'host_aux_title';
  if (mode === 'host_aux_title' || mode === 'off') return mode;
  return 'off';
}

function writeTitleGenLlm(value) {
  const mode = normalizeTitleGenLlm(value);
  const dir = configDir();
  const file = configPath();
  fs.mkdirSync(dir, { recursive: true });
  const source = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8')
    : '# PassiDeck local config\nhost: 127.0.0.1\nport: 8791\nshell: /bin/bash\n';
  let parsed;
  try {
    const yaml = require('yaml');
    parsed = yaml.parse(source) || {};
  } catch (err) {
    throw new Error(`Cannot update invalid PassiDeck config: ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Cannot update invalid PassiDeck config: expected a mapping');
  }

  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const index = lines.findIndex(line => /^\s*titleGenLlm\s*:/.test(line));
  if (index >= 0) lines[index] = `titleGenLlm: ${mode}`;
  else {
    if (lines[lines.length - 1] === '') lines.pop();
    lines.push(`titleGenLlm: ${mode}`, '');
  }
  const content = lines.join(newline);
  const serialized = content.endsWith(newline) ? content : `${content}${newline}`;
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  let fd = null;
  try {
    const permissions = fs.existsSync(file) ? (fs.statSync(file).mode & 0o777) : 0o600;
    fd = fs.openSync(temp, 'w', permissions);
    fs.writeSync(fd, serialized, null, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(temp, file);
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    try { fs.unlinkSync(temp); } catch {}
  }
  return mode;
}

function loadConfig() {
  const dir = configDir();
  const file = configPath();
  fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `# PassiDeck local config\nhost: 127.0.0.1\nport: 8791\nshell: /bin/bash\ntitleGenLlm: host_aux_title\n`, 'utf8');
  }

  let parsed = {};
  try {
    const yaml = require('yaml');
    parsed = yaml.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (err) {
    console.warn('[config] using defaults:', err.message);
  }

  const config = { ...defaultConfig(), ...parsed };
  config.titleGenLlm = normalizeTitleGenLlm(process.env.PASSIDECK_TITLE_GEN_LLM ?? config.titleGenLlm);
  return config;
}

module.exports = { loadConfig, configDir, configPath, normalizeTitleGenLlm, writeTitleGenLlm };
