# T4 — Security + Deployment Documentation

## Goal

Create documentation for secure deployment beyond localhost. The 360 audits flagged that TermDeck has no auth and trusts localhost implicitly — acceptable for local dev, but needs documentation for any other deployment.

## Deliverables

### 1. `docs/SECURITY.md` (new)

Cover:
- **Threat model**: TermDeck runs PTYs — anyone with access can execute arbitrary commands. The API surface includes shell spawning, PTY input injection, and transcript retrieval. This is by design for a local dev tool.
- **Default posture**: Binds to 127.0.0.1 only. No auth required. Safe on a single-user machine.
- **When to enable auth**: Remote access, LAN sharing, any non-localhost bind.
- **Auth mechanism**: `auth.token` in config.yaml or `TERMDECK_AUTH_TOKEN` env var. Bearer token in headers, query param, or cookie.
- **What auth does NOT protect**: If someone has shell access to the machine, they can read the token from config.yaml. Auth is a network-level gate, not a privilege escalation boundary.
- **Secrets handling**: All secrets in `~/.termdeck/secrets.env` (not in config.yaml). File permissions should be 600.
- **Transcript data**: Terminal output is stored in Supabase if DATABASE_URL is set. Consider what's in your terminals before enabling transcript backup on shared projects.

### 2. `docs/DEPLOYMENT.md` (new)

Deployment checklist for non-localhost use:

- [ ] Set `auth.token` in config.yaml
- [ ] Bind to 0.0.0.0 only if behind a reverse proxy with TLS
- [ ] Use `wss://` for WebSocket if exposed over HTTPS
- [ ] Set file permissions: `chmod 600 ~/.termdeck/secrets.env`
- [ ] Review transcript backup scope — disable if sharing the Supabase instance
- [ ] Monitor the health badge — all 6 checks should pass before exposing

Also cover:
- Running behind nginx/caddy reverse proxy
- Running as a systemd service
- Docker deployment (future — note as not yet available)

## Files you own
- docs/SECURITY.md (create)
- docs/DEPLOYMENT.md (create)

## Acceptance criteria
- [ ] SECURITY.md covers threat model, auth, secrets, transcripts
- [ ] DEPLOYMENT.md has a concrete checklist
- [ ] Both docs are under 150 lines each
- [ ] Write [T4] DONE to STATUS.md
