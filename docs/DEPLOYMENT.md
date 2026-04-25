# Deployment

TermDeck is designed to run on `localhost`. This guide covers what to do if
you need to expose it to a LAN, a reverse-proxied hostname, or a persistent
host process. Read [SECURITY.md](./SECURITY.md) first.

---

## Pre-exposure checklist

Complete every item before binding TermDeck to anything other than
`127.0.0.1`.

- [ ] Set `auth.token` in `~/.termdeck/config.yaml` (32+ random bytes, hex).
- [ ] Bind to `0.0.0.0` **only** when TermDeck sits behind a reverse proxy that
      terminates TLS. Do not expose the raw port to the internet.
- [ ] Use `wss://` for the WebSocket whenever the page is served over
      `https://`. Mixed-content browsers will block `ws://` upgrades.
- [ ] `chmod 600 ~/.termdeck/secrets.env` — the file holds the auth token and
      any DB/API keys.
- [ ] Review transcript scope. If the deployment shares a Supabase project with
      other tools, disable transcript backup for projects that handle secrets.
- [ ] Confirm the preflight health badge is green (all 6 checks pass) before
      opening the port to other users.

---

## Reverse proxy

TermDeck speaks plain HTTP and WebSocket. Terminate TLS upstream.

### nginx

```nginx
server {
  listen 443 ssl http2;
  server_name termdeck.example.com;
  ssl_certificate     /etc/letsencrypt/live/termdeck.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/termdeck.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:7700;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
```

The long read/send timeouts matter — idle PTYs hold the WebSocket open.

### caddy

```caddy
termdeck.example.com {
  reverse_proxy 127.0.0.1:7700
}
```

Caddy auto-upgrades WebSocket and provisions TLS.

---

## systemd service

Run TermDeck as the user whose shells you want to spawn. **Do not run as
root** — a PTY spawned as root gives every authenticated client root.

`/etc/systemd/system/termdeck.service`:

```ini
[Unit]
Description=TermDeck browser terminal multiplexer
After=network.target

[Service]
Type=simple
User=josh
Group=josh
Environment="PATH=/home/josh/.nvm/versions/node/v24.5.0/bin:/usr/bin:/bin"
Environment="TERMDECK_AUTH_TOKEN=replace-me-or-load-from-EnvironmentFile"
EnvironmentFile=/home/josh/.termdeck/secrets.env
ExecStart=/home/josh/.nvm/versions/node/v24.5.0/bin/termdeck --port 7700 --no-open
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now termdeck
journalctl -u termdeck -f
```

Use `--no-open` so systemd doesn't try to launch a browser. Use
`--session-logs` if you want markdown transcripts written to disk.

---

## Binding

By default, `termdeck --port 7700` binds to `127.0.0.1`. To bind to a
different interface, set `host` in `config.yaml`:

```yaml
server:
  host: 0.0.0.0   # only behind a reverse proxy
  port: 7700
```

Binding to `0.0.0.0` (or any non-localhost interface) without auth is
equivalent to publishing a root shell on your LAN. The server refuses to
start in that configuration and exits with a `[security]` error — set
`auth.token` in `~/.termdeck/config.yaml` or export `TERMDECK_AUTH_TOKEN`
first. Loopback hosts (`127.0.0.1`, `localhost`, `::1`) are always allowed,
with or without a token.

---

## Docker

**Not yet available.** A Dockerfile is tentatively planned for v0.5. The
open questions are native-module compatibility for
`@homebridge/node-pty-prebuilt-multiarch`, how to mount `~/.termdeck/` without
leaking host state, and whether PTYs should run inside the container
(isolated, but useless for host development) or on the host via a
bind-mounted socket (large attack surface).

Until then, run TermDeck directly on the host via npm or systemd.

---

## Post-deployment verification

After the service is up, from a different machine:

1. Hit `https://termdeck.example.com/healthz` — should return 401 without a
   token, 200 with.
2. With the token, open the dashboard and confirm the health badge is green.
3. Create a session, run `whoami` — confirm it reports the expected user, not
   `root`.
4. Close the browser tab, reconnect, and verify the session survives.

If any of those fail, take the port back down to `127.0.0.1` and debug locally.
