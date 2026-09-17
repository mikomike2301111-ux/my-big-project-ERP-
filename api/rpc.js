/**
 * Bootstrap v6.1: merge D1 normalized data into CRM/Sales/Accounts
 * Customers: live from D1 (601). Calls/sales/deliveries: data/*.json
 * Logs: [d1-merge]
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const GOOD_URL =
  process.env.RPC_GOOD_URL ||
  'https://raw.githubusercontent.com/mikomike2301111-ux/ftcerp-to-cloudflare-public/91cacae99d4d2f45b01d94f4dde98230119cc29c/api/rpc.js';

const CACHE = path.join('/tmp', 'farmtrack-rpc-good.js');
let cachedHandler = null;
let loadPromise = null;

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

function tryLoadJson(rel) {
  const paths = [
    path.join(__dirname, '..', 'data', rel),
    path.join(process.cwd(), 'data', rel),
    path.join('/var/task', 'data', rel),
  ];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        console.log('[d1-merge] LOADED', rel, p);
        return j;
      }
    } catch (e) {
      console.warn('[d1-merge] fail', p, e && e.message);
    }
  }
  try {
    return require('../data/' + rel);
  } catch (e) {
    return null;
  }
}

async function fetchCustomersFromD1() {
  const account = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const dbId = String(process.env.CLOUDFLARE_D1_DATABASE_ID || '').trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!account || !dbId || !token) {
    console.warn('[d1-merge] D1 env missing — cannot live-load customers');
    return [];
  }
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${dbId}/query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT id, name, phone, email, city, address, balance, status, created_at FROM customers' }),
    });
    const json = await res.json();
    const rows = (json.result && json.result[0] && json.result[0].results) || [];
    console.log('[d1-merge] live customers from D1 count=' + rows.length);
    return rows.map((r) => ({
      id: r.id,
      name: r.name || '',
      phone: r.phone || '',
      email: r.email || '',
      city: r.city || '',
      address: r.address || '',
      balance: r.balance || 0,
      status: r.status || 'Active',
      createdAt: String(r.created_at || '').replace(' ', 'T'),
      source: 'd1-live-customers',
      isDeleted: 'No',
    }));
  } catch (e) {
    console.warn('[d1-merge] live customers fail', e && e.message);
    return [];
  }
}

function mergeById(existing, incoming, idKey) {
  const list = Array.isArray(existing) ? existing.slice() : [];
  const byId = new Map();
  for (const x of list) {
    if (x && x[idKey]) byId.set(String(x[idKey]), x);
  }
  let added = 0;
  for (const x of incoming || []) {
    if (!x || !x[idKey]) continue;
    const id = String(x[idKey]);
    if (!byId.has(id)) {
      byId.set(id, x);
      added++;
    } else {
      byId.set(id, { ...byId.get(id), ...x });
    }
  }
  return { list: Array.from(byId.values()), added };
}

function applyD1NormalizedMerge(d) {
  if (!d) return;
  const custSnap = globalThis.__D1_CUSTOMERS__ || [];
  if (custSnap.length) {
    const r = mergeById(d.customers, custSnap, 'id');
    d.customers = r.list;
    console.log('[d1-merge] customers total=' + d.customers.length + ' added=' + r.added);
  }
  d.calls = Array.isArray(d.calls)
    ? d.calls.filter((c) => c && !String(c.id || '').startsWith('QBCALL') && !String(c.id || '').startsWith('QB-CALL'))
    : [];
  const callSnap = globalThis.__RECEPTION_CALLS__ || [];
  if (callSnap.length) {
    const r = mergeById(d.calls, callSnap, 'id');
    d.calls = r.list.sort((a, b) =>
      String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || ''))
    );
    console.log('[d1-merge] calls total=' + d.calls.length + ' added=' + r.added);
  }
  const sd = globalThis.__D1_SALES__ || {};
  if (sd.salesOrders && sd.salesOrders.length) {
    const r = mergeById(d.salesOrders || d.sales || [], sd.salesOrders, 'id');
    d.salesOrders = r.list;
    if (Array.isArray(d.sales)) d.sales = r.list;
    console.log('[d1-merge] salesOrders total=' + r.list.length + ' added=' + r.added);
  }
  if (sd.deliveries && sd.deliveries.length) {
    const r = mergeById(d.deliveries, sd.deliveries, 'id');
    d.deliveries = r.list;
    console.log('[d1-merge] deliveries total=' + d.deliveries.length + ' added=' + r.added);
  }
  if (sd.invoices && sd.invoices.length) {
    const r = mergeById(d.invoices, sd.invoices, 'id');
    d.invoices = r.list;
    console.log('[d1-merge] invoices total=' + d.invoices.length + ' added=' + r.added);
  }
  d._d1Merge = {
    at: new Date().toISOString(),
    customers: (d.customers || []).length,
    calls: (d.calls || []).length,
    salesOrders: (d.salesOrders || []).length,
    deliveries: (d.deliveries || []).length,
    invoices: (d.invoices || []).length,
  };
}

function applyFixes(src) {
  if (src.includes('D1_NORMALIZED_MERGE_V61')) return src;

  const prRe = /function periodRange\(period = ['"]Month['"]\)\s*\{[\s\S]*?return \{ startDate:[\s\S]*?\};\s*\}/;
  const prNew = `function periodRange(period = 'Year') { // D1_NORMALIZED_MERGE_V61\n  const cleanPeriod = String(period || 'Year').toLowerCase();\n  let days = 365;\n  if (cleanPeriod.includes('all') || cleanPeriod.includes('history') || cleanPeriod.includes('full') || cleanPeriod.includes('lifetime')) days = 2000;\n  else if (cleanPeriod.includes('day') && !cleanPeriod.includes('today')) days = 1;\n  else if (cleanPeriod.includes('week')) days = 7;\n  else if (cleanPeriod.includes('month')) days = 30;\n  else if (cleanPeriod.includes('quarter')) days = 90;\n  else if (cleanPeriod.includes('year')) days = 365;\n  else days = 365;\n  const end = new Date();\n  const start = new Date();\n  start.setDate(end.getDate() - (days - 1));\n  const label = days === 1 ? 'Day' : days === 7 ? 'Week' : days === 30 ? 'Month' : days === 90 ? 'Quarter' : days >= 2000 ? 'All' : 'Year';\n  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), days, label };\n}`;
  if (prRe.test(src)) src = src.replace(prRe, prNew);

  const dataNeedle = 'function data() {\n  if (!db) seed();\n  applyQuickBooksSeed();';
  const dataInject = `function data() {\n  if (!db) seed();\n  applyQuickBooksSeed();\n  try { if (typeof globalThis.__applyD1Merge === 'function') globalThis.__applyD1Merge(db); } catch (e) { console.warn('[d1-merge] fail', e && e.message); }`;
  if (src.includes(dataNeedle) && !src.includes('__applyD1Merge')) {
    src = src.replace(dataNeedle, dataInject);
  }

  if (!src.includes('// D1_MERGE_CRM_V61')) {
    src = src.replace(
      'getCRMWorkspaceData(user, filters = {}) {\n    reqRole(user);',
      `getCRMWorkspaceData(user, filters = {}) {\n    reqRole(user);\n    // D1_MERGE_CRM_V61\n    try { if (typeof globalThis.__applyD1Merge === 'function') globalThis.__applyD1Merge(data()); } catch (e) {}`
    );
  }
  if (!src.includes('// D1_MERGE_SALES_V61') && src.includes('getSalesWorkspaceData')) {
    src = src.replace(
      /getSalesWorkspaceData\(user,\s*filters\s*=\s*\{\}\)\s*\{\s*reqRole\(user\);/,
      `getSalesWorkspaceData(user, filters = {}) {\n    reqRole(user);\n    // D1_MERGE_SALES_V61\n    try { if (typeof globalThis.__applyD1Merge === 'function') globalThis.__applyD1Merge(data()); } catch (e) {}`
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
    const callsSnap = tryLoadJson('d1-reception-calls.json');
    const salesSnap = tryLoadJson('d1-sales-deliveries.json');
    let customers = await fetchCustomersFromD1();
    if (!customers.length) {
      const custSnap = tryLoadJson('d1-customers.json');
      customers = (custSnap && custSnap.customers) || [];
    }
    globalThis.__RECEPTION_CALLS__ = (callsSnap && callsSnap.calls) || [];
    globalThis.__D1_CUSTOMERS__ = customers;
    globalThis.__D1_SALES__ = salesSnap || {};
    globalThis.__applyD1Merge = applyD1NormalizedMerge;
    console.log(
      '[d1-merge] bootstrap v6.1 calls=' +
        globalThis.__RECEPTION_CALLS__.length +
        ' customers=' +
        customers.length +
        ' sales=' +
        ((salesSnap && salesSnap.salesOrders) || []).length
    );

    let code;
    try {
      if (fs.existsSync(CACHE) && fs.statSync(CACHE).size > 100000) {
        code = fs.readFileSync(CACHE, 'utf8');
      }
    } catch {}
    if (!code || code.includes('PLACEHOLDER') || code.length < 50000) {
      code = await fetchText(GOOD_URL);
      if (!code || code.length < 50000) throw new Error('Failed to load good RPC (' + (code && code.length) + ' bytes)');
      try {
        fs.writeFileSync(CACHE, code);
      } catch {}
    }
    code = applyFixes(code);
    const exp = loadFromSource(code, path.join(__dirname, 'rpc-full.js'));
    cachedHandler = typeof exp === 'function' ? exp : exp && exp.default ? exp.default : exp;
    if (typeof cachedHandler !== 'function') throw new Error('RPC export is not a function');
    console.log('[d1-merge] handler ready v6.1');
    return cachedHandler;
  })();
  try {
    return await loadPromise;
  } catch (e) {
    loadPromise = null;
    throw e;
  }
}

async function handler(req, res) {
  try {
    const hdr = (req.headers && (req.headers['x-reception-status'] || req.headers['x-d1-status'])) || '';
    if (String(hdr) === '1' || String(hdr).toLowerCase() === 'reception') {
      await getHandler();
      return res.status(200).json({
        ok: true,
        version: 'v6.1',
        customers: (globalThis.__D1_CUSTOMERS__ || []).length,
        calls: (globalThis.__RECEPTION_CALLS__ || []).length,
        salesOrders: ((globalThis.__D1_SALES__ || {}).salesOrders || []).length,
        deliveries: ((globalThis.__D1_SALES__ || {}).deliveries || []).length,
        at: new Date().toISOString(),
      });
    }
    const h = await getHandler();
    return h(req, res);
  } catch (e) {
    console.error('[d1-merge] bootstrap error:', e && e.message ? e.message : e);
    if (res && typeof res.status === 'function') {
      return res.status(200).json({ error: 'RPC bootstrap: ' + (e && e.message ? e.message : String(e)) });
    }
  }
}

module.exports = handler;
