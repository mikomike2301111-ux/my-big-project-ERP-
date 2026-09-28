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
 *   id='FTC-PTR'              data='<gen>|<version>' → pointer to live generation
 *   id='FTC-G-<gen>-<seq>'    data='<chunk>'         → ordered chunks of that gen
 * A save stages a brand-new generation under a unique token, verifies it fully,
 * then flips the pointer in ONE atomic statement. The live document is never
 * deleted before its replacement is complete, so a crash/timeout can never
 * leave the database empty (the old DELETE-then-rename layout could).
 * Optimistic concurrency: callers pass the baseGen/baseVersion they loaded;
 * if the pointer moved since then the save is rejected with code
 * D1_WRITE_CONFLICT instead of silently clobbering another writer's changes.
 * Legacy layouts ('FTC-STATE-*', 'farmtrack-demo', 'default') are still read.
 *
 * BLOB_SAFE_V10: tables are the durable record store. Every save union-merges
 * with the live blob + normalized tables, dual-writes rows FIRST, then writes
 * the blob. Concurrent users can no longer erase each other's inserts.
 */

const { mergeStateDocuments, mergeRecord, isQbCall } = require('./d1BlobSafety');

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const ACCOUNT_ID = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const DATABASE_ID = String(process.env.CLOUDFLARE_D1_DATABASE_ID || '').trim();
const API_TOKEN = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();

function d1Configured() {
  return Boolean(ACCOUNT_ID && DATABASE_ID && API_TOKEN);
}

