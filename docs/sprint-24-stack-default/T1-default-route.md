# T1 — Default `termdeck` Routes Through the Stack Orchestrator

## Goal

Make a bare `termdeck` (no args, no subcommand) detect a configured stack and dispatch into `stack.js`. If detection comes back negative, fall through to today's direct-launch code path so first-run users see no behavioral change.

## Why this terminal owns this

The CLI dispatcher in `packages/cli/src/index.js` is where subcommand routing already happens (`init`, `forge`, `stack`). Adding the detection step here keeps all routing logic in one file and avoids spreading boot-time policy across modules.

## Implementation

### 1. New helper at the top of `packages/cli/src/index.js`

```js
function shouldAutoOrchestrate() {
  const secretsPath = path.join(os.homedir(), '.termdeck', 'secrets.env');
  const configPath = path.join(os.homedir(), '.termdeck', 'config.yaml');
  if (!fs.existsSync(secretsPath)) return false;
  if (!fs.existsSync(configPath)) return false;
  let yaml;
  try { yaml = require('yaml').parse(fs.readFileSync(configPath, 'utf8')) || {}; }
  catch (_e) { return false; }
  const mnestraAuto = yaml.mnestra && yaml.mnestra.autoStart === true;
  const ragEnabled = yaml.rag && yaml.rag.enabled === true;
  return Boolean(mnestraAuto || ragEnabled);
}
```

### 2. Default-path dispatch

After the existing `init`, `forge`, and `stack` subcommand checks, but before `parseFlags`, add:

```js
const hasSubcommand = ['init', 'forge', 'stack'].includes(args[0]);
const noStack = args.includes('--no-stack');
if (!hasSubcommand && !noStack && shouldAutoOrchestrate()) {
  const stack = require(path.join(__dirname, 'stack.js'));
  // Forward all args verbatim. stack.js already understands --port and
  // passes unknown flags through to termdeck via its `extra` array.
  stack(args).then((code) => process.exit(code || 0)).catch((err) => {
    console.error('[cli] auto-stack failed:', err && err.stack || err);
    process.exit(1);
  });
  return;
}
```

### 3. Strip `--no-stack` from `args` before flag parsing

The existing flag parser doesn't recognize `--no-stack`. After the dispatch block above, mutate `args` in place to drop it so the existing `flags.port` / `flags.noOpen` / `flags.sessionLogs` parsing keeps working unchanged.

## Files you own

- `packages/cli/src/index.js` (default-route detection + dispatch)

## Acceptance criteria

- [ ] `termdeck` on a config-less machine still hits the existing direct-launch banner and starts on port 3000.
- [ ] `termdeck` on a Tier 2 machine (`mnestra.autoStart: true`) prints the four-step orchestrator output.
- [ ] `termdeck --port 8080` on a Tier 2 machine forwards the port through `stack.js` and TermDeck binds 8080.
- [ ] `termdeck stack` and `termdeck init --mnestra` are unaffected.
- [ ] Write `[T1] DONE` to STATUS.md when verified.
