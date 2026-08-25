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
 * erp_state is stored as ordered 32KB chunks because D1 has a per-cell value
 * limit. Layout (crash-safe generation scheme):
 *   id='FTC-PTR'              data='<gen>'          → pointer to live generation
 *   id='FTC-G-<gen>-<seq>'    data='<chunk>'        → ordered chunks of that gen
 * A save stages a brand-new generation under a unique token, verifies it fully,
 * then flips the pointer in ONE atomic statement. The live document is never
 * deleted before its replacement is complete, so a crash/timeout can never
 * leave the database empty (the old DELETE-then-rename layout could).
 * Legacy layouts ('FTC-STATE-*', 'farmtrack-demo', 'default') are still read.
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

/** Fetch one chunk's data per request, in parallel with limited concurrency.
 *  Each response is ~35KB (one 32KB chunk + JSON overhead), avoiding any D1
 *  REST API response size limits on Vercel serverless. */
const CHUNK_FETCH_CONCURRENCY = 20;
async function fetchChunkDataByIds(chunkIds) {
  const out = new Array(chunkIds.length).fill('');
  for (let i = 0; i < chunkIds.length; i += CHUNK_FETCH_CONCURRENCY) {
    const slice = chunkIds.slice(i, i + CHUNK_FETCH_CONCURRENCY);
    const results = await Promise.all(
      slice.map(id => d1First('SELECT data FROM erp_state WHERE id = ?', [id]))
    );
    for (let j = 0; j < results.length; j++) {
      out[i + j] = results[j] ? String(results[j].data || '') : '';
    }
  }
  return out;
}

function parseJoinedChunks(joined, label, chunks) {
  try {
    return { id: label, data: JSON.parse(joined), chunks };
  } catch (e) {
    console.warn(`[d1] ${label} unreadable:`, e.message);
    return { id: label, data: null, chunks, parseError: e.message, rawLength: joined.length };
  }
}

/** Reassemble chunked erp_state JSON document from D1.
 *  Resolution order: pointer generation → legacy FTC-STATE-* rows →
 *  farmtrack-demo/default single row. Never throws for missing data. */
