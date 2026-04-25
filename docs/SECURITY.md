# Security Model

TermDeck is a local development tool that spawns real PTYs and exposes them over
HTTP + WebSocket. This document describes the threat model, the default posture,
and what you need to do before exposing TermDeck beyond localhost.

---

## Threat model

TermDeck runs PTYs on behalf of anyone who can reach the HTTP/WebSocket
endpoints. That means:

- **Arbitrary command execution.** Every session is a real shell. A client with
  access to `POST /api/sessions` and `ws://host/ws` can run any command the
  TermDeck process user can run.
- **PTY input injection.** The WebSocket accepts `{ type: 'input', data }`
  messages that are written verbatim into the PTY. There is no sandbox.
- **Transcript retrieval.** `GET /api/transcripts/:sessionId` returns captured
  terminal output — including anything you pasted or echoed.
- **File edits via agents.** Claude Code, Gemini CLI, and other agents spawned
  inside a TermDeck session can read and modify files in the working directory.

This is by design. TermDeck is a local control-room UI, not a hardened
multi-tenant service.

---

## Default posture

Out of the box, `termdeck` (and `npx @jhizzard/termdeck`) binds to
**127.0.0.1 only**. There is no authentication, because only processes running
as your user on your machine can reach the socket.

This is safe on a single-user workstation. It is **not** safe if:

- You bind to `0.0.0.0` or a LAN IP.
- You expose the port through a reverse proxy, tunnel (ngrok, Cloudflared), or
  SSH forward to another human.
- You run TermDeck on a shared machine where other local users could reach
  127.0.0.1.

In any of those cases, enable authentication before starting the server.

---

## When to enable auth

Enable `auth.token` whenever the TermDeck port is reachable from a network
identity that is not you. Rule of thumb: if you type anything other than
`localhost` or `127.0.0.1` into a browser to reach TermDeck, you need auth.

---

## Auth mechanism

Set a token in `~/.termdeck/config.yaml`:

```yaml
auth:
  token: ${TERMDECK_AUTH_TOKEN}
```

Or pass it directly via the `TERMDECK_AUTH_TOKEN` environment variable. Long
random tokens are strongly preferred — generate one with:

```bash
openssl rand -hex 32
```

Clients present the token in one of three places:

1. `Authorization: Bearer <token>` header on REST requests.
2. `?token=<token>` query parameter on the WebSocket upgrade URL.
3. `termdeck_token` cookie (set once by the browser after the login page).

All three are accepted; pick whichever fits your proxy setup.

### What auth does NOT protect

Auth is a **network gate**, not a privilege boundary.

- Anyone with shell access to the TermDeck machine can read the token from
  `~/.termdeck/config.yaml` or `~/.termdeck/secrets.env`.
- Anyone with access to the browser profile that holds the cookie can reuse it.
- Auth does not isolate sessions from each other — once you're past the gate,
  you can attach to any session.

If you need multi-user isolation, run one TermDeck process per user on
separate ports, each with its own token.

---

## Secrets handling

All secrets (API keys, database URLs, auth tokens) live in
`~/.termdeck/secrets.env` — a plain dotenv file. `config.yaml` references them
with `${VAR}` substitution.

- **File permissions:** `chmod 600 ~/.termdeck/secrets.env`. The file contains
  your Mnestra DB URL, OpenAI key, and auth token in cleartext.
- **Never commit it.** `.gitignore` already excludes `.termdeck/`, but if you
  copy the file into a project directory, verify the project's gitignore.
- **Rotation:** Treat this file the same way you treat `.env.production`. If
  the machine is compromised or a laptop is lost, rotate every key in it.

---

## Transcript data

When `DATABASE_URL` is set and the Mnestra bridge is active, terminal output
is captured into `rag_events` and `transcripts` tables in Supabase.

Consider what you type before enabling transcript backup on shared projects:

- Environment variables echoed in shells (`env`, `printenv`).
- Paste-buffer leaks when copying credentials into `psql`, `redis-cli`, etc.
- Anything inside a `.env` file opened with `cat`.

If a project routinely surfaces secrets in terminal output, either disable
transcript backup for that project in `config.yaml` or scrub the offending
sessions from the Supabase tables manually.

---

## Reporting issues

Found a security problem? Email `admin@nashvillechopin.org` or open a private
security advisory on the GitHub repo. Please do not file public issues for
anything that would let an unauthenticated client reach a PTY.
