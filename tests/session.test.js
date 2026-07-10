const assert = require('assert');
const { SessionManager } = require('../packages/server/src/session');

const sessions = new SessionManager();
const exited = sessions.create({ id: 'exited' });
exited.meta.status = 'exited';

assert.deepStrictEqual(sessions.getAll(), [], 'disconnected exited sessions must not leak into health/session lists');
assert.strictEqual(sessions.get('exited'), null, 'disconnected exited sessions must be released from memory');

console.log('session ok');
