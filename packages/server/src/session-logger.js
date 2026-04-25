// Session-log summarizer (T2.5 / Tier 1 feature).
// On session exit, writes a markdown session log to ~/.termdeck/sessions/.
// Optional LLM summary via Anthropic if ANTHROPIC_API_KEY is set.

const fs = require('fs');
const os = require('os');
const path = require('path');

let warnedNoKey = false;

function slugify(str) {
  return String(str || 'session')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'session';
}

function buildMarkdown({ session, summary, commands, edits, errors }) {
  const meta = session.meta;
  const opened = meta.createdAt;
  const closed = new Date().toISOString();
  const lines = [];
  lines.push('---');
  lines.push(`session_id: ${session.id}`);
  lines.push(`project: ${meta.project || ''}`);
  lines.push(`type: ${meta.type}`);
  lines.push(`opened_at: ${opened}`);
  lines.push(`closed_at: ${closed}`);
  lines.push(`command_count: ${commands.length}`);
  if (meta.exitCode !== null && meta.exitCode !== undefined) {
    lines.push(`exit_code: ${meta.exitCode}`);
  }
  lines.push('---');
  lines.push('');
  lines.push(`# TermDeck session ${session.id.slice(0, 8)} — ${meta.label || meta.type}`);
  lines.push('');
  lines.push('## What ran');
  lines.push('');
  if (commands.length === 0) {
    lines.push('_(no commands recorded)_');
  } else {
    for (const c of commands) {
      const ts = c.timestamp || c.created_at || '';
      lines.push(`- \`${c.command}\`${ts ? ` — ${ts}` : ''}`);
    }
  }
  lines.push('');
  lines.push('## What was edited');
  lines.push('');
  if (edits.length === 0) {
    lines.push('_(no edits detected)_');
  } else {
    for (const e of edits) lines.push(`- ${e}`);
  }
  lines.push('');
  lines.push('## What errored');
  lines.push('');
  if (errors.length === 0) {
    lines.push('_(no errors detected)_');
  } else {
    for (const e of errors) lines.push(`- ${e}`);
  }
  lines.push('');
  if (summary) {
    lines.push('## Summary');
    lines.push('');
    lines.push(summary);
    lines.push('');
  }
  return lines.join('\n');
}

async function summarizeWithLLM({ session, commands, edits, errors, model, apiKey }) {
  const prompt = [
    `You are summarizing a TermDeck terminal session in 2-4 sentences.`,
    `Session type: ${session.meta.type}`,
    `Project: ${session.meta.project || 'untagged'}`,
    `Commands (${commands.length}): ${commands.slice(-20).map((c) => c.command).join(' | ')}`,
    `Edits: ${edits.slice(-10).join(' | ') || 'none'}`,
    `Errors: ${errors.slice(-5).join(' | ') || 'none'}`,
    `Write a concise summary of what the user accomplished, what broke, and what state the session ended in.`
  ].join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model || 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }
  const data = await res.json();
  const block = data.content?.[0];
  return block?.text?.trim() || '';
}

function writeSessionLog({ session, config, db, getSessionHistory }) {
  try {
    const enabled = config.sessionLogs?.enabled === true || process.env.TERMDECK_SESSION_LOGS === '1';
    if (!enabled) return;

    const sessionsDir = path.join(os.homedir(), '.termdeck', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const commands = (db && typeof getSessionHistory === 'function')
      ? getSessionHistory(db, session.id).slice().reverse()
      : session.meta.lastCommands.slice();

    // Heuristics: classify commands as edits or errors (also scan command output snippets)
    const edits = [];
    const errors = [];
    for (const c of commands) {
      const text = `${c.command || ''} ${c.output_snippet || ''}`;
      if (/\b(vim|nano|nvim|code|edit|Edit |Create |Update |Delete )\b/.test(text)) {
        edits.push(c.command);
      }
      if (/\b(error|Error|fatal|Traceback|panic|ECONN|ENOENT)\b/.test(text)) {
        errors.push(c.command);
      }
    }

    const apiKey = config.rag?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    const model = config.sessionLogs?.summaryModel || 'claude-haiku-4-5';

    const finishWrite = (summary) => {
      const markdown = buildMarkdown({ session, summary, commands, edits, errors });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const slug = slugify(session.meta.label || session.meta.type);
      const filename = `${ts}-${session.id.slice(0, 8)}-${slug}.md`;
      const filepath = path.join(sessionsDir, filename);
      fs.writeFileSync(filepath, markdown, 'utf-8');
      console.log(`[session-logger] wrote ${filepath}`);
    };

    if (!apiKey) {
      if (!warnedNoKey) {
        console.warn('[session-logger] ANTHROPIC_API_KEY not set — writing logs without LLM summary');
        warnedNoKey = true;
      }
      finishWrite(null);
      return;
    }

    // Fire-and-forget: do not block session teardown
    summarizeWithLLM({ session, commands, edits, errors, model, apiKey })
      .then((summary) => finishWrite(summary))
      .catch((err) => {
        console.warn('[session-logger] LLM summary failed, writing without summary:', err.message);
        finishWrite(null);
      });
  } catch (err) {
    console.error('[session-logger] writeSessionLog failed:', err);
  }
}

module.exports = { writeSessionLog };