let misconfigWarned = false;
function warnMisconfigurationOnce() {
  if (misconfigWarned) return;
  misconfigWarned = true;
  console.error('[D1] MISCONFIGURED — saves are DISABLED and reads serve fallbacks. ' +
    'Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID and CLOUDFLARE_API_TOKEN. ' +
    '(account: ' + (ACCOUNT_ID ? 'set' : 'MISSING') +
    ', databaseId: ' + (DATABASE_ID ? 'set' : 'MISSING') +
    ', token: ' + (API_TOKEN ? 'set' : 'MISSING') + ')');
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

/** Read the pointer row and return { gen, version, writerAt, hasVersion } */
async function readPointerVersion() {
  try {
    const ptr = await d1First("SELECT data FROM erp_state WHERE id = 'FTC-PTR'");
    return parsePointer(ptr && ptr.data);
  } catch (e) {
    return { gen: '', version: 0, writerAt: '', hasVersion: false };
  }
}
 /**
 * Fetch one chunk's data per request, in parallel with limited concurrency.
 * Each response is ~35KB (one 32KB chunk + JSON overhead), avoiding any D1
 * REST API response size limits on Vercel serverless. Missing chunks are
 * retried up to CHUNK_READ_ATTEMPTS with backoff. If a chunk is still missing
 * the caller receives { parts, missing } and MUST treat the document as
 * incomplete — silently substituting '' truncates the JSON and corrupts it. */
const CHUNK_FETCH_CONCURRENCY = 32;
const CHUNK_READ_ATTEMPTS = 3;
async function fetchChunkDataByIds(chunkIds) {
  const out = new Array(chunkIds.length).fill(null);
  const missing = [];
  const fetchOne = async (id) => {
    const row = await d1First('SELECT data FROM erp_state WHERE id = ?', [id]);
    return row ? String(row.data || '') : null;
  };
  for (let i = 0; i < chunkIds.length; i += CHUNK_FETCH_CONCURRENCY) {
    const slice = chunkIds.slice(i, i + CHUNK_FETCH_CONCURRENCY);
    let results = await Promise.all(slice.map(fetchOne));
    for (let attempt = 1; attempt < CHUNK_READ_ATTEMPTS; attempt++) {
      const needRetry = [];
      for (let j = 0; j < results.length; j++) {
        if (results[j] === null || results[j] === '') needRetry.push(j);
      }
      if (!needRetry.length) break;
      await new Promise(r => setTimeout(r, 120 * attempt));
      const retried = await Promise.all(needRetry.map(j => fetchOne(slice[j])));
      needRetry.forEach((idx, k) => { results[idx] = retried[k]; });
    }
    for (let j = 0; j < results.length; j++) {
      const val = results[j];
      out[i + j] = val === null || val === '' ? null : val;
      if (out[i + j] === null) missing.push(slice[j]);
    }
  }
  return { parts: out.map(v => v === null ? '' : v), missing };
}

function parseJoinedChunks(joined, label, chunks) {
  try {
    return { id: label, data: JSON.parse(joined), chunks };
  } catch (e) {
    console.warn(`[d1] ${label} unreadable:`, e.message);
    return { id: label, data: null, chunks, parseError: e.message, rawLength: joined.length };
  }
}

/** Pick the freshest of two parsed candidate documents. When concurrent
 *  writers exist (e.g. an old deployment still using the legacy layout), the
 *  newest valid document wins by _writeVersion / _lastWriterAt instead of
 *  blindly preferring one layout — this self-heals split-brain writes. */
function fresherDoc(a, b) {
  if (!a || !a.data) return b || a;
  if (!b || !b.data) return a;
  const score = (d) => {
    const v = Number(d.data._writeVersion || 0);
    const t = Date.parse(d.data._lastWriterAt || '') || 0;
    return { v, t };
  };
  const sa = score(a), sb = score(b);
  if (sa.v !== sb.v) return sa.v > sb.v ? a : b;
  return sa.t >= sb.t ? a : b;
}

/** Parse the FTC-PTR row value. Format: '<gen>' (legacy, pre-versioning) or
 *  '<gen>|<version>|<writerAtISO>'. Legacy pointers report hasVersion=false so
 *  the concurrency check can trust the caller's base instead of a fake 0. */
function parsePointer(raw) {
  const s = String(raw || '').trim();
  if (!s) return { gen: '', version: 0, writerAt: '', hasVersion: false };
  const idx = s.indexOf('|');
  if (idx === -1) return { gen: s, version: 0, writerAt: '', hasVersion: false };
  const [gen, ver, at] = s.split('|');
  return { gen, version: Number(ver) || 0, writerAt: at || '', hasVersion: true };
}

/** Reassemble chunked erp_state JSON document from D1.
 *  Reads BOTH the pointer generation and the legacy layout, then returns the
 *  freshest valid document (see fresherDoc). Never throws for missing data.
 *  A generation with unreadable chunks is NEVER parsed as truncated JSON —
 *  it is reported via `incomplete` so callers fall back instead of serving
 *  corrupted data (and never save over D1 based on a broken read). */
async function getErpStateDocument(opts = {}) {
  let pointerDoc = null, legacyDoc = null;
  // 1) Current generation via pointer.
  try {
    const ptr = await d1First("SELECT data FROM erp_state WHERE id = 'FTC-PTR'");
    const ptrInfo = parsePointer(ptr && ptr.data);
    if (ptrInfo.gen) {
      const idRows = await d1All(
        'SELECT id FROM erp_state WHERE id LIKE ? ORDER BY id',
        [`FTC-G-${ptrInfo.gen}-%`]
      );
      if (idRows.length) {
        const { parts, missing } = await fetchChunkDataByIds(idRows.map(r => r.id));
        if (missing.length) {
          console.error(`[d1] pointer generation ${ptrInfo.gen} has ${missing.length} unreadable chunk(s) — treating as incomplete`);
          pointerDoc = { id: `FTC-G-${ptrInfo.gen}`, data: null, chunks: idRows.length, incomplete: true, missingChunks: missing.length };
        } else {
          pointerDoc = parseJoinedChunks(parts.join(''), `FTC-G-${ptrInfo.gen}`, idRows.length);
          pointerDoc.baseGen = `FTC-G-${ptrInfo.gen}`;
        }
      }
    }
  } catch (e) {
    console.warn('[d1] pointer generation read failed:', (e && e.message) || e);
  }
  // 2) Legacy ordered chunks ('FTC-STATE-*').
  try {
    const countRow = await d1First("SELECT COUNT(*) AS c FROM erp_state WHERE id LIKE 'FTC-STATE-%'");
    const totalChunks = countRow ? Number(countRow.c) : 0;
    if (!totalChunks) {
      const single = await d1First(
        "SELECT id, data FROM erp_state WHERE id IN ('farmtrack-demo', 'default') LIMIT 1"
      );
      if (single) {
        let data = single.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch { /* keep string */ }
        }
        legacyDoc = { id: single.id, data, chunks: 1, baseGen: '' };
      }
    } else {
      const idRows = await d1All("SELECT id FROM erp_state WHERE id LIKE 'FTC-STATE-%' ORDER BY id");
      const { parts, missing } = await fetchChunkDataByIds(idRows.map(r => r.id));
      if (missing.length) {
        console.error(`[d1] legacy layout has ${missing.length} unreadable chunk(s) — treating as incomplete`);
        legacyDoc = { id: 'FTC-STATE', data: null, chunks: idRows.length, incomplete: true, missingChunks: missing.length, baseGen: '' };
      } else {
        legacyDoc = parseJoinedChunks(parts.join(''), 'FTC-STATE', idRows.length);
        legacyDoc.baseGen = '';
      }
    }
  } catch (e) {
    console.warn('[d1] legacy layout read failed:', (e && e.message) || e);
  }
  // 3) Prefer the pointer generation whenever it is complete — it is the ONLY
  //    authoring layout going forward. The legacy FTC-STATE-* layout (and the
  //    single-row 'farmtrack-demo'/'default') is retained ONLY as a last-resort
  //    fallback when there is no healthy pointer generation at all.
  //    IMPORTANT: serving the legacy doc (which has baseGen='') was the root
  //    cause of endless D1_WRITE_CONFLICT loops — every save compared the empty
  //    baseGen against the real pointer generation and conflicted forever, so
  //    Sales/other saves failed with "D1 write conflict: remote state moved".
  if (pointerDoc && pointerDoc.data) {
    // Make the returned doc's baseVersion AUTHORITATIVE with the live pointer.
    // The document copy's embedded _writeVersion can lag the pointer after a
    // merge-retry (pointer got bumped to vN but doc still says vN-2), and the
    // caller stores that stale value as baseVersion → every subsequent save
    // conflicts forever. Re-stamp it here so saveState always compares against
    // the true live version.
    try {
      const pv = await readPointerVersion();
      if (pv.gen === pointerDoc.baseGen.replace('FTC-G-', '')) {
        pointerDoc.data._writeVersion = pv.version || Number(pointerDoc.data._writeVersion || 0);
        pointerDoc.version = pv.version || pointerDoc.version || 0;
        pointerDoc.writerAt = pv.writerAt || '';
        // The API layer reads baseVersion from data._writeVersion — stamp it.
        pointerDoc.baseVersion = pv.version || 0;
      } else {
        // If the pointer moved after we read the chunks (extreme race), the
        // generation we loaded is no longer live. Force a re-read.
        return getErpStateDocument(opts);
      }
    } catch (e) {
      console.warn('[d1] pointer version re-stamp skipped:', (e && e.message) || e);
    }
    // Best-effort: once a healthy pointer generation exists, retire the legacy
    // rows so the split-brain (and empty-baseGen path) can never come back.
    if (legacyDoc && legacyDoc.data) {
      try {
        const del = await d1Query("DELETE FROM erp_state WHERE id LIKE 'FTC-STATE-%' OR id IN ('farmtrack-demo', 'default')");
        console.warn('[d1] removed legacy layout rows after healthy pointer generation; affected=', del);
      } catch (e) {
        console.warn('[d1] legacy cleanup skipped:', (e && e.message) || e);
      }
    }
    try { if (!opts.skipHydrate && pointerDoc.data) await hydrateFromNormalizedTables(pointerDoc.data); } catch (e) { console.warn('[hydrate]', e && e.message); }
    if (pointerDoc.data) {
      pointerDoc.data._d1BaseGen = pointerDoc.baseGen;
      pointerDoc.data._blobSafety = 'v10';
    }
    return pointerDoc;
  }
  if (legacyDoc && legacyDoc.data) {
    try { if (!opts.skipHydrate) await hydrateFromNormalizedTables(legacyDoc.data); } catch (e) { console.warn('[hydrate]', e && e.message); }
    if (legacyDoc.data) {
      legacyDoc.data._d1BaseGen = legacyDoc.baseGen || '';
      legacyDoc.data._blobSafety = 'v10';
    }
    return legacyDoc;
  }
  if (pointerDoc) return pointerDoc; // surface parseError/incomplete info to caller
  if (legacyDoc) return legacyDoc;
  return { id: null, data: null, chunks: 0, baseGen: '' };
}