async function getErpStateDocument() {
  // 1) Current generation via pointer.
  try {
    const ptr = await d1First("SELECT data FROM erp_state WHERE id = 'FTC-PTR'");
    const gen = ptr && ptr.data ? String(ptr.data).trim() : '';
    if (gen) {
      const idRows = await d1All(
        'SELECT id FROM erp_state WHERE id LIKE ? ORDER BY id',
        [`FTC-G-${gen}-%`]
      );
      if (idRows.length) {
        const parts = await fetchChunkDataByIds(idRows.map(r => r.id));
        const doc = parseJoinedChunks(parts.join(''), `FTC-G-${gen}`, idRows.length);
        if (doc.data) return doc;
        console.warn('[d1] current generation unreadable, falling back to legacy');
      }
    }
  } catch (e) {
    console.warn('[d1] pointer read failed, falling back to legacy:', (e && e.message) || e);
  }
  // 2) Legacy ordered chunks ('FTC-STATE-*').
  const countRow = await d1First("SELECT COUNT(*) AS c FROM erp_state WHERE id LIKE 'FTC-STATE-%'");
  const totalChunks = countRow ? Number(countRow.c) : 0;
  if (!totalChunks) {
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
  const idRows = await d1All("SELECT id FROM erp_state WHERE id LIKE 'FTC-STATE-%' ORDER BY id");
  const parts = await fetchChunkDataByIds(idRows.map(r => r.id));
  return parseJoinedChunks(parts.join(''), 'FTC-STATE', idRows.length);
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

/** In-process write queue — serializes concurrent full-state writes so a torn
 *  write never leaves the D1 erp_state unusable. NOTE: tasks are created
 *  lazily INSIDE the queue chain — an eagerly-started async IIFE would run
 *  concurrently with the previous save and defeat the whole queue. */
let saveQueue = Promise.resolve();

const STAGE_BATCH_CHUNKS = 40; // 40 chunks x 2 params = 80 bound params (< SQLite limit)

/** Persist full erp_state JSON as ordered 32KB chunks.
 *  Crash-safe generation scheme: every save writes a brand-new generation
 *  (FTC-G-<gen>-<seq>) under a unique token, verifies the staged row count,
 *  then flips the FTC-PTR pointer in ONE atomic statement. The previously live
 *  generation is never touched first, so a killed process / timeout / API error
 *  can never leave an empty or half-written database.
 */
async function saveErpStateDocument(data) {
  let resolveTask, rejectTask;
  const done = new Promise((res, rej) => { resolveTask = res; rejectTask = rej; });
  saveQueue = saveQueue.then(async () => {
    try {
      const json = typeof data === 'string' ? data : JSON.stringify(data);

      // Safety guard: refuse to save an obviously empty/purged state.
      // This prevents a cold-start purge from wiping D1 with empty arrays.
      if (typeof data === 'object' && data) {
        const customers = Array.isArray(data.customers) ? data.customers : [];
        const employees = Array.isArray(data.employees) ? data.employees : [];
        const users = Array.isArray(data.users) ? data.users : [];
        if (users.length > 0 && customers.length === 0 && employees.length === 0) {
          console.warn('[D1] Refusing to save state with users but 0 customers/employees — likely a purge, skipping');
          resolveTask({ chunks: 0, bytes: json.length, skipped: true });
          return;
        }
      }

      const CHUNK = 32000;
      const chunks = [];
      for (let i = 0; i < json.length; i += CHUNK) {
        chunks.push(json.slice(i, i + CHUNK));
      }
      // '<tsBase36>-<rand>' — the leading timestamp lets cleanupStaleStageRows
      // skip generations that another instance may still be writing.
      const gen = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const pad = n => String(n).padStart(4, '0');
      const stageId = i => `FTC-G-${gen}-${pad(i + 1)}`;

      // 1) Stage ALL chunks for this generation (multi-row batches).
      for (let start = 0; start < chunks.length; start += STAGE_BATCH_CHUNKS) {
        const batch = chunks.slice(start, start + STAGE_BATCH_CHUNKS);
        const placeholders = batch.map(() => '(?, ?)').join(', ');
        const params = [];
        batch.forEach((chunk, j) => { params.push(stageId(start + j), chunk); });
        await d1Query(
          `INSERT OR REPLACE INTO erp_state (id, data) VALUES ${placeholders}`,
          params
        );
      }
      // 2) Verify staged count BEFORE flipping. On mismatch this generation is
      //    simply abandoned — the live document stays untouched and readable.
      const check = await d1First('SELECT COUNT(*) AS c FROM erp_state WHERE id LIKE ?', [`FTC-G-${gen}-%`]);
      const staged = check ? Number(check.c) : 0;
      if (staged !== chunks.length) {
        throw new Error(`Staged write failed: expected ${chunks.length} chunks, found ${staged}`);
      }
      // 3) ATOMIC flip: one upsert moves every reader to the new generation.
      await d1Query(
        "INSERT INTO erp_state (id, data) VALUES ('FTC-PTR', ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
        [gen]
      );
      // 4) Garbage-collect superseded generations + legacy layout (best effort).
      //    Same grace rule as cleanupStaleStageRows: never touch generations
      //    another instance may still be staging.
      try {
        const counts = await listGenerations();
        for (const [g] of counts) {
          if (g === gen) continue;
          if (genAgeMs(g) > STALE_GEN_GRACE_MS) await deleteGeneration(g);
        }
        await d1Query(
          "DELETE FROM erp_state WHERE id LIKE 'FTC-STATE-%' OR id IN ('farmtrack-demo', 'default')"
        );
      } catch (e) {
        console.warn('[d1] old-generation cleanup skipped:', (e && e.message) || e);
      }
      resolveTask({ chunks: chunks.length, bytes: json.length, gen });
    } catch (e) {
      rejectTask(e);
    }
  });
  return done;
}

const STALE_GEN_GRACE_MS = 10 * 60 * 1000;

/** Split an erp_state chunk row id into its generation + sequence.
 *  Id layout: 'FTC-G-<gen>-<NNNN>' where <gen> may itself contain hyphens,
 *  so parse greedily anchored on the trailing 4-digit sequence. */
function splitGenRowId(id) {
  const m = /^FTC-G-(.+)-(\d{4})$/.exec(String(id || ''));
  return m ? { gen: m[1], seq: m[2] } : null;
}

function genAgeMs(gen) {
  const m = String(gen || '').match(/^([0-9a-z]+)-/); // '<tsBase36>-<rand>'
  if (!m) return Infinity;
  const ts = parseInt(m[1], 36);
  if (!Number.isFinite(ts)) return Infinity;
  return Math.max(0, Date.now() - ts);
}

/** List generations present in erp_state with their row counts. */
async function listGenerations() {
  const rows = await d1All("SELECT id FROM erp_state WHERE id LIKE 'FTC-G-%'");
  const counts = new Map();
  for (const r of rows) {
    const parts = splitGenRowId(r.id);
    if (!parts) continue;
    counts.set(parts.gen, (counts.get(parts.gen) || 0) + 1);
  }
  return counts;
}

/** Delete every row of a generation. */
async function deleteGeneration(gen) {
  const res = await d1Query('DELETE FROM erp_state WHERE id LIKE ?', [`FTC-G-${gen}-%`]);
  return (res && res[0] && res[0].meta && Number(res[0].meta.changes)) || 0;
}

/** Remove orphaned generations (not pointed to by FTC-PTR) left by
 *  interrupted saves or races between serverless instances.
 *  Safety rules:
 *   - Never deletes the generation the pointer references.
 *   - Never deletes "young" generations (< STALE_GEN_GRACE_MS): another
 *     serverless instance may be mid-staging that generation right now, and
 *     deleting its rows would break its count verification.
 *   - Generations whose age can't be parsed are never auto-deleted.
 *   - Runs through the same in-process write queue as saves so it can never
 *     interleave with an active saveErpStateDocument on this instance. */
async function cleanupStaleStageRows() {
  return new Promise((resolve) => {
    saveQueue = saveQueue.then(async () => {
      try {
        let currentGen = '';
        try {
          const ptr = await d1First("SELECT data FROM erp_state WHERE id = 'FTC-PTR'");
          currentGen = ptr && ptr.data ? String(ptr.data).trim() : '';
        } catch (_) {}
        const counts = await listGenerations();
        let deleted = 0;
        for (const [g] of counts) {
          if (g === currentGen) continue;
          if (genAgeMs(g) > STALE_GEN_GRACE_MS) deleted += await deleteGeneration(g);
        }
        resolve(deleted);
      } catch (_) { resolve(0); }
    });
  });
}

module.exports = {
  d1Configured,
  d1Query,
  d1All,
  d1First,
  getErpStateDocument,
  saveErpStateDocument,
  cleanupStaleStageRows,
  probeD1,
  ACCOUNT_ID,
  DATABASE_ID,
};
