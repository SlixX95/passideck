// Skill installer (Sprint 20 / SkillForge foundation).
// Writes generated skills to ~/.claude/skills/ as markdown files with frontmatter,
// lists installed skills, and removes them. Used by the `termdeck forge` CLI.

const fs = require('fs');
const os = require('os');
const path = require('path');

const FRONTMATTER_KEYS = ['name', 'description', 'trigger', 'source', 'generated'];

function getSkillsDir() {
  const override = process.env.TERMDECK_SKILLS_DIR;
  if (override && override.trim()) return path.resolve(override);
  const home = os.homedir();
  if (!home) {
    return path.resolve(process.cwd(), '.claude', 'skills');
  }
  return path.join(home, '.claude', 'skills');
}

function ensureSkillsDir() {
  const dir = getSkillsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function validateName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('skill name is required');
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
    throw new Error(`invalid skill name: ${name} (use letters, digits, - or _)`);
  }
}

function skillPath(name) {
  validateName(name);
  return path.join(getSkillsDir(), `${name}.md`);
}

function escapeFrontmatterValue(value) {
  const str = String(value ?? '');
  if (str.includes('\n')) {
    return JSON.stringify(str);
  }
  if (/^[\s"'`]|[:#]\s|[\s"'`]$/.test(str)) {
    return JSON.stringify(str);
  }
  return str;
}

function buildMarkdown(skill) {
  const generated = skill.generated || new Date().toISOString();
  const frontmatter = { ...skill, generated };
  const lines = ['---'];
  for (const key of FRONTMATTER_KEYS) {
    if (frontmatter[key] === undefined || frontmatter[key] === null) continue;
    lines.push(`${key}: ${escapeFrontmatterValue(frontmatter[key])}`);
  }
  lines.push('---');
  lines.push('');
  const body = (skill.content || skill.body || '').replace(/\s+$/, '');
  if (body) {
    lines.push(body);
    lines.push('');
  }
  return lines.join('\n');
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      try { value = JSON.parse(value); } catch (_) { value = value.slice(1, -1); }
    }
    meta[m[1]] = value;
  }
  return meta;
}

function installSkill(skill, options = {}) {
  if (!skill || typeof skill !== 'object') {
    throw new Error('installSkill: skill object is required');
  }
  validateName(skill.name);
  const dir = ensureSkillsDir();
  const filepath = path.join(dir, `${skill.name}.md`);
  const exists = fs.existsSync(filepath);
  if (exists && !options.overwrite) {
    const err = new Error(`skill already exists: ${skill.name}`);
    err.code = 'SKILL_EXISTS';
    err.path = filepath;
    throw err;
  }
  const markdown = buildMarkdown(skill);
  fs.writeFileSync(filepath, markdown, 'utf-8');
  return { path: filepath, overwritten: exists };
}

function listInstalledSkills() {
  const dir = getSkillsDir();
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filepath = path.join(dir, entry.name);
    let meta = {};
    let stat = null;
    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      meta = parseFrontmatter(content);
      stat = fs.statSync(filepath);
    } catch (err) {
      // skip unreadable file, keep going
      continue;
    }
    skills.push({
      name: meta.name || entry.name.replace(/\.md$/, ''),
      description: meta.description || '',
      trigger: meta.trigger || '',
      source: meta.source || '',
      generated: meta.generated || (stat ? stat.mtime.toISOString() : ''),
      path: filepath
    });
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

function skillExists(name) {
  try {
    return fs.existsSync(skillPath(name));
  } catch (_) {
    return false;
  }
}

function removeSkill(name) {
  const filepath = skillPath(name);
  if (!fs.existsSync(filepath)) {
    const err = new Error(`skill not found: ${name}`);
    err.code = 'SKILL_NOT_FOUND';
    err.path = filepath;
    throw err;
  }
  fs.unlinkSync(filepath);
  return { path: filepath };
}

module.exports = {
  getSkillsDir,
  installSkill,
  listInstalledSkills,
  removeSkill,
  skillExists,
  // exposed for tests
  _buildMarkdown: buildMarkdown,
  _parseFrontmatter: parseFrontmatter
};
