const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_DIR = path.join(os.homedir(), '.passideck');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.yaml');

function defaultConfig() {
  return {
    host: '127.0.0.1',
    port: 3000,
    shell: '/bin/bash',
    defaultTheme: 'tokyo-night',
    projects: {}
  };
}

function loadConfig() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, `# PassiDeck local config\nhost: 127.0.0.1\nport: 3000\nshell: /bin/bash\ndefaultTheme: tokyo-night\nprojects: {}\n`, 'utf8');
  }

  let parsed = {};
  try {
    const yaml = require('yaml');
    parsed = yaml.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) || {};
  } catch (err) {
    console.warn('[config] using defaults:', err.message);
  }

  return { ...defaultConfig(), ...parsed };
}

module.exports = { loadConfig, CONFIG_DIR, CONFIG_PATH };
