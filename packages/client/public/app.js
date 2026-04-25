/* Extracted from index.html 2026-04-15 — see git blame on index.html prior to commit UNCOMMITTED for history */
    // ===== TermDeck Client =====
    const API = window.location.origin;
    const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const WS_BASE = `${WS_PROTOCOL}//${window.location.host}/ws`;

    // State
    const state = {
      sessions: new Map(),   // id → { session, terminal, ws, fitAddon, el }
      layout: '2x1',
      themes: {},
      config: {},
      focusedId: null
    };

    // ===== API helpers =====
    async function api(method, path, body) {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(`${API}${path}`, opts);
      return res.json();
    }

    // ===== Initialize =====
    async function init() {
      // Load config
      state.config = await api('GET', '/api/config');

      // Populate project dropdown
      const sel = document.getElementById('promptProject');
      for (const name of Object.keys(state.config.projects || {})) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      }

      // Load themes
      const themeList = await api('GET', '/api/themes');
      for (const t of themeList) {
        state.themes[t.id] = t;
      }

      // Load existing sessions
      const sessions = await api('GET', '/api/sessions');
      for (const s of sessions) {
        if (s.meta.status !== 'exited') {
          createTerminalPanel(s);
        }
      }

      // RAG indicator removed (Sprint 9 T2): redundant with health badge which
      // already surfaces mnestra_reachable / mnestra_has_memories per-check.
      // The #stat-rag HTML stub is hidden by default; T1 can strip it from
      // index.html.

      // Disable AI input bars if Supabase/OpenAI not configured
      if (!state.config.aiQueryAvailable) {
        document.querySelectorAll('.ctrl-input').forEach(el => {
          el.placeholder = 'Configure Supabase in ~/.termdeck/config.yaml to enable';
          el.disabled = true;
        });
      }

      updateEmptyState();

      // Rumen insights badge + briefing (no-op when server reports enabled:false)
      setupRumen();

      // Health badge (Sprint 6 T4) — polls /api/health every 30s
      setupHealthBadge();

      // Transcript recovery UI (Sprint 6 T4) — depends on T3 endpoints
      setupTranscriptUI();

      // First-run onboarding tour. Fires on the first visit only; never again
      // unless the user explicitly clicks "how this works" in the top toolbar.
      try {
        if (!localStorage.getItem('termdeck:tour:seen')) {
          setTimeout(() => { if (!tourState.active) startTour(); }, 1200);
        }
      } catch {}

      // Sprint 19 T2: auto-open setup wizard if /api/setup reports firstRun.
      // Silent-fail if the endpoint isn't available yet (T1 not merged).
      maybeAutoOpenSetupWizard();
    }

    // ===== Create Terminal Panel =====
    function createTerminalPanel(sessionData) {
      const id = sessionData.id;
      const meta = sessionData.meta;

      // Idempotency guard: multiple code paths can trigger this function for
      // the same session ID in rapid succession — status_broadcast handler
      // (2s interval), external-session poller (3s interval), launchTerminal
      // (immediate after POST), and init() on page load. Without a claim at
      // function entry, two of these can race and create two client panels
      // for the same server session — which means two WebSockets, the second
      // overwrites session.ws on the server, and term.onData output stops
      // reaching the first panel's xterm. Result: terminals spawn but never
      // render a prompt and don't accept input.
      //
      // Fix: reserve the slot in state.sessions immediately on entry. Any
      // subsequent call sees has(id) and early-returns. The full entry gets
      // written later when the xterm + ws + fitAddon are built; that write
      // overwrites this placeholder in place.
      if (state.sessions.has(id)) return;
      state.sessions.set(id, { _mounting: true });

      // Hide empty state
      document.getElementById('emptyState').style.display = 'none';

      // Project CSS class
      const projClass = meta.project
        ? `project-${meta.project.replace(/[^a-z0-9]/gi, '').toLowerCase()}`
        : 'project-default';

      // Build panel HTML
      const panel = document.createElement('div');
      panel.className = 'term-panel';
      panel.id = `panel-${id}`;
      panel.innerHTML = `
        <div class="panel-header">
          <div class="panel-header-left">
            <span class="status-dot" id="dot-${id}" style="background:${getStatusColor(meta.status)}"></span>
            <span class="panel-type">${getTypeLabel(meta.type)}</span>
            ${meta.project ? `<span class="panel-project ${projClass}">${meta.project}</span>` : ''}
            <span class="panel-index" id="idx-${id}"></span>
            <span class="panel-sid" title="Session ID: ${id}">${id.slice(0, 8)}</span>
            <span class="panel-status" id="status-${id}">${meta.statusDetail || meta.status}</span>
          </div>
          <div class="panel-header-right">
            <button class="panel-btn" onclick="focusPanel('${id}')" title="Focus this terminal">&#9634;</button>
            <button class="panel-btn" onclick="halfPanel('${id}')" title="Half screen">&#9645;</button>
            <button class="panel-btn danger" onclick="closePanel('${id}')" title="Close terminal">&times;</button>
          </div>
        </div>
        <div class="panel-meta">
          <span class="meta-item"><span class="meta-label">opened</span> ${timeAgo(meta.createdAt)}</span>
          <span class="meta-item"><span class="meta-label">why</span> ${meta.reason}</span>
          <span class="meta-item" id="meta-last-${id}"><span class="meta-label">last</span> ${meta.lastCommands?.length ? meta.lastCommands[meta.lastCommands.length - 1].command : '—'}</span>
          <span class="meta-item" id="meta-port-${id}" style="${meta.detectedPort ? '' : 'display:none'}"><span class="meta-label">port</span> <span class="meta-value">:${meta.detectedPort || ''}</span></span>
          <span class="meta-item" id="meta-reqs-${id}" style="${meta.type === 'python-server' ? '' : 'display:none'}"><span class="meta-label">reqs</span> <span class="meta-value">${meta.requestCount || 0}</span></span>
        </div>
        <div class="panel-terminal" id="term-${id}"></div>
        <div class="panel-drawer" id="drawer-${id}">
          <div class="drawer-tabs" role="tablist">
            <button class="drawer-tab active" data-tab="overview" data-panel-id="${id}">Overview</button>
            <button class="drawer-tab" data-tab="commands" data-panel-id="${id}">Commands<span class="tab-badge" id="badge-commands-${id}">0</span></button>
            <button class="drawer-tab" data-tab="memory" data-panel-id="${id}">Memory<span class="tab-badge" id="badge-memory-${id}">0</span></button>
            <button class="drawer-tab" data-tab="log" data-panel-id="${id}">Status log<span class="tab-badge" id="badge-log-${id}">0</span></button>
          </div>
          <div class="drawer-body">
            <div class="drawer-panel drawer-overview active" data-panel="overview">
              <div class="overview-controls">
                <select class="theme-select" id="theme-${id}" onchange="changeTheme('${id}', this.value)">
                  ${Object.entries(state.themes).map(([tid, t]) =>
                    `<option value="${tid}" ${tid === meta.theme ? 'selected' : ''}>${t.label}</option>`
                  ).join('')}
                </select>
                <button class="ctrl-btn" onclick="focusPanel('${id}')">focus</button>
                <button class="ctrl-btn" onclick="halfPanel('${id}')">half</button>
                <button class="ctrl-btn reply-toggle" id="reply-btn-${id}" onclick="toggleReplyForm('${id}')" title="Send text to another terminal">reply ▸</button>
                <input type="text" class="ctrl-input" id="ai-${id}" placeholder="Ask about this terminal..." onkeydown="if(event.key==='Enter')askAI('${id}', this.value)">
              </div>
              <div class="reply-form" id="reply-form-${id}">
                <select class="reply-target" id="reply-target-${id}"></select>
                <input type="text" class="reply-text" id="reply-text-${id}" placeholder="Text to send..." onkeydown="if(event.key==='Enter')sendReply('${id}')">
                <button class="reply-send" id="reply-send-${id}" onclick="sendReply('${id}')">send</button>
                <div class="reply-status" id="reply-status-${id}"></div>
              </div>
              <div class="overview-meta" id="ovmeta-${id}"></div>
            </div>
            <div class="drawer-panel drawer-list" data-panel="commands" id="dp-commands-${id}">
              <div class="empty-msg">No commands captured yet.</div>
            </div>
            <div class="drawer-panel drawer-list" data-panel="memory" id="dp-memory-${id}">
              <div class="empty-msg">No memory hits yet. Ask about this terminal or wait for a proactive lookup.</div>
            </div>
            <div class="drawer-panel drawer-list" data-panel="log" id="dp-log-${id}">
              <div class="empty-msg">No status transitions recorded yet.</div>
            </div>
          </div>
        </div>
      `;

      document.getElementById('termGrid').appendChild(panel);

      // Create xterm.js instance
      const terminal = new Terminal({
        fontFamily: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace",
        fontSize: 13,
        lineHeight: 1.3,
        cursorBlink: true,
        cursorStyle: 'bar',
        allowProposedApi: true,
        scrollback: 5000,
        theme: getThemeObject(meta.theme)
      });

      const fitAddon = new FitAddon.FitAddon();
      terminal.loadAddon(fitAddon);

      const webLinksAddon = new WebLinksAddon.WebLinksAddon();
      terminal.loadAddon(webLinksAddon);

      const container = document.getElementById(`term-${id}`);
      terminal.open(container);

      // Delay fit to ensure DOM is ready
      requestAnimationFrame(() => {
        fitAddon.fit();
        // Inform server of initial size
        api('POST', `/api/sessions/${id}/resize`, {
          cols: terminal.cols,
          rows: terminal.rows
        });
      });

      // Connect WebSocket
      const ws = new WebSocket(`${WS_BASE}?session=${id}`);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'output':
              terminal.write(msg.data);
              break;
            case 'meta':
              updatePanelMeta(id, msg.session.meta);
              break;
            case 'exit':
              updatePanelMeta(id, {
                status: 'exited',
                statusDetail: `Exited (${msg.exitCode})`
              });
              // Dim the panel
              const exitPanel = document.getElementById(`panel-${id}`);
              if (exitPanel) exitPanel.classList.add('exited');
              refreshAllReplyFormsFor(id);
              refreshPanelIndices();
              renderSwitcher();
              break;
            case 'status_broadcast':
              updateGlobalStats(msg.sessions);
              break;
          }
        } catch (err) { console.error('[client] ws message parse failed:', err); }
      };

      ws.onclose = (event) => {
        console.log(`[ws] Disconnected from session ${id} (code ${event.code})`);
        const entry = state.sessions.get(id);
        if (!entry) return;

        // Don't reconnect if session was explicitly closed or exited
        if (event.code === 4000 || event.code === 4001) return;
        const panel = document.getElementById(`panel-${id}`);
        if (panel && panel.classList.contains('exited')) return;

        // Auto-reconnect with backoff
        const delay = Math.min(1000 * Math.pow(2, (entry._reconnectAttempts || 0)), 10000);
        entry._reconnectAttempts = (entry._reconnectAttempts || 0) + 1;

        if (entry._reconnectAttempts <= 5) {
          console.log(`[ws] Reconnecting session ${id} in ${delay}ms (attempt ${entry._reconnectAttempts})`);
          setTimeout(() => reconnectSession(id), delay);
        } else {
          updatePanelMeta(id, { status: 'errored', statusDetail: 'Connection lost' });
        }
      };

      // Terminal input → WebSocket
      terminal.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });

      // Track focus
      terminal.textarea?.addEventListener('focus', () => {
        panel.classList.add('active-input');
        state.focusedId = id;
      });
      terminal.textarea?.addEventListener('blur', () => {
        panel.classList.remove('active-input');
      });

      // Store reference
      state.sessions.set(id, {
        session: sessionData,
        terminal,
        ws,
        fitAddon,
        el: panel,
        activeTab: 'overview',
        drawerOpen: false,
        commandHistory: [],
        commandsLoaded: false,
        memoryHits: [],
        statusLog: [],
        lastKnownStatus: meta.status,
      });

      // Seed an initial status-log entry so the tab isn't blank
      appendStatusLog(id, meta.status, meta.statusDetail || '');

      // Drawer tab wiring
      setupDrawerListeners(id);
      renderOverviewTab(id);
      renderSwitcher();

      // Reply form: disabled until there's another panel to target
      const replyBtn = document.getElementById(`reply-btn-${id}`);
      if (replyBtn) replyBtn.disabled = state.sessions.size < 2;
      refreshAllReplyFormsFor(id);
      refreshPanelIndices();

      // Handle window resize
      const resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon.fit();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'resize',
              cols: terminal.cols,
              rows: terminal.rows
            }));
          }
        } catch (err) { console.error('[client] terminal resize failed:', err); }
      });
      resizeObserver.observe(container);

      return { terminal, ws, fitAddon };
    }

    // ===== Control dashboard (T1.6) =====
    async function enterControlMode() {
      // Pre-warm command history for every open session so the feed is dense.
      const loads = [];
      for (const [sid, entry] of state.sessions) {
        if (entry.commandsLoaded) continue;
        loads.push(
          api('GET', `/api/sessions/${sid}/history`).then(resp => {
            const list = Array.isArray(resp) ? resp : (resp.commands || resp.history || []);
            entry.commandHistory = list;
            entry.commandsLoaded = true;
          }).catch(() => { /* silent */ })
        );
      }
      await Promise.allSettled(loads);
      renderControlFeed();
    }

    function renderControlFeed() {
      const grid = document.getElementById('termGrid');
      const rowsEl = document.getElementById('feedRows');
      const countEl = document.getElementById('feedCount');
      if (!grid || !rowsEl) return;
      if (!grid.classList.contains('layout-control')) return;

      const events = [];
      for (const [sid, entry] of state.sessions) {
        const meta = entry.session?.meta || {};
        const label = `${getTypeLabel(meta.type || 'shell')}${meta.project ? '·' + meta.project : ''}`;
        const statusColor = getStatusColor(meta.status || 'idle');

        // Status transitions
        for (const ev of (entry.statusLog || [])) {
          const isErr = ev.status === 'errored';
          events.push({
            at: new Date(ev.at).getTime(),
            sid,
            label,
            statusColor,
            kind: isErr ? 'error' : 'status',
            body: `${ev.status}${ev.detail ? ' — ' + ev.detail : ''}`,
          });
        }

        // Recent commands
        for (const c of (entry.commandHistory || []).slice(0, 25)) {
          const t = c.timestamp || c.createdAt || c.created_at;
          if (!t) continue;
          events.push({
            at: new Date(t).getTime(),
            sid,
            label,
            statusColor,
            kind: 'command',
            body: c.command || c.cmd || '',
          });
        }

        // Memory hits cached from askAI / proactive queries
        for (const m of (entry.memoryHits || []).slice(0, 10)) {
          if (!m.cachedAt) continue;
          events.push({
            at: new Date(m.cachedAt).getTime(),
            sid,
            label,
            statusColor,
            kind: 'memory',
            body: (m.content || m.text || '(memory)').slice(0, 220),
          });
        }
      }

      events.sort((a, b) => b.at - a.at);
      const capped = events.slice(0, 200);

      if (countEl) countEl.textContent = `${capped.length} event${capped.length === 1 ? '' : 's'}`;

      if (capped.length === 0) {
        rowsEl.innerHTML = '<div class="feed-empty">No activity yet. Commands, status transitions, and memory hits will appear here.</div>';
        return;
      }

      rowsEl.innerHTML = capped.map(ev => {
        const t = new Date(ev.at);
        const hh = String(t.getHours()).padStart(2, '0');
        const mm = String(t.getMinutes()).padStart(2, '0');
        const ss = String(t.getSeconds()).padStart(2, '0');
        return `
          <div class="feed-row" data-session-id="${ev.sid}">
            <span class="feed-time">${hh}:${mm}:${ss}</span>
            <span class="feed-panel-ref"><span class="dot" style="background:${ev.statusColor}"></span>${escapeHtml(ev.label)}</span>
            <span class="feed-kind ${ev.kind}">${ev.kind}</span>
            <span class="feed-body">${escapeHtml(ev.body)}</span>
          </div>
        `;
      }).join('');
    }

    function onFeedRowClick(e) {
      const row = e.target.closest('.feed-row');
      if (!row) return;
      const sid = row.dataset.sessionId;
      if (!sid) return;
      // Return to 2x2 layout and focus the source panel
      setLayout('2x2');
      requestAnimationFrame(() => focusSessionById(sid));
    }

    // ===== Proactive memory toast (T1.4) =====
    const PROACTIVE_COOLDOWN_MS = 30_000;

    async function triggerProactiveMemoryQuery(id) {
      const entry = state.sessions.get(id);
      if (!entry) return;
      if (!state.config.aiQueryAvailable) return;

      const now = Date.now();
      if (entry._lastProactiveAt && now - entry._lastProactiveAt < PROACTIVE_COOLDOWN_MS) return;
      entry._lastProactiveAt = now;

      const meta = entry.session?.meta || {};
      const lastCmd = meta.lastCommands?.length
        ? meta.lastCommands[meta.lastCommands.length - 1].command
        : '';
      const type = meta.type || 'shell';
      const question = `${type} error ${lastCmd}`.trim();
      if (!question || question === `${type} error`) {
        // No command context — still query using status detail as a last resort
        if (!meta.statusDetail) return;
      }

      try {
        const result = await api('POST', '/api/ai/query', {
          question: question || `${type} error ${meta.statusDetail || ''}`.trim(),
          sessionId: id,
          project: meta.project || null,
        });
        if (result?.error) return;
        if (!Array.isArray(result?.memories) || result.memories.length === 0) return;

        // Cache every hit into the Memory tab so the drawer stays in sync
        if (!entry.memoryHits) entry.memoryHits = [];
        const cachedAt = new Date().toISOString();
        for (const m of result.memories) entry.memoryHits.unshift({ ...m, cachedAt });
        if (entry.memoryHits.length > 60) entry.memoryHits.length = 60;
        setBadge(id, 'memory', entry.memoryHits.length);
        if (entry.drawerOpen && entry.activeTab === 'memory') renderMemoryTab(id);

        showProactiveToast(id, result.memories[0]);
      } catch (err) {
        console.error('[client] proactive memory query failed:', err);
      }
    }

    function showProactiveToast(id, hit) {
      const entry = state.sessions.get(id);
      if (!entry || !entry.el) return;

      // Remove any prior toast for this panel
      const prev = entry.el.querySelector('.proactive-toast');
      if (prev) prev.remove();

      const toast = document.createElement('div');
      toast.className = 'proactive-toast';
      const proj = hit.project ? escapeHtml(hit.project) : 'another session';
      const snippet = escapeHtml((hit.content || hit.text || '').slice(0, 220));
      const score = typeof hit.similarity === 'number' ? `${(hit.similarity * 100).toFixed(0)}%` : '';

      toast.innerHTML = `
        <button class="t-dismiss" aria-label="Dismiss">×</button>
        <div class="t-title">Mnestra — possible match</div>
        <div class="t-body">Found a similar error in <b>${proj}</b>${score ? ` · ${score}` : ''} — click to see.</div>
        <div class="t-meta">${snippet}</div>
      `;

      entry.el.appendChild(toast);

      const dismiss = () => {
        toast.remove();
        clearTimeout(toast._autoTimer);
      };
      toast.querySelector('.t-dismiss').addEventListener('click', (e) => {
        e.stopPropagation();
        dismiss();
      });
      toast.addEventListener('click', () => {
        dismiss();
        showFlashbackModal(hit, id);
      });

      toast._autoTimer = setTimeout(dismiss, 30000);
    }

    // ===== Flashback modal (Sprint 16 T2) =====
    let _flashbackModalEl = null;
    let _flashbackKeyHandler = null;
    let _flashbackPrevFocus = null;

    function closeFlashbackModal() {
      if (!_flashbackModalEl) return;
      _flashbackModalEl.remove();
      _flashbackModalEl = null;
      if (_flashbackKeyHandler) {
        document.removeEventListener('keydown', _flashbackKeyHandler);
        _flashbackKeyHandler = null;
      }
      if (_flashbackPrevFocus && typeof _flashbackPrevFocus.focus === 'function') {
        try { _flashbackPrevFocus.focus(); } catch {}
      }
      _flashbackPrevFocus = null;
    }

    function logFlashbackFeedback(hit, sessionId, verdict) {
      // Fire-and-forget; no dedicated endpoint yet.
      const payload = {
        verdict,
        sessionId: sessionId || null,
        project: hit?.project || null,
        sourceType: hit?.source_type || hit?.sourceType || null,
        similarity: typeof hit?.similarity === 'number' ? hit.similarity : null,
        contentPreview: (hit?.content || hit?.text || '').slice(0, 160),
        at: new Date().toISOString(),
      };
      console.log('[flashback] feedback', payload);
    }

    function showFlashbackModal(hit, sessionId) {
      // Replace any existing modal (new toast wins).
      if (_flashbackModalEl) closeFlashbackModal();

      _flashbackPrevFocus = document.activeElement;

      const content = (hit?.content || hit?.text || '').trim();
      const project = hit?.project || '';
      const sourceType = hit?.source_type || hit?.sourceType || '';
      const createdAt = hit?.created_at || hit?.createdAt || '';
      const scoreNum = typeof hit?.similarity === 'number' ? hit.similarity : null;
      const scorePct = scoreNum !== null ? `${(scoreNum * 100).toFixed(0)}%` : '';

      const overlay = document.createElement('div');
      overlay.className = 'flashback-modal open';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'flashbackTitle');

      const projectChip = project
        ? `<span class="fb-chip fb-chip-project">${escapeHtml(project)}</span>`
        : '';
      const scoreChip = scorePct
        ? `<span class="fb-chip fb-chip-score">${escapeHtml(scorePct)}</span>`
        : '';
      const sourceLine = sourceType
        ? `<span class="fb-meta-item"><span class="fb-meta-label">source</span> ${escapeHtml(sourceType)}</span>`
        : '';
      const timeLine = createdAt
        ? `<span class="fb-meta-item"><span class="fb-meta-label">when</span> ${escapeHtml(timeAgo(createdAt))}</span>`
        : '';
      const projectLine = project
        ? `<span class="fb-meta-item"><span class="fb-meta-label">project</span> ${escapeHtml(project)}</span>`
        : '';

      overlay.innerHTML = `
        <div class="fb-backdrop"></div>
        <div class="fb-card" tabindex="-1">
          <header>
            <h3 id="flashbackTitle">
              <span class="fb-title-text">Flashback — similar issue found</span>
              <span class="fb-title-chips">${projectChip}${scoreChip}</span>
            </h3>
            <button class="fb-x" type="button" aria-label="Close">×</button>
          </header>
          <div class="fb-body">
            <pre class="fb-content">${escapeHtml(content || '(empty memory)')}</pre>
            <div class="fb-meta">
              ${projectLine}
              ${sourceLine}
              ${timeLine}
            </div>
          </div>
          <footer>
            <div class="fb-feedback">
              <button class="fb-btn fb-helped" type="button">This helped</button>
              <button class="fb-btn fb-not-relevant" type="button">Not relevant</button>
            </div>
            <button class="fb-btn fb-dismiss" type="button">Dismiss</button>
          </footer>
        </div>
      `;

      document.body.appendChild(overlay);
      _flashbackModalEl = overlay;

      overlay.querySelector('.fb-backdrop').addEventListener('click', closeFlashbackModal);
      overlay.querySelector('.fb-x').addEventListener('click', closeFlashbackModal);
      overlay.querySelector('.fb-dismiss').addEventListener('click', closeFlashbackModal);
      overlay.querySelector('.fb-helped').addEventListener('click', () => {
        logFlashbackFeedback(hit, sessionId, 'helped');
        closeFlashbackModal();
      });
      overlay.querySelector('.fb-not-relevant').addEventListener('click', () => {
        logFlashbackFeedback(hit, sessionId, 'not_relevant');
        closeFlashbackModal();
      });

      _flashbackKeyHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeFlashbackModal();
        }
      };
      document.addEventListener('keydown', _flashbackKeyHandler);

      setTimeout(() => {
        const card = overlay.querySelector('.fb-card');
        if (card) card.focus();
      }, 30);
    }

    // ===== Reply / send-to-terminal (T1.3) =====
    // Flip this to false to force the local-WS fallback even when the server
    // endpoint is available — handy for debugging.
    const USE_SERVER_INPUT_API = true;

    function toggleReplyForm(fromId) {
      const form = document.getElementById(`reply-form-${fromId}`);
      if (!form) return;
      const willOpen = !form.classList.contains('open');
      form.classList.toggle('open', willOpen);
      if (willOpen) {
        refreshReplyTargets(fromId);
        const input = document.getElementById(`reply-text-${fromId}`);
        setTimeout(() => input?.focus(), 20);
      }
    }

    function refreshReplyTargets(fromId) {
      const select = document.getElementById(`reply-target-${fromId}`);
      if (!select) return;
      const prev = select.value;

      // F1.3: number duplicate labels with `#N` so e.g. two "Claude Code · termdeck"
      // panels become "Claude Code · termdeck #1" / "... #2". Numbering is across
      // ALL live panels with that base label (including the current one) in
      // state.sessions insertion order, so suffixes stay stable as the user opens
      // the reply form from different panels.
      const groupIndex = new Map();  // sid → index-within-group (1-based, only when group.size ≥ 2)
      const groupCount = new Map();  // baseLabel → count so far
      for (const [sid, entry] of state.sessions) {
        const panel = entry.el;
        if (panel && panel.classList.contains('exited')) continue;
        const meta = entry.session?.meta || {};
        const base = `${getTypeLabel(meta.type || 'shell')}${meta.project ? ' · ' + meta.project : ''}`;
        const next = (groupCount.get(base) || 0) + 1;
        groupCount.set(base, next);
        groupIndex.set(sid, { base, n: next });
      }

      const options = [];
      for (const [sid, entry] of state.sessions) {
        if (sid === fromId) continue;
        const panel = entry.el;
        if (panel && panel.classList.contains('exited')) continue;
        const info = groupIndex.get(sid);
        if (!info) continue;
        const needsSuffix = (groupCount.get(info.base) || 0) >= 2;
        const label = needsSuffix ? `${info.base} #${info.n}` : info.base;
        options.push(`<option value="${sid}">${escapeHtml(label)}</option>`);
      }
      if (options.length === 0) {
        select.innerHTML = `<option value="">(no other terminals)</option>`;
      } else {
        select.innerHTML = options.join('');
        if (prev && Array.from(select.options).some(o => o.value === prev)) {
          select.value = prev;
        }
      }
    }

    // Assign #N index suffixes to panels that share (type, project) with another
    // panel. Insertion-order numbering via Map iteration (Map preserves insert order).
    // Groups of size 1 get no suffix — only collisions get numbered.
    function refreshPanelIndices() {
      const groups = new Map(); // key = "type|project" → [sid, ...]
      for (const [sid, entry] of state.sessions) {
        const meta = entry.session?.meta || {};
        const key = `${meta.type || 'shell'}|${meta.project || ''}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(sid);
      }
      for (const [, sids] of groups) {
        const showIndex = sids.length >= 2;
        sids.forEach((sid, i) => {
          const el = document.getElementById(`idx-${sid}`);
          if (!el) return;
          el.textContent = showIndex ? `#${i + 1}` : '';
        });
      }
    }

    function refreshAllReplyFormsFor(changedId) {
      // When a panel is added, removed, or exits, the target list in *other*
      // panels' open reply forms needs refreshing.
      for (const [sid, entry] of state.sessions) {
        if (sid === changedId) continue;
        const form = document.getElementById(`reply-form-${sid}`);
        if (form && form.classList.contains('open')) {
          refreshReplyTargets(sid);
        }
        const btn = document.getElementById(`reply-btn-${sid}`);
        if (btn) btn.disabled = state.sessions.size < 2;
      }
    }

    async function sendReply(fromId) {
      const select = document.getElementById(`reply-target-${fromId}`);
      const input = document.getElementById(`reply-text-${fromId}`);
      const statusEl = document.getElementById(`reply-status-${fromId}`);
      if (!select || !input) return;
      const targetId = select.value;
      let text = input.value;
      if (!targetId) {
        showReplyStatus(statusEl, 'No target selected.', 'error');
        return;
      }
      if (!text) return;

      const targetEntry = state.sessions.get(targetId);
      if (!targetEntry) {
        showReplyStatus(statusEl, 'Target not found.', 'error');
        return;
      }

      // zsh and most shells want CR. Normalize \n → \r and strip \r\n pairs.
      const normalized = text.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
      // Ensure the line actually submits at the target prompt.
      const payload = normalized.endsWith('\r') ? normalized : normalized + '\r';

      let delivered = false;
      let errMsg = '';

      if (USE_SERVER_INPUT_API) {
        try {
          const result = await api('POST', `/api/sessions/${targetId}/input`, {
            text: payload,
            source: 'reply',
            fromSessionId: fromId,
          });
          if (result && !result.error) {
            delivered = true;
          } else {
            errMsg = result?.error || 'server returned an error';
          }
        } catch (err) {
          errMsg = err.message || String(err);
        }
      }

      if (!delivered) {
        // Local-WS fallback. Used when USE_SERVER_INPUT_API is false, or when
        // the server endpoint is missing / failing.
        const ws = targetEntry.ws;
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'input', data: payload }));
            delivered = true;
          } catch (err) {
            errMsg = err.message || String(err);
          }
        } else {
          if (!errMsg) errMsg = 'target websocket not open';
        }
      }

      if (delivered) {
        input.value = '';
        showReplyStatus(statusEl, `Sent ${payload.length} bytes →`, 'ok');
      } else {
        showReplyStatus(statusEl, `Send failed: ${errMsg}`, 'error');
      }
    }

    function showReplyStatus(el, msg, kind) {
      if (!el) return;
      el.textContent = msg;
      el.classList.remove('error', 'ok');
      if (kind) el.classList.add(kind);
      clearTimeout(el._timer);
      el._timer = setTimeout(() => { el.textContent = ''; el.classList.remove('error', 'ok'); }, 3500);
    }

    // ===== Terminal switcher (T1.2) =====
    function renderSwitcher() {
      const wrap = document.getElementById('termSwitcher');
      const grid = document.getElementById('switcherGrid');
      if (!wrap || !grid) return;

      const ids = Array.from(state.sessions.keys());
      if (ids.length < 2) {
        wrap.classList.remove('visible');
        grid.innerHTML = '';
        return;
      }

      wrap.classList.add('visible');
      grid.innerHTML = '';

      ids.forEach((id, idx) => {
        const entry = state.sessions.get(id);
        if (!entry) return;
        const meta = entry.session?.meta || {};
        const tile = document.createElement('button');
        tile.className = 'switcher-tile';
        tile.type = 'button';
        tile.dataset.sessionId = id;
        tile.title = `${getTypeLabel(meta.type || 'shell')}${meta.project ? ' · ' + meta.project : ''} — ${meta.status || ''}`;
        tile.textContent = String(idx + 1);
        if (state.focusedId === id) tile.classList.add('active');
        if (entry.el && entry.el.classList.contains('exited')) tile.classList.add('exited');

        const dot = document.createElement('span');
        dot.className = 'switcher-dot';
        dot.style.background = getStatusColor(meta.status || 'idle');
        tile.appendChild(dot);

        if (meta.project) {
          const bar = document.createElement('span');
          bar.className = 'switcher-bar';
          bar.style.background = getProjectBarColor(meta.project);
          tile.appendChild(bar);
        }

        tile.addEventListener('click', (e) => {
          e.preventDefault();
          focusSessionById(id);
        });

        grid.appendChild(tile);
      });
    }

    // Pull the CSS-var color for a project tag, falling back to gray
    function getProjectBarColor(project) {
      const cls = `project-${project.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
      const probe = document.createElement('span');
      probe.className = cls;
      probe.style.display = 'none';
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).color;
      document.body.removeChild(probe);
      return color || '#6b7089';
    }

    function focusSessionById(id) {
      const entry = state.sessions.get(id);
      if (!entry) return;

      // If we're in focus-mode, swap which panel is the focused one
      const grid = document.getElementById('termGrid');
      if (grid.classList.contains('layout-focus')) {
        document.querySelectorAll('.term-panel').forEach(p => p.classList.remove('focused'));
        entry.el.classList.add('focused');
      } else if (grid.classList.contains('layout-half')) {
        document.querySelectorAll('.term-panel').forEach(p => p.classList.remove('primary'));
        entry.el.classList.add('primary');
      }

      // Focus the xterm textarea (without stealing pointer)
      try { entry.terminal.focus(); } catch (err) { /* ignore */ }
      state.focusedId = id;

      // Flash the panel border briefly
      entry.el.classList.remove('focus-flash');
      // Force reflow so the animation restarts on rapid switches
      void entry.el.offsetWidth;
      entry.el.classList.add('focus-flash');
      clearTimeout(entry._focusFlashTimer);
      entry._focusFlashTimer = setTimeout(() => {
        entry.el.classList.remove('focus-flash');
      }, 600);

      // Refit if layout changed (focus / half swap)
      requestAnimationFrame(() => fitAll());
      renderSwitcher();
    }

    function focusNthSession(n) {
      const ids = Array.from(state.sessions.keys());
      if (ids.length === 0) return;
      if (n < 1 || n > ids.length) return;
      focusSessionById(ids[n - 1]);
    }

    function cycleSessionFocus() {
      const ids = Array.from(state.sessions.keys());
      if (ids.length === 0) return;
      const curIdx = ids.indexOf(state.focusedId);
      const next = curIdx < 0 ? 0 : (curIdx + 1) % ids.length;
      focusSessionById(ids[next]);
    }

    // ===== Panel info drawer (T1.1) =====
    function setupDrawerListeners(id) {
      const drawer = document.getElementById(`drawer-${id}`);
      if (!drawer) return;

      // Tab clicks
      drawer.querySelectorAll('.drawer-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleDrawerTab(id, tab.dataset.tab);
        });
      });

      // Commands tab — click a row to copy
      const cmdContainer = drawer.querySelector('[data-panel="commands"]');
      cmdContainer.addEventListener('click', (e) => {
        const row = e.target.closest('.drawer-row');
        if (!row || !row.dataset.command) return;
        copyRowText(row, row.dataset.command);
      });

      // Memory tab — click a row to expand inline
      const memContainer = drawer.querySelector('[data-panel="memory"]');
      memContainer.addEventListener('click', (e) => {
        const row = e.target.closest('.drawer-row');
        if (!row) return;
        row.classList.toggle('expanded');
      });
    }

    function toggleDrawerTab(id, tabName) {
      const entry = state.sessions.get(id);
      if (!entry) return;
      const drawer = document.getElementById(`drawer-${id}`);
      if (!drawer) return;

      const wasOpen = !!entry.drawerOpen;
      const prevTab = entry.activeTab || 'overview';

      // Clicking the same active tab while the drawer is open collapses it
      if (wasOpen && prevTab === tabName) {
        entry.drawerOpen = false;
        drawer.classList.remove('open');
      } else {
        entry.activeTab = tabName;
        entry.drawerOpen = true;
        drawer.classList.add('open');
        drawer.querySelectorAll('.drawer-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.tab === tabName);
        });
        drawer.querySelectorAll('.drawer-panel').forEach(p => {
          p.classList.toggle('active', p.dataset.panel === tabName);
        });
        renderDrawerTab(id, tabName);
      }

      // Re-fit the terminal after the drawer transitions
      requestAnimationFrame(() => {
        setTimeout(() => {
          try { entry.fitAddon.fit(); } catch (err) { /* ignore */ }
          const ws = entry.ws;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'resize',
              cols: entry.terminal.cols,
              rows: entry.terminal.rows,
            }));
          }
        }, 190);
      });
    }

    function renderDrawerTab(id, tabName) {
      if (tabName === 'overview') renderOverviewTab(id);
      else if (tabName === 'commands') renderCommandsTab(id);
      else if (tabName === 'memory') renderMemoryTab(id);
      else if (tabName === 'log') renderStatusLogTab(id);
    }

    function renderOverviewTab(id) {
      const entry = state.sessions.get(id);
      const ov = document.getElementById(`ovmeta-${id}`);
      if (!entry || !ov) return;
      const meta = entry.session?.meta || {};
      const last = meta.lastCommands?.length
        ? meta.lastCommands[meta.lastCommands.length - 1].command
        : '—';
      const parts = [
        ['type', getTypeLabel(meta.type || 'shell')],
        ['project', meta.project || '—'],
        ['status', meta.statusDetail || meta.status || '—'],
        ['opened', meta.createdAt ? timeAgo(meta.createdAt) : '—'],
        ['last', last],
      ];
      if (meta.detectedPort) parts.push(['port', ':' + meta.detectedPort]);
      if (typeof meta.requestCount === 'number' && meta.requestCount > 0) {
        parts.push(['requests', String(meta.requestCount)]);
      }
      ov.innerHTML = parts.map(([k, v]) =>
        `<span><span class="ov-label">${k}</span><span class="ov-value">${escapeHtml(String(v))}</span></span>`
      ).join('');
    }

    async function renderCommandsTab(id) {
      const entry = state.sessions.get(id);
      const container = document.getElementById(`dp-commands-${id}`);
      if (!entry || !container) return;

      try {
        const resp = await api('GET', `/api/sessions/${id}/history`);
        const list = Array.isArray(resp) ? resp : (resp.commands || resp.history || []);
        entry.commandHistory = list;
        entry.commandsLoaded = true;
      } catch (err) {
        console.error('[client] failed to load command history:', err);
        if (!entry.commandsLoaded) {
          container.innerHTML = '<div class="empty-msg">Failed to load history.</div>';
          return;
        }
      }

      // server returns command_history rows ordered DESC (newest first)
      const rows = (entry.commandHistory || []).slice(0, 60);
      if (rows.length === 0) {
        container.innerHTML = '<div class="empty-msg">No commands captured yet.</div>';
      } else {
        container.innerHTML = rows.map(r => {
          const cmd = r.command || r.cmd || '';
          const ts = r.timestamp || r.createdAt || r.created_at || null;
          const src = r.source ? ` · ${escapeHtml(r.source)}` : '';
          return `
            <div class="drawer-row" data-command="${escapeAttr(cmd)}">
              <div class="row-meta"><span>${escapeHtml(ts ? timeAgo(ts) : 'recent')}${src}</span></div>
              <div class="row-cmd">${escapeHtml(cmd)}</div>
            </div>
          `;
        }).join('');
      }
      container.scrollTop = 0;
      setBadge(id, 'commands', entry.commandHistory.length);
    }

    function renderMemoryTab(id) {
      const entry = state.sessions.get(id);
      const container = document.getElementById(`dp-memory-${id}`);
      if (!entry || !container) return;

      const hits = entry.memoryHits || [];
      if (hits.length === 0) {
        container.innerHTML = '<div class="empty-msg">No memory hits yet. Ask about this terminal or wait for a proactive lookup.</div>';
        setBadge(id, 'memory', 0);
        return;
      }

      const rows = hits.slice(0, 40);
      container.innerHTML = rows.map(m => {
        const score = typeof m.similarity === 'number' ? `${(m.similarity * 100).toFixed(0)}%` : '';
        const proj = m.project ? escapeHtml(m.project) : '';
        const type = escapeHtml(m.source_type || m.sourceType || 'memory');
        const ts = m.cachedAt ? timeAgo(m.cachedAt) : '';
        return `
          <div class="drawer-row">
            <div class="row-meta">
              <span>${type}</span>
              ${proj ? `<span>${proj}</span>` : ''}
              ${score ? `<span>${score}</span>` : ''}
              ${ts ? `<span>${ts}</span>` : ''}
            </div>
            <div class="row-content">${escapeHtml(m.content || m.text || '(empty)')}</div>
          </div>
        `;
      }).join('');
      setBadge(id, 'memory', hits.length);
    }

    function renderStatusLogTab(id) {
      const entry = state.sessions.get(id);
      const container = document.getElementById(`dp-log-${id}`);
      if (!entry || !container) return;

      const log = entry.statusLog || [];
      if (log.length === 0) {
        container.innerHTML = '<div class="empty-msg">No status transitions recorded yet.</div>';
        setBadge(id, 'log', 0);
        return;
      }

      const rows = log.slice().reverse();
      container.innerHTML = rows.map(ev => {
        const color = getStatusColor(ev.status);
        const t = new Date(ev.at);
        const hh = String(t.getHours()).padStart(2, '0');
        const mm = String(t.getMinutes()).padStart(2, '0');
        const ss = String(t.getSeconds()).padStart(2, '0');
        return `
          <div class="status-log-row">
            <span class="ts">${hh}:${mm}:${ss}</span>
            <span class="chip" style="color:${color}">${escapeHtml(ev.status)}</span>
            ${ev.detail ? `<span class="detail">${escapeHtml(ev.detail)}</span>` : ''}
          </div>
        `;
      }).join('');
      container.scrollTop = 0;
      setBadge(id, 'log', log.length);
    }

    function appendStatusLog(id, status, detail) {
      const entry = state.sessions.get(id);
      if (!entry) return;
      if (!entry.statusLog) entry.statusLog = [];
      entry.statusLog.push({ at: new Date().toISOString(), status, detail: detail || '' });
      if (entry.statusLog.length > 500) entry.statusLog.splice(0, entry.statusLog.length - 500);
      setBadge(id, 'log', entry.statusLog.length);
      if (entry.drawerOpen && entry.activeTab === 'log') {
        renderStatusLogTab(id);
      }
    }

    function setBadge(id, tab, count) {
      const el = document.getElementById(`badge-${tab}-${id}`);
      if (el) el.textContent = String(count);
    }

    function copyRowText(row, text) {
      const done = () => {
        row.classList.add('copied');
        setTimeout(() => row.classList.remove('copied'), 700);
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(err => {
          console.error('[client] clipboard write failed:', err);
        });
      } else {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          done();
        } catch (err) { console.error('[client] fallback copy failed:', err); }
      }
    }

    function escapeAttr(str) {
      return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ===== Panel actions =====
    function focusPanel(id) {
      const grid = document.getElementById('termGrid');
      const isAlreadyFocused = grid.classList.contains('layout-focus') && state.focusedId === id;

      if (isAlreadyFocused) {
        // Restore previous layout
        setLayout(state.layout);
        document.querySelectorAll('.term-panel').forEach(p => {
          p.classList.remove('focused');
          p.style.display = '';
        });
      } else {
        grid.className = 'grid-container layout-focus';
        document.querySelectorAll('.term-panel').forEach(p => {
          p.classList.remove('focused');
        });
        const panel = document.getElementById(`panel-${id}`);
        if (panel) panel.classList.add('focused');
        state.focusedId = id;
      }

      // Re-fit all visible terminals
      requestAnimationFrame(() => fitAll());
    }

    function reconnectSession(id) {
      const entry = state.sessions.get(id);
      if (!entry) return;

      const ws = new WebSocket(`${WS_BASE}?session=${id}`);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'output':
              entry.terminal.write(msg.data);
              break;
            case 'meta':
              updatePanelMeta(id, msg.session.meta);
              break;
            case 'exit':
              updatePanelMeta(id, { status: 'exited', statusDetail: `Exited (${msg.exitCode})` });
              const p = document.getElementById(`panel-${id}`);
              if (p) p.classList.add('exited');
              break;
            case 'status_broadcast':
              updateGlobalStats(msg.sessions);
              break;
          }
        } catch (err) { console.error('[client] reconnect ws message failed:', err); }
      };

      ws.onopen = () => {
        console.log(`[ws] Reconnected session ${id}`);
        entry._reconnectAttempts = 0;
        entry.ws = ws;
        updatePanelMeta(id, { status: 'active', statusDetail: 'Reconnected' });
      };

      ws.onclose = (event) => {
        const panel = document.getElementById(`panel-${id}`);
        if (panel && panel.classList.contains('exited')) return;
        if (event.code === 4001) {
          // Session no longer exists on server
          updatePanelMeta(id, { status: 'exited', statusDetail: 'Session ended' });
          if (panel) panel.classList.add('exited');
          return;
        }
        const delay = Math.min(1000 * Math.pow(2, (entry._reconnectAttempts || 0)), 10000);
        entry._reconnectAttempts = (entry._reconnectAttempts || 0) + 1;
        if (entry._reconnectAttempts <= 5) {
          setTimeout(() => reconnectSession(id), delay);
        } else {
          updatePanelMeta(id, { status: 'errored', statusDetail: 'Connection lost' });
        }
      };

      // Re-wire terminal input
      entry.terminal.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });
    }

    function halfPanel(id) {
      const grid = document.getElementById('termGrid');
      grid.className = 'grid-container layout-half';
      document.querySelectorAll('.term-panel').forEach(p => p.classList.remove('primary'));
      const panel = document.getElementById(`panel-${id}`);
      if (panel) panel.classList.add('primary');
      requestAnimationFrame(() => fitAll());
    }

    async function closePanel(id) {
      if (!confirm('Close this terminal? The process will be killed.')) return;

      await api('DELETE', `/api/sessions/${id}`);

      const entry = state.sessions.get(id);
      if (entry) {
        entry.terminal.dispose();
        entry.ws.close();
        entry.el.remove();
        state.sessions.delete(id);
      }

      updateEmptyState();
      renderSwitcher();
      refreshAllReplyFormsFor(id);
      refreshPanelIndices();
    }

    function changeTheme(id, themeId) {
      const entry = state.sessions.get(id);
      if (!entry) return;

      const themeObj = getThemeObject(themeId);
      entry.terminal.options.theme = themeObj;

      // Persist to server
      api('PATCH', `/api/sessions/${id}`, { theme: themeId });
    }

    async function askAI(id, question) {
      if (!question.trim()) return;
      const entry = state.sessions.get(id);
      if (!entry) return;

      // Early return if AI queries are not available
      if (!state.config.aiQueryAvailable) {
        entry.terminal.write(
          '\r\n\x1b[33m[mnestra] AI queries are not available.\x1b[0m\r\n' +
          '\x1b[33mTo enable, add the following to ~/.termdeck/config.yaml:\x1b[0m\r\n' +
          '\x1b[90m  rag:\r\n' +
          '    supabaseUrl: https://your-project.supabase.co\r\n' +
          '    supabaseKey: your-anon-key\r\n' +
          '    openaiApiKey: sk-...\x1b[0m\r\n'
        );
        return;
      }

      const inputEl = document.getElementById(`ai-${id}`);
      inputEl.value = 'Searching memories...';
      inputEl.disabled = true;

      try {
        const result = await api('POST', '/api/ai/query', {
          question,
          sessionId: id,
          project: entry.session?.meta?.project || null
        });

        if (result.error) {
          entry.terminal.write(`\r\n\x1b[33m[mnestra] ${result.error}\x1b[0m\r\n`);
        } else if (result.memories && result.memories.length > 0) {
          // Cache hits for the Memory tab
          if (!entry.memoryHits) entry.memoryHits = [];
          const cachedAt = new Date().toISOString();
          for (const m of result.memories) {
            entry.memoryHits.unshift({ ...m, cachedAt });
          }
          if (entry.memoryHits.length > 60) {
            entry.memoryHits.length = 60;
          }
          setBadge(id, 'memory', entry.memoryHits.length);
          if (entry.drawerOpen && entry.activeTab === 'memory') {
            renderMemoryTab(id);
          }
          const cols = entry.terminal.cols || 80;
          const wrap = (text, indent) => {
            const maxW = cols - indent - 2;
            const words = text.split(/\s+/);
            const lines = [];
            let line = '';
            for (const w of words) {
              if (line.length + w.length + 1 > maxW && line.length > 0) {
                lines.push(' '.repeat(indent) + line);
                line = w;
              } else {
                line = line ? line + ' ' + w : w;
              }
            }
            if (line) lines.push(' '.repeat(indent) + line);
            return lines;
          };

          entry.terminal.write(`\r\n\x1b[36m━━━ Mnestra: ${result.total} memories found ━━━\x1b[0m\r\n`);
          for (const m of result.memories) {
            const score = m.similarity ? `${(m.similarity * 100).toFixed(0)}%` : '';
            const proj = m.project ? m.project : '';
            entry.terminal.write(`\r\n\x1b[35m● ${m.source_type}\x1b[0m \x1b[90m${proj} ${score}\x1b[0m\r\n`);
            const contentLines = wrap(m.content || '(empty)', 2);
            for (const cl of contentLines) {
              entry.terminal.write(`${cl}\r\n`);
            }
          }
          entry.terminal.write(`\r\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n\r\n`);
        } else {
          entry.terminal.write(`\r\n\x1b[33m[mnestra] No relevant memories found.\x1b[0m\r\n`);
        }
      } catch (err) {
        console.error('[client] AI query failed:', err);
        entry.terminal.write(`\r\n\x1b[31m[mnestra] Query failed: ${err.message}\x1b[0m\r\n`);
      }

      inputEl.value = '';
      inputEl.disabled = false;
      inputEl.placeholder = 'Ask about this terminal...';
    }

    // ===== Quick launch from empty state =====
    function quickLaunch(cmd) {
      document.getElementById('promptInput').value = cmd;
      launchTerminal();
    }

    // ===== Add Project modal =====
    function rebuildProjectDropdown(selectName) {
      const sel = document.getElementById('promptProject');
      if (!sel) return;
      const prev = selectName || sel.value;
      sel.innerHTML = '<option value="">no project</option>';
      for (const name of Object.keys(state.config.projects || {})) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      }
      if (prev && state.config.projects && state.config.projects[prev]) {
        sel.value = prev;
      }
    }

    function openAddProjectModal() {
      const modal = document.getElementById('addProjectModal');
      // Populate theme dropdown from loaded themes
      const themeSel = document.getElementById('apmTheme');
      themeSel.innerHTML = '<option value="">— pick a theme —</option>';
      for (const [tid, t] of Object.entries(state.themes || {})) {
        const opt = document.createElement('option');
        opt.value = tid;
        opt.textContent = t.label || tid;
        themeSel.appendChild(opt);
      }
      // Clear fields
      document.getElementById('apmName').value = '';
      document.getElementById('apmPath').value = '';
      document.getElementById('apmCommand').value = '';
      document.getElementById('apmTheme').value = '';
      setApmStatus('', null);
      modal.classList.add('open');
      setTimeout(() => document.getElementById('apmName').focus(), 50);
    }

    function closeAddProjectModal() {
      document.getElementById('addProjectModal').classList.remove('open');
    }

    function setApmStatus(msg, kind) {
      const el = document.getElementById('apmStatus');
      el.textContent = msg || '';
      el.classList.remove('error', 'ok');
      if (kind) el.classList.add(kind);
    }

    async function submitAddProject() {
      const name = document.getElementById('apmName').value.trim();
      const projectPath = document.getElementById('apmPath').value.trim();
      const defaultCommand = document.getElementById('apmCommand').value.trim();
      const defaultTheme = document.getElementById('apmTheme').value;

      if (!name) { setApmStatus('Name is required.', 'error'); return; }
      if (!projectPath) { setApmStatus('Path is required.', 'error'); return; }

      const saveBtn = document.getElementById('apmSave');
      saveBtn.disabled = true;
      setApmStatus('Saving…', null);

      try {
        const result = await api('POST', '/api/projects', {
          name,
          path: projectPath,
          defaultCommand: defaultCommand || undefined,
          defaultTheme: defaultTheme || undefined,
        });
        if (result && result.error) {
          setApmStatus(result.error, 'error');
          saveBtn.disabled = false;
          return;
        }
        // Merge the updated projects into in-memory state.config so subsequent
        // launches can immediately use the new project.
        state.config.projects = result.projects || {};
        rebuildProjectDropdown(name);
        setApmStatus(`Added "${name}" ✓`, 'ok');
        setTimeout(() => { closeAddProjectModal(); saveBtn.disabled = false; }, 700);
      } catch (err) {
        setApmStatus(`Failed: ${err.message || err}`, 'error');
        saveBtn.disabled = false;
      }
    }

    // ===== Rumen insights badge + briefing modal =====
    function rumenState() {
      if (!state.rumen) {
        state.rumen = {
          enabled: false,
          status: null,
          insights: [],
          total: 0,
          unseen: 0,
          filters: { project: '', sort: 'newest', unseen: false },
          pollTimer: null,
          modalOpen: false,
          prevFocus: null,
        };
      }
      return state.rumen;
    }

    function rumenRelTime(iso) {
      if (!iso) return '—';
      const t = new Date(iso).getTime();
      if (!Number.isFinite(t)) return '—';
      const delta = Math.max(0, Date.now() - t);
      const s = Math.floor(delta / 1000);
      if (s < 60) return `${s}s ago`;
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      const d = Math.floor(h / 24);
      return `${d}d ago`;
    }

    function rumenEscape(str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderRumenBadge() {
      const r = rumenState();
      const badge = document.getElementById('rumenBadge');
      const label = document.getElementById('rumenBadgeLabel');
      if (!badge || !label) return;
      if (!r.enabled) {
        badge.classList.remove('visible', 'has-unseen');
        return;
      }
      badge.classList.add('visible');
      const unseen = r.unseen | 0;
      const total = r.total | 0;
      if (unseen > 0) {
        badge.classList.add('has-unseen');
        label.textContent = `${unseen} new insight${unseen === 1 ? '' : 's'}`;
      } else {
        badge.classList.remove('has-unseen');
        label.textContent = `${total} insight${total === 1 ? '' : 's'}`;
      }
    }

    async function fetchRumenStatus() {
      try {
        const data = await api('GET', '/api/rumen/status');
        const r = rumenState();
        if (data && data.enabled === true) {
          r.enabled = true;
          r.status = data;
          r.total = data.total_insights | 0;
          r.unseen = data.unseen_insights | 0;
        } else {
          r.enabled = false;
          r.status = data || { enabled: false };
        }
        renderRumenBadge();
        if (r.modalOpen) renderRumenSummary();
      } catch (err) {
        console.warn('[rumen] status fetch failed', err);
      }
    }

    function buildRumenQuery() {
      const r = rumenState();
      const qs = new URLSearchParams();
      qs.set('limit', '50');
      if (r.filters.project) qs.set('project', r.filters.project);
      if (r.filters.unseen) qs.set('unseen', 'true');
      return qs.toString();
    }

    async function fetchRumenInsights() {
      const r = rumenState();
      try {
        const data = await api('GET', `/api/rumen/insights?${buildRumenQuery()}`);
        if (data && data.enabled === false) {
          r.enabled = false;
          r.insights = [];
          r.total = 0;
          renderRumenBadge();
          renderRumenList();
          return;
        }
        let list = Array.isArray(data?.insights) ? data.insights : [];
        if (r.filters.sort === 'confidence') {
          list = list.slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        }
        r.insights = list;
        renderRumenList();
        renderRumenSummary();
      } catch (err) {
        console.warn('[rumen] insights fetch failed', err);
        const list = document.getElementById('rumenList');
        if (list) list.innerHTML = '<div class="rumen-empty">Could not load insights. Try again.</div>';
      }
    }

    function renderRumenSummary() {
      const r = rumenState();
      const summary = document.getElementById('rumenSummary');
      const title = document.getElementById('rumenTitle');
      if (!summary || !title) return;
      const total = r.total | 0;
      const unseen = r.unseen | 0;
      title.textContent = `Rumen Insights — ${total} total · ${unseen} new`;
      const s = r.status || {};
      if (s.last_job_completed_at) {
        summary.textContent =
          `Last processed: ${s.last_job_sessions_processed | 0} sessions → ` +
          `${s.last_job_insights_generated | 0} insights · ${rumenRelTime(s.last_job_completed_at)}`;
      } else if (s.last_job_status) {
        summary.textContent = `Last job: ${s.last_job_status}`;
      } else {
        summary.textContent = 'No jobs have run yet.';
      }
    }

    function renderRumenList() {
      const r = rumenState();
      const list = document.getElementById('rumenList');
      if (!list) return;
      if (!r.insights.length) {
        list.innerHTML = '<div class="rumen-empty">No insights match the current filter.</div>';
        return;
      }
      const rows = r.insights.map((ins) => {
        const chips = (ins.projects || []).map((p) => `<span class="ri-chip">${rumenEscape(p)}</span>`).join('');
        const conf = typeof ins.confidence === 'number' ? `conf ${ins.confidence.toFixed(2)}` : 'conf —';
        const seen = ins.acted_upon === true;
        const btnLabel = seen ? 'seen ✓' : 'mark seen';
        const btnClass = seen ? 'ri-mark seen' : 'ri-mark';
        const btnDisabled = seen ? 'disabled' : '';
        return (
          `<div class="rumen-item" role="listitem" data-id="${rumenEscape(ins.id)}">` +
            `<div class="ri-text">${rumenEscape(ins.insight_text)}</div>` +
            `<div class="ri-meta">` +
              `<span class="ri-conf">${conf}</span>` +
              chips +
              `<span class="ri-time">${rumenRelTime(ins.created_at)}</span>` +
              `<button type="button" class="${btnClass}" data-seen-id="${rumenEscape(ins.id)}" ${btnDisabled}>${btnLabel}</button>` +
            `</div>` +
          `</div>`
        );
      });
      list.innerHTML = rows.join('');
    }

    function populateRumenProjectFilter() {
      const r = rumenState();
      const sel = document.getElementById('rumenFilterProject');
      if (!sel) return;
      const prev = sel.value;
      const projects = new Set();
      for (const ins of r.insights) {
        for (const p of (ins.projects || [])) projects.add(p);
      }
      for (const name of Object.keys(state.config?.projects || {})) projects.add(name);
      const opts = Array.from(projects).sort();
      sel.innerHTML = '<option value="">all</option>' +
        opts.map((p) => `<option value="${rumenEscape(p)}">${rumenEscape(p)}</option>`).join('');
      if (prev && opts.includes(prev)) sel.value = prev;
    }

    async function markRumenInsightSeen(id) {
      const r = rumenState();
      const sel = (attr) => `[${attr}="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`;
      const item = document.querySelector(`.rumen-item${sel('data-id')}`);
      const btn = document.querySelector(`.ri-mark${sel('data-seen-id')}`);
      if (btn) btn.disabled = true;
      const insight = r.insights.find((i) => i.id === id);
      const wasUnseen = insight && insight.acted_upon === false;
      if (insight) insight.acted_upon = true;
      if (wasUnseen && r.unseen > 0) r.unseen -= 1;
      renderRumenBadge();
      if (item) item.classList.add('fading');
      try {
        const resp = await fetch(`${API}/api/rumen/insights/${encodeURIComponent(id)}/seen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        setTimeout(() => {
          if (r.filters.unseen) {
            r.insights = r.insights.filter((i) => i.id !== id);
            renderRumenList();
          } else if (item) {
            item.classList.remove('fading');
            const b = item.querySelector('.ri-mark');
            if (b) { b.classList.add('seen'); b.textContent = 'seen ✓'; b.disabled = true; }
          }
        }, 360);
      } catch (err) {
        console.warn('[rumen] mark-seen failed', err);
        if (insight) insight.acted_upon = false;
        if (wasUnseen) r.unseen += 1;
        renderRumenBadge();
        if (item) item.classList.remove('fading');
        if (btn) { btn.disabled = false; btn.textContent = 'retry'; }
      }
    }

    function openRumenModal() {
      const r = rumenState();
      if (!r.enabled) return;
      r.modalOpen = true;
      r.prevFocus = document.activeElement;
      document.getElementById('rumenModal').classList.add('open');
      populateRumenProjectFilter();
      renderRumenSummary();
      fetchRumenInsights();
      setTimeout(() => {
        const close = document.getElementById('rumenClose');
        if (close) close.focus();
      }, 30);
    }

    function closeRumenModal() {
      const r = rumenState();
      r.modalOpen = false;
      document.getElementById('rumenModal').classList.remove('open');
      if (r.prevFocus && typeof r.prevFocus.focus === 'function') {
        try { r.prevFocus.focus(); } catch {}
      }
    }

    function setupRumen() {
      const r = rumenState();
      document.getElementById('rumenBadge').addEventListener('click', openRumenModal);
      document.getElementById('rumenClose').addEventListener('click', closeRumenModal);
      document.getElementById('rumenBackdrop').addEventListener('click', closeRumenModal);
      document.getElementById('rumenModal').addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeRumenModal(); }
      });
      document.getElementById('rumenFilterProject').addEventListener('change', (e) => {
        r.filters.project = e.target.value || '';
        fetchRumenInsights();
      });
      document.getElementById('rumenFilterSort').addEventListener('change', (e) => {
        r.filters.sort = e.target.value || 'newest';
        if (r.filters.sort === 'confidence') {
          r.insights = r.insights.slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        } else {
          r.insights = r.insights.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }
        renderRumenList();
      });
      document.getElementById('rumenFilterUnseen').addEventListener('change', (e) => {
        r.filters.unseen = !!e.target.checked;
        fetchRumenInsights();
      });
      document.getElementById('rumenList').addEventListener('click', (e) => {
        const btn = e.target.closest('.ri-mark');
        if (!btn || btn.disabled) return;
        const id = btn.getAttribute('data-seen-id');
        if (id) markRumenInsightSeen(id);
      });
      fetchRumenStatus();
      r.pollTimer = setInterval(fetchRumenStatus, 60000);
    }

    // ===== Launch terminal =====
    async function launchTerminal() {
      const input = document.getElementById('promptInput');
      const project = document.getElementById('promptProject').value;
      let command = input.value.trim();

      // If the input is empty but the selected project has a defaultCommand,
      // use it. That way "select project + click launch" actually runs the
      // project's declared default (e.g. `claude`) instead of silently falling
      // through to the global shell.
      if (!command && project) {
        const projectCfg = state.config.projects?.[project];
        if (projectCfg?.defaultCommand || projectCfg?.command) {
          command = projectCfg.defaultCommand || projectCfg.command;
        }
      }

      if (!command) {
        // Still nothing to run — launch a plain shell in the project's cwd
        const session = await api('POST', '/api/sessions', {
          project: project || undefined,
          reason: 'manual launch'
        });
        createTerminalPanel(session);
        input.value = '';
        updateEmptyState();
        return;
      }

      // Parse shorthand commands
      let resolvedCommand = command;
      let resolvedType = 'shell';
      let resolvedCwd = undefined;

      let resolvedProject = project || undefined;

      if (/^claude\b/i.test(command) || /^cc\b/i.test(command)) {
        resolvedType = 'claude-code';
        const argMatch = command.match(/(?:claude|cc)\s+(?:code\s+)?(.+)/i);
        if (argMatch) {
          const arg = argMatch[1].trim();
          // Check if arg is a known project name
          if (state.config.projects && state.config.projects[arg]) {
            resolvedProject = arg;
          } else {
            resolvedCwd = arg;
          }
        }
        resolvedCommand = 'claude';
      } else if (/^gemini\b/i.test(command)) {
        resolvedType = 'gemini';
      } else if (/^python3?\b.*(?:runserver|uvicorn|flask|gunicorn)/i.test(command)) {
        resolvedType = 'python-server';
      }

      const session = await api('POST', '/api/sessions', {
        command: resolvedCommand,
        cwd: resolvedCwd,
        project: resolvedProject,
        type: resolvedType,
        reason: `launched: ${command}`
      });

      createTerminalPanel(session);
      input.value = '';
      updateEmptyState();
    }

    // ===== Layout =====
    function setLayout(layout) {
      const wasControl = state.layout === 'control';
      // Only persist "real" grid layouts as state.layout; the control view is
      // an overlay, not a target to restore to when the user hits Escape.
      if (layout !== 'control') {
        state.layout = layout;
      }
      const grid = document.getElementById('termGrid');
      grid.className = `grid-container layout-${layout}`;

      // Orchestrator layout: set column count based on worker panels (total - 1)
      if (layout === 'orch') {
        const panelCount = grid.querySelectorAll('.term-panel').length;
        const workerCount = Math.max(0, panelCount - 1);
        grid.setAttribute('data-orch-cols', String(workerCount || panelCount));
      } else {
        grid.removeAttribute('data-orch-cols');
      }

      // Remove focus/half states
      document.querySelectorAll('.term-panel').forEach(p => {
        p.classList.remove('focused', 'primary');
        p.style.display = '';
      });

      // Update buttons
      document.querySelectorAll('.layout-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.layout === layout);
      });

      // Control-mode side effects (T1.6)
      if (layout === 'control') {
        enterControlMode();
      } else if (wasControl) {
        // Leaving control — nothing to clean up; feed stays hidden via CSS
      }

      requestAnimationFrame(() => fitAll());
    }

    // ===== Helpers =====
    function getStatusColor(status) {
      const colors = {
        starting: '#7aa2f7',
        active: '#9ece6a',
        idle: '#6b7089',
        thinking: '#bb9af7',
        editing: '#e0af68',
        listening: '#7dcfff',
        errored: '#f7768e',
        exited: '#414868'
      };
      return colors[status] || '#6b7089';
    }

    function getTypeLabel(type) {
      const labels = {
        'shell': 'Shell',
        'claude-code': 'Claude Code',
        'gemini': 'Gemini CLI',
        'python-server': 'Python Server',
        'one-shot': 'One-shot'
      };
      return labels[type] || type;
    }

    function getThemeObject(themeId) {
      // Fetch full theme from server cache or use fallback
      const known = state.themes[themeId];
      if (known?.theme) return known.theme;
      // Minimal fallback
      return { background: '#1a1b26', foreground: '#c0caf5' };
    }

    function timeAgo(isoString) {
      const diff = Date.now() - new Date(isoString).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    }

    function updatePanelMeta(id, meta) {
      // Track status transitions into the per-panel status log
      const entry = state.sessions.get(id);
      if (entry && meta.status && meta.status !== entry.lastKnownStatus) {
        appendStatusLog(id, meta.status, meta.statusDetail || '');
        // Proactive memory lookup on entering the errored state (T1.4)
        if (meta.status === 'errored') {
          // Fire-and-forget; own rate limiting lives inside the function.
          triggerProactiveMemoryQuery(id);
        }
        entry.lastKnownStatus = meta.status;
      }
      // Keep the cached session.meta fresh so the overview tab renders current data
      if (entry && entry.session) {
        entry.session.meta = { ...entry.session.meta, ...meta };
      }

      const dot = document.getElementById(`dot-${id}`);
      const status = document.getElementById(`status-${id}`);
      const metaLast = document.getElementById(`meta-last-${id}`);
      const metaPort = document.getElementById(`meta-port-${id}`);
      const metaReqs = document.getElementById(`meta-reqs-${id}`);

      if (dot) {
        dot.style.background = getStatusColor(meta.status);
        dot.classList.toggle('pulsing', meta.status === 'thinking');
      }
      if (status) status.textContent = meta.statusDetail || meta.status;
      if (metaLast && meta.lastCommands?.length) {
        metaLast.innerHTML = `<span class="meta-label">last</span> ${escapeHtml(meta.lastCommands[meta.lastCommands.length - 1].command)}`;
      }
      if (metaPort) {
        if (meta.detectedPort) {
          metaPort.style.display = '';
          metaPort.querySelector('.meta-value').textContent = ':' + meta.detectedPort;
        }
      }
      if (metaReqs) {
        if (meta.type === 'python-server' || meta.requestCount > 0) {
          metaReqs.style.display = '';
          metaReqs.querySelector('.meta-value').textContent = meta.requestCount || 0;
        }
      }

      // If the drawer is showing the overview tab, refresh its metadata block
      if (entry && entry.drawerOpen && entry.activeTab === 'overview') {
        renderOverviewTab(id);
      }

      // Sync theme dropdown if server-side theme changed
      if (meta.theme) {
        const themeSelect = document.getElementById(`theme-${id}`);
        if (themeSelect && themeSelect.value !== meta.theme) {
          themeSelect.value = meta.theme;
          const entry = state.sessions.get(id);
          if (entry) {
            entry.terminal.options.theme = getThemeObject(meta.theme);
          }
        }
      }
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function updateGlobalStats(sessions) {
      let active = 0, thinking = 0, idle = 0;
      for (const s of sessions) {
        if (s.meta.status === 'active' || s.meta.status === 'listening') active++;
        else if (s.meta.status === 'thinking') thinking++;
        else if (s.meta.status === 'idle') idle++;

        // Update existing panels from broadcast. NOTE: we deliberately do NOT
        // createTerminalPanel for sessions that aren't in state.sessions —
        // that creates a race between the immediate createTerminalPanel call
        // from launchTerminal and the 2s status_broadcast cycle, producing
        // duplicate WebSockets per session and breaking terminal input
        // rendering. External-session auto-discover is parked for Sprint 3.
        if (state.sessions.has(s.id)) {
          updatePanelMeta(s.id, s.meta);
        }
      }
      document.getElementById('stat-active').textContent = active;
      document.getElementById('stat-thinking').textContent = thinking;
      document.getElementById('stat-idle').textContent = idle;
      renderSwitcher();
    }

    function updateEmptyState() {
      const empty = document.getElementById('emptyState');
      empty.style.display = state.sessions.size === 0 ? '' : 'none';
    }

    function fitAll() {
      for (const [, entry] of state.sessions) {
        try { entry.fitAddon.fit(); } catch (err) { if (!entry._fitWarned) { console.error('[client] fitAddon.fit failed for session:', err); entry._fitWarned = true; } }
      }
    }

    // Debounce: collapse a burst of calls (e.g. a window-resize drag firing
    // dozens of events/sec) into a single invocation after `wait` ms of quiet.
    function debounce(fn, wait) {
      let timer = null;
      return function debounced(...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; fn.apply(this, args); }, wait);
      };
    }

    const fitAllDebounced = debounce(() => {
      requestAnimationFrame(() => fitAll());
    }, 100);

    // ===== ONBOARDING TOUR =====
    // Spotlight + tooltip walkthrough of every TermDeck surface. Runs once on
    // first visit (localStorage gate) and replays on demand via the "how this
    // works" button. Zero dependencies — vanilla DOM, same philosophy as the
    // rest of this client.
    const TOUR_STEPS = [
      {
        target: null,
        title: 'Welcome to TermDeck',
        body: `TermDeck is a browser-based terminal multiplexer with a persistent memory layer. It lets you run many real terminals side by side, each with rich metadata and automatic recall of similar past errors. This walkthrough takes about 90 seconds and covers every button on the screen. Press <kbd>Esc</kbd> any time to exit.`,
      },
      {
        target: '#topbarQuickLaunch',
        title: 'Quick launch',
        body: `These three buttons instantly spawn a new terminal. <strong>shell</strong> opens bash, <strong>hermes</strong> opens Hermes CLI, <strong>python</strong> starts a Python HTTP server on port 8080. One click — no typing required.`,
      },
      {
        target: '.topbar-center',
        title: 'Layout modes',
        body: `Eight preset grid layouts — <kbd>1x1</kbd> through <kbd>4x2</kbd>, <strong>orch</strong> (4 workers across the top + 1 full-width orchestrator across the bottom, for 4+1 sprints), plus <strong>control</strong> (aggregate activity feed). Click any layout to switch instantly; all terminals re-fit to the new grid. Keyboard shortcuts <kbd>Cmd+Shift+1</kbd>–<kbd>Cmd+Shift+7</kbd> (or <kbd>Ctrl+Shift+1</kbd>–<kbd>7</kbd>) do the same.`,
      },
      {
        target: '#termSwitcher',
        title: 'Terminal switcher',
        body: `When you have 2+ terminals open, this overlay shows numbered tiles. Click a tile to focus that panel, or press <kbd>Alt+1</kbd> through <kbd>Alt+9</kbd>. Color-coded by project, status-dot updates live. Watch — a second shell is spawning right now so you can see it appear.`,
        onEnter: async () => { await ensureSecondShellForTour(); },
      },
      {
        targets: ['#btn-status', '#btn-config'],
        title: 'Status and config',
        body: `<strong>status</strong> opens a global-metrics modal (session counts by state, RAG mode, memory bridge). <strong>config</strong> shows your loaded project list and theme defaults. Both are in the polish queue for Sprint 3 — buttons are visible but unwired right now.`,
      },
      {
        targets: ['#btn-how', '#btn-help'],
        title: 'How this works and help',
        body: `Click <strong>how this works</strong> any time to replay this tour. <strong>help</strong> opens the full TermDeck documentation in a new tab.`,
      },
      {
        target: '.panel-header',
        title: 'Panel header',
        body: `Every terminal has a header showing a <strong>status dot</strong> (active · thinking · idle · errored · exited), the detected <strong>type</strong> (shell · Claude Code · Python server · etc.), a colored <strong>project tag</strong>, and a <strong>#N index</strong> when multiple panels share the same (type, project). The right side has focus, half-screen, and close buttons.`,
        fallback: '#topbarQuickLaunch',
      },
      {
        target: '.drawer-tabs',
        title: 'Info tabs',
        body: `Below every terminal is a drawer with four tabs. <strong>Overview</strong> — live metadata + "Ask about this terminal" input + reply button. <strong>Commands</strong> — scrollable command history (click to copy). <strong>Memory</strong> — every Flashback hit this panel has collected. <strong>Status log</strong> — chronological status transitions with detail chips.`,
        onEnter: async () => { await openFirstPanelDrawer('overview'); },
        fallback: '#topbarQuickLaunch',
      },
      {
        target: '.reply-toggle',
        title: 'Reply — send text to another panel',
        body: `Click <strong>reply ▸</strong> on any panel to route text to another open terminal. Pick the target from the dropdown (labels use <kbd>#N</kbd> suffixes to disambiguate same-project duplicates), type your message, hit send. Useful for handing off work to a Claude Code panel, broadcasting a command, or piping errors into a debug agent.`,
        onEnter: async () => { await openFirstPanelDrawer('overview'); },
        fallback: '#topbarQuickLaunch',
      },
      {
        target: '.ctrl-input',
        title: 'Ask about this terminal',
        body: `Type a question here and TermDeck queries your <strong>Mnestra memory store</strong> for relevant context — scoped to the current panel's project. Prefix with <kbd>all:</kbd> to search every project. Results render inline in the terminal with similarity scores.`,
        onEnter: async () => { await openFirstPanelDrawer('overview'); },
        fallback: '#topbarQuickLaunch',
      },
      {
        target: null,
        title: 'Flashback — proactive recall',
        body: `When a panel errors out, TermDeck <strong>automatically</strong> queries Mnestra for similar past errors and surfaces the top match as a toast. You don't have to ask. Rate-limited to one per 30 seconds per panel. Click the toast to open the Memory tab with the full hit expanded.`,
      },
      {
        target: '.prompt-bar',
        title: 'Prompt bar',
        body: `Type any command here to launch it as a new terminal — <kbd>claude code ~/myproject</kbd>, <kbd>python3 manage.py runserver</kbd>, <kbd>npm run dev</kbd>. Pick a project from the dropdown to auto-cd into its path and apply its default theme. <kbd>Ctrl+Shift+N</kbd> focuses this bar from anywhere.`,
      },
      {
        target: null,
        title: 'You are ready.',
        body: `That's every major surface. Click <strong>how this works</strong> in the top toolbar to replay this walkthrough. <strong>help</strong> opens the full docs. Questions, bugs, feedback: <a href="https://github.com/jhizzard/termdeck/issues" target="_blank" style="color:var(--tg-accent)">github.com/jhizzard/termdeck/issues</a>. Now launch something.`,
      },
    ];

    // Tour setup helpers — manipulate DOM so target selectors resolve to
    // visible, sized elements before the spotlight positions itself.
    async function ensureSecondShellForTour() {
      if (state.sessions.size >= 2) return;
      try {
        const session = await api('POST', '/api/sessions', {
          command: 'zsh',
          type: 'shell',
          reason: 'onboarding tour (switcher demo)',
        });
        createTerminalPanel(session);
        updateEmptyState();
        await new Promise((r) => setTimeout(r, 450));
      } catch (err) {
        console.error('[tour] failed to auto-launch second shell:', err);
      }
    }

    async function openFirstPanelDrawer(tabName = 'overview') {
      const firstId = state.sessions.keys().next().value;
      if (!firstId) return;
      const entry = state.sessions.get(firstId);
      if (!entry) return;
      // Only toggle if not already open on the requested tab — avoid bouncing
      // the drawer shut mid-tour.
      if (entry.drawerOpen && entry.activeTab === tabName) return;
      // Force-open by setting state first so toggleDrawerTab expands it.
      entry.drawerOpen = false;
      toggleDrawerTab(firstId, tabName);
      // Let the CSS transition settle so bounding rects stabilize.
      await new Promise((r) => setTimeout(r, 280));
    }

    const tourState = { active: false, idx: 0 };

    // Resolve a step's target(s) to a bounding rect. Supports single `target`
    // selector, a `targets` array (union rect across multiple elements), and
    // `fallback` as a last resort. Elements with 0×0 rects are treated as
    // invisible and ignored so collapsed drawer content doesn't produce
    // phantom spotlights in the top-left corner.
    function tourResolveRect(step) {
      const visibleRect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return null;
        return r;
      };

      if (step.targets && Array.isArray(step.targets)) {
        const rects = step.targets.map(visibleRect).filter(Boolean);
        if (rects.length > 0) {
          const left = Math.min(...rects.map((r) => r.left));
          const top = Math.min(...rects.map((r) => r.top));
          const right = Math.max(...rects.map((r) => r.right));
          const bottom = Math.max(...rects.map((r) => r.bottom));
          return { left, top, right, bottom, width: right - left, height: bottom - top };
        }
      }

      if (step.target) {
        const r = visibleRect(step.target);
        if (r) return r;
      }

      if (step.fallback) {
        const r = visibleRect(step.fallback);
        if (r) return r;
      }

      return null;
    }

    function positionTourElements(step) {
      const backdrop = document.getElementById('tourBackdrop');
      const spotlight = document.getElementById('tourSpotlight');
      const tooltip = document.getElementById('tourTooltip');
      backdrop.classList.add('active');
      tooltip.style.display = 'block';

      const rect = tourResolveRect(step);
      if (!rect) {
        // Centered step — no spotlight target, or resolved element was invisible
        spotlight.classList.add('centered');
        tooltip.classList.add('centered');
        tooltip.style.top = '';
        tooltip.style.left = '';
        return;
      }
      spotlight.classList.remove('centered');
      tooltip.classList.remove('centered');

      const padding = 8;
      spotlight.style.top = `${rect.top - padding}px`;
      spotlight.style.left = `${rect.left - padding}px`;
      spotlight.style.width = `${rect.width + padding * 2}px`;
      spotlight.style.height = `${rect.height + padding * 2}px`;

      // Place tooltip below the target by default; flip to above if it would
      // overflow the viewport. Clamp horizontally to avoid right-edge clipping.
      const tooltipRect = tooltip.getBoundingClientRect();
      let top = rect.bottom + 16;
      let left = Math.max(12, rect.left);
      if (top + tooltipRect.height > window.innerHeight - 12) {
        top = Math.max(12, rect.top - tooltipRect.height - 16);
      }
      if (left + tooltipRect.width > window.innerWidth - 12) {
        left = window.innerWidth - tooltipRect.width - 12;
      }
      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
    }

    async function renderTourStep() {
      const step = TOUR_STEPS[tourState.idx];
      if (!step) { endTour(); return; }

      // Optional setup hook — launches a panel, opens a drawer, etc.
      if (typeof step.onEnter === 'function') {
        try { await step.onEnter(); } catch (err) { console.error('[tour] onEnter failed:', err); }
      }

      document.getElementById('tourTitle').innerHTML = step.title;
      document.getElementById('tourBody').innerHTML = step.body;
      document.getElementById('tourCounter').textContent =
        `Step ${tourState.idx + 1} of ${TOUR_STEPS.length}`;
      document.getElementById('tourPrevBtn').disabled = tourState.idx === 0;
      document.getElementById('tourNextBtn').textContent =
        tourState.idx === TOUR_STEPS.length - 1 ? 'done' : 'next';
      positionTourElements(step);
    }

    // Auto-launch a shell panel so the tour's panel-targeting steps
    // (header, drawer tabs, reply, ctrl-input) have a real DOM target.
    // Only fires when no panels exist yet. Replays of the tour against
    // an already-populated dashboard skip this — their existing panels
    // serve as the tour targets.
    async function ensurePanelForTour() {
      if (state.sessions.size > 0) return;
      try {
        const session = await api('POST', '/api/sessions', {
          command: 'zsh',
          type: 'shell',
          reason: 'onboarding tour',
        });
        createTerminalPanel(session);
        updateEmptyState();
        // Let xterm.js mount and .panel-* selectors settle before rendering.
        await new Promise((r) => setTimeout(r, 450));
      } catch (err) {
        console.error('[tour] failed to auto-launch shell:', err);
      }
    }

    async function startTour() {
      tourState.active = true;
      tourState.idx = 0;
      // Explicitly show the spotlight. CSS default is `display:none` so the
      // 9999px box-shadow doesn't darken the page before/after a tour runs.
      document.getElementById('tourSpotlight').style.display = 'block';
      await ensurePanelForTour();
      renderTourStep();
    }

    function nextTourStep() {
      if (tourState.idx >= TOUR_STEPS.length - 1) { endTour(); return; }
      tourState.idx += 1;
      renderTourStep();
    }

    function prevTourStep() {
      if (tourState.idx <= 0) return;
      tourState.idx -= 1;
      renderTourStep();
    }

    function endTour() {
      tourState.active = false;
      document.getElementById('tourBackdrop').classList.remove('active');
      document.getElementById('tourTooltip').style.display = 'none';
      // CRITICAL: hide the spotlight element too. Its 9999px box-shadow
      // creates the dark overlay effect independently of the backdrop, so
      // leaving display:block here means the dashboard looks "stuck in tour"
      // even after the tooltip is gone.
      const spotlight = document.getElementById('tourSpotlight');
      spotlight.style.display = 'none';
      spotlight.classList.remove('centered');
      const tooltip = document.getElementById('tourTooltip');
      tooltip.classList.remove('centered');
      tooltip.style.top = '';
      tooltip.style.left = '';
      try { localStorage.setItem('termdeck:tour:seen', '1'); } catch {}
    }

    // ===== Status / Config dropdowns (Sprint 9 T2) =====
    // Generic toolbar-button → dropdown factory. Opens below the button,
    // click-outside closes, re-fetches every open so the data isn't stale.
    function setupInfoDropdown({ btnId, dropdownId, fetch, render }) {
      const btn = document.getElementById(btnId);
      if (!btn) return;

      const dropdown = document.createElement('div');
      dropdown.className = 'health-dropdown info-dropdown';
      dropdown.id = dropdownId;
      dropdown.innerHTML = '<div class="hd-loading">Loading…</div>';
      document.body.appendChild(dropdown);

      let open = false;

      const close = () => {
        dropdown.classList.remove('open');
        open = false;
      };

      const openDropdown = async () => {
        const rect = btn.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 4}px`;
        // Right-align under the button; clamp to viewport
        const desiredLeft = Math.min(
          window.innerWidth - 320,
          Math.max(8, rect.right - 300)
        );
        dropdown.style.left = `${desiredLeft}px`;
        dropdown.innerHTML = '<div class="hd-loading">Loading…</div>';
        dropdown.classList.add('open');
        open = true;
        try {
          const data = await fetch();
          // If user closed it while we were fetching, abort
          if (!open) return;
          dropdown.innerHTML = render(data);
        } catch (err) {
          dropdown.innerHTML = `<div class="hd-empty">Failed to load: ${escapeHtml(err.message || String(err))}</div>`;
        }
      };

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (open) close(); else openDropdown();
      });
      document.addEventListener('click', (e) => {
        if (open && !dropdown.contains(e.target) && e.target !== btn) close();
      });
      document.addEventListener('keydown', (e) => {
        if (open && e.key === 'Escape') close();
      });
    }

    function renderStatusDropdown(data) {
      const total = data.totalSessions || 0;
      const byStatus = data.byStatus || {};
      const byProject = data.byProject || {};
      const byType = data.byType || {};
      const uptime = fmtUptime(data.uptime || 0);
      const heapMB = data.memory && data.memory.heapUsed
        ? (data.memory.heapUsed / 1024 / 1024).toFixed(1) + ' MB'
        : '—';
      const rag = data.ragEnabled ? 'on' : 'off';

      const row = (label, value) => `<div class="hd-check">
        <span class="hd-icon">·</span>
        <span class="hd-name">${escapeHtml(label)}</span>
        <span class="hd-dots"></span>
        <span class="hd-status">${escapeHtml(String(value))}</span>
      </div>`;

      const kvBlock = (title, obj) => {
        const keys = Object.keys(obj);
        if (keys.length === 0) return '';
        const lines = keys.map(k => row(k, obj[k])).join('');
        return `<div class="hd-detail" style="grid-column:1/-1;margin-top:6px;color:var(--tg-text-dim);font-size:10px">${escapeHtml(title)}</div>${lines}`;
      };

      return row('sessions', total)
        + row('uptime', uptime)
        + row('heap', heapMB)
        + row('rag sync', rag)
        + kvBlock('by status', byStatus)
        + kvBlock('by project', byProject)
        + kvBlock('by type', byType);
    }

    function renderConfigDropdown(data) {
      const projects = data.projects || {};
      const projectCount = Object.keys(projects).length;
      const defaultTheme = data.defaultTheme || '—';
      const rag = data.ragEnabled ? 'enabled' : 'disabled';
      const aiQuery = data.aiQueryAvailable ? 'yes' : 'no';

      const row = (label, value, ok) => {
        const icon = ok == null ? '·' : (ok ? '✓' : '✗');
        const cls = ok == null ? '' : (ok ? 'hd-ok' : 'hd-fail');
        return `<div class="hd-check ${cls}">
          <span class="hd-icon">${icon}</span>
          <span class="hd-name">${escapeHtml(label)}</span>
          <span class="hd-dots"></span>
          <span class="hd-status">${escapeHtml(String(value))}</span>
        </div>`;
      };

      let html = ''
        + row('projects', projectCount)
        + row('default theme', defaultTheme)
        + row('RAG sync', rag, data.ragEnabled)
        + row('AI query', aiQuery, data.aiQueryAvailable);

      if (projectCount > 0) {
        html += `<div class="hd-detail" style="grid-column:1/-1;margin-top:6px;color:var(--tg-text-dim);font-size:10px">projects</div>`;
        for (const [name, cfg] of Object.entries(projects)) {
          const path = (cfg && cfg.path) || '';
          html += `<div class="hd-check">
            <span class="hd-icon">·</span>
            <span class="hd-name">${escapeHtml(name)}</span>
            <span class="hd-dots"></span>
            <span class="hd-status" style="font-size:10px;color:var(--tg-text-dim)">${escapeHtml(path)}</span>
          </div>`;
        }
      }

      html += `<div class="hd-detail" style="grid-column:1/-1;margin-top:8px;color:var(--tg-text-dim);font-size:10px">edit <code>~/.termdeck/config.yaml</code> and restart to apply</div>`;
      return html;
    }

    // ===== Setup Wizard (Sprint 19 T2) =====
    // Progressive-disclosure modal that shows TermDeck's 4 configuration tiers
    // and their live status. Detection only — does not write config files.
    const SETUP_TIERS = [
      {
        id: '1',
        name: 'Tier 1 — TermDeck core',
        desc: 'Local terminal multiplexer running in your browser.',
        commands: []
      },
      {
        id: '2',
        name: 'Tier 2 — Mnestra RAG',
        desc: 'Persistent cross-session memory backed by Postgres + pgvector.',
        commands: ['termdeck init --mnestra']
      },
      {
        id: '3',
        name: 'Tier 3 — Rumen learning loop',
        desc: 'Async insight extraction and morning briefings (Supabase Edge Function).',
        commands: ['termdeck init --rumen']
      },
      {
        id: '4',
        name: 'Tier 4 — Projects',
        desc: 'Named project roots so you can launch with "cc <name>" shorthand.',
        commands: ['Click the + button in the prompt bar, or edit ~/.termdeck/config.yaml']
      }
    ];

    let setupModalOpen = false;

    // Sprint 25 T3 — Supabase MCP auto-flow state. Closure-scoped to this module
    // so a re-render of the tier list (refreshSetupStatus) doesn't lose an
    // in-flight picker step. The PAT lives here only between /connect success
    // and /select success; we null `supabaseAutoState` after /select returns ok.
    // Never log .pat. Never assign it to a property of `state` or `window`.
    let supabaseAutoState = null;
    // Cache of the last /api/setup payload so we can re-render the tier list
    // (e.g. PAT entry → project picker) without forcing another HTTP fetch.
    let lastSetupData = null;

    function ensureSetupModal() {
      if (document.getElementById('setupModal')) return;
      const modal = document.createElement('div');
      modal.className = 'setup-modal';
      modal.id = 'setupModal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'setupTitle');
      modal.innerHTML = `
        <div class="setup-backdrop" id="setupBackdrop"></div>
        <div class="setup-card">
          <header class="setup-header">
            <div>
              <h3 id="setupTitle">Setup wizard</h3>
              <p class="setup-subtitle" id="setupSubtitle">Checking status…</p>
            </div>
            <button type="button" class="setup-close" id="setupClose" aria-label="Close">×</button>
          </header>
          <div class="setup-body">
            <div class="setup-tiers" id="setupTiers">
              <div class="setup-loading">Checking tier status…</div>
            </div>
          </div>
          <footer class="setup-footer">
            <div class="setup-hint">
              Edit <code>~/.termdeck/config.yaml</code> and <code>~/.termdeck/secrets.env</code>, then re-check.
            </div>
            <div class="setup-actions">
              <button type="button" class="setup-recheck" id="setupRecheck">re-check</button>
              <button type="button" class="setup-done" id="setupDone">done</button>
            </div>
          </footer>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('setupBackdrop').addEventListener('click', closeSetupModal);
      document.getElementById('setupClose').addEventListener('click', closeSetupModal);
      document.getElementById('setupDone').addEventListener('click', closeSetupModal);
      document.getElementById('setupRecheck').addEventListener('click', refreshSetupStatus);
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeSetupModal(); }
      });
    }

    async function openSetupModal() {
      ensureSetupModal();
      document.getElementById('setupModal').classList.add('open');
      setupModalOpen = true;
      await refreshSetupStatus();
    }

    function closeSetupModal() {
      const m = document.getElementById('setupModal');
      if (m) m.classList.remove('open');
      setupModalOpen = false;
    }

    async function refreshSetupStatus() {
      const tiersEl = document.getElementById('setupTiers');
      const subtitle = document.getElementById('setupSubtitle');
      const recheckBtn = document.getElementById('setupRecheck');
      if (!tiersEl) return;
      tiersEl.innerHTML = '<div class="setup-loading">Checking tier status…</div>';
      if (subtitle) subtitle.textContent = 'Checking status…';
      if (recheckBtn) { recheckBtn.disabled = true; recheckBtn.textContent = 're-checking…'; }
      try {
        const data = await api('GET', '/api/setup');
        lastSetupData = data;
        renderSetupTiers(data);
        const cur = Number(data.tier) || 1;
        if (subtitle) {
          subtitle.textContent = cur >= 4
            ? 'All tiers configured — you are good to go.'
            : `Current tier: ${cur} of 4. Install the next tier below to unlock more features.`;
        }
      } catch (err) {
        tiersEl.innerHTML = `<div class="setup-error">
          Failed to load setup status: ${escapeHtml(err && err.message ? err.message : String(err))}.<br>
          Make sure the server is reachable and supports <code>GET /api/setup</code>.
        </div>`;
        if (subtitle) subtitle.textContent = 'Error checking status.';
      } finally {
        if (recheckBtn) { recheckBtn.disabled = false; recheckBtn.textContent = 're-check'; }
      }
    }

    function renderSetupTiers(data) {
      const tiersEl = document.getElementById('setupTiers');
      if (!tiersEl) return;
      const tiers = (data && data.tiers) || {};
      const currentTier = Number(data && data.tier) || 1;

      const html = SETUP_TIERS.map((tier, idx) => {
        const info = tiers[tier.id] || { status: 'not_configured', detail: 'Unknown' };
        const status = info.status || 'not_configured';
        const detail = info.detail || '';
        const badgeLabel = status === 'active'
          ? 'active'
          : status === 'partial' ? 'partial' : 'not configured';
        const isCurrent = Number(tier.id) === currentTier + 1 && status !== 'active';

        // Sprint 23 T2: tier 2 renders a credential form instead of CLI commands
        // when not active, so users can paste URL/keys directly in the browser.
        const isCredentialForm = tier.id === '2' && status !== 'active';
        // Sprint 25 T3: above the manual paste form, offer the Supabase MCP
        // auto-flow. Only render for tier 2 when status is not_configured or
        // partial — once active there is nothing to configure.
        const showSupabaseAutoFlow = tier.id === '2' && (status === 'not_configured' || status === 'partial');
        const autoFlowHtml = showSupabaseAutoFlow ? renderSupabaseAutoFlow() : '';
        const cmds = isCredentialForm
          ? `${autoFlowHtml}${renderSetupCredentialForm()}`
          : (status === 'active' || tier.commands.length === 0)
            ? ''
            : `<div class="setup-cmds">${tier.commands.map((c) => {
                const copyable = /^termdeck\s/.test(c);
                return `<div class="setup-cmd">
                  <code>${escapeHtml(c)}</code>
                  ${copyable ? `<button type="button" class="setup-copy" data-copy="${escapeHtml(c)}">copy</button>` : ''}
                </div>`;
              }).join('')}</div>`;

        return `
          <div class="setup-tier setup-tier-${status}${isCurrent ? ' setup-tier-next' : ''}">
            <div class="setup-tier-rail" aria-hidden="true">
              <span class="setup-tier-dot"></span>
              ${idx < SETUP_TIERS.length - 1 ? '<span class="setup-tier-line"></span>' : ''}
            </div>
            <div class="setup-tier-body">
              <div class="setup-tier-head">
                <span class="setup-tier-name">${escapeHtml(tier.name)}</span>
                <span class="setup-tier-status setup-tier-status-${status}">${escapeHtml(badgeLabel)}</span>
              </div>
              <div class="setup-tier-desc">${escapeHtml(tier.desc)}</div>
              ${detail ? `<div class="setup-tier-detail">${escapeHtml(detail)}</div>` : ''}
              ${cmds}
            </div>
          </div>
        `;
      }).join('');

      tiersEl.innerHTML = html;

      tiersEl.querySelectorAll('.setup-copy').forEach((btn) => {
        btn.addEventListener('click', () => {
          const txt = btn.getAttribute('data-copy') || '';
          navigator.clipboard.writeText(txt).then(() => {
            const original = btn.textContent;
            btn.textContent = 'copied!';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.textContent = original;
              btn.classList.remove('copied');
            }, 1500);
          }).catch(() => {});
        });
      });

      const credSaveBtn = tiersEl.querySelector('#setupCredSave');
      if (credSaveBtn) {
        credSaveBtn.addEventListener('click', submitSetupCredentials);
      }
      const credForm = tiersEl.querySelector('#setupCredForm');
      if (credForm) {
        credForm.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitSetupCredentials();
          }
        });
      }

      // Sprint 25 T3 — Supabase MCP auto-flow handlers. The form is only in the
      // DOM when showSupabaseAutoFlow was true above; querying for missing nodes
      // is a no-op and keeps this branch defensive against re-render order.
      const autoConnectBtn = tiersEl.querySelector('#supabaseAutoConnect');
      if (autoConnectBtn) {
        autoConnectBtn.addEventListener('click', handleSupabaseAutoConnect);
      }
      const autoPatInput = tiersEl.querySelector('#supabaseAutoPat');
      if (autoPatInput) {
        autoPatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSupabaseAutoConnect();
          }
        });
      }
      const autoSelectBtn = tiersEl.querySelector('#supabaseAutoSelect');
      if (autoSelectBtn) {
        autoSelectBtn.addEventListener('click', handleSupabaseAutoSelect);
      }
      const autoBackBtn = tiersEl.querySelector('#supabaseAutoBack');
      if (autoBackBtn) {
        autoBackBtn.addEventListener('click', handleSupabaseAutoBack);
      }
    }

    // Sprint 25 T3 — Supabase MCP auto-flow renderer.
    // Inline-styled (Sprint 23 T1 owns style.css). Renders one of two states
    // driven by `supabaseAutoState`: the PAT entry form (default), or the
    // project picker (when state.picking is true). Errors render inline; the
    // manual credential form is always still visible below as a fallback.
    function renderSupabaseAutoFlow() {
      const s = supabaseAutoState || {};
      const wrapStyle = 'margin-top:10px;padding:12px;background:rgba(0,0,0,0.18);border:1px solid var(--border, #2a2c3a);border-radius:6px;';
      const titleStyle = 'font-size:11px;font-weight:600;color:var(--text, #e2e3e8);margin-bottom:4px;';
      const helpStyle = 'font-size:10px;color:var(--text-dim, #8a8d9a);margin-bottom:10px;line-height:1.4;';
      const inputStyle = 'flex:1;padding:6px 8px;background:var(--bg, #0f1017);color:var(--text, #e2e3e8);border:1px solid var(--border, #2a2c3a);border-radius:4px;font-family:monospace;font-size:12px;box-sizing:border-box;';
      const btnStyle = 'padding:6px 14px;background:var(--accent, #7aa2f7);color:#000;border:none;border-radius:4px;font-weight:600;cursor:pointer;font-size:11px;';
      const ghostBtnStyle = 'padding:6px 14px;background:transparent;color:var(--text-dim, #8a8d9a);border:1px solid var(--border, #2a2c3a);border-radius:4px;cursor:pointer;font-size:11px;';
      const dividerStyle = 'text-align:center;font-size:10px;color:var(--text-dim, #8a8d9a);margin:10px 0 0;text-transform:uppercase;letter-spacing:0.05em;';
      const errStyle = 'font-size:11px;color:var(--red, #f7768e);margin-top:8px;min-height:14px;line-height:1.4;';
      const linkStyle = 'color:var(--accent, #7aa2f7);text-decoration:underline;';

      let body;
      if (s.picking && Array.isArray(s.projects)) {
        if (s.projects.length === 0) {
          body = `
            <div style="${errStyle}">
              Token accepted, but no projects were found on this account.
              Create one at <a href="https://supabase.com/dashboard" target="_blank" rel="noopener" style="${linkStyle}">supabase.com/dashboard</a> and try again.
            </div>
            <button type="button" id="supabaseAutoBack" style="margin-top:10px;${ghostBtnStyle}">Use a different token</button>
          `;
        } else {
          const opts = s.projects.map((p) => {
            const id = escapeHtml(String((p && p.id) || ''));
            const name = (p && p.name) || 'unnamed';
            const region = p && p.region ? ` — ${p.region}` : '';
            return `<option value="${id}">${escapeHtml(name + region)}</option>`;
          }).join('');
          body = `
            <label style="display:block;font-size:11px;color:var(--text-dim, #8a8d9a);margin-bottom:4px;">Project</label>
            <select id="supabaseAutoProject" style="${inputStyle}width:100%;font-family:inherit;">${opts}</select>
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button type="button" id="supabaseAutoSelect" style="${btnStyle}">Use this project</button>
              <button type="button" id="supabaseAutoBack" style="${ghostBtnStyle}">Use a different token</button>
            </div>
            <div id="supabaseAutoError" style="${errStyle}">${s.error ? escapeHtml(s.error) : ''}</div>
          `;
        }
      } else {
        body = `
          <div style="display:flex;gap:8px;align-items:stretch;">
            <input type="password" id="supabaseAutoPat" name="supabase_pat_one_time"
                   autocomplete="new-password" spellcheck="false"
                   autocapitalize="off" autocorrect="off"
                   placeholder="sbp_..." aria-label="Supabase Personal Access Token"
                   style="${inputStyle}">
            <button type="button" id="supabaseAutoConnect" style="${btnStyle}">Connect</button>
          </div>
          <div id="supabaseAutoError" style="${errStyle}">${s.error ? escapeHtml(s.error) : ''}</div>
        `;
      }

      return `
        <div style="${wrapStyle}">
          <div style="${titleStyle}">Faster: connect Supabase automatically</div>
          <div style="${helpStyle}">
            Paste a Supabase Personal Access Token and pick your project from a list — we'll fetch the credentials for you.
            Mint a PAT at <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noopener" style="${linkStyle}">supabase.com/dashboard/account/tokens</a>.
          </div>
          ${body}
        </div>
        <div style="${dividerStyle}">— or paste credentials manually below —</div>
      `;
    }

    function rerenderSetupTiersFromCache() {
      if (lastSetupData) renderSetupTiers(lastSetupData);
    }

    async function handleSupabaseAutoConnect() {
      const input = document.getElementById('supabaseAutoPat');
      const errEl = document.getElementById('supabaseAutoError');
      const btn = document.getElementById('supabaseAutoConnect');
      const pat = ((input && input.value) || '').trim();
      if (!pat) {
        if (errEl) errEl.textContent = 'Paste a Personal Access Token to continue.';
        return;
      }
      if (errEl) errEl.textContent = '';
      if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }
      try {
        const res = await fetch(`${API}/api/setup/supabase/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pat })
        });
        let data = {};
        try { data = await res.json(); } catch { data = {}; }
        if (res.ok && data && data.ok) {
          const projects = Array.isArray(data.projects) ? data.projects : [];
          // Hold the PAT in module-scope state only; never on `state`/`window`.
          supabaseAutoState = { pat, projects, picking: true, error: null };
          rerenderSetupTiersFromCache();
          return;
        }
        const code = data && data.code;
        let msg;
        if (code === 'mcp_not_installed') {
          msg = "The Supabase MCP isn't installed on this machine. Run `npx @jhizzard/termdeck-stack --tier 4` to install it, or paste credentials manually below.";
        } else if (code === 'pat_invalid') {
          const detail = (data && data.detail) || 'token rejected';
          msg = `Token rejected: ${detail}. Mint a fresh PAT and try again.`;
        } else if (code === 'mcp_timeout') {
          msg = "Supabase didn't respond in time. Try again or paste credentials manually below.";
        } else {
          msg = (data && (data.error || data.detail)) || `Connect failed (HTTP ${res.status}). Paste credentials manually below.`;
        }
        if (errEl) errEl.textContent = msg;
      } catch (err) {
        if (errEl) errEl.textContent = `Request failed: ${err && err.message ? err.message : String(err)}`;
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Connect'; }
      }
    }

    async function handleSupabaseAutoSelect() {
      if (!supabaseAutoState || !supabaseAutoState.pat) return;
      const sel = document.getElementById('supabaseAutoProject');
      const errEl = document.getElementById('supabaseAutoError');
      const btn = document.getElementById('supabaseAutoSelect');
      const projectId = sel ? sel.value : '';
      if (!projectId) {
        if (errEl) errEl.textContent = 'Pick a project first.';
        return;
      }
      if (errEl) errEl.textContent = '';
      if (btn) { btn.disabled = true; btn.textContent = 'Configuring…'; }
      // Snapshot the PAT locally so we can null out module state before the
      // network call resolves; the snapshot only lives for the duration of
      // this async function.
      const patSnapshot = supabaseAutoState.pat;
      try {
        const res = await fetch(`${API}/api/setup/supabase/select`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pat: patSnapshot, projectId })
        });
        let data = {};
        try { data = await res.json(); } catch { data = {}; }
        if (res.ok && data && data.ok) {
          // Null out the PAT before doing anything else with the response.
          supabaseAutoState = null;
          await refreshSetupStatus();
          return;
        }
        const detail = (data && (data.error || data.detail)) || `HTTP ${res.status}`;
        if (errEl) {
          errEl.textContent = `Couldn't finish setup: ${detail}. Paste credentials manually below if this keeps failing.`;
        }
      } catch (err) {
        if (errEl) errEl.textContent = `Request failed: ${err && err.message ? err.message : String(err)}`;
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Use this project'; }
      }
    }

    function handleSupabaseAutoBack() {
      // Drop the PAT and any cached project list and re-render from scratch.
      supabaseAutoState = null;
      rerenderSetupTiersFromCache();
    }

    // Sprint 23 T2 — credential form for Tier 2.
    // Uses inline styles because wizard CSS is owned by T1 this sprint; these
    // stubs fall back to CSS vars already defined in style.css so they inherit
    // theme colours automatically.
    function renderSetupCredentialForm() {
      const inputStyle = 'width:100%;padding:6px 8px;background:var(--bg, #0f1017);color:var(--text, #e2e3e8);border:1px solid var(--border, #2a2c3a);border-radius:4px;font-family:monospace;font-size:12px;margin-top:4px;box-sizing:border-box;';
      const labelStyle = 'display:block;font-size:11px;color:var(--text-dim, #8a8d9a);margin-top:10px;';
      const helpStyle = 'font-size:10px;color:var(--text-dim, #8a8d9a);margin-top:3px;min-height:12px;';
      const btnStyle = 'margin-top:14px;padding:8px 18px;background:var(--accent, #7aa2f7);color:#000;border:none;border-radius:4px;font-weight:600;cursor:pointer;font-size:12px;';
      return `
        <form class="setup-credentials" id="setupCredForm" autocomplete="off" style="margin-top:10px;padding:12px;background:rgba(0,0,0,0.2);border-radius:6px;border:1px solid var(--border, #2a2c3a);">
          <div style="font-size:11px;color:var(--text-dim, #8a8d9a);margin-bottom:4px;">
            Paste your Supabase + OpenAI credentials. They are written to <code>~/.termdeck/secrets.env</code> (chmod 600) and never leave this machine.
          </div>
          <label style="${labelStyle}">
            Supabase URL
            <input type="text" name="supabaseUrl" placeholder="https://xxxxxx.supabase.co" spellcheck="false" autocapitalize="off" autocorrect="off" style="${inputStyle}">
          </label>
          <div class="setup-cred-status" data-field="supabase" style="${helpStyle}"></div>
          <label style="${labelStyle}">
            Service Role Key
            <input type="password" name="supabaseServiceRoleKey" placeholder="sb_secret_..." spellcheck="false" autocomplete="new-password" style="${inputStyle}">
          </label>
          <label style="${labelStyle}">
            OpenAI API Key
            <input type="password" name="openaiApiKey" placeholder="sk-proj-..." spellcheck="false" autocomplete="new-password" style="${inputStyle}">
          </label>
          <div class="setup-cred-status" data-field="openai" style="${helpStyle}"></div>
          <label style="${labelStyle}">
            Database URL
            <input type="password" name="databaseUrl" placeholder="postgresql://postgres:...@...pooler.supabase.com:6543/postgres" spellcheck="false" autocomplete="new-password" style="${inputStyle}">
          </label>
          <div class="setup-cred-status" data-field="database" style="${helpStyle}"></div>
          <label style="${labelStyle}">
            Anthropic API Key <span style="opacity:0.6;">(optional — powers session-log summaries)</span>
            <input type="password" name="anthropicApiKey" placeholder="sk-ant-..." spellcheck="false" autocomplete="new-password" style="${inputStyle}">
          </label>
          <div class="setup-cred-error" id="setupCredError" style="font-size:11px;margin-top:10px;min-height:14px;"></div>
          <button type="button" class="setup-cred-save" id="setupCredSave" style="${btnStyle}">Save &amp; Connect</button>
        </form>
      `;
    }

    async function submitSetupCredentials() {
      const form = document.getElementById('setupCredForm');
      if (!form) return;
      const btn = document.getElementById('setupCredSave');
      const errorEl = document.getElementById('setupCredError');
      const statuses = form.querySelectorAll('.setup-cred-status');

      // Reset state
      if (errorEl) { errorEl.textContent = ''; errorEl.style.color = ''; }
      statuses.forEach((el) => { el.textContent = ''; el.style.color = ''; });

      const body = {
        supabaseUrl: (form.supabaseUrl.value || '').trim(),
        supabaseServiceRoleKey: (form.supabaseServiceRoleKey.value || '').trim(),
        openaiApiKey: (form.openaiApiKey.value || '').trim(),
        anthropicApiKey: (form.anthropicApiKey.value || '').trim(),
        databaseUrl: (form.databaseUrl.value || '').trim()
      };

      const missing = [];
      if (!body.supabaseUrl) missing.push('Supabase URL');
      if (!body.supabaseServiceRoleKey) missing.push('Service Role Key');
      if (!body.openaiApiKey) missing.push('OpenAI API Key');
      if (!body.databaseUrl) missing.push('Database URL');
      if (missing.length) {
        if (errorEl) {
          errorEl.textContent = `Please fill in: ${missing.join(', ')} (Anthropic is optional).`;
          errorEl.style.color = 'var(--red, #f7768e)';
        }
        return;
      }

      if (btn) { btn.disabled = true; btn.textContent = 'Validating…'; }
      try {
        const res = await fetch(`${API}/api/setup/configure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        let data = {};
        try { data = await res.json(); } catch { data = {}; }

        if (data && data.validation) {
          for (const field of ['supabase', 'openai', 'database']) {
            const result = data.validation[field];
            if (!result) continue;
            const el = form.querySelector(`.setup-cred-status[data-field="${field}"]`);
            if (el) {
              el.textContent = (result.ok ? '✓ ' : '✗ ') + (result.detail || '');
              el.style.color = result.ok ? 'var(--green, #9ece6a)' : 'var(--red, #f7768e)';
            }
          }
        }

        if (res.ok && data && data.success) {
          if (errorEl) {
            errorEl.textContent = (data.detail || 'Credentials saved.') + ' Running migrations…';
            errorEl.style.color = 'var(--green, #9ece6a)';
          }
          if (btn) btn.textContent = 'Migrating…';
          await runSetupMigrations(errorEl);
          setTimeout(() => { refreshSetupStatus(); }, 600);
        } else {
          if (errorEl) {
            errorEl.textContent = (data && data.error) || `Configuration failed (HTTP ${res.status})`;
            errorEl.style.color = 'var(--red, #f7768e)';
          }
        }
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = `Request failed: ${err && err.message ? err.message : String(err)}`;
          errorEl.style.color = 'var(--red, #f7768e)';
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save & Connect'; }
      }
    }

    // Sprint 23 audit fix: chain /api/setup/migrate after credentials save so
    // the wizard fulfills the sprint mission ("write config AND run migrations")
    // in a single click instead of leaving the user to run `termdeck init`.
    async function runSetupMigrations(statusEl) {
      try {
        const res = await fetch(`${API}/api/setup/migrate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        });
        let data = {};
        try { data = await res.json(); } catch { data = {}; }
        if (statusEl) {
          if (res.ok && data && data.ok) {
            statusEl.textContent = `Migrations applied (${data.applied}/${data.total}). Tier 2 active.`;
            statusEl.style.color = 'var(--green, #9ece6a)';
          } else {
            const applied = (data && data.applied != null) ? `${data.applied}/${data.total} applied` : '';
            const detail = (data && data.error) ? data.error : `HTTP ${res.status}`;
            statusEl.textContent = `Migrations failed: ${detail}${applied ? ` (${applied})` : ''}`;
            statusEl.style.color = 'var(--red, #f7768e)';
          }
        }
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = `Migration request failed: ${err && err.message ? err.message : String(err)}`;
          statusEl.style.color = 'var(--red, #f7768e)';
        }
      }
    }

    async function maybeAutoOpenSetupWizard() {
      // First-run users get the full wizard; returning users with at least
      // tier 1 configured get a brief welcome-back toast (Sprint 23 T4).
      // Silent-fail if the endpoint doesn't exist (server predates Sprint 19 T1).
      try {
        const res = await fetch(`${API}/api/setup`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data || tourState.active) return;
        if (data.firstRun) {
          setTimeout(() => {
            if (!tourState.active && !setupModalOpen) openSetupModal();
          }, 800);
        } else if (Number(data.tier) >= 1) {
          setTimeout(() => {
            if (!tourState.active && !setupModalOpen) showWelcomeBackToast(data);
          }, 800);
        }
      } catch {
        // API not available — skip silently
      }
    }

    // Sprint 23 T4: returning-user welcome-back toast. Non-blocking, dismisses
    // on click or after 5s. Inline-styled so we don't touch style.css (T1's
    // ownership). The config button still opens the full wizard.
    function showWelcomeBackToast(data) {
      const existing = document.getElementById('welcomeBackToast');
      if (existing) existing.remove();

      const tier = Number(data.tier) || 1;
      const tierNames = {
        1: 'TermDeck core',
        2: 'TermDeck + Mnestra',
        3: 'TermDeck + Mnestra + Rumen',
        4: 'Full stack + projects'
      };
      const stackLabel = tierNames[tier] || 'TermDeck';

      const tiers = data.tiers || {};
      const mnestraDetail = (tiers[2] && tiers[2].detail) || '';
      const rumenDetail = (tiers[3] && tiers[3].detail) || '';

      const memMatch = mnestraDetail.match(/([\d,]+)\s*memories/i);
      const memoryCount = memMatch ? memMatch[1] : null;
      const rumenMatch = rumenDetail.match(/last job\s+([^,]+?)(?:\s+ago|,|$)/i);
      const rumenAgo = rumenMatch ? rumenMatch[1].trim() : null;

      const parts = [`Stack: ${stackLabel}.`];
      if (memoryCount) parts.push(`${memoryCount} memories.`);
      if (rumenAgo) parts.push(`Last Rumen job: ${rumenAgo} ago.`);

      const toast = document.createElement('div');
      toast.id = 'welcomeBackToast';
      toast.setAttribute('role', 'status');
      toast.style.cssText = [
        'position:fixed',
        'top:64px',
        'right:16px',
        'z-index:9999',
        'max-width:360px',
        'padding:10px 14px',
        'background:rgba(20,22,28,0.95)',
        'color:#cdd6f4',
        'border:1px solid rgba(137,180,250,0.35)',
        'border-radius:6px',
        'box-shadow:0 4px 18px rgba(0,0,0,0.4)',
        'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
        'cursor:pointer',
        'opacity:0',
        'transition:opacity 180ms ease'
      ].join(';');
      toast.innerHTML = `
        <div style="font-weight:600;color:#89b4fa;margin-bottom:2px">Welcome back</div>
        <div>${parts.map(p => escapeHtml(p)).join(' ')}</div>
      `;

      document.body.appendChild(toast);
      requestAnimationFrame(() => { toast.style.opacity = '1'; });

      const dismiss = () => {
        clearTimeout(timer);
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 200);
      };
      toast.addEventListener('click', dismiss);
      const timer = setTimeout(dismiss, 5000);
    }

    function fmtUptime(sec) {
      const s = Math.floor(sec);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const rs = s % 60;
      if (h > 0) return `${h}h ${m}m`;
      if (m > 0) return `${m}m ${rs}s`;
      return `${rs}s`;
    }

    // ===== Event Listeners =====
    document.querySelectorAll('.layout-btn').forEach(btn => {
      btn.addEventListener('click', () => setLayout(btn.dataset.layout));
    });

    document.getElementById('promptLaunch').addEventListener('click', launchTerminal);
    document.getElementById('promptInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') launchTerminal();
    });

    // Add-project modal wiring
    document.getElementById('btnAddProject').addEventListener('click', openAddProjectModal);
    document.getElementById('apmCancel').addEventListener('click', closeAddProjectModal);
    document.getElementById('apmSave').addEventListener('click', submitAddProject);
    document.querySelector('#addProjectModal .add-project-backdrop').addEventListener('click', closeAddProjectModal);
    // Enter in any input inside the modal submits; Escape closes
    document.getElementById('addProjectModal').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAddProject(); }
      if (e.key === 'Escape') { e.preventDefault(); closeAddProjectModal(); }
    });

    // Status + config dropdowns (Sprint 9 T2): btn-status/btn-config were
    // stubs with no listeners. Each now opens a dropdown with live data
    // fetched from /api/status and /api/config. Reuses .health-dropdown
    // styling (from T1's style.css) for visual consistency.
    setupInfoDropdown({
      btnId: 'btn-status',
      dropdownId: 'statusDropdown',
      fetch: () => api('GET', '/api/status'),
      render: renderStatusDropdown
    });
    // Sprint 19 T2: config button now opens the setup wizard instead of the
    // legacy config dropdown (renderConfigDropdown is kept as dead code).
    document.getElementById('btn-config').addEventListener('click', openSetupModal);

    // Onboarding tour wiring
    document.getElementById('btn-how').addEventListener('click', startTour);
    document.getElementById('tourNextBtn').addEventListener('click', nextTourStep);
    document.getElementById('tourPrevBtn').addEventListener('click', prevTourStep);
    document.getElementById('tourSkipBtn').addEventListener('click', endTour);
    // Clicking the backdrop (but not the spotlight/tooltip) also skips
    document.getElementById('tourBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'tourBackdrop') endTour();
    });

    // Resize handler — debounced so a resize drag doesn't re-fit every frame.
    window.addEventListener('resize', fitAllDebounced);

    // Re-render the tour on viewport changes so the spotlight tracks resizes
    window.addEventListener('resize', () => {
      if (tourState.active) renderTourStep();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Tour has priority: Esc exits, ArrowRight/Enter advances, ArrowLeft back
      if (tourState.active) {
        if (e.key === 'Escape') { e.preventDefault(); endTour(); return; }
        if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); nextTourStep(); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); prevTourStep(); return; }
      }
      // Ctrl+Shift+N → new terminal
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        document.getElementById('promptInput').focus();
      }
      // "/" → focus prompt bar (first-run hint, ignored when typing in any input/textarea)
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target;
        const tag = target?.tagName || '';
        const inEditable = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
        if (!inEditable) {
          e.preventDefault();
          document.getElementById('promptInput').focus();
        }
      }
      // Ctrl+Shift+1-7 OR Cmd+Shift+1-7 → layout switch (Mac friendly)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key >= '1' && e.key <= '7') {
        e.preventDefault();
        const layouts = ['1x1', '2x1', '2x2', '3x2', '2x4', '4x2', 'orch'];
        setLayout(layouts[parseInt(e.key) - 1]);
      }
      // Ctrl+Shift+] / [ → cycle between terminals
      if (e.ctrlKey && e.shiftKey && (e.key === ']' || e.key === '[')) {
        e.preventDefault();
        const ids = Array.from(state.sessions.keys());
        if (ids.length > 0) {
          const curIdx = ids.indexOf(state.focusedId);
          const next = e.key === ']'
            ? (curIdx + 1) % ids.length
            : (curIdx - 1 + ids.length) % ids.length;
          const entry = state.sessions.get(ids[next]);
          if (entry) {
            entry.terminal.focus();
            state.focusedId = ids[next];
          }
        }
      }
      // Escape → exit focus mode
      if (e.key === 'Escape') {
        const grid = document.getElementById('termGrid');
        if (grid.classList.contains('layout-focus') || grid.classList.contains('layout-half')) {
          setLayout(state.layout);
          document.querySelectorAll('.term-panel').forEach(p => {
            p.classList.remove('focused', 'primary');
            p.style.display = '';
          });
          fitAll();
        }
      }
    });

    // Control feed click (T1.6) — delegated at the feed container
    document.getElementById('feedRows').addEventListener('click', onFeedRowClick);

    // Live refresh while in control mode
    setInterval(() => {
      const grid = document.getElementById('termGrid');
      if (grid && grid.classList.contains('layout-control')) {
        renderControlFeed();
      }
    }, 2000);

    // Alt+1..9 → focus panel N, Alt+0 → cycle focus (T1.2)
    // Use capture-phase so xterm.js never sees the key as a Meta sequence.
    // Match on e.code, not e.key: on macOS, Option+1 produces "¡", not "1".
    document.addEventListener('keydown', (e) => {
      if (!e.altKey) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.code && e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) {
          e.preventDefault();
          e.stopPropagation();
          focusNthSession(n);
        } else if (n === 0) {
          e.preventDefault();
          e.stopPropagation();
          cycleSessionFocus();
        }
      }
    }, { capture: true });

    // External-session auto-discover disabled. The poller raced with the
    // immediate createTerminalPanel call in launchTerminal and caused
    // duplicate WebSocket connections per session, which broke terminal
    // input rendering (session.ws on the server got overwritten by the
    // second connect and term.onData output stopped reaching the visible
    // panel). Parked for Sprint 3 — needs an idempotent creation path
    // AND a way to suppress the race window during POST → createPanel.

    // Refresh "opened X ago" timestamps every 30s
    setInterval(() => {
      for (const [id, entry] of state.sessions) {
        const metaOpened = document.querySelector(`#panel-${id} .panel-meta .meta-item:first-child`);
        if (metaOpened && entry.session?.meta?.createdAt) {
          metaOpened.innerHTML = `<span class="meta-label">opened</span> ${timeAgo(entry.session.meta.createdAt)}`;
        }
      }
    }, 30000);

    // ===== Health Badge (Sprint 6 T4) =====
    const healthState = {
      available: false,    // false until first successful /api/health response
      pollTimer: null,
      dropdownOpen: false,
      lastResult: null
    };

    function setupHealthBadge() {
      // Inject badge into topbar-stats, after the rumen badge
      const statsDiv = document.getElementById('globalStats');
      if (!statsDiv) return;

      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'health-badge';
      badge.id = 'healthBadge';
      badge.title = 'Stack health';
      badge.setAttribute('aria-haspopup', 'true');
      badge.innerHTML = `<span class="hb-icon" aria-hidden="true">&#x1F6E1;</span> <span id="healthBadgeLabel">checking…</span>`;
      badge.style.display = 'none'; // hidden until first successful poll
      statsDiv.appendChild(badge);

      // Dropdown
      const dropdown = document.createElement('div');
      dropdown.className = 'health-dropdown';
      dropdown.id = 'healthDropdown';
      dropdown.innerHTML = '<div class="hd-loading">Loading…</div>';
      document.body.appendChild(dropdown);

      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleHealthDropdown();
      });
      document.addEventListener('click', (e) => {
        if (healthState.dropdownOpen && !dropdown.contains(e.target) && e.target !== badge) {
          closeHealthDropdown();
        }
      });

      // Initial fetch + poll
      fetchHealth();
      healthState.pollTimer = setInterval(fetchHealth, 30000);
    }

    async function fetchHealth() {
      try {
        const res = await fetch(`${API}/api/health`);
        if (res.status === 404) {
          // Server doesn't have health endpoint — hide badge entirely
          hideHealthBadge();
          return;
        }
        if (!res.ok) {
          showHealthOffline();
          return;
        }
        const data = await res.json();
        healthState.available = true;
        healthState.lastResult = data;
        renderHealthBadge(data);
      } catch {
        showHealthOffline();
      }
    }

    function hideHealthBadge() {
      healthState.available = false;
      const badge = document.getElementById('healthBadge');
      if (badge) badge.style.display = 'none';
      if (healthState.pollTimer) {
        clearInterval(healthState.pollTimer);
        healthState.pollTimer = null;
      }
    }

    function showHealthOffline() {
      healthState.available = true;
      healthState.lastResult = null;
      const badge = document.getElementById('healthBadge');
      if (!badge) return;
      badge.style.display = '';
      badge.className = 'health-badge hb-red';
      document.getElementById('healthBadgeLabel').textContent = 'Health: offline';
    }

    // Tier 2/3 checks only shown when the user has configured those tiers.
    // Without DATABASE_URL, mnestra/rumen/database checks are irrelevant noise.
    const TIER1_CHECKS = new Set(['project_paths', 'shell_sanity']);
    const TIER23_CHECKS = new Set(['mnestra_reachable', 'mnestra_has_memories', 'rumen_recent', 'database_url']);

    function filterChecksByTier(checks) {
      // Show Tier 2/3 checks if DATABASE_URL was ATTEMPTED (exists in results),
      // regardless of pass/fail. Only hide higher-tier checks when the user
      // has no DATABASE_URL at all (detail says "not set").
      const dbCheck = checks.find(c => c.name === 'database_url');
      const dbConfigured = dbCheck && !/not set/i.test(dbCheck.detail || '');
      if (dbConfigured) return checks; // full stack configured — show everything
      // No DATABASE_URL configured: only show Tier 1 checks
      return checks.filter(c => TIER1_CHECKS.has(c.name));
    }

    function renderHealthBadge(data) {
      const badge = document.getElementById('healthBadge');
      if (!badge) return;
      badge.style.display = '';

      const allChecks = data.checks || [];
      const checks = filterChecksByTier(allChecks);
      const total = checks.length;
      const passed = checks.filter(c => c.passed).length;
      const allOk = passed === total && total > 0;
      const tierLabel = total < allChecks.length ? 'Tier 1' : 'Stack';

      if (allOk) {
        badge.className = 'health-badge hb-green';
        document.getElementById('healthBadgeLabel').textContent = `${tierLabel}: OK`;
      } else if (total === 0) {
        badge.className = 'health-badge hb-amber';
        document.getElementById('healthBadgeLabel').textContent = 'Stack: ?';
      } else {
        badge.className = 'health-badge hb-red';
        document.getElementById('healthBadgeLabel').textContent = `${tierLabel}: ${passed}/${total}`;
      }

      // Update dropdown content — pass filtered checks
      renderHealthDropdown({ ...data, checks });
    }

    function renderHealthDropdown(data) {
      const dropdown = document.getElementById('healthDropdown');
      if (!dropdown) return;
      const checks = data.checks || [];
      if (checks.length === 0) {
        dropdown.innerHTML = '<div class="hd-empty">No health checks reported</div>';
        return;
      }

      let html = '';
      for (const check of checks) {
        const icon = check.passed ? '✓' : '✗';
        const cls = check.passed ? 'hd-ok' : 'hd-fail';
        const name = check.name || 'Unknown';
        const detail = check.detail || '';
        const remediation = check.passed ? '' : (check.remediation ? `<div class="hd-remediation">${escapeHtml(check.remediation)}</div>` : '');
        html += `<div class="hd-check ${cls}">
          <span class="hd-icon">${icon}</span>
          <span class="hd-name">${escapeHtml(name)}</span>
          <span class="hd-dots"></span>
          <span class="hd-status">${check.passed ? 'OK' : 'FAIL'}</span>
          <span class="hd-detail">${escapeHtml(detail)}</span>
          ${remediation}
        </div>`;
      }
      dropdown.innerHTML = html;
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function toggleHealthDropdown() {
      if (healthState.dropdownOpen) {
        closeHealthDropdown();
      } else {
        openHealthDropdown();
      }
    }

    function openHealthDropdown() {
      const badge = document.getElementById('healthBadge');
      const dropdown = document.getElementById('healthDropdown');
      if (!badge || !dropdown) return;

      const rect = badge.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom + 4}px`;
      dropdown.style.left = `${Math.max(8, rect.left - 100)}px`;
      dropdown.classList.add('open');
      healthState.dropdownOpen = true;
    }

    function closeHealthDropdown() {
      const dropdown = document.getElementById('healthDropdown');
      if (dropdown) dropdown.classList.remove('open');
      healthState.dropdownOpen = false;
    }

    // ===== Transcript Recovery UI (Sprint 6 T4) =====
    const transcriptState = {
      available: false,
      modalOpen: false,
      view: 'recent',   // 'recent' | 'search' | 'replay'
      recentData: null,
      searchResults: null,
      replaySession: null,
      replayData: null
    };

    function setupTranscriptUI() {
      // Inject "Transcripts" button into topbar-right, before the "status" button
      const topbarRight = document.querySelector('.topbar-right');
      const btnStatus = document.getElementById('btn-status');
      if (!topbarRight || !btnStatus) return;

      const btn = document.createElement('button');
      btn.id = 'btn-transcripts';
      btn.textContent = 'transcripts';
      btn.title = 'Session transcript recovery';
      btn.style.display = 'none'; // hidden until we confirm endpoints exist
      topbarRight.insertBefore(btn, btnStatus);

      // Create the modal
      const modal = document.createElement('div');
      modal.className = 'transcript-modal';
      modal.id = 'transcriptModal';
      modal.innerHTML = `
        <div class="transcript-backdrop" id="transcriptBackdrop"></div>
        <div class="transcript-card">
          <header>
            <h3>Session Transcripts</h3>
            <div class="transcript-tabs">
              <button class="transcript-tab active" data-view="recent">Recent</button>
              <button class="transcript-tab" data-view="search">Search</button>
            </div>
          </header>
          <div class="transcript-search-bar" id="transcriptSearchBar" style="display:none">
            <input type="text" id="transcriptSearchInput" placeholder="Search transcript content…" class="ctrl-input" />
          </div>
          <div class="transcript-body" id="transcriptBody">
            <div class="transcript-loading">Checking transcript endpoints…</div>
          </div>
          <footer>
            <button class="transcript-back" id="transcriptBack" style="display:none">← Back</button>
            <button class="rm-close" id="transcriptClose">Close</button>
          </footer>
        </div>
      `;
      document.body.appendChild(modal);

      // Events
      btn.addEventListener('click', openTranscriptModal);
      document.getElementById('transcriptBackdrop').addEventListener('click', closeTranscriptModal);
      document.getElementById('transcriptClose').addEventListener('click', closeTranscriptModal);
      document.getElementById('transcriptBack').addEventListener('click', transcriptGoBack);

      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeTranscriptModal(); }
      });

      // Tab switching
      modal.querySelectorAll('.transcript-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const view = tab.dataset.view;
          transcriptSwitchView(view);
        });
      });

      // Search input
      let searchDebounce = null;
      document.getElementById('transcriptSearchInput').addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          const q = e.target.value.trim();
          if (q.length >= 2) transcriptSearch(q);
        }, 400);
      });

      // Probe for endpoint availability
      probeTranscriptEndpoints();
    }

    async function probeTranscriptEndpoints() {
      try {
        const res = await fetch(`${API}/api/transcripts/recent?minutes=1`);
        if (res.status === 404) {
          // Endpoints not available — keep button hidden
          transcriptState.available = false;
          return;
        }
        // Endpoint exists (even if empty)
        transcriptState.available = true;
        const btn = document.getElementById('btn-transcripts');
        if (btn) btn.style.display = '';
      } catch {
        transcriptState.available = false;
      }
    }

    function openTranscriptModal() {
      if (!transcriptState.available) return;
      transcriptState.modalOpen = true;
      document.getElementById('transcriptModal').classList.add('open');
      transcriptSwitchView('recent');
      fetchRecentTranscripts();
    }

    function closeTranscriptModal() {
      transcriptState.modalOpen = false;
      document.getElementById('transcriptModal').classList.remove('open');
    }

    function transcriptGoBack() {
      if (transcriptState.view === 'replay') {
        transcriptState.replaySession = null;
        transcriptState.replayData = null;
        // Go back to whichever list view was active
        transcriptSwitchView(transcriptState.searchResults ? 'search' : 'recent');
        if (transcriptState.view === 'recent') renderRecentTranscripts();
        else renderSearchResults();
      }
    }

    function transcriptSwitchView(view) {
      transcriptState.view = view;
      const tabs = document.querySelectorAll('.transcript-tab');
      tabs.forEach(t => t.classList.toggle('active', t.dataset.view === view));
      const searchBar = document.getElementById('transcriptSearchBar');
      const backBtn = document.getElementById('transcriptBack');
      searchBar.style.display = view === 'search' ? '' : 'none';
      backBtn.style.display = view === 'replay' ? '' : 'none';

      if (view === 'recent') fetchRecentTranscripts();
      if (view === 'search') {
        const input = document.getElementById('transcriptSearchInput');
        input.focus();
        if (transcriptState.searchResults) renderSearchResults();
        else document.getElementById('transcriptBody').innerHTML = '<div class="transcript-empty">Type to search transcript content</div>';
      }
    }

    async function fetchRecentTranscripts() {
      const body = document.getElementById('transcriptBody');
      body.innerHTML = '<div class="transcript-loading">Loading recent transcripts…</div>';
      try {
        const res = await fetch(`${API}/api/transcripts/recent?minutes=60`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        transcriptState.recentData = data;
        renderRecentTranscripts();
      } catch {
        body.innerHTML = '<div class="transcript-empty">Failed to load transcripts</div>';
      }
    }

    function renderRecentTranscripts() {
      const body = document.getElementById('transcriptBody');
      const data = transcriptState.recentData;
      if (!data || !data.sessions || data.sessions.length === 0) {
        body.innerHTML = '<div class="transcript-empty">No recent transcript activity</div>';
        return;
      }
      let html = '';
      for (const sess of data.sessions) {
        const id = sess.sessionId || sess.session_id || 'unknown';
        const shortId = id.slice(0, 8);
        const type = sess.type || 'shell';
        const project = sess.project || '';
        const lines = sess.lines || sess.preview || [];
        const lineCount = sess.totalLines || lines.length;
        html += `<div class="transcript-session" data-session-id="${escapeHtml(id)}">
          <div class="ts-header">
            <span class="ts-id">${escapeHtml(shortId)}</span>
            <span class="ts-type">${escapeHtml(type)}</span>
            ${project ? `<span class="ts-project">${escapeHtml(project)}</span>` : ''}
            <span class="ts-lines">${lineCount} lines</span>
          </div>
          <pre class="ts-preview">${escapeHtml(lines.slice(-6).join('\n'))}</pre>
        </div>`;
      }
      body.innerHTML = html;

      // Click to replay
      body.querySelectorAll('.transcript-session').forEach(el => {
        el.addEventListener('click', () => {
          const sid = el.dataset.sessionId;
          loadTranscriptReplay(sid);
        });
      });
    }

    async function transcriptSearch(query) {
      const body = document.getElementById('transcriptBody');
      body.innerHTML = '<div class="transcript-loading">Searching…</div>';
      try {
        const res = await fetch(`${API}/api/transcripts/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error('search failed');
        const data = await res.json();
        transcriptState.searchResults = data;
        renderSearchResults();
      } catch {
        body.innerHTML = '<div class="transcript-empty">Search failed</div>';
      }
    }

    function renderSearchResults() {
      const body = document.getElementById('transcriptBody');
      const data = transcriptState.searchResults;
      if (!data || !data.results || data.results.length === 0) {
        body.innerHTML = '<div class="transcript-empty">No matches found</div>';
        return;
      }
      let html = '';
      for (const result of data.results) {
        const id = result.sessionId || result.session_id || 'unknown';
        const shortId = id.slice(0, 8);
        const line = result.line || result.content || '';
        const ts = result.timestamp ? new Date(result.timestamp).toLocaleTimeString() : '';
        html += `<div class="transcript-result" data-session-id="${escapeHtml(id)}">
          <div class="tr-meta">
            <span class="tr-session">${escapeHtml(shortId)}</span>
            ${ts ? `<span class="tr-time">${escapeHtml(ts)}</span>` : ''}
          </div>
          <pre class="tr-line">${highlightMatch(escapeHtml(line), escapeHtml(document.getElementById('transcriptSearchInput').value))}</pre>
        </div>`;
      }
      body.innerHTML = html;

      // Click to replay
      body.querySelectorAll('.transcript-result').forEach(el => {
        el.addEventListener('click', () => {
          const sid = el.dataset.sessionId;
          loadTranscriptReplay(sid);
        });
      });
    }

    function highlightMatch(text, query) {
      if (!query) return text;
      try {
        const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(re, '<mark class="tr-highlight">$1</mark>');
      } catch {
        return text;
      }
    }

    async function loadTranscriptReplay(sessionId) {
      transcriptState.view = 'replay';
      transcriptState.replaySession = sessionId;
      const body = document.getElementById('transcriptBody');
      const backBtn = document.getElementById('transcriptBack');
      const searchBar = document.getElementById('transcriptSearchBar');
      backBtn.style.display = '';
      searchBar.style.display = 'none';
      body.innerHTML = '<div class="transcript-loading">Loading full transcript…</div>';

      try {
        const res = await fetch(`${API}/api/transcripts/${encodeURIComponent(sessionId)}`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        transcriptState.replayData = data;
        renderTranscriptReplay(data);
      } catch {
        body.innerHTML = '<div class="transcript-empty">Failed to load transcript</div>';
      }
    }

    function renderTranscriptReplay(data) {
      const body = document.getElementById('transcriptBody');
      const content = data.content || data.lines?.join('\n') || '';
      const sessionId = transcriptState.replaySession || 'unknown';
      body.innerHTML = `
        <div class="transcript-replay-header">
          <span class="tr-replay-id">Session: ${escapeHtml(sessionId.slice(0, 12))}</span>
          <button class="transcript-copy" id="transcriptCopyBtn">Copy to clipboard</button>
        </div>
        <pre class="transcript-replay-content">${escapeHtml(content)}</pre>
      `;
      document.getElementById('transcriptCopyBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(content).then(() => {
          const btn = document.getElementById('transcriptCopyBtn');
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = 'Copy to clipboard';
            btn.classList.remove('copied');
          }, 2000);
        }).catch(() => {});
      });
    }

    // Boot
    init();
