// Readline-based interactive prompts for the `termdeck init` wizards.
//
// No external deps. All prompts in a single wizard run share ONE readline
// interface (via the module-scoped `rl` below). We consume lines via the
// `line` event and an internal FIFO of pending resolvers instead of
// `rl.question()` — the latter has broken behavior when stdin is a piped
// stream in non-terminal mode, where the second `.question()` call silently
// hangs. The event-driven path works for both TTY and piped input, which lets
// us drive the wizard non-interactively in tests:
//
//   printf 'a\nb\nc\n' | termdeck init --mnestra --dry-run
//
// Secret prompts still mute stdout echo when TTY is attached; on non-TTY
// stdin they fall back to visible input so piped test runs work.

const readline = require('readline');

let rl = null;
const waiting = [];   // pending resolver functions
const buffered = [];  // lines that arrived before anyone was waiting
let sawEnd = false;

function getRl() {
  if (rl) return rl;
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });
  rl.on('line', (line) => {
    if (waiting.length > 0) {
      const resolver = waiting.shift();
      resolver(line);
    } else {
      buffered.push(line);
    }
  });
  rl.on('close', () => {
    sawEnd = true;
    while (waiting.length > 0) {
      const resolver = waiting.shift();
      resolver('');
    }
  });
  return rl;
}

function readLine() {
  return new Promise((resolve) => {
    getRl();
    if (buffered.length > 0) {
      resolve(buffered.shift());
      return;
    }
    if (sawEnd) { resolve(''); return; }
    waiting.push(resolve);
  });
}

// Basic non-secret prompt. Returns empty string if the user just hits enter.
async function ask(question, { defaultValue } = {}) {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  if (question) process.stdout.write(`${question}${suffix}: `);
  const line = await readLine();
  const trimmed = (line || '').trim();
  return trimmed || defaultValue || '';
}

// Required prompt — re-asks up to `maxAttempts` times if the answer is empty
// or fails `validate(value) → null | string`. A validator returning a string
// message means "invalid, re-ask with this error". Throws if all attempts fail.
async function askRequired(question, { validate, maxAttempts = 3 } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    const answer = await ask(question);
    if (!answer) {
      process.stdout.write('  (required)\n');
      continue;
    }
    if (validate) {
      const err = validate(answer);
      if (err) {
        process.stdout.write(`  ${err}\n`);
        continue;
      }
    }
    return answer;
  }
  throw new Error(`No valid answer after ${maxAttempts} attempts: ${question}`);
}

// Optional prompt. Empty → null. Still validates non-empty answers.
async function askOptional(question, { validate } = {}) {
  const answer = await ask(question);
  if (!answer) return null;
  if (validate) {
    const err = validate(answer);
    if (err) {
      process.stdout.write(`  ${err} — ignoring.\n`);
      return null;
    }
  }
  return answer;
}

// Secret prompt. On TTY we mute echo; on non-TTY we fall back to a visible
// line read. Callers typically pass an empty string for `question` and write
// their own label first.
//
// Reported as broken on MobaXterm SSH (Brad, 2026-04-25): the wizard would
// abort after the Anthropic key prompt as if Ctrl-C were pressed. Three real
// bugs hardened against here, all from the original raw-mode loop:
//
//   1. CRLF leak. When the terminal sends "\r\n" as a single chunk (Windows /
//      MobaXterm Enter key), the original loop matched the "\r", resolved,
//      and dropped the rest of the chunk on the floor. The trailing "\n"
//      then surfaced through the next prompt's data path. Worst case the
//      dropped chunk also contained  from a stray keystroke and the
//      original SIGINT branch fired, killing the wizard mid-flow.
//
//   2. ANSI / escape-sequence pollution. Some terminals emit "[..."
//      sequences for non-character events (focus changes, cursor reports,
//      paste-bracketing). The old loop fed those bytes into the password
//      buffer and echoed "*" for each one. We now consume escape sequences
//      silently.
//
//   3. SIGINT during a secret prompt is now a soft cancel — return empty
//      string, let the caller's shape validator re-prompt — instead of
//      `process.kill`-ing the process. The hard-kill was masking the CRLF
//      bug above and aborting the wizard from stray bytes.
//
// Carry-over bytes (anything in the chunk after the resolving "\r"/"\n")
// are pushed back onto stdin via `stdin.unshift` so the next consumer
// (readline, the next askSecret) reads from a clean stream. Regression
// fixtures in tests/setup-prompts.test.js.
async function askSecret(question) {
  if (!process.stdin.isTTY) {
    return ask(question);
  }
  if (question) process.stdout.write(`${question}: `);
  return new Promise((resolve) => {
    if (rl) rl.pause();
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf-8');

    let buffer = '';
    let inEscape = false;
    let escapeDepth = 0;

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      if (rl) rl.resume();
    };

    const carryOver = (chunk, fromIndex) => {
      if (fromIndex >= chunk.length) return;
      const tail = chunk.slice(fromIndex);
      // Drop a single leading \n if we just consumed \r (CRLF pair already
      // accounted for at the call site).
      const trimmed = tail[0] === '\n' ? tail.slice(1) : tail;
      if (trimmed.length > 0) {
        try { stdin.unshift(Buffer.from(trimmed, 'utf-8')); } catch (_e) { /* unsupported on some Node versions */ }
      }
    };

    const onData = (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];

        // Bug #2: silently consume ANSI escape sequences. ESC (\u001b) starts one;
        // we consume until a final byte (CSI: 0x40..0x7E) or run out of
        // patience (16 bytes).
        if (inEscape) {
          escapeDepth++;
          if ((escapeDepth === 1 && ch !== '[') ||
              (escapeDepth > 1 && ch >= '@' && ch <= '~') ||
              escapeDepth > 16) {
            inEscape = false;
            escapeDepth = 0;
          }
          continue;
        }
        if (ch === '') { inEscape = true; escapeDepth = 0; continue; }

        // Line terminators — the resolve path. Bug #1 handled here via the
        // explicit CRLF drain inside the same chunk.
        if (ch === '\n' || ch === '\r' || ch === '') {
          let consumeUpTo = i + 1;
          if (ch === '\r' && chunk[i + 1] === '\n') consumeUpTo++;
          cleanup();
          carryOver(chunk, consumeUpTo);
          resolve(buffer);
          return;
        }

        // Bug #3: Ctrl-C during a secret prompt → soft cancel, not SIGINT.
        if (ch === '') {
          cleanup();
          carryOver(chunk, i + 1);
          resolve('');
          return;
        }

        // Backspace / DEL.
        if (ch === '' || ch === '\b') {
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }

        // Drop any other control character silently; never let them into
        // the password buffer.
        if (ch < ' ' && ch !== '\t') continue;

        buffer += ch;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

// Yes/no confirm. Returns boolean.
async function confirm(question, { defaultYes = true } = {}) {
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = (await ask(`${question} ${suffix}`)).toLowerCase();
  if (!answer) return defaultYes;
  return answer === 'y' || answer === 'yes';
}

function closeRl() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

module.exports = {
  ask,
  askRequired,
  askOptional,
  askSecret,
  confirm,
  closeRl
};
