#!/usr/bin/env node
// sync-content.mjs
//
// Copies README.md, CHANGELOG.md, and docs/*.md from three sibling repos
// (TermDeck, Mnestra, Rumen) into src/content/docs/<repo>/ so Starlight can
// render them. Missing files/repos are skipped with a warning — never throws.
//
// Env overrides:
//   TERMDECK_REPO  absolute path to the termdeck repo    (default: ../)
//   MNESTRA_REPO    absolute path to the mnestra repo      (default: sibling)
//   RUMEN_REPO     absolute path to the rumen repo       (default: sibling)

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// docs-site root (one up from scripts/)
const SITE_ROOT = path.resolve(__dirname, '..');

// TermDeck is the parent of docs-site/.
// Mnestra and Rumen live as siblings under ~/Documents/Graciella/.
// From /Users/joshuaizzard/Documents/Graciella/ChopinNashville/SideHustles/TermDeck/termdeck/docs-site
// up to             /Users/joshuaizzard/Documents/Graciella/ is six levels.
const DEFAULT_TERMDECK = path.resolve(SITE_ROOT, '..');
// Mnestra's repo dir is still named 'engram' on disk (legacy from before the
// 2026-04-15 rename). Try the new name first, fall back to the legacy name
// so the docs still build on machines that haven't renamed the directory.
const MNESTRA_NEW_PATH = path.resolve(SITE_ROOT, '..', '..', '..', '..', '..', 'mnestra');
const MNESTRA_LEGACY_PATH = path.resolve(SITE_ROOT, '..', '..', '..', '..', '..', 'engram');
const DEFAULT_MNESTRA = await fs.stat(MNESTRA_NEW_PATH).then(() => MNESTRA_NEW_PATH).catch(() => MNESTRA_LEGACY_PATH);
const DEFAULT_RUMEN = path.resolve(SITE_ROOT, '..', '..', '..', '..', '..', 'rumen');

const REPOS = [
  {
    slug: 'termdeck',
    title: 'TermDeck',
    description: 'Browser-based terminal multiplexer with rich metadata and per-panel theming.',
    root: process.env.TERMDECK_REPO || DEFAULT_TERMDECK,
  },
  {
    slug: 'mnestra',
    title: 'Mnestra',
    description: 'Long-term memory store with hybrid search, tiered decay, and MCP tools.',
    root: process.env.MNESTRA_REPO || DEFAULT_MNESTRA,
  },
  {
    slug: 'rumen',
    title: 'Rumen',
    description: 'Async learning layer that extracts, relates, synthesises, and surfaces insights over Mnestra.',
    root: process.env.RUMEN_REPO || DEFAULT_RUMEN,
  },
];

const OUT_ROOT = path.join(SITE_ROOT, 'src', 'content', 'docs');

function warn(msg) {
  console.warn(`[sync-content] WARN: ${msg}`);
}

