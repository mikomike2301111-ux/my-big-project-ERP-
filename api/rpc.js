/**
 * Bootstrap v4: restore 27 real D1 reception/follow-up calls into CRM.
 * Logs: search Vercel runtime for [reception-restore]
 * Diagnostic (no auth):
 *   GET  /api/rpc?diag=reception
 *   POST {"fn":"__receptionStatus"}
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { URL } = require('url');

const GOOD_URL =
  process.env.RPC_GOOD_URL ||
  'https://raw.githubusercontent.com/mikomike2301111-ux/ftcerp-to-cloudflare-public/91cacae99d4d2f45b01d94f4dde98230119cc29c/api/rpc.js';

const CACHE = path.join('/tmp', 'farmtrack-rpc-good.js');
let cachedHandler = null;
let loadPromise = null;
let lastLoadInfo = { pathsTried: [], loadedFrom: null, count: 0, at: null };

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'farmtrack-rpc-bootstrap' }, timeout: 25000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchText(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' loading RPC'));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout loading RPC')); });
  });
}

function loadReceptionCalls() {
  const paths = [
    path.join(__dirname, '..', 'data', 'd1-reception-calls.json'),
    path.join(process.cwd(), 'data', 'd1-reception-calls.json'),
    path.join('/var/task', 'data', 'd1-reception-calls.json'),
    path.join('/var/task', 'api', '..', 'data', 'd1-reception-calls.json'),
  ];
  lastLoadInfo = { pathsTried: [], loadedFrom: null, count: 0, at: new Date().toISOString() };
  for (const p of paths) {
    lastLoadInfo.pathsTried.push(p);
    try {
      if (fs.existsSync(p)) {
        const snap = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (snap && Array.isArray(snap.calls) && snap.calls.length) {
          console.log('[reception-restore] LOADED file=' + p + ' count=' + snap.calls.length);
          lastLoadInfo.loadedFrom = p;
          lastLoadInfo.count = snap.calls.length;
          return snap.calls;
        }
      } else {
        console.log('[reception-restore] missing path=' + p);
      }
    } catch (e) {
      console.warn('[reception-restore] read fail', p, e && e.message);
    }
  }
  try {
    const snap = require('../data/d1-reception-calls.json');
    if (snap && Array.isArray(snap.calls) && snap.calls.length) {
      console.log('[reception-restore] LOADED via require count=' + snap.calls.length);
      lastLoadInfo.loadedFrom = 'require';
      lastLoadInfo.count = snap.calls.length;
      return snap.calls;
    }
  } catch (e) {
    console.warn('[reception-restore] require fail', e && e.message);
  }
  console.warn('[reception-restore] NO CALLS FILE FOUND — QBCALL will still be stripped');
  return [];
}

function applyFixes(src) {
  if (src.includes('RECEPTION_CALLS_RESTORE_V4')) return src;

  const prRe = /function periodRange\(period = ['"]Month['"]\)\s*\{[\s\S]*?return \{ startDate:[\s\S]*?\};\s*\}/;
  const prNew = `function periodRange(period = 'Year') { // RECEPTION_CALLS_RESTORE_V4\n  const cleanPeriod = String(period || 'Year').toLowerCase();\n  let days = 365;\n  if (cleanPeriod.includes('all') || cleanPeriod.includes('history') || cleanPeriod.includes('full') || cleanPeriod.includes('lifetime')) days = 2000;\n  else if (cleanPeriod.includes('day') && !cleanPeriod.includes('today')) days = 1;\n  else if (cleanPeriod.includes('week')) days = 7;\n  else if (cleanPeriod.includes('month')) days = 30;\n  else if (cleanPeriod.includes('quarter')) days = 90;\n  else if (cleanPeriod.includes('year')) days = 365;\n  else days = 365;\n  const end = new Date();\n  const start = new Date();\n  start.setDate(end.getDate() - (days - 1));\n  const label = days === 1 ? 'Day' : days === 7 ? 'Week' : days === 30 ? 'Month' : days === 90 ? 'Quarter' : days >= 2000 ? 'All' : 'Year';\n  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), days, label };\n}`;
  if (prRe.test(src)) src = src.replace(prRe, prNew);

  if (!src.includes('function restoreReceptionCallsFromD1')) {
    const helpers = `\nfunction restoreReceptionCallsFromD1(d) {\n  if (!d) return;\n  d.calls = Array.isArray(d.calls) ? d.calls : [];\n  const before = d.calls.length;\n  d.calls = d.calls.filter(c => c && !String(c.id || '').startsWith('QBCALL') && !String(c.id || '').startsWith('QB-CALL'));\n  const stripped = before - d.calls.length;\n  let source = [];\n  try {\n    if (typeof globalThis.__RECEPTION_CALLS__ !== 'undefined' && Array.isArray(globalThis.__RECEPTION_CALLS__)) {\n      source = globalThis.__RECEPTION_CALLS__;\n    }\n  } catch (e) {}\n  if (!source.length) {\n    try {\n      const snap = require('../data/d1-reception-calls.json');\n      if (snap && Array.isArray(snap.calls)) source = snap.calls;\n    } catch (e) {}\n  }\n  if (!source.length) {\n    console.warn('[reception-restore] no source calls; strippedQBCALL=' + stripped + ' remaining=' + d.calls.length);\n    d._receptionRestore = { ok: false, stripped, totalReal: d.calls.length, at: new Date().toISOString() };\n    return;\n  }\n  const byId = new Map(d.calls.map(c => [String(c.id), c]));\n  let added = 0;\n  for (const c of source) {\n    if (!c || !c.id) continue;\n    const id = String(c.id);\n    if (!byId.has(id)) {\n      byId.set(id, c);\n      added++;\n    } else {\n      byId.set(id, { ...byId.get(id), ...c, source: c.source || 'd1-reception-restore' });\n    }\n  }\n  d.calls = Array.from(byId.values()).sort((a, b) =>\n    String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || ''))\n  );\n  d._receptionRestore = { ok: true, sourceCount: source.length, added, stripped, totalReal: d.calls.length, at: new Date().toISOString() };\n  console.log('[reception-restore] OK source=' + source.length + ' totalReal=' + d.calls.length + ' added=' + added + ' strippedQBCALL=' + stripped);\n}\n\n`;
    const idx = src.indexOf('function data()');
    if (idx > 0) src = src.slice(0, idx) + helpers + src.slice(idx);
  }

  const dataNeedle = 'function data() {\n  if (!db) seed();\n  applyQuickBooksSeed();';
  const dataInject = `function data() {\n  if (!db) seed();\n  applyQuickBooksSeed();\n  try { restoreReceptionCallsFromD1(db); } catch (e) { console.warn('[reception-restore] fail', e && e.message); }`;
  if (src.includes(dataNeedle) && !src.includes('restoreReceptionCallsFromD1(db)')) {
    src = src.replace(dataNeedle, dataInject);
  }

  if (!src.includes('// RECEPTION_CRM_FORCE_CALLS_V4')) {
    src = src.replace(
      'getCRMWorkspaceData(user, filters = {}) {\n    reqRole(user);',
      `getCRMWorkspaceData(user, filters = {}) {\n    reqRole(user);\n    // RECEPTION_CRM_FORCE_CALLS_V4\n    try { restoreReceptionCallsFromD1(data()); } catch (e) { console.warn('[reception-restore] crm-force', e && e.message); }`
    );
  }

  return src;
}

function loadFromSource(code, filename) {
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(code, filename);
  return mod.exports;
}

async function getHandler() {
  if (cachedHandler) return cachedHandler;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const calls = loadReceptionCalls();
    globalThis.__RECEPTION_CALLS__ = calls;
    console.log('[reception-restore] bootstrap v4 start embeddedOrFile=' + calls.length);

    let code;
    try {
      if (fs.existsSync(CACHE) && fs.statSync(CACHE).size > 100000) {
        code = fs.readFileSync(CACHE, 'utf8');
      }
    } catch {}
    if (!code || code.includes('PLACEHOLDER') || code.length < 50000) {
      code = await fetchText(GOOD_URL);
      if (!code || code.length < 50000) throw new Error('Failed to load good RPC (' + (code && code.length) + ' bytes)');
      try { fs.writeFileSync(CACHE, code); } catch {}
    }
    code = applyFixes(code);
    const exp = loadFromSource(code, path.join(__dirname, 'rpc-full.js'));
    cachedHandler = typeof exp === 'function' ? exp : exp && exp.default ? exp.default : exp;
    if (typeof cachedHandler !== 'function') throw new Error('RPC export is not a function');
    console.log('[reception-restore] handler ready v4 calls=' + calls.length);
    return cachedHandler;
  })();
  try {
    return await loadPromise;
  } catch (e) {
    loadPromise = null;
    throw e;
  }
}

async function sendStatus(res) {
  await getHandler();
  const calls = globalThis.__RECEPTION_CALLS__ || [];
  const sample = calls.slice(0, 5).map((c) => ({
    id: c.id,
    customerName: c.customerName || c.customer_name,
    stage: c.stage,
    recordType: c.recordType || c.record_type,
    notes: String(c.notes || '').slice(0, 80),
    assignedTo: c.assignedTo || c.assigned_to,
  }));
  console.log('[reception-restore] STATUS check count=' + calls.length + ' from=' + (lastLoadInfo.loadedFrom || 'none'));
  return res.status(200).json({
    ok: true,
    version: 'v4',
    message: 'Reception restore status — 27 real D1 calls should be loaded',
    sourceCount: calls.length,
    expected: 27,
    loadedFrom: lastLoadInfo.loadedFrom,
    pathsTried: lastLoadInfo.pathsTried,
    sample,
    meta: lastLoadInfo,
    at: new Date().toISOString(),
  });
}

async function handler(req, res) {
  try {
    // GET ?diag=reception — public status
    try {
      const u = new URL(req.url || '/', 'http://localhost');
      if (u.searchParams.get('diag') === 'reception') {
        return sendStatus(res);
      }
    } catch {}

    // POST body may already be parsed by Vercel
    const body = req.body && typeof req.body === 'object' ? req.body : null;
    const fn = body && (body.fn || body.function || body.method);
    if (fn === '__receptionStatus' || fn === 'receptionStatus') {
      return sendStatus(res);
    }

    const h = await getHandler();
    return h(req, res);
  } catch (e) {
    console.error('[reception-restore] bootstrap error:', e && e.message ? e.message : e);
    if (res && typeof res.status === 'function') {
      return res.status(200).json({ error: 'RPC bootstrap: ' + (e && e.message ? e.message : String(e)) });
    }
  }
}

module.exports = handler;
