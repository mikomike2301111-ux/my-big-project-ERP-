/**
 * Bootstrap — no product lists on deliveries (CRM + Delivery desk)
 * DELIVERY_NO_PRODUCTS_V2
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
const CACHE = path.join('/tmp', 'farmtrack-rpc-good-v4-noproducts.js');
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
  ];
  lastLoadInfo = { pathsTried: [], loadedFrom: null, count: 0, at: new Date().toISOString() };
  for (const p of paths) {
    lastLoadInfo.pathsTried.push(p);
    try {
      if (fs.existsSync(p)) {
        const snap = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (snap && Array.isArray(snap.calls) && snap.calls.length) {
          lastLoadInfo.loadedFrom = p;
          lastLoadInfo.count = snap.calls.length;
          return snap.calls;
        }
      }
    } catch (e) {}
  }
  try {
    const snap = require('../data/d1-reception-calls.json');
    if (snap && Array.isArray(snap.calls) && snap.calls.length) {
      lastLoadInfo.loadedFrom = 'require';
      lastLoadInfo.count = snap.calls.length;
      return snap.calls;
    }
  } catch (e) {}
  return [];
}

function applyFixes(src) {
  if (!src.includes('BLOB_SAFE_V10')) {
    src = src.replace(
      'await d1.saveErpStateDocument(persistedState);',
      "await d1.saveErpStateDocument(persistedState, { baseGen: (db && db._d1BaseGen) || persistedState._d1BaseGen, baseVersion: Math.max(0, Number((db && db._writeVersion) || persistedState._writeVersion || 1) - 1), mergeOnConflict: true }); // BLOB_SAFE_V10"
    );
  }

  if (!src.includes('RECEPTION_CALLS_RESTORE_V4')) {
    const prRe = /function periodRange\(period = ['"]Month['"]\)\s*\{[\s\S]*?return \{ startDate:[\s\S]*?\};\s*\}/;
    const prNew = `function periodRange(period = 'Year') { // RECEPTION_CALLS_RESTORE_V4\n  const cleanPeriod = String(period || 'Year').toLowerCase();\n  let days = 365;\n  if (cleanPeriod.includes('all') || cleanPeriod.includes('history') || cleanPeriod.includes('full') || cleanPeriod.includes('lifetime')) days = 2000;\n  else if (cleanPeriod.includes('day') && !cleanPeriod.includes('today')) days = 1;\n  else if (cleanPeriod.includes('week')) days = 7;\n  else if (cleanPeriod.includes('month')) days = 30;\n  else if (cleanPeriod.includes('quarter')) days = 90;\n  else if (cleanPeriod.includes('year')) days = 365;\n  const end = new Date();\n  const start = new Date();\n  start.setDate(end.getDate() - (days - 1));\n  const label = days === 1 ? 'Day' : days === 7 ? 'Week' : days === 30 ? 'Month' : days === 90 ? 'Quarter' : days >= 2000 ? 'All' : 'Year';\n  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), days, label };\n}`;
    if (prRe.test(src)) src = src.replace(prRe, prNew);
  }

  if (!src.includes('DELIVERY_NO_PRODUCTS_V2')) {
    const helpers = `\nfunction restoreReceptionCallsFromD1(d) {\n  if (!d) return;\n  d.calls = Array.isArray(d.calls) ? d.calls : [];\n  d.calls = d.calls.filter(c => c && !String(c.id || '').startsWith('QBCALL') && !String(c.id || '').startsWith('QB-CALL'));\n  let source = [];\n  try { if (Array.isArray(globalThis.__RECEPTION_CALLS__)) source = globalThis.__RECEPTION_CALLS__; } catch (e) {}\n  if (!source.length) { try { const snap = require('../data/d1-reception-calls.json'); if (snap && Array.isArray(snap.calls)) source = snap.calls; } catch (e) {} }\n  const byId = new Map(d.calls.map(c => [String(c.id), c]));\n  for (const c of source) { if (c && c.id) byId.set(String(c.id), Object.assign({}, byId.get(String(c.id)) || {}, c)); }\n  d.calls = Array.from(byId.values());\n  d._receptionRestore = { ok: true, totalReal: d.calls.length, at: new Date().toISOString() };\n}\nfunction stripDeliveryProductLists(d) { // DELIVERY_NO_PRODUCTS_V2\n  if (!d) return;\n  d.deliveryItems = [];\n  d.deliveries = Array.isArray(d.deliveries) ? d.deliveries : [];\n  d.deliveries = d.deliveries.filter(row => {\n    if (!row || row.isDeleted === 'Yes' || row.isDeleted === true) return false;\n    const s = String(row.source || ''), id = String(row.id || '');\n    if (s.includes('d1-deliveries-restore')) return false;\n    if (id.startsWith('DEL-QBINV') || id.startsWith('DEL-QB')) return false;\n    return true;\n  });\n  for (const del of d.deliveries) {\n    del.productCount = 0;\n    del.productsSummary = '';\n    del.productSummary = '';\n    del.totalQty = 0;\n    del.items = [];\n    del.products = [];\n    del.productList = '';\n  }\n}\nfunction stripDeliveryProductsOnRow(row) {\n  if (!row || typeof row !== 'object') return row;\n  row.productCount = 0;\n  row.productsSummary = '';\n  row.productSummary = '';\n  row.totalQty = 0;\n  row.items = [];\n  row.products = [];\n  row.productList = '';\n  return row;\n}\nfunction deliveryItemsForRow() { return []; }\n`;
    const idx = src.indexOf('function data()');
    if (idx > 0) src = src.slice(0, idx) + helpers + src.slice(idx);

    const dataNeedle = 'function data() {\n  if (!db) seed();\n  applyQuickBooksSeed();';
    if (src.includes(dataNeedle) && !src.includes('stripDeliveryProductLists(db)')) {
      src = src.replace(
        dataNeedle,
        `function data() {\n  if (!db) seed();\n  applyQuickBooksSeed();\n  try { restoreReceptionCallsFromD1(db); } catch (e) {}\n  try { stripDeliveryProductLists(db); } catch (e) {} // DELIVERY_NO_PRODUCTS_V2`
      );
    }

    src = src.replace(
      'const items = (d.deliveryItems || []).filter(item => item.deliveryId === delivery.id);',
      "const items = []; // DELIVERY_NO_PRODUCTS_V2"
    );
    src = src.replace(
      "productSummary: items.map(i => `${i.productName} x${i.quantity}`).join(', '),",
      "productSummary: '', productCount: 0, totalQty: 0, productsSummary: '', // DELIVERY_NO_PRODUCTS_V2"
    );
    src = src.replace(
      'items: (d.saleItems || []).filter(item => item.saleId === inv.saleId || item.invoiceId === inv.id),',
      'items: [], // DELIVERY_NO_PRODUCTS_V2'
    );
    src = src.replace(
      "productSummary: (d.saleItems || []).filter(item => item.saleId === inv.saleId || item.invoiceId === inv.id).map(i => `${i.productName} x${i.quantity}`).join(', '),",
      "productSummary: '', productCount: 0, totalQty: 0, productsSummary: '', // DELIVERY_NO_PRODUCTS_V2"
    );

    if (src.includes('function resolveInvoiceProductsForDelivery')) {
      src = src.replace(
        /function resolveInvoiceProductsForDelivery\([^)]*\)\s*\{/,
        'function resolveInvoiceProductsForDelivery() { return { items: [], productCount: 0, totalQty: 0, productsSummary: "", productSummary: "" }; /* DELIVERY_NO_PRODUCTS_V2 */\n  if (false) {'
      );
    }
    if (src.includes('function enrichDeliveryRow')) {
      src = src.replace(
        /function enrichDeliveryRow\([^)]*\)\s*\{/,
        'function enrichDeliveryRow(row) { if (row) { row.productCount=0; row.totalQty=0; row.productsSummary=""; row.productSummary=""; row.items=[]; } return row; /* DELIVERY_NO_PRODUCTS_V2 */\n  if (false) {'
      );
    }
    if (src.includes('function enrichDeliveriesList')) {
      src = src.replace(
        /function enrichDeliveriesList\([^)]*\)\s*\{/,
        'function enrichDeliveriesList(list) { return (Array.isArray(list)?list:[]).map(r => { if(r){ r.productCount=0; r.totalQty=0; r.productsSummary=""; r.productSummary=""; r.items=[]; } return r; }); /* DELIVERY_NO_PRODUCTS_V2 */\n  if (false) {'
      );
    }
  }

  if (!src.includes('// RECEPTION_CRM_FORCE_CALLS_V4')) {
    src = src.replace(
      'getCRMWorkspaceData(user, filters = {}) {\n    reqRole(user);',
      `getCRMWorkspaceData(user, filters = {}) {\n    reqRole(user);\n    // RECEPTION_CRM_FORCE_CALLS_V4\n    try { restoreReceptionCallsFromD1(data()); } catch (e) {}\n    try { stripDeliveryProductLists(data()); } catch (e) {} // DELIVERY_NO_PRODUCTS_V2`
    );
  } else if (!src.includes('stripDeliveryProductLists(data())')) {
    src = src.replace(
      '// RECEPTION_CRM_FORCE_CALLS_V4\n    try { restoreReceptionCallsFromD1(data()); } catch (e) {}',
      '// RECEPTION_CRM_FORCE_CALLS_V4\n    try { restoreReceptionCallsFromD1(data()); } catch (e) {}\n    try { stripDeliveryProductLists(data()); } catch (e) {} // DELIVERY_NO_PRODUCTS_V2'
    );
  }

  if (!src.includes('DELIVERY_NO_PRODUCTS_V2_POST')) {
    src = src.replace(
      'deliveries: rows,\n      stats:',
      `deliveries: rows.map(r => { try { return stripDeliveryProductsOnRow(r); } catch(e) { return r; } }), // DELIVERY_NO_PRODUCTS_V2_POST\n      stats:`
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
    let code;
    try { if (fs.existsSync(CACHE) && fs.statSync(CACHE).size > 100000) code = fs.readFileSync(CACHE, 'utf8'); } catch {}
    if (!code || code.includes('PLACEHOLDER') || code.length < 50000) {
      code = await fetchText(GOOD_URL);
      if (!code || code.length < 50000) throw new Error('Failed to load good RPC');
      try { fs.writeFileSync(CACHE, code); } catch {}
    }
    code = applyFixes(code);
    const exp = loadFromSource(code, path.join(__dirname, 'rpc-full.js'));
    cachedHandler = typeof exp === 'function' ? exp : (exp && exp.default) || exp;
    if (typeof cachedHandler !== 'function') throw new Error('RPC export is not a function');
    return cachedHandler;
  })();
  try { return await loadPromise; } catch (e) { loadPromise = null; throw e; }
}

async function handler(req, res) {
  try {
    try {
      const u = new URL(req.url || '/', 'http://localhost');
      if (u.searchParams.get('diag') === 'reception') {
        await getHandler();
        return res.status(200).json({ ok: true, version: 'delivery-no-products-v2', sourceCount: (globalThis.__RECEPTION_CALLS__ || []).length, meta: lastLoadInfo });
      }
    } catch {}
    const body = req.body && typeof req.body === 'object' ? req.body : null;
    if (body && (body.fn === '__receptionStatus' || body.fn === 'receptionStatus')) {
      await getHandler();
      return res.status(200).json({ ok: true, version: 'delivery-no-products-v2', sourceCount: (globalThis.__RECEPTION_CALLS__ || []).length });
    }
    const h = await getHandler();
    return h(req, res);
  } catch (e) {
    console.error('[rpc-bootstrap]', e && e.message);
    if (res && typeof res.status === 'function') return res.status(200).json({ error: 'RPC bootstrap: ' + (e && e.message ? e.message : String(e)) });
  }
}

module.exports = handler;