async function probeD1() {
  const started = Date.now();
  try {
    if (!d1Configured()) {
      warnMisconfigurationOnce();
      return { ok: false, error: 'Missing CLOUDFLARE_* env', ms: 0, backend: 'd1' };
    }
    const tenant = await d1First('SELECT id, name FROM tenants LIMIT 1');
    const chunkRow = await d1First("SELECT COUNT(*) AS c FROM erp_state");
    // Persistence diagnostics so "is my data actually saved?" is answerable.
    let pointer = null, generations = 0;
    try {
      const ptr = await d1First("SELECT data FROM erp_state WHERE id = 'FTC-PTR'");
      const info = parsePointer(ptr && ptr.data);
      pointer = info.gen ? { gen: info.gen, version: info.version, writerAt: info.writerAt || null } : null;
      const gens = await listGenerations();
      generations = gens.size;
    } catch (_) {}
    return {
      ok: true,
      ms: Date.now() - started,
      backend: 'd1',
      accountId: ACCOUNT_ID,
      databaseId: DATABASE_ID,
      tenant: tenant || null,
      erp_state_rows: chunkRow ? chunkRow.c : 0,
      pointer,
      generations,
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
 *
 *  Optimistic concurrency (opts.baseGen / opts.baseVersion): if the pointer
 *  moved, BLOB_SAFE_V10 union-merges collections (never drops ids) and retries.
 *  Callers that omit base info still merge against the live pointer before write,
 *  so last-write-wins cannot erase another user's inserts.
 *
 *  Returns { chunks, bytes, gen, version }.
 */
async function saveErpStateDocument(data, opts = {}) {
  let resolveTask, rejectTask;
  const done = new Promise((res, rej) => { resolveTask = res; rejectTask = rej; });
  saveQueue = saveQueue.then(async () => {
    try {
      const result = await saveErpStateDocumentInner(data, opts || {});
      resolveTask(result);
    } catch (e) {
      rejectTask(e);
    }
  });
  return done;
}

async function saveErpStateDocumentInner(data, opts) {
  if (typeof data === 'object' && data && !(opts && opts.allowEmptyOrg)) {
    const customers = Array.isArray(data.customers) ? data.customers : [];
    const employees = Array.isArray(data.employees) ? data.employees : [];
    const users = Array.isArray(data.users) ? data.users : [];
    if (users.length > 0 && customers.length === 0 && employees.length === 0) {
      console.warn('[D1] Refusing to save state with users but 0 customers/employees — likely a purge, skipping');
      return { chunks: 0, bytes: 0, skipped: true };
    }
  }

  let working = data;
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    let curGen = '', curVersion = 0, curHasVersion = false;
    try {
      const ptr = await d1First("SELECT data FROM erp_state WHERE id = 'FTC-PTR'");
      const info = parsePointer(ptr && ptr.data);
      curGen = info.gen; curVersion = info.version; curHasVersion = info.hasVersion;
    } catch (_) {}

    // Always union-merge with the live blob so a stale in-memory copy cannot
    // drop records another user just saved. Skip only for explicit force.
    if (!opts.force && typeof working === 'object' && working) {
      try {
        const remote = await getErpStateDocument({ skipHydrate: true });
        if (remote && remote.data && typeof remote.data === 'object') {
          working = mergeStateDocuments(working, remote.data);
          if (remote.baseGen) working._d1BaseGen = remote.baseGen;
          curVersion = Math.max(curVersion, Number(remote.data._writeVersion || 0));
          if (remote.baseGen && remote.baseGen.startsWith('FTC-G-')) {
            curGen = remote.baseGen.replace(/^FTC-G-/, '');
          }
        }
      } catch (e) {
        console.warn('[d1] pre-save merge skipped:', e && e.message);
      }
      try { await hydrateFromNormalizedTables(working); } catch (e) { console.warn('[hydrate] pre-save', e && e.message); }
    }

    // TABLES FIRST — entity rows land even if the blob write later conflicts.
    try {
      if (typeof working === 'object' && working) {
        const dw = await dualWriteFromState(working);
        console.log('[d1] tables-first dual-write', dw && dw.wrote, 'attempt', attempt);
      }
    } catch (e) {
      console.warn('[dual-write] pre-blob', e && e.message);
    }

    if (!opts.force && opts && opts.baseVersion != null && Number.isFinite(Number(opts.baseVersion)) && attempt === 0) {
      const baseGen = String(opts.baseGen || '');
      const baseVer = Number(opts.baseVersion) || 0;
      const moved = curGen
        ? (baseGen && baseGen !== `FTC-G-${curGen}` && curHasVersion && curVersion !== baseVer)
        : Boolean(baseGen) || baseVer > 0;
      // Do not throw — we already merged. Continue to write the union.
      if (moved) {
        console.warn('[d1] BLOB_SAFE_V10 conflict on attempt 0 — writing merged union instead of rejecting');
      }
    }

    const newVersion = Math.max(curVersion, Number(opts && opts.baseVersion) || 0) + 1;
    const writerAt = new Date().toISOString();
    if (working && typeof working === 'object') {
      working._writeVersion = newVersion;
      working._lastWriterAt = writerAt;
      working._blobSafety = 'v10';
    }

    const json = typeof working === 'string' ? working : JSON.stringify(working);
    const CHUNK = 32000;
    const chunks = [];
    for (let i = 0; i < json.length; i += CHUNK) {
      chunks.push(json.slice(i, i + CHUNK));
    }
    const gen = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const pad = n => String(n).padStart(4, '0');
    const stageId = i => `FTC-G-${gen}-${pad(i + 1)}`;

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
    const check = await d1First('SELECT COUNT(*) AS c FROM erp_state WHERE id LIKE ?', [`FTC-G-${gen}-%`]);
    const staged = check ? Number(check.c) : 0;
    if (staged !== chunks.length) {
      lastErr = new Error(`Staged write failed: expected ${chunks.length} chunks, found ${staged}`);
      continue;
    }

    // Re-read pointer: if another writer flipped while we staged, merge+retry
    // instead of clobbering their generation.
    let liveGen = curGen, liveVersion = curVersion;
    try {
      const ptr2 = await readPointerVersion();
      liveGen = ptr2.gen; liveVersion = ptr2.version;
    } catch (_) {}
    if (!opts.force && liveGen && curGen && liveGen !== curGen) {
      console.warn('[d1] BLOB_SAFE_V10 pointer moved during stage', curGen, '->', liveGen, 'retry', attempt);
      lastErr = new Error('D1 write conflict during stage');
      lastErr.code = 'D1_WRITE_CONFLICT';
      continue;
    }

    await d1Query(
      "INSERT INTO erp_state (id, data) VALUES ('FTC-PTR', ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      [`${gen}|${newVersion}|${writerAt}`]
    );

    try { await gcGenerations(gen); } catch (e) {
      console.warn('[d1] old-generation cleanup skipped:', (e && e.message) || e);
    }
    try { if (typeof working === 'object' && working) await dualWriteFromState(working); } catch (e) {
      console.warn('[dual-write]', e && e.message);
    }
    if (typeof data === 'object' && data && typeof working === 'object' && working) {
      data._writeVersion = working._writeVersion;
      data._lastWriterAt = working._lastWriterAt;
      data._d1BaseGen = `FTC-G-${gen}`;
    }
    return { chunks: chunks.length, bytes: json.length, gen, version: newVersion, writerAt, merged: Boolean(working && working._mergedFromConflict), blobSafety: 'v10' };
  }
  if (lastErr) throw lastErr;
  throw new Error('D1 save failed after merge retries');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * NORMALIZED / TABLE-LEVEL WRITE PATH (high-frequency records)
 * ──────────────────────────────────────────────────────────────────────────
 * Tables are the durable store for entity rows (customers, calls, invoices, …).
 * The erp_state blob remains the compatibility document the RPC layer reads,
 * but every save union-merges + dual-writes tables FIRST so last-write-wins
 * cannot erase another user's inserts.
 * Disable table writes with NORMALIZED_WRITES_DISABLED=1 / FAST_SAVE_DISABLE=1.
 */

function normalizedStateWritesEnabled() {
  const v = String(process.env.NORMALIZED_WRITES_DISABLED || process.env.FAST_SAVE_DISABLE || '').trim().toLowerCase();
  return !(v === '1' || v === 'true' || v === 'yes');
}

/** Per-table column definitions: [d1_snake_col, ...camelRowKeysToTry].
 *  Only columns whose row value is present are included in the upsert. */
const NORMALIZE_TABLE_DEFS = {
  invoices: [
    ['id', 'id'],
    ['invoice_no', 'invoiceNo', 'invNo'],
    ['customer_id', 'customerId'],
    ['customer_name', 'customerName'],
    ['invoice_date', 'invoiceDate', 'date'],
    ['due_date', 'dueDate'],
    ['subtotal', 'subtotal'], ['tax', 'tax'], ['total', 'total'],
    ['paid', 'paid'], ['balance', 'balance'], ['status', 'status'],
    ['discount_mode', 'discountMode'], ['round_to', 'roundTo'],
  ],
  payments: [
    ['id', 'id'],
    ['payment_no', 'paymentNo', 'payNo', 'reference', 'paymentNo'],
    ['date', 'date'],
    ['invoice_id', 'invoiceId'],
    ['customer_id', 'customerId'],
    ['customer_name', 'customerName'],
    ['amount', 'amount'],
    ['method', 'method', 'paymentMethod'],
    ['status', 'status'],
  ],
  expenses: [
    ['id', 'id'],
    ['expense_no', 'expNo', 'expenseNo'],
    ['category', 'category'],
    ['description', 'description'],
    ['amount', 'amount'],
    ['payment_method', 'paymentMethod', 'payment_method', 'method'],
    ['status', 'status'],
    ['expense_date', 'expenseDate', 'date'],
  ],
  requisitions: [
    ['id', 'id'],
    ['req_no', 'reqNo', 'requisitionNo'],
    ['module', 'module'],
    ['title', 'title'],
    ['status', 'status'],
    ['requested_by', 'requestedBy'],
    ['amount', 'amount'],
  ],
  calls: [
    ['id', 'id'],
    ['customer_id', 'customerId'],
    ['customer_name', 'customerName'],
    ['phone', 'phone'],
    ['stage', 'stage'],
    ['record_type', 'recordType'],
    ['follow_up_date', 'followUpDate'],
    ['assigned_to', 'assignedTo'],
    ['notes', 'notes'],
    ['date', 'date'],
  ],
  customers: [
    ['id', 'id'], ['name', 'name'], ['phone', 'phone'], ['email', 'email'],
    ['city', 'city'], ['address', 'address'], ['balance', 'balance'], ['status', 'status'],
  ],
  sales_orders: [
    ['id', 'id'], ['so_no', 'soNo', 'orderNo', 'saleNo'],
    ['customer_id', 'customerId'], ['customer_name', 'customerName'],
    ['total', 'total'], ['status', 'status'],
  ],
  deliveries: [
    ['id', 'id'], ['delivery_no', 'deliveryNo', 'dnNo'],
    ['sale_id', 'saleId', 'salesOrderId'], ['sale_no', 'saleNo', 'soNo'],
    ['customer_name', 'customerName'], ['status', 'status'],
    ['driver', 'driver'], ['vehicle', 'vehicle'], ['destination', 'destination'],
    ['delivery_date', 'deliveryDate', 'date'],
  ],
  suppliers: [
    ['id', 'id'], ['name', 'name'], ['phone', 'phone'], ['email', 'email'],
    ['status', 'status'],
  ],
  products: [
    ['id', 'id'], ['sku', 'sku'], ['name', 'name'], ['category', 'category'],
    ['status', 'status'],
  ],
  finance_accounts: [
    ['id', 'id'], ['code', 'code'], ['name', 'name'], ['type', 'type'], ['status', 'status'],
  ],
};

/** Escape an identifier (table / column) so it can't inject SQL. */
function qi(name) {
  return String(name || '').replace(/[^A-Za-z0-9_]/g, '');
}

/** Write rows to normalized D1 tables. Batches VALUES (≤12) per HTTP call.
 *  COALESCE on conflict so a stale empty field cannot wipe a populated column.
 *  entries: [{ table, row }]
 */
async function upsertStateRows(entries) {
  const results = [];
  const byTable = new Map();
  for (const entry of entries || []) {
    const table = String(entry && entry.table || '').trim();
    const row = entry && entry.row;
    const def = NORMALIZE_TABLE_DEFS[table];
    if (!def || !row || typeof row !== 'object') {
      results.push({ table, ok: false, reason: 'unsupported' });
      continue;
    }
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table).push(row);
  }
  for (const [table, rows] of byTable) {
    const def = NORMALIZE_TABLE_DEFS[table];
    const CHUNK = 40;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      try {
        await upsertTableSlice(table, def, slice);
        for (const row of slice) results.push({ table, ok: true, rowId: row && row.id });
      } catch (e) {
        console.warn('[d1] batch upsert failed', table, e && e.message, '— falling back per-row');
        for (const row of slice) {
          try {
            await upsertTableSlice(table, def, [row]);
            results.push({ table, ok: true, rowId: row && row.id });
          } catch (e2) {
            results.push({ table, ok: false, rowId: row && row.id, reason: String(e2 && e2.message || e2) });
          }
        }
      }
    }
  }
  return results;
}

function rowValue(row, keys) {
  return keys.reduce((acc, k) => (acc !== undefined && acc !== null ? acc : row[k]), undefined);
}

async function upsertTableSlice(table, def, rows) {
  if (!rows.length) return;
  const cols = [];
  for (const [snake] of def) {
    const name = qi(snake);
    if (name && !cols.includes(name)) cols.push(name);
  }
  if (!cols.includes('id')) cols.unshift('id');
  if (!cols.includes('tenant_id')) cols.push('tenant_id');
  const idCol = qi('id');
  const placeholdersRow = '(' + cols.map(() => '?').join(', ') + ')';
  const placeholders = rows.map(() => placeholdersRow).join(', ');
  const params = [];
  for (const row of rows) {
    for (const col of cols) {
      if (col === 'tenant_id') {
        const v = rowValue(row, ['tenantId', 'tenant_id']);
        params.push(v == null || v === '' ? DEFAULT_TENANT_ID : v);
        continue;
      }
      const spec = def.find((d) => qi(d[0]) === col);
      let val = spec ? rowValue(row, spec.slice(1)) : row[col];
      if (col === 'name' && (table === 'customers' || table === 'suppliers') && (val === undefined || val === null || val === '')) {
        val = String(row.id || 'Unknown');
      }
      params.push((val === undefined || val === '') ? null : val);
    }
  }
  const updateCols = cols.filter((c) => c !== idCol);
  const updateSql = updateCols.length
    ? ('DO UPDATE SET ' + updateCols.map((c) => `${c}=COALESCE(excluded.${c}, ${qi(table)}.${c})`).join(', '))
    : 'DO NOTHING';
  const sql = `INSERT INTO ${qi(table)} (${cols.join(', ')}) VALUES ${placeholders} ON CONFLICT(${idCol}) ${updateSql}`;
  await d1Query(sql, params);
}

const STALE_GEN_GRACE_MS = 10 * 60 * 1000;
const KEEP_GENERATIONS = 5;

/** Delete superseded generations beyond the retention window.
 *  Keeps: the live generation + the newest KEEP_GENERATIONS-1 others.
 *  Deletes: older ones past STALE_GEN_GRACE_MS (young ones are protected —
 *  another serverless instance may still be mid-staging them).
 *  Also clears legacy layout rows once a healthy pointer generation exists. */
async function gcGenerations(currentGen) {
  const counts = await listGenerations();
  const entries = Array.from(counts.entries())
    .map(([g, n]) => ({ gen: g, rows: n, ageMs: genAgeMs(g), ts: (() => { const m = String(g).match(/^([0-9a-z]+)-/); const t = m ? parseInt(m[1], 36) : NaN; return Number.isFinite(t) ? t : 0; })() }))
    .filter(e => e.gen !== currentGen)
    .sort((a, b) => b.ts - a.ts);
  const keepSet = new Set(entries.slice(0, KEEP_GENERATIONS - 1).map(e => e.gen));
  let deleted = 0;
  for (const e of entries) {
    if (keepSet.has(e.gen)) continue;
    if (e.ageMs <= STALE_GEN_GRACE_MS) continue; // young — may be mid-staging elsewhere
    deleted += await deleteGeneration(e.gen);
  }
  return deleted;
}

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
 *   - Keeps the newest KEEP_GENERATIONS generations as restore points.
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
          currentGen = parsePointer(ptr && ptr.data).gen;
        } catch (_) {}
        const deleted = await gcGenerations(currentGen);
        resolve(deleted);
      } catch (_) { resolve(0); }
    });
  });
}


