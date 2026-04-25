#!/usr/bin/env node
const path = require('path');
const { createServer, loadConfig } = require(path.join(__dirname, '..', '..', 'server', 'src', 'index.js'));

const args = process.argv.slice(2);
const config = loadConfig();
let noOpen = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--port' && args[i + 1]) config.port = Number(args[++i]);
  else if (arg === '--host' && args[i + 1]) config.host = args[++i];
  else if (arg === '--no-open' || arg === '--no-stack') noOpen = true;
  else if (arg === '--help' || arg === '-h') {
    console.log(`PassiDeck\n\nUsage:\n  passideck [--host 0.0.0.0] [--port 8791] [--no-open]\n\nLocal web terminal wall.`);
    process.exit(0);
  }
}

const { server } = createServer(config);
const host = config.host || '127.0.0.1';
const port = config.port || 3000;
const url = `http://${host}:${port}`;

server.listen(port, host, () => {
  console.log(`PassiDeck running: ${url}`);
  if (!noOpen && host === '127.0.0.1') {
    import('open').then(({ default: open }) => open(url)).catch(() => {});
  }
});
