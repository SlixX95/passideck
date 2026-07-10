#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
let noOpen = false;
let showConfig = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--home' && args[i + 1]) process.env.PASSIDECK_HOME = path.resolve(args[++i]);
  else if (a === '--tmux-socket' && args[i + 1]) process.env.PASSIDECK_TMUX_SOCKET = args[++i];
}

const { createServer, loadConfig } = require(path.join(__dirname, '..', '..', 'server', 'src', 'index.js'));

function openUrl(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  // ponytail: no package for one OS opener; if this fails, the printed URL still works.
  try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref(); } catch {}
}
const config = loadConfig();

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--port' && args[i + 1]) config.port = Number(args[++i]);
  else if (a === '--host' && args[i + 1]) config.host = args[++i];
  else if (a === '--home' && args[i + 1]) i++;
  else if (a === '--tmux-socket' && args[i + 1]) i++;
  else if (a === '--no-open' || a === '--no-stack') noOpen = true;
  else if (a === '--print-config') showConfig = true;
  else if (a === '--help' || a === '-h') {
    console.log(`PassiDeck\n\nUsage:\n  passideck [--host 127.0.0.1] [--port 8791] [--home ~/.passideck] [--tmux-socket passideck] [--no-open]\n\nStandalone browser terminal wall.`);
    process.exit(0);
  }
}

if (showConfig) {
  console.log(JSON.stringify(config, null, 2));
  process.exit(0);
}

const { server, close } = createServer(config);
const host = config.host || '127.0.0.1';
const port = config.port || 8791;
const url = `http://${host}:${port}`;

server.listen(port, host, () => {
  console.log(`PassiDeck running: ${url}`);
  if (!noOpen && host === '127.0.0.1') openUrl(url);
});

let closing = false;
function gracefulShutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n[shutdown] ${signal} received`);
  close().then(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
