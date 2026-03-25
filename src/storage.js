const DEFAULT_TTL_SECONDS = 3600;
const MAX_TTL_SECONDS = 7 * 24 * 3600;

function normalizeTtl(ttlSeconds) {
  const ttl = Number.parseInt(String(ttlSeconds ?? DEFAULT_TTL_SECONDS), 10);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    return DEFAULT_TTL_SECONDS;
  }
  return Math.min(ttl, MAX_TTL_SECONDS);
}

function buildId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export function ensureDatabase(env) {
  if (!env?.DB) {
    throw new Error('D1 binding `DB` is missing. Configure it in wrangler.toml before using share links.');
  }
  return env.DB;
}

export async function createSharedResult(env, payload) {
  const db = ensureDatabase(env);
  const ttlSeconds = normalizeTtl(payload.ttlSeconds);
  const now = Date.now();
  const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();
  const id = buildId();

  await db.prepare(
    `INSERT INTO shared_results (
      id, target, content, content_type, template_url, created_at, expires_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  )
    .bind(
      id,
      payload.target,
      payload.content,
      payload.contentType,
      payload.templateUrl || '',
      new Date(now).toISOString(),
      expiresAt
    )
    .run();

  return { id, expiresAt, ttlSeconds };
}

export async function getSharedResult(env, id) {
  const db = ensureDatabase(env);
  const row = await db.prepare(
    `SELECT id, target, content, content_type, template_url, created_at, expires_at
     FROM shared_results
     WHERE id = ?1`
  )
    .bind(id)
    .first();

  if (!row) {
    return null;
  }

  const expired = Date.parse(row.expires_at) <= Date.now();
  if (expired) {
    await db.prepare('DELETE FROM shared_results WHERE id = ?1').bind(id).run();
    return { expired: true };
  }

  return row;
}

export async function purgeExpiredResults(env) {
  const db = ensureDatabase(env);
  await db.prepare('DELETE FROM shared_results WHERE expires_at <= ?1').bind(new Date().toISOString()).run();
}
