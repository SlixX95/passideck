// Sprint 25 T1 — Supabase MCP bridge.
//
// Thin server-side wrapper that spawns @supabase/mcp-server-supabase as a
// child process and speaks JSON-RPC 2.0 to it on stdio. One spawn per call —
// no caching, no retries, no business logic. T2's wizard endpoints stack
// listProjects / readCredentials helpers on top of this primitive.
//
// Zero new npm deps: child_process + JSON only.
//
// PAT discipline: the caller's Supabase Personal Access Token is passed via
// the SUPABASE_ACCESS_TOKEN env var on the spawned child and is never logged,
// echoed, or persisted on disk by this module.

const { spawn, spawnSync } = require('child_process');

const DEFAULT_TIMEOUT_MS = 8000;
const PACKAGE_SPEC = '@supabase/mcp-server-supabase';
const BINARY_NAME = 'mcp-server-supabase';

// Detect whether @supabase/mcp-server-supabase can be invoked on this host.
// Resolution order:
//   1. A globally installed `mcp-server-supabase` binary on PATH.
//   2. A locally cached npx package (probed without network install).
// Both probes are short-running and synchronous-shaped — wrapped in a Promise
// so the call site can stay async.
async function detectMcp() {
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const r = spawnSync(whichCmd, [BINARY_NAME], { encoding: 'utf-8' });
    if (r.status === 0 && r.stdout && r.stdout.trim()) {
      return { available: true, mode: 'binary' };
    }
  } catch (err) {
    // `which` itself missing is unusual but not fatal — fall through to npx.
  }

  try {
    // --no-install: only succeed if the package is already cached locally.
    // Avoids surprising a user with a multi-MB install during a wizard probe.
    const r = spawnSync('npx', ['--no-install', PACKAGE_SPEC, '--version'], {
      encoding: 'utf-8',
      timeout: 5000
    });
    if (r.status === 0) {
      return { available: true, mode: 'npx' };
    }
  } catch (err) {
    // npx absent (rare on Node installs) — fall through to "not installed".
  }

  return {
    available: false,
    mode: null,
    error: `not installed; run: npm install -g ${PACKAGE_SPEC}`
  };
}

function buildSpawnInvocation(mode) {
  if (mode === 'binary') {
    return { command: BINARY_NAME, args: [] };
  }
  // npx path — pin to @latest as the spec calls for, with -y to bypass the
  // interactive "ok to proceed?" prompt that would otherwise hang stdio.
  return { command: 'npx', args: ['-y', `${PACKAGE_SPEC}@latest`] };
}

// One-shot JSON-RPC tools/call. Spawns the MCP, writes a single request
// envelope, awaits the matching response by id, then kills the child.
//
// Resolves with `response.result` on success.
// Rejects with:
//   - Error('mcp not installed: <hint>') if detectMcp() reports unavailable
//   - Error('mcp timeout') if no response inside opts.timeoutMs
//   - Error('mcp spawn failed: <msg>') on spawn-time errors (ENOENT, EACCES)
//   - Error('mcp exited (code=<n>): <stderr tail>') if the child exits before
//     a matching response arrives
//   - Error(<rpc error message>) if the JSON-RPC response carries an `error`
async function callTool(pat, method, params, opts) {
  if (typeof pat !== 'string' || !pat) {
    throw new Error('callTool requires a Supabase PAT string');
  }
  if (typeof method !== 'string' || !method) {
    throw new Error('callTool requires an MCP method name');
  }
  const timeoutMs = (opts && Number.isFinite(opts.timeoutMs))
    ? opts.timeoutMs
    : DEFAULT_TIMEOUT_MS;

  const detect = await detectMcp();
  if (!detect.available) {
    throw new Error(`mcp not installed: ${detect.error}`);
  }

  const { command, args } = buildSpawnInvocation(detect.mode);

  const id = Math.floor(Math.random() * 1e9) + 1;
  const request = {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: method, arguments: params || {} }
  };

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        // Pass PAT only via env — never via argv so it can't show up in `ps`.
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: pat },
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (err) {
      reject(new Error(`mcp spawn failed: ${err.message}`));
      return;
    }

    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try { child.stdin.end(); } catch (_e) { /* stdin already closed */ }
      // SIGKILL — the MCP doesn't need a graceful shutdown for a one-shot.
      try { child.kill('SIGKILL'); } catch (_e) { /* child already dead */ }
    };

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    timer = setTimeout(() => {
      settle(reject, new Error('mcp timeout'));
    }, timeoutMs);

    child.on('error', (err) => {
      // 'error' fires for ENOENT / EACCES at spawn time and for write-after-end.
      settle(reject, new Error(`mcp spawn failed: ${err.message}`));
    });

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf-8');
      // Cap so a chatty MCP can't blow memory on a stuck call.
      if (stderrBuf.length > 8192) stderrBuf = stderrBuf.slice(-8192);
    });

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf-8');
      let nl;
      while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch (_e) {
          // Non-JSON noise (banner, log line) — ignore and keep buffering.
          continue;
        }
        if (msg && msg.id === id) {
          if (msg.error) {
            const detail = msg.error.message || JSON.stringify(msg.error);
            settle(reject, new Error(detail));
          } else {
            settle(resolve, msg.result);
          }
          return;
        }
      }
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      const tail = stderrBuf.slice(-512).trim();
      const why = signal ? `signal=${signal}` : `code=${code}`;
      settle(reject, new Error(`mcp exited (${why})${tail ? ': ' + tail : ''}`));
    });

    try {
      child.stdin.write(JSON.stringify(request) + '\n');
    } catch (err) {
      settle(reject, new Error(`mcp stdin write failed: ${err.message}`));
    }
  });
}

module.exports = { callTool, detectMcp };
