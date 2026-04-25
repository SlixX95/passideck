'use strict';

// TranscriptWriter — batched, non-blocking PTY output archiver.
// Buffers chunks in memory and flushes to Supabase/Postgres on an interval.
// Circuit breaker prevents cascade failure if the database is unreachable.

let pg;
try { pg = require('pg'); } catch (err) { pg = null; }

// Strip ANSI escape codes (CSI sequences, OSC sequences, simple escapes)
function stripAnsi(str) {
  return str
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')   // OSC sequences
    .replace(/\x1b\[[\?]?[0-9;]*[A-Za-z]/g, '')       // CSI sequences
    .replace(/\x1b[()][AB012]/g, '')                    // charset switches
    .replace(/\x1b[\x20-\x2F]*[\x40-\x7E]/g, '');     // remaining two-byte escapes
}

class TranscriptWriter {
  /**
   * @param {string} databaseUrl - Postgres connection string
   * @param {object} [options]
   * @param {number} [options.batchSize=50]         - max chunks per flush
   * @param {number} [options.flushIntervalMs=2000] - flush timer interval
   * @param {boolean} [options.enabled=true]        - master on/off
   */
  constructor(databaseUrl, options = {}) {
    this._databaseUrl = databaseUrl;
    this._batchSize = options.batchSize || 50;
    this._flushIntervalMs = options.flushIntervalMs || 2000;
    this._maxBufferSize = options.maxBufferSize || 10000;
    this._enabled = options.enabled !== false;

    // Per-session monotonic chunk counters
    this._counters = new Map();  // sessionId -> next chunk_index

    // Write buffer: array of { sessionId, content, rawBytes, chunkIndex }
    this._buffer = [];

    // Circuit breaker state
    this._consecutiveErrors = 0;
    this._circuitOpen = false;
    this._circuitOpenedAt = 0;
    this._circuitCooldownMs = 60000; // 60s

    // Lazy pool
    this._pool = null;
    this._poolFailed = false;
    this._poolFailedAt = 0;
    this._poolRetryMs = 30_000;

    // Start flush timer
    this._timer = null;
    if (this._enabled) {
      this._timer = setInterval(() => this.flush().catch(() => {}), this._flushIntervalMs);
    }
  }

  // Lazy-init pg.Pool (same pattern as getRumenPool in index.js)
  _getPool() {
    if (this._pool) return this._pool;
    if (this._poolFailed) {
      if (Date.now() - this._poolFailedAt < this._poolRetryMs) return null;
      console.warn('[transcript] retrying pool creation after 30s cooldown');
      this._poolFailed = false;
      this._poolFailedAt = 0;
    }
    if (!pg || !this._databaseUrl) return null;
    try {
      this._pool = new pg.Pool({
        connectionString: this._databaseUrl,
        max: 3,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });
      this._pool.on('error', (err) => {
        console.error('[transcript] pool error:', err.message);
      });
      return this._pool;
    } catch (err) {
      console.error('[transcript] pool creation failed:', err.message);
      this._poolFailed = true;
      this._poolFailedAt = Date.now();
      return null;
    }
  }

  /**
   * Queue a chunk for writing. Non-blocking. Returns immediately.
   * @param {string} sessionId
   * @param {string} content - raw PTY output (may contain ANSI)
   * @param {number} rawByteCount - byte length of original data
   */
  append(sessionId, content, rawByteCount) {
    if (!this._enabled) return;

    const stripped = stripAnsi(content);
    if (!stripped.trim()) return; // skip empty-after-strip chunks

    // Monotonic chunk index per session
    const idx = this._counters.get(sessionId) || 0;
    this._counters.set(sessionId, idx + 1);

    // Cap buffer to prevent unbounded growth during sustained DB failures
    if (this._buffer.length >= this._maxBufferSize) {
      this._buffer.splice(0, this._buffer.length - this._maxBufferSize + 1);
    }

    this._buffer.push({
      sessionId,
      content: stripped,
      rawBytes: rawByteCount || Buffer.byteLength(content, 'utf8'),
      chunkIndex: idx
    });

    // Auto-flush if buffer is full
    if (this._buffer.length >= this._batchSize) {
      this.flush().catch(() => {});
    }
  }

  /**
   * Flush pending chunks to Postgres. Called on interval and on shutdown.
   */
  async flush() {
    if (!this._enabled || this._buffer.length === 0) return;

    // Circuit breaker check
    if (this._circuitOpen) {
      const elapsed = Date.now() - this._circuitOpenedAt;
      if (elapsed < this._circuitCooldownMs) return;
      // Cooldown expired — half-open, try one flush
      this._circuitOpen = false;
      console.log('[transcript] circuit breaker half-open, retrying');
    }

    const pool = this._getPool();
    if (!pool) return;

    // Drain buffer (take up to batchSize)
    const batch = this._buffer.splice(0, this._batchSize);
    if (batch.length === 0) return;

    try {
      // Build a multi-row INSERT
      const values = [];
      const params = [];
      let paramIdx = 1;

      for (const chunk of batch) {
        values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3})`);
        params.push(chunk.sessionId, chunk.chunkIndex, chunk.content, chunk.rawBytes);
        paramIdx += 4;
      }

      const sql = `INSERT INTO termdeck_transcripts (session_id, chunk_index, content, raw_bytes)
        VALUES ${values.join(', ')}`;

      await pool.query(sql, params);

      // Success — reset circuit breaker
      this._consecutiveErrors = 0;
    } catch (err) {
      console.error('[transcript] flush error:', err.message);

      // Put chunks back at front of buffer for retry
      this._buffer.unshift(...batch);

      this._consecutiveErrors++;
      if (this._consecutiveErrors >= 3) {
        this._circuitOpen = true;
        this._circuitOpenedAt = Date.now();
        console.error('[transcript] circuit breaker open — disabling writes for 60s');
      }
    }
  }

  /**
   * Retrieve transcript for crash recovery.
   * @param {string} sessionId
   * @param {object} [options]
   * @param {number} [options.limit]  - max chunks to return
   * @param {string} [options.since]  - ISO timestamp, only chunks after this time
   * @returns {Promise<Array<{chunk_index, content, raw_bytes, created_at}>>}
   */
  async getSessionTranscript(sessionId, { limit, since } = {}) {
    const pool = this._getPool();
    if (!pool) return [];

    let sql = 'SELECT chunk_index, content, raw_bytes, created_at FROM termdeck_transcripts WHERE session_id = $1';
    const params = [sessionId];
    let paramIdx = 2;

    if (since) {
      sql += ` AND created_at >= $${paramIdx}`;
      params.push(since);
      paramIdx++;
    }

    sql += ' ORDER BY chunk_index ASC';

    if (limit) {
      sql += ` LIMIT $${paramIdx}`;
      params.push(limit);
    }

    try {
      const result = await pool.query(sql, params);
      return result.rows;
    } catch (err) {
      console.error('[transcript] getSessionTranscript error:', err.message);
      return [];
    }
  }

  /**
   * Search across all transcripts using full-text search.
   * @param {string} query - search terms
   * @param {object} [options]
   * @param {string} [options.sessionId] - restrict to one session
   * @param {string} [options.since]     - ISO timestamp lower bound
   * @param {number} [options.limit=50]  - max results
   * @returns {Promise<Array<{session_id, chunk_index, content, created_at, rank}>>}
   */
  async search(query, { sessionId, since, limit = 50 } = {}) {
    const pool = this._getPool();
    if (!pool) return [];

    let sql = `SELECT session_id, chunk_index, content, created_at,
        ts_rank(fts, websearch_to_tsquery('english', $1)) AS rank
      FROM termdeck_transcripts
      WHERE fts @@ websearch_to_tsquery('english', $1)`;
    const params = [query];
    let paramIdx = 2;

    if (sessionId) {
      sql += ` AND session_id = $${paramIdx}`;
      params.push(sessionId);
      paramIdx++;
    }

    if (since) {
      sql += ` AND created_at >= $${paramIdx}`;
      params.push(since);
      paramIdx++;
    }

    sql += ` ORDER BY rank DESC, created_at DESC LIMIT $${paramIdx}`;
    params.push(limit);

    try {
      const result = await pool.query(sql, params);
      return result.rows;
    } catch (err) {
      console.error('[transcript] search error:', err.message);
      return [];
    }
  }

  /**
   * Get recent transcript chunks across all sessions (crash recovery).
   * @param {number} [minutes=60] - how far back to look
   * @param {number} [limit=500]  - max rows
   * @returns {Promise<Array>}
   */
  async getRecent(minutes = 60, limit = 500) {
    const pool = this._getPool();
    if (!pool) return [];

    const sql = `SELECT session_id, chunk_index, content, raw_bytes, created_at
      FROM termdeck_transcripts
      WHERE created_at >= NOW() - $1::interval
      ORDER BY created_at DESC
      LIMIT $2`;

    try {
      const result = await pool.query(sql, [`${minutes} minutes`, limit]);
      return result.rows;
    } catch (err) {
      console.error('[transcript] getRecent error:', err.message);
      return [];
    }
  }

  /**
   * Graceful shutdown — flush remaining buffer and close pool.
   */
  async close() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }

    // Force flush remaining buffer (bypass circuit breaker for shutdown)
    this._circuitOpen = false;
    await this.flush();

    if (this._pool) {
      try { await this._pool.end(); } catch (err) { console.warn('[transcript] pool close error:', err.message); }
      this._pool = null;
    }
  }
}

module.exports = { TranscriptWriter, stripAnsi };