/** HYDRATE_DUAL_WRITE_V10 — tables win missing ids; non-empty table fields merge
 *  into blob rows without wiping blob-only keys (items, notes, etc.). */
async function hydrateFromNormalizedTables(data) {
  if (!data || typeof data !== 'object' || !d1Configured()) return data;
  const merge = (arrKey, rows) => {
    if (!rows || !rows.length) return 0;
    const list = Array.isArray(data[arrKey]) ? data[arrKey].slice() : [];
    const byId = new Map();
    for (const x of list) {
      if (x && x.id != null) byId.set(String(x.id), x);
    }
    let added = 0;
    for (const r of rows) {
      if (!r || r.id == null) continue;
      const id = String(r.id);
      if (!byId.has(id)) { byId.set(id, r); added++; }
      else byId.set(id, mergeRecord(byId.get(id), r));
    }
    data[arrKey] = Array.from(byId.values());
    return added;
  };
  if (Array.isArray(data.calls)) {
    data.calls = data.calls.filter((c) => c && !isQbCall(c));
  }
  try {
    const customers = await d1All('SELECT id, name, phone, email, city, address, balance, status, created_at FROM customers LIMIT 5000');
    if (customers.length) {
      merge('customers', customers.map((r) => ({
        id: r.id, name: r.name || '', phone: r.phone || '', email: r.email || '',
        city: r.city || '', address: r.address || '', balance: r.balance || 0,
        status: r.status || 'Active', createdAt: String(r.created_at || '').replace(' ', 'T'),
        source: 'd1-table', isDeleted: 'No',
      })));
      console.log('[hydrate] customers', customers.length, 'merged', (data.customers || []).length);
    }
  } catch (e) { console.warn('[hydrate] customers', e && e.message); }
  try {
    const calls = await d1All('SELECT id, customer_id, customer_name, phone, stage, record_type, follow_up_date, assigned_to, notes, date, created_at FROM calls LIMIT 2000');
    const mapped = (calls || []).filter((r) => r && r.id && !String(r.id).startsWith('QBCALL')).map((r) => ({
      id: r.id, customerId: r.customer_id || '', customerName: r.customer_name || '', phone: r.phone || '',
      stage: r.stage || '', recordType: r.record_type || '', followUpDate: r.follow_up_date || '',
      assignedTo: r.assigned_to || '', notes: r.notes || '', date: r.date || '',
      createdAt: String(r.created_at || '').replace(' ', 'T'), source: 'd1-table',
    }));
    if (mapped.length) {
      merge('calls', mapped);
      console.log('[hydrate] calls', mapped.length, 'merged', (data.calls || []).length);
    }
  } catch (e) { console.warn('[hydrate] calls', e && e.message); }
  try {
    const sos = await d1All('SELECT id, so_no, customer_id, customer_name, total, status, created_at FROM sales_orders LIMIT 2000');
    if (sos.length) {
      const mapped = sos.map((r) => ({
        id: r.id, soNo: r.so_no || '', customerId: r.customer_id || '', customerName: r.customer_name || '',
        total: r.total || 0, status: r.status || 'Open', createdAt: String(r.created_at || '').replace(' ', 'T'), source: 'd1-table',
      }));
      merge('salesOrders', mapped);
      merge('sales', mapped);
      console.log('[hydrate] sales_orders', sos.length);
    }
  } catch (e) { console.warn('[hydrate] sales_orders', e && e.message); }
  try {
    const dels = await d1All('SELECT id, delivery_no, sale_id, sale_no, customer_name, status, driver, vehicle, destination, delivery_date, created_at FROM deliveries LIMIT 2000');
    if (dels.length) {
      merge('deliveries', dels.map((r) => ({
        id: r.id, deliveryNo: r.delivery_no || '', saleId: r.sale_id || '', saleNo: r.sale_no || '',
        customerName: r.customer_name || '', status: r.status || 'pending', driver: r.driver || '',
        vehicle: r.vehicle || '', destination: r.destination || '', deliveryDate: r.delivery_date || '',
        createdAt: String(r.created_at || '').replace(' ', 'T'), source: 'd1-table',
      })));
      console.log('[hydrate] deliveries', dels.length);
    }
  } catch (e) { console.warn('[hydrate] deliveries', e && e.message); }
  try {
    const inv = await d1All('SELECT id, invoice_no, customer_id, customer_name, invoice_date, due_date, subtotal, tax, total, paid, balance, status, created_at FROM invoices LIMIT 2000');
    if (inv.length) {
      merge('invoices', inv.map((r) => ({
        id: r.id, invoiceNo: r.invoice_no || '', customerId: r.customer_id || '', customerName: r.customer_name || '',
        invoiceDate: r.invoice_date || '', dueDate: r.due_date || '', subtotal: r.subtotal || 0, tax: r.tax || 0,
        total: r.total || 0, paid: r.paid || 0, balance: r.balance || 0, status: r.status || 'Pending',
        createdAt: String(r.created_at || '').replace(' ', 'T'), source: 'd1-table',
      })));
      console.log('[hydrate] invoices', inv.length);
    }
  } catch (e) { console.warn('[hydrate] invoices', e && e.message); }
  try {
    const prods = await d1All('SELECT id, sku, name, category, status FROM products LIMIT 2000');
    if (prods.length) {
      merge('products', prods.map((r) => ({
        id: r.id, sku: r.sku || '', name: r.name || '', category: r.category || '',
        status: r.status || 'active', source: 'd1-table',
      })));
      console.log('[hydrate] products', prods.length);
    }
  } catch (e) { console.warn('[hydrate] products', e && e.message); }
  try {
    const accts = await d1All('SELECT id, code, name, type, status FROM finance_accounts LIMIT 2000');
    if (accts.length) {
      const seen = new Set();
      const unique = [];
      for (const r of accts) {
        const code = String(r.code || '').trim();
        if (!code || seen.has(code)) continue;
        seen.add(code);
        unique.push({
          id: r.id, code, name: r.name || '', type: r.type || '',
          status: r.status || 'active', source: 'd1-table',
        });
      }
      merge('financeAccounts', unique);
      merge('chartOfAccounts', unique);
      console.log('[hydrate] finance_accounts unique', unique.length);
    }
  } catch (e) { console.warn('[hydrate] finance_accounts', e && e.message); }
  try {
    const pays = await d1All('SELECT id, payment_no, date, invoice_id, customer_id, customer_name, amount, method, status, created_at FROM payments LIMIT 2000');
    if (pays.length) {
      merge('payments', pays.map((r) => ({
        id: r.id, paymentNo: r.payment_no || '', date: r.date || '', invoiceId: r.invoice_id || '',
        customerId: r.customer_id || '', customerName: r.customer_name || '', amount: r.amount || 0,
        method: r.method || 'Cash', status: r.status || 'Completed',
        createdAt: String(r.created_at || '').replace(' ', 'T'), source: 'd1-table',
      })));
      console.log('[hydrate] payments', pays.length);
    }
  } catch (e) { console.warn('[hydrate] payments', e && e.message); }
  try {
    const exps = await d1All('SELECT id, expense_no, category, description, amount, payment_method, status, expense_date, created_at FROM expenses LIMIT 2000');
    if (exps.length) {
      merge('expenses', exps.map((r) => ({
        id: r.id, expenseNo: r.expense_no || '', category: r.category || '', description: r.description || '',
        amount: r.amount || 0, paymentMethod: r.payment_method || '', status: r.status || '',
        expenseDate: r.expense_date || '', createdAt: String(r.created_at || '').replace(' ', 'T'), source: 'd1-table',
      })));
      console.log('[hydrate] expenses', exps.length);
    }
  } catch (e) { console.warn('[hydrate] expenses', e && e.message); }
  try {
    const sups = await d1All('SELECT id, name, phone, email, category, status, created_at FROM suppliers LIMIT 2000');
    if (sups.length) {
      merge('suppliers', sups.map((r) => ({
        id: r.id, name: r.name || '', phone: r.phone || '', email: r.email || '',
        category: r.category || '', status: r.status || 'active',
        createdAt: String(r.created_at || '').replace(' ', 'T'), source: 'd1-table',
      })));
      console.log('[hydrate] suppliers', sups.length);
    }
  } catch (e) { console.warn('[hydrate] suppliers', e && e.message); }
  data._hydratedFromTables = new Date().toISOString();
  data._blobSafety = 'v10';
  return data;
}

