// Parse + validate Supabase URLs and derive what we can from them without the
// database password. Useful for both init wizards:
//
//   - init-mnestra needs the project ref to show in status output and also
//     needs a full DATABASE_URL to apply migrations; since the DB password
//     cannot be derived from the project URL alone, the wizard prompts for
//     the direct connection string separately.
//
//   - init-rumen needs the project ref to run `supabase link --project-ref`
//     and to substitute into the pg_cron schedule SQL.

// A Supabase project URL looks like:
//   https://<project-ref>.supabase.co
// The ref is 20 characters of lowercase alphanumerics, but we accept anything
// that matches `[a-z0-9-]+` to avoid being stricter than Supabase itself.
function parseProjectUrl(url) {
  if (!url || typeof url !== 'string') {
    return { ok: false, error: 'empty url' };
  }
  const trimmed = url.trim().replace(/\/+$/, '');
  let u;
  try {
    u = new URL(trimmed);
  } catch (_err) {
    return { ok: false, error: 'not a valid URL' };
  }
  if (u.protocol !== 'https:') {
    return { ok: false, error: 'must be https://' };
  }
  const m = u.hostname.match(/^([a-z0-9-]+)\.supabase\.(co|in)$/i);
  if (!m) {
    return { ok: false, error: 'hostname must end in .supabase.co' };
  }
  return {
    ok: true,
    url: `https://${u.hostname}`,
    projectRef: m[1].toLowerCase(),
    hostname: u.hostname
  };
}

// Validate that a string has the shape of a Supabase service role key.
// Supabase now ships two formats:
//   (1) legacy JWT: `eyJ...` (header.payload.signature), usually ~200 chars
//   (2) prefixed v2: `sb_secret_...` or `sb_publishable_...`
// We accept both shapes and reject anything else with an explicit hint.
function looksLikeServiceRole(key) {
  if (!key || typeof key !== 'string') return 'empty';
  const trimmed = key.trim();
  if (trimmed.startsWith('sb_secret_')) return null;
  if (trimmed.startsWith('sb_publishable_')) {
    return 'that looks like a publishable (anon) key, not the service_role key';
  }
  if (trimmed.startsWith('eyJ')) {
    // Rough JWT shape check — 3 dot-separated base64url chunks.
    const parts = trimmed.split('.');
    if (parts.length === 3) return null;
    return 'JWT-looking string but not 3 segments';
  }
  return 'does not look like a Supabase service_role key (expected sb_secret_… or eyJ…)';
}

// Shape-check an OpenAI API key. Both classic `sk-` and project `sk-proj-`
// formats are accepted.
function looksLikeOpenAiKey(key) {
  if (!key || typeof key !== 'string') return 'empty';
  const trimmed = key.trim();
  if (trimmed.startsWith('sk-') && trimmed.length >= 20) return null;
  return 'OpenAI keys start with sk-';
}

// Shape-check an Anthropic API key.
function looksLikeAnthropicKey(key) {
  if (!key || typeof key !== 'string') return 'empty';
  const trimmed = key.trim();
  if (trimmed.startsWith('sk-ant-') && trimmed.length >= 30) return null;
  return 'Anthropic keys start with sk-ant-';
}

// Shape-check a Postgres connection string. Accepts both Supabase pooler URLs
// (`postgres://postgres.<ref>:...@aws-0-<region>.pooler.supabase.com:<port>/postgres`)
// and direct connection URLs (`postgres://postgres:...@db.<ref>.supabase.co:5432/postgres`).
function looksLikePostgresUrl(url) {
  if (!url || typeof url !== 'string') return 'empty';
  let u;
  try {
    u = new URL(url);
  } catch (_err) {
    return 'not a valid URL';
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') {
    return 'must start with postgres:// or postgresql://';
  }
  if (!u.username || !u.password) {
    return 'missing username or password — paste the full Connection String from Supabase';
  }
  return null;
}

// Mask all but the last 4 chars of a secret for logging.
function maskSecret(value) {
  if (!value || typeof value !== 'string') return '';
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

module.exports = {
  parseProjectUrl,
  looksLikeServiceRole,
  looksLikeOpenAiKey,
  looksLikeAnthropicKey,
  looksLikePostgresUrl,
  maskSecret
};
