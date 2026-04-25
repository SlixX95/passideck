// Mnestra bridge — routes TermDeck memory queries through one of three backends:
//   - direct:  talk to Supabase + OpenAI from the server (pre-bridge behavior)
//   - webhook: POST to Mnestra's HTTP webhook server (T3.1) at rag.mnestraWebhookUrl
//   - mcp:     spawn the @jhizzard/mnestra binary and talk JSON-RPC over stdio
//
// All three modes return the same shape:
//   { memories: Array<{ content, source_type, project, similarity, created_at }>, total }
//
// Errors are thrown as plain Error objects; the caller maps them to HTTP responses.

const { spawn } = require('child_process');
const { resolveProjectName } = require('../rag');

function createBridge(config) {
  const mode = config.rag?.mnestraMode || 'direct';
  const state = { mcpChild: null, mcpQueue: [], mcpNextId: 1, mcpBuffer: '' };

  async function queryDirect({ question, project, searchAll }) {
    const supabaseUrl = config.rag?.supabaseUrl;
    const supabaseKey = config.rag?.supabaseKey;
    const openaiKey = config.rag?.openaiApiKey || process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('RAG not configured — add supabaseUrl and supabaseKey to ~/.termdeck/config.yaml');
    }
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: question,
        dimensions: 1536
      })
    });
    if (!embeddingRes.ok) {
      const err = await embeddingRes.text();
      console.error('[mnestra-bridge:direct] embedding failed:', err);
      throw new Error('Embedding generation failed');
    }
    const embeddingData = await embeddingRes.json();
    const embedding = embeddingData.data[0].embedding;

    // NOTE: memory_hybrid_search (migrations/004) accepts exactly 8 named params:
    //   query_text, query_embedding, match_count, full_text_weight,
    //   semantic_weight, rrf_k, filter_project, filter_source_type.
    // PostgREST matches RPC functions by the set of JSON keys in the body — any
    // extra key (e.g. recency_weight, decay_days) makes it fail to resolve the
    // overload and return 404 "Could not find the function". That was silently
    // killing every Flashback query for 15 sprints.
    const rpcBody = {
      query_text: question,
      query_embedding: `[${embedding.join(',')}]`,
      match_count: 10,
      full_text_weight: 1.0,
      semantic_weight: 1.0,
      rrf_k: 60,
      filter_project: searchAll ? null : (project || null),
      filter_source_type: null
    };
    console.log(`[flashback] direct RPC → memory_hybrid_search project=${rpcBody.filter_project ?? 'ALL'} q="${question.slice(0, 60)}"`);
    const searchRes = await fetch(`${supabaseUrl}/rest/v1/rpc/memory_hybrid_search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify(rpcBody)
    });
    if (!searchRes.ok) {
      const err = await searchRes.text();
      console.error(`[flashback] direct RPC failed ${searchRes.status}:`, err);
      console.error('[mnestra-bridge:direct] supabase search failed:', err);
      throw new Error(`Memory search failed (${searchRes.status})`);
    }
    const rows = await searchRes.json();
    console.log(`[flashback] direct RPC returned ${rows.length} rows`);
    return {
      memories: rows.map((m) => ({
        content: m.content,
        source_type: m.source_type,
        project: m.project,
        // memory_hybrid_search returns `score`, not `similarity`.
        similarity: m.similarity ?? m.score ?? null,
        created_at: m.created_at
      })),
      total: rows.length
    };
  }

  async function queryWebhook({ question, project, searchAll }) {
    const url = config.rag?.mnestraWebhookUrl || 'http://localhost:37778/mnestra';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        op: 'recall',
        question,
        project: searchAll ? null : (project || null),
        min_results: 5
      })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[mnestra-bridge:webhook] request failed:', err);
      throw new Error(`Mnestra webhook returned ${res.status}`);
    }
    const data = await res.json();
    const rows = data.memories || [];
    return {
      memories: rows.map((m) => ({
        content: m.content,
        source_type: m.source_type,
        project: m.project,
        similarity: m.similarity ?? m.score ?? null,
        created_at: m.created_at
      })),
      total: rows.length
    };
  }

  function ensureMcpChild() {
    if (state.mcpChild && !state.mcpChild.killed) return state.mcpChild;

    const bin = config.rag?.mnestraBinary || 'mnestra';
    const child = spawn(bin, ['serve', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
    state.mcpChild = child;
    state.mcpBuffer = '';

    child.stdout.on('data', (chunk) => {
      state.mcpBuffer += chunk.toString('utf-8');
      let idx;
      while ((idx = state.mcpBuffer.indexOf('\n')) >= 0) {
        const line = state.mcpBuffer.slice(0, idx).trim();
        state.mcpBuffer = state.mcpBuffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          const pending = state.mcpQueue.find((p) => p.id === msg.id);
          if (pending) {
            state.mcpQueue = state.mcpQueue.filter((p) => p !== pending);
            if (msg.error) pending.reject(new Error(msg.error.message || 'Mnestra MCP error'));
            else pending.resolve(msg.result);
          }
        } catch (err) {
          console.error('[mnestra-bridge:mcp] parse error:', err.message, line);
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      console.error('[mnestra-bridge:mcp]', chunk.toString('utf-8').trim());
    });

    child.on('exit', (code, signal) => {
      console.warn(`[mnestra-bridge:mcp] child exited (code=${code}, signal=${signal}); will respawn on next call`);
      state.mcpChild = null;
      for (const pending of state.mcpQueue) {
        pending.reject(new Error('Mnestra MCP child exited'));
      }
      state.mcpQueue = [];
    });

    return child;
  }

  function mcpCall(method, params) {
    const child = ensureMcpChild();
    const id = state.mcpNextId++;
    const req = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      state.mcpQueue.push({ id, resolve, reject });
      try {
        child.stdin.write(JSON.stringify(req) + '\n');
      } catch (err) {
        state.mcpQueue = state.mcpQueue.filter((p) => p.id !== id);
        reject(err);
      }
      // Safety timeout
      setTimeout(() => {
        const pending = state.mcpQueue.find((p) => p.id === id);
        if (pending) {
          state.mcpQueue = state.mcpQueue.filter((p) => p !== pending);
          pending.reject(new Error('Mnestra MCP call timed out'));
        }
      }, 15000);
    });
  }

  async function queryMcp({ question, project, searchAll }) {
    try {
      const result = await mcpCall('tools/call', {
        name: 'memory_recall',
        arguments: {
          query: question,
          project: searchAll ? null : (project || null),
          match_count: 10
        }
      });
      const rows = (result && (result.memories || result.content || [])) || [];
      return {
        memories: rows.map((m) => ({
          content: m.content,
          source_type: m.source_type,
          project: m.project,
          similarity: m.similarity ?? m.score ?? null,
          created_at: m.created_at
        })),
        total: rows.length
      };
    } catch (err) {
      // Kill child so it respawns next call
      if (state.mcpChild) {
        try { state.mcpChild.kill(); } catch (err) { /* process may already be dead */ }
        state.mcpChild = null;
      }
      throw err;
    }
  }

  async function queryMnestra({ question, project, searchAll, sessionContext, cwd }) {
    // Flashback callers pass the session's project (from config.yaml). If that
    // slot is empty — e.g. a session created without an explicit project — fall
    // back to resolving the session's cwd against config.projects so queries
    // don't leak into unrelated repos via basename collisions.
    let effectiveProject = project;
    if (!effectiveProject) {
      const ctxCwd = cwd || (sessionContext && sessionContext.cwd);
      if (ctxCwd) {
        effectiveProject = resolveProjectName(ctxCwd, config);
      }
    }

    switch (mode) {
      case 'webhook':
        return queryWebhook({ question, project: effectiveProject, searchAll });
      case 'mcp':
        return queryMcp({ question, project: effectiveProject, searchAll });
      case 'direct':
      default:
        return queryDirect({ question, project: effectiveProject, searchAll });
    }
  }

  return { mode, queryMnestra };
}

module.exports = { createBridge };
