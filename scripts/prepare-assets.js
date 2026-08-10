#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pub = path.join(root, 'packages', 'client', 'public');
const vendor = path.join(pub, 'vendor');
fs.mkdirSync(vendor, { recursive: true });

const files = [
  ['node_modules/@xterm/xterm/css/xterm.css', 'xterm.css'],
  ['node_modules/@xterm/xterm/lib/xterm.js', 'xterm.js'],
  ['node_modules/@xterm/addon-fit/lib/addon-fit.js', 'addon-fit.js'],
  ['node_modules/@xterm/addon-web-links/lib/addon-web-links.js', 'addon-web-links.js'],
  ['node_modules/@xterm/addon-serialize/lib/addon-serialize.js', 'addon-serialize.js'],
  ['node_modules/xterm-zerolag-input/dist/index.global.js', 'xterm-zerolag-input.js']
];

for (const [srcRel, dst] of files) {
  const src = path.join(root, srcRel);
  if (!fs.existsSync(src)) throw new Error(`Missing asset: ${srcRel}`);
  fs.copyFileSync(src, path.join(vendor, dst));
}
console.log('PassiDeck vendor assets ready');