async function dualWriteFromState(state, opts) {
  opts = opts || {};
  if (!normalizedStateWritesEnabled() || !state || typeof state !== 'object') return { skipped: true };
  if (!d1Configured()) return { skipped: true, reason: 'd1_not_configured' };
  const maxPer = Number(opts.maxPerTable) > 0 ? Number(opts.maxPerTable) : 2000;
  const map = [
    ['customers', 'customers'],
    ['calls', 'calls'],
    ['invoices', 'invoices'],
    ['payments', 'payments'],
    ['expenses', 'expenses'],
    ['requisitions', 'requisitions'],
    ['sales_orders', 'salesOrders'],
    ['sales_orders', 'sales'],
    ['deliveries', 'deliveries'],
    ['suppliers', 'suppliers'],
    ['products', 'products'],
    ['finance_accounts', 'financeAccounts'],
  ];
  const entries = [];
  const seen = new Set();
  for (const [table, key] of map) {
    const arr = Array.isArray(state[key]) ? state[key] : [];
    let n = 0;
    for (const row of arr) {
      if (!row || !row.id) continue;
      if (table === 'calls' && isQbCall(row)) continue;
      const sid = table + ':' + String(row.id);
      if (seen.has(sid)) continue;
      seen.add(sid);
      entries.push({ table, row });
      if (++n >= maxPer) break;
    }
  }
  if (!entries.length) return { ok: true, wrote: 0 };
  try {
    const results = await upsertStateRows(entries);
    const ok = results.filter((r) => r && r.ok).length;
    console.log('[dual-write] entries=' + entries.length + ' ok=' + ok);
    return { ok: true, wrote: ok, total: entries.length };
  } catch (e) {
    console.warn('[dual-write] failed:', e && e.message);
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function syncFullStateToNormalizedTables(state) {
  return dualWriteFromState(state);
}

module.exports = {
  d1Configured,
  d1Query,
  d1All,
  d1First,
  getErpStateDocument,
  saveErpStateDocument,
  cleanupStaleStageRows,
  parsePointer,
  readPointerVersion,
  warnMisconfigurationOnce,
  probeD1,
  normalizedStateWritesEnabled,
  upsertStateRows,
  hydrateFromNormalizedTables,
  dualWriteFromState,
  syncFullStateToNormalizedTables,
  mergeStateDocuments,
  ACCOUNT_ID,
  DATABASE_ID,
};
