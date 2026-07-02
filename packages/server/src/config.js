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
    shell: '/bin/bash'
  };
}

function loadConfig() {
  const dir = configDir();
  const file = configPath();
  fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `# PassiDeck local config\nhost: 127.0.0.1\nport: 8791\nshell: /bin/bash\n`, 'utf8');
  }

  let parsed = {};
  try {
    const yaml = require('yaml');
    parsed = yaml.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (err) {
    console.warn('[config] using defaults:', err.message);
  }

  return { ...defaultConfig(), ...parsed, configDir: dir, configPath: file };
}

module.exports = { loadConfig, configDir, configPath };