function info(msg) {
  console.log(`[sync-content] ${msg}`);
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function readFileSafe(p) {
  try {
    return await fs.readFile(p, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    warn(`could not read ${p}: ${err.message}`);
    return null;
  }
}

// Strip any existing YAML frontmatter from the top of a markdown file.
function stripFrontmatter(src) {
  if (!src.startsWith('---')) return src;
  const end = src.indexOf('\n---', 3);
  if (end === -1) return src;
  const rest = src.slice(end + 4);
  return rest.replace(/^\r?\n/, '');
}

// Derive a short description from the first non-heading, non-empty paragraph.
function deriveDescription(body, fallback) {
  const lines = body.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('>')) continue;
    if (line.startsWith('!')) continue;
    if (line.startsWith('[![')) continue;
    // Strip markdown links/emphasis for a cleaner description.
    const plain = line
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`]/g, '')
      .trim();
    if (plain.length >= 20) {
      return plain.length > 200 ? plain.slice(0, 197) + '...' : plain;
    }
  }
  return fallback;
}

function escapeYaml(s) {
  return String(s).replace(/"/g, '\\"');
}

// Strip markdown image references that point at local, non-http paths.
// The synced repos reference images like `assets/hero.jpg` that do not
// exist in the docs-site tree (screenshots are captured by T1.7 separately).
// Leaving them in breaks Astro's image resolver at build time. We drop the
// image line entirely; http(s) images are left alone.
function stripLocalImages(src) {
  return src.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
    if (/^https?:\/\//i.test(url) || url.startsWith('/')) return match;
    return `<!-- image removed at sync: ${alt || url} -->`;
  });
}

function withFrontmatter({ title, description }, body) {
  const stripped = stripLocalImages(stripFrontmatter(body));
  const fm = `---\ntitle: "${escapeYaml(title)}"\ndescription: "${escapeYaml(description)}"\n---\n\n`;
  return fm + stripped;
}

// Convert a source filename like "INTEGRATION.md" to a slug-friendly name.
function slugifyDocName(name) {
  const base = name.replace(/\.md$/i, '');
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.md';
}

function titleCaseFromSlug(filename) {
  const base = filename.replace(/\.md$/i, '');
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function writeFile(destPath, content) {
  await ensureDir(path.dirname(destPath));
  await fs.writeFile(destPath, content, 'utf8');
}

async function syncRepo(repo) {
  let copied = 0;
  const outDir = path.join(OUT_ROOT, repo.slug);

  if (!(await exists(repo.root))) {
    warn(`repo not found for ${repo.slug}: ${repo.root} — skipping`);
    return copied;
  }

  // Clean the output dir for this repo so stale files are removed.
  try {
    await fs.rm(outDir, { recursive: true, force: true });
  } catch (err) {
    warn(`could not clean ${outDir}: ${err.message}`);
  }
  await ensureDir(outDir);

  // 1. README.md -> index.md
  const readmePath = path.join(repo.root, 'README.md');
  const readme = await readFileSafe(readmePath);
  if (readme) {
    const description = deriveDescription(stripFrontmatter(readme), repo.description);
    const body = withFrontmatter({ title: repo.title, description }, readme);
    await writeFile(path.join(outDir, 'index.md'), body);
    copied++;
  } else {
    warn(`${repo.slug}: no README.md at ${readmePath}`);
    // Write a stub index so the sidebar link does not 404.
    const stub =
      `---\ntitle: "${escapeYaml(repo.title)}"\ndescription: "${escapeYaml(repo.description)}"\n---\n\n` +
      `# ${repo.title}\n\n_No \`README.md\` was found for this repo at sync time._\n`;
    await writeFile(path.join(outDir, 'index.md'), stub);
  }

  // 2. CHANGELOG.md -> changelog.md
  const changelogPath = path.join(repo.root, 'CHANGELOG.md');
  const changelog = await readFileSafe(changelogPath);
  if (changelog) {
    const body = withFrontmatter(
      {
        title: `${repo.title} Changelog`,
        description: `Release notes and unreleased work for ${repo.title}.`,
      },
      changelog,
    );
    await writeFile(path.join(outDir, 'changelog.md'), body);
    copied++;
  } else {
    warn(`${repo.slug}: no CHANGELOG.md at ${changelogPath}`);
  }

  // 3. docs/*.md -> docs/*.md
  const docsDir = path.join(repo.root, 'docs');
  if (await exists(docsDir)) {
    let entries = [];
    try {
      entries = await fs.readdir(docsDir, { withFileTypes: true });
    } catch (err) {
      warn(`${repo.slug}: could not list ${docsDir}: ${err.message}`);
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!/\.md$/i.test(entry.name)) continue;
      const src = path.join(docsDir, entry.name);
      const raw = await readFileSafe(src);
      if (raw == null) continue;
      const slugName = slugifyDocName(entry.name);
      const title = titleCaseFromSlug(entry.name);
      const description = deriveDescription(
        stripFrontmatter(raw),
        `${title} — from the ${repo.title} repo.`,
      );
      const body = withFrontmatter({ title, description }, raw);
      await writeFile(path.join(outDir, 'docs', slugName), body);
      copied++;
    }
  } else {
    info(`${repo.slug}: no docs/ directory at ${docsDir} (ok)`);
  }

  info(`${repo.slug}: copied ${copied} file(s) from ${repo.root}`);
  return copied;
}

async function main() {
  await ensureDir(OUT_ROOT);

  const counts = {};
  for (const repo of REPOS) {
    counts[repo.slug] = await syncRepo(repo);
  }

  info(
    `copied ${counts.termdeck ?? 0} files from termdeck, ` +
      `${counts.mnestra ?? 0} from mnestra, ` +
      `${counts.rumen ?? 0} from rumen`,
  );
}

main().catch((err) => {
  // Per spec: we should not throw on missing content, but genuine programmer
  // errors (e.g. out-of-disk) should still surface.
  console.error('[sync-content] fatal:', err);
  process.exit(1);
});
