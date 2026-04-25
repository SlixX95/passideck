// Detection helper for Sprint 24: should `termdeck` (no subcommand)
// auto-route through stack.js? Pure function, isolated for testability —
// the dispatcher in index.js still owns the actual routing decision.

const fs = require('fs');
const os = require('os');
const path = require('path');

function shouldAutoOrchestrate(homeDir) {
  const home = homeDir || os.homedir();
  const secretsPath = path.join(home, '.termdeck', 'secrets.env');
  const configPath = path.join(home, '.termdeck', 'config.yaml');
  if (!fs.existsSync(secretsPath) || !fs.existsSync(configPath)) return false;
  let parsed;
  try {
    const yaml = require('yaml');
    parsed = yaml.parse(fs.readFileSync(configPath, 'utf8')) || {};
  } catch (_e) {
    return false;
  }
  const mnestraAuto = parsed.mnestra && parsed.mnestra.autoStart === true;
  const ragEnabled = parsed.rag && parsed.rag.enabled === true;
  return Boolean(mnestraAuto || ragEnabled);
}

module.exports = { shouldAutoOrchestrate };
