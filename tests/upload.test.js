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
  const saved = saveUploadedBlob({ name: 'ok.txt', type: 'text/plain', data: 'Zm9v' });
  assert.strictEqual(fs.readFileSync(saved.path, 'utf8'), 'foo');
  assert.throws(
    () => saveUploadedBlob({ name: 'bad.txt', type: 'text/plain', data: 'Zm9v$' }),
    /Invalid base64 upload/,
    'malformed base64 must not be silently truncated into a corrupt upload'
  );
  console.log('upload ok');
} finally {
  fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
