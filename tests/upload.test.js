const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = path.join(os.homedir(), 'tmp');
fs.mkdirSync(tmpRoot, { recursive: true });
const home = fs.mkdtempSync(path.join(tmpRoot, 'passideck-upload-test-'));
process.env.PASSIDECK_HOME = home;

try {
  const { saveUploadedBlob } = require('../packages/server/src/index');
  assert.ok(!fs.existsSync(path.join(home, 'passideck.db')), 'importing an upload helper must not open the server database');
  const saved = saveUploadedBlob({ name: 'ok.txt', type: 'text/plain', data: 'Zm9v' });
  assert.strictEqual(fs.readFileSync(saved.path, 'utf8'), 'foo');
  assert.strictEqual(Object.hasOwn(saved, 'insert'), false, 'uploads must expose only the canonical path field');
  assert.throws(
    () => saveUploadedBlob({ name: 'bad.txt', type: 'text/plain', data: 'Zm9v$' }),
    /Invalid base64 upload/,
    'malformed base64 must not be silently truncated into a corrupt upload'
  );
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const pasted = saveUploadedBlob({
    name: 'clipboard.png',
    type: 'application/octet-stream',
    data: `data:application/octet-stream;base64,${png.toString('base64')}`
  });
  assert.strictEqual(pasted.type, 'image/png', 'generic clipboard MIME must be replaced only by detected media type');
  assert.deepStrictEqual(fs.readFileSync(pasted.path), png);
  assert.throws(
    () => saveUploadedBlob({ name: 'fake.png', type: 'application/octet-stream', data: 'bm90LWEtcG5n' }),
    /Upload type not allowed: application\/octet-stream/,
    'generic MIME must stay rejected when the bytes are not a supported media signature'
  );
  console.log('upload ok');
} finally {
  fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
