# Installing TermDeck — pick the path that fits you

There are four ways to install TermDeck. Pick **one**. They all get you to the same running dashboard, just with different trade-offs around speed, permanence, and whether you'll be editing the code.

---

## Which path do I pick?

Answer three questions:

1. **Do you already have Node.js 18 or newer on your computer?**
   - If yes → continue below.
   - If no → **[Install Node.js first](#i-dont-have-nodejs-yet)**, then come back.

2. **Do you want a double-clickable Mac app in your Applications folder?**
   - If yes → use **[Path C — macOS native app](#path-c--macos-native-app-double-clickable)**.

3. **Are you just trying it out, or do you want it permanently?**
   - Trying it out → use **[Path A — no install, just run it once](#path-a--no-install-just-run-it-once)**.
   - Want it permanently → use **[Path B — install the command globally](#path-b--install-the-command-globally)**.

If you **downloaded the source code as a ZIP from GitHub** and don't know what to do with the folder, see **[I downloaded a ZIP from GitHub, what now](#i-downloaded-a-zip-from-github-what-now)**.

---

## Path A — no install, just run it once

**Good for:** first-time testing, trying before committing, or running from a machine you don't own.

**One command:**

```
npx @jhizzard/termdeck
```

That's it. `npx` comes with Node.js — it downloads TermDeck into a temp folder, runs it, and forgets about it when you close. No files are added to your system permanently.

A browser tab should open automatically at `http://127.0.0.1:3000`. If it doesn't, open that URL yourself.

**To stop TermDeck:** go back to the terminal where you ran the command and press `Ctrl+C`.

**To try again later:** run the same command. It'll re-download (usually from a local cache — only slow the first time).

---

## Path B — install the command globally

**Good for:** daily use, permanent setup, and having `termdeck` as a command you can type from anywhere.

**One command:**

```
npm install -g @jhizzard/termdeck
```

This takes about 10 seconds. No C++ compiler or build tools required — TermDeck ships prebuilt binaries.

When it's done, you can launch TermDeck from anywhere on your machine with:

```
termdeck
```

A browser tab opens at `http://127.0.0.1:3000`. Close the terminal or press `Ctrl+C` to stop.

**Useful flags:**

```
termdeck --port 3001       # run on a different port
termdeck --no-open         # don't auto-open the browser
termdeck --session-logs    # save a markdown log of every session when it exits
```

**To update later:** `npm install -g @jhizzard/termdeck@latest`.

**To uninstall:** `npm uninstall -g @jhizzard/termdeck`.

---

## Path C — macOS native app (double-clickable)

**Good for:** Mac users who want TermDeck to feel like a normal app — double-click an icon in Applications, no terminal commands to remember.

**Three steps:**

1. Open Terminal.app (press `Cmd+Space`, type "Terminal", hit Enter).
2. Paste this command and press Enter:

   ```
   git clone https://github.com/jhizzard/termdeck.git && cd termdeck && ./install.sh
   ```

3. When the installer finishes, you'll find **TermDeck.app** in your Applications folder (specifically `~/Applications/TermDeck.app`). Double-click it to launch.

The installer takes about 60 seconds. It creates the `.app` bundle, wires up the launcher, and optionally adds a Desktop shortcut. Your browser will open automatically when you launch the app.

**Requirements for this path:** You need `git` and `node` installed. On modern Macs, `git` comes with Xcode Command Line Tools (which macOS will prompt you to install the first time you run a `git` command). For `node`, see [I don't have Node.js yet](#i-dont-have-nodejs-yet).

---

## Path D — from source, for developers

**Good for:** you want to hack on TermDeck, contribute a PR, or run the latest unreleased code from the `main` branch.

```
git clone https://github.com/jhizzard/termdeck.git
cd termdeck
npm install
npm run dev
```

That runs the server in watch mode — any changes you save to the source files reload automatically. The dashboard is at `http://127.0.0.1:3000`.

Workspace packages:

- `packages/server/` — Express + WebSocket + PTY management
- `packages/client/public/` — the dashboard UI (single HTML file, vanilla JS, no build step)
- `packages/cli/` — the `termdeck` binary wrapper

Open a PR at https://github.com/jhizzard/termdeck/pulls.

---

## I don't have Node.js yet

TermDeck needs **Node.js version 18 or newer**. Two ways to install it:

### Option 1 — The official installer (easiest)

1. Go to **[nodejs.org](https://nodejs.org)**.
2. Click the big green **LTS** button (currently "24.x LTS" or similar).
3. Run the downloaded installer. Click through all the defaults. No advanced options needed.
4. When it's done, close and reopen Terminal.app (or PowerShell on Windows).
5. Verify with:

   ```
   node --version
   ```

   You should see something like `v24.14.1`. If you see "command not found," your shell hasn't picked up the new Node — close the terminal window and open a new one.

### Option 2 — Homebrew (for Mac users who prefer it)

```
brew install node
```

---

## I downloaded a ZIP from GitHub, what now?

This is a common question. When you click "Code → Download ZIP" on GitHub, you get a folder of source code — not an installer. Here's how to turn it into a running TermDeck:

1. **Unzip the file.** Double-click the ZIP on macOS (or right-click → "Extract All" on Windows). You'll get a folder called something like `termdeck-main`.

2. **Open Terminal.app** (Mac) or **PowerShell** (Windows).

3. **Navigate into the folder.** Type `cd ` (with a trailing space), then drag the unzipped folder onto the terminal window and press Enter. Your prompt should now show the folder name.

4. **Install dependencies:**

   ```
   npm install
   ```

   This takes ~30 seconds. It downloads the libraries TermDeck needs.

5. **Start it up:**

   ```
   npm run dev
   ```

   A browser tab should open at `http://127.0.0.1:3000`. You're running TermDeck from the source.

**If step 4 says `npm: command not found`:** you don't have Node.js. Follow [I don't have Node.js yet](#i-dont-have-nodejs-yet) first.

**Easier alternative:** forget the ZIP entirely and use Path A above (`npx @jhizzard/termdeck`). Same result, one command, no folder to manage.

---

## Troubleshooting

### "I ran `npx @jhizzard/termdeck` and nothing happened"

- Check the terminal for error messages. The most common is `command not found: npx`, which means you don't have Node.js — see above.
- If it prints a banner but no browser opens, manually navigate to `http://127.0.0.1:3000`.
- If it prints `EADDRINUSE`, port 3000 is already in use by something else. Try `npx @jhizzard/termdeck --port 3001`.

### "The browser opens but I see a blank page"

- Hard-reload: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux).
- Check the terminal where `termdeck` is running — any red `Error` lines there?
- Try a different browser. TermDeck is tested on Chrome, Safari, and Firefox. Older browsers may not work.

### "It says `node-pty: command not found` or compile errors"

- You're probably on an older Node version. Upgrade to Node 18 or newer (see [I don't have Node.js yet](#i-dont-have-nodejs-yet)).
- If you're on Alpine Linux, prebuilt binaries are not currently available for musl libc — use a Debian/Ubuntu base image instead.

### "My terminal says `bash: typeset: -g: invalid option` and a bunch of errors"

- You're spawning `/bin/bash` which on macOS is ancient (3.2 from 2007). TermDeck defaults to `zsh` now; update to the latest version. Alternatively, use the prompt bar to launch `zsh` explicitly.

### "I clicked the TermDeck.app icon and nothing happened"

- The first launch on macOS is sometimes blocked by Gatekeeper. Right-click TermDeck.app, choose **Open**, and confirm the prompt that appears. Subsequent launches will work normally.
- If the terminal briefly flashes and closes, run `~/Applications/TermDeck.app/Contents/MacOS/TermDeck` from Terminal.app to see the error message.

### I'm still stuck

Open an issue at **[github.com/jhizzard/termdeck/issues](https://github.com/jhizzard/termdeck/issues)** with:

- Your operating system and version
- The output of `node --version` and `npm --version`
- The exact command you ran
- The full error message

I usually respond within a day.

---

## What TermDeck does once it's running

1. Your browser opens at `http://127.0.0.1:3000`.
2. A walkthrough tour starts automatically on your first visit — 13 steps covering every button and feature. Takes about 90 seconds.
3. You can launch terminals using the top-toolbar buttons (**shell**, **claude**, **python**) or by typing a command in the prompt bar at the bottom.
4. Every panel has real PTY support — you can run anything a normal terminal runs. `vim`, `htop`, `claude`, `python3`, `docker`, `kubectl`, all of it.
5. When a panel hits an error, TermDeck will automatically look for similar past errors in your memory store and show a **Flashback** toast on the panel. Click the toast to see the full match.

Click **how this works** in the top toolbar at any time to replay the tour, or **help** to open the full documentation.

---

## What TermDeck does NOT do

Honest limits so you know what you're signing up for:

- **It is not a replacement for your terminal app.** You'll still use Terminal.app / iTerm2 / Warp / wezterm for daily work. TermDeck is for specific workflows — running multiple agents in parallel, watching long-running jobs, debugging with memory recall.
- **It requires Node.js.** No way around it — the PTY implementation is Node-based. If you hate JavaScript, this isn't the tool for you.
- **The memory features (Flashback) require Supabase credentials.** If you don't configure them, TermDeck runs in local-only mode — still useful, but no cross-session recall.
- **It does not phone home.** All data stays on your machine unless you configure Supabase.
- **It's v0.2.** Expect rough edges. Bugs will exist. File issues and I'll fix them.
