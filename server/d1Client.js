/**
 * Farmtrack ERP — Cloudflare D1 server client
 * Uses Cloudflare REST API (works from Vercel serverless).
 *
 * Env (Vercel):
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_D1_DATABASE_ID
 *   CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_D1_DATABASE_NAME (optional, docs only)
 *
 * erp_state is stored as ordered chunks (FTC-STATE-001 … N) because D1
 * has a ~32KB value limit per cell.
 */

const ACCOUNT_ID = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const DATABASE_ID = String(process.env.CLOUDFLARE_D1_DATABASE_ID || '').trim();
const API_TOKEN = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();

function d1Configured() {
  return Boolean(ACCOUNT_ID && DATABASE_ID && API_TOKEN);
}

async function d1Query(sql, params = []) {
  if (!d1Configured()) {
    throw new Error('D1 credentials missing (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_D1_DATABASE_ID / CLOUDFLARE_API_TOKEN)');
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;
  const body = params && params.length
    ? { sql, params }
    : { sql };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const msg = (json.errors && json.errors[0] && json.errors[0].message) || `D1 HTTP ${res.status}`;
    throw new Error(msg);
  }
  const blocks = Array.isArray(json.result) ? json.result : [];
  return blocks.map((b) => ({
    results: b.results || [],
    meta: b.meta || {},
    success: b.success !== false,
  }));
}

async function d1All(sql, params = []) {
  const blocks = await d1Query(sql, params);
  return (blocks[0] && blocks[0].results) || [];
}

async function d1First(sql, params = []) {
  const rows = await d1All(sql, params);
  return rows[0] || null;
}

/** Reassemble chunked erp_state JSON document from D1 */
async function getErpStateDocument() {
  const rows = await d1All(
    "SELECT id, data FROM erp_state WHERE id LIKE 'FTC-STATE-%' ORDER BY id"
  );
  if (!rows.length) {
    const single = await d1First(
      "SELECT id, data FROM erp_state WHERE id IN ('farmtrack-demo', 'default') LIMIT 1"
    );
    if (!single) return { id: null, data: null, chunks: 0 };
    let data = single.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { /* keep string */ }
    }
    return { id: single.id, data, chunks: 1 };
  }
  const joined = rows.map((r) => String(r.data || '')).join('');
  let data = null;
  try {
    data = JSON.parse(joined);
  } catch (e) {
    return { id: 'FTC-STATE', data: null, chunks: rows.length, parseError: e.message, rawLength: joined.length };
  }
  return { id: 'FTC-STATE', data, chunks: rows.length };
}

async function probeD1() {
  const started = Date.now();
  try {
    if (!d1Configured()) {
      return { ok: false, error: 'Missing CLOUDFLARE_* env', ms: 0, backend: 'd1' };
    }
    const tenant = await d1First('SELECT id, name FROM tenants LIMIT 1');
    const chunkRow = await d1First("SELECT COUNT(*) AS c FROM erp_state");
    return {
      ok: true,
      ms: Date.now() - started,
      backend: 'd1',
      accountId: ACCOUNT_ID,
      databaseId: DATABASE_ID,
      tenant: tenant || null,
      erp_state_rows: chunkRow ? chunkRow.c : 0,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e), ms: Date.now() - started, backend: 'd1' };
  }
}

/** Persist full erp_state JSON as ordered 32KB chunks */
async function saveErpStateDocument(data) {
  const json = typeof data === 'string' ? data : JSON.stringify(data);
  const CHUNK = 32000;
  const chunks = [];
  for (let i = 0; i < json.length; i += CHUNK) {
    chunks.push(json.slice(i, i + CHUNK));
  }
  await d1Query("DELETE FROM erp_state WHERE id LIKE 'FTC-STATE-%' OR id IN ('farmtrack-demo', 'default')");
  for (let i = 0; i < chunks.length; i++) {
    const id = `FTC-STATE-${String(i + 1).padStart(3, '0')}`;
    await d1Query('INSERT INTO erp_state (id, data) VALUES (?, ?)', [id, chunks[i]]);
  }
  return { chunks: chunks.length, bytes: json.length };
}

module.exports = {
  d1Configured,
  d1Query,
  d1All,
  d1First,
  getErpStateDocument,
  saveErpStateDocument,
  probeD1,
  ACCOUNT_ID,
  DATABASE_ID,
};
