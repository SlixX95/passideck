const assert = require('assert');
const { SessionManager, WS_BACKPRESSURE_MAX_BYTES, sendJson } = require('../packages/server/src/session');

const sessions = new SessionManager();
const exited = sessions.create({ id: 'exited' });
exited.meta.status = 'exited';

assert.deepStrictEqual(sessions.getAll(), [], 'disconnected exited sessions must not leak into health/session lists');
assert.strictEqual(sessions.get('exited'), null, 'disconnected exited sessions must be released from memory');

const sent = [];
const healthy = { readyState: 1, bufferedAmount: 0, send: payload => sent.push(JSON.parse(payload)) };
assert.strictEqual(sendJson(healthy, { type: 'meta' }), true);
assert.deepStrictEqual(sent, [{ type: 'meta' }]);
let closed = null;
const slow = { readyState: 1, bufferedAmount: WS_BACKPRESSURE_MAX_BYTES - 1, send() { throw new Error('must not send'); }, close: (code, reason) => { closed = { code, reason }; } };
assert.strictEqual(sendJson(slow, { type: 'output', data: 'x' }), false);
assert.deepStrictEqual(closed, { code: 1013, reason: 'websocket backpressure' });

console.log('session ok');
