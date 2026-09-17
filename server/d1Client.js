/**
 * Farmtrack ERP — Cloudflare D1 server client (loader v7)
 * Loads the real implementation from a pinned good blob, then applies dual-write hooks.
 */
const Module = require('module');
const path = require('path');
const https = require('https');
const fs = require('fs');

const SOURCE_URL =
  process.env.D1CLIENT_SOURCE_URL ||
  'https://raw.githubusercontent.com/mikomike2301111-ux/my-big-project-ERP-/b5c8f0900cfadf42bfd55868147c5e4e993a815a/server/d1Client.js';

const CACHE = path.join('/tmp', 'farmtrack-d1client-good.js');
let cached = null;
let loadPromise = null;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'farmtrack-d1-loader' }, timeout: 25000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchText(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function applyV7Patches(src) {
  if (src.includes('DUAL_WRITE_HYDRATE_V7')) return src;

  if (!src.includes("customers: [") && src.includes('const NORMALIZE_TABLE_DEFS = {')) {
    src = src.replace(
      'const NORMALIZE_TABLE_DEFS = {\n  invoices:',
      `const NORMALIZE_TABLE_DEFS = {\n  customers: [\n    ['id', 'id'], ['name', 'name'], ['phone', 'phone'], ['email', 'email'],\n    ['city', 'city'], ['address', 'address'], ['balance', 'balance'], ['status', 'status'],\n    ['created_at', 'createdAt', 'created_at'],\n  ],\n  invoices:`
    );
  }
  if (!src.includes('sales_orders:') && src.includes("calls: [")) {
    src = src.replace(
      `  calls: [\n    ['id', 'id'],\n    ['customer_id', 'customerId'],\n    ['customer_name', 'customerName'],\n    ['phone', 'phone'],\n    ['stage', 'stage'],\n    ['record_type', 'recordType'],\n    ['follow_up_date', 'followUpDate'],\n    ['assigned_to', 'assignedTo'],\n    ['notes', 'notes'],\n    ['date', 'date'],\n  ],\n};`,
      `  calls: [\n    ['id', 'id'],\n    ['customer_id', 'customerId'],\n    ['customer_name', 'customerName'],\n    ['phone', 'phone'],\n    ['stage', 'stage'],\n    ['record_type', 'recordType'],\n    ['follow_up_date', 'followUpDate'],\n    ['assigned_to', 'assignedTo'],\n    ['notes', 'notes'],\n    ['date', 'date'],\n  ],\n  sales_orders: [\n    ['id', 'id'], ['so_no', 'soNo', 'orderNo', 'saleNo'],\n    ['customer_id', 'customerId'], ['customer_name', 'customerName'],\n    ['total', 'total'], ['status', 'status'], ['created_at', 'createdAt', 'date'],\n  ],\n  deliveries: [\n    ['id', 'id'], ['delivery_no', 'deliveryNo', 'dnNo'],\n    ['sale_id', 'saleId', 'salesOrderId'], ['sale_no', 'saleNo', 'soNo'],\n    ['customer_name', 'customerName'], ['status', 'status'],\n    ['driver', 'driver'], ['vehicle', 'vehicle'], ['destination', 'destination'],\n    ['delivery_date', 'deliveryDate', 'date'],\n  ],\n};`
    );
  }

  const oldResolve = "resolveTask({ chunks: chunks.length, bytes: json.length, gen, version: newVersion, writerAt });";
  if (src.includes(oldResolve) && !src.includes('dualWriteFromState')) {
    src = src.replace(
      oldResolve,
      `try { if (typeof dualWriteFromState === 'function') await dualWriteFromState(typeof data === 'object' ? data : null); } catch (e) { console.warn('[dual-write]', e && e.message); }\n      resolveTask({ chunks: chunks.length, bytes: json.length, gen, version: newVersion, writerAt });`
    );
  }

  if (!src.includes('async function dualWriteFromState')) {
    const inject = `\n/** DUAL_WRITE_HYDRATE_V7 */\nasync function dualWriteFromState(data, opts) {\n  opts = opts || {};\n  if (!normalizedStateWritesEnabled() || !data || typeof data !== 'object') return { skipped: true };\n  const maxPer = Number(opts.maxPerTable) > 0 ? Number(opts.maxPerTable) : 200;\n  const map = [['customers','customers'],['calls','calls'],['invoices','invoices'],['payments','payments'],['expenses','expenses'],['requisitions','requisitions'],['sales_orders','salesOrders'],['sales_orders','sales'],['deliveries','deliveries']];\n  const entries = []; const seen = new Set();\n  for (const [table, key] of map) {\n    const arr = Array.isArray(data[key]) ? data[key] : [];\n    let n = 0;\n    for (const row of arr) {\n      if (!row || !row.id) continue;\n      const sid = table + ':' + String(row.id);\n      if (seen.has(sid)) continue;\n      seen.add(sid);\n      entries.push({ table, row });\n      if (++n >= maxPer) break;\n    }\n  }\n  if (!entries.length) return { ok: true, wrote: 0 };\n  try {\n    const results = await upsertStateRows(entries);\n    const ok = results.filter(r => r && r.ok).length;\n    console.log('[dual-write] entries=' + entries.length + ' ok=' + ok);\n    return { ok: true, wrote: ok, total: entries.length };\n  } catch (e) {\n    console.warn('[dual-write] failed:', e && e.message);\n    return { ok: false, error: String(e && e.message || e) };\n  }\n}\nasync function hydrateFromNormalizedTables(data) {\n  if (!data || typeof data !== 'object' || !d1Configured()) return data;\n  const merge = (arrKey, rows, idKey) => {\n    idKey = idKey || 'id';\n    if (!rows || !rows.length) return 0;\n    const list = Array.isArray(data[arrKey]) ? data[arrKey].slice() : [];\n    const byId = new Map();\n    for (const x of list) { if (x && x[idKey] != null) byId.set(String(x[idKey]), x); }\n    let added = 0;\n    for (const r of rows) {\n      if (!r || r[idKey] == null) continue;\n      const id = String(r[idKey]);\n      if (!byId.has(id)) { byId.set(id, r); added++; }\n      else byId.set(id, Object.assign({}, byId.get(id), r));\n    }\n    data[arrKey] = Array.from(byId.values());\n    return added;\n  };\n  try {\n    const customers = await d1All('SELECT id, name, phone, email, city, address, balance, status, created_at FROM customers LIMIT 5000');\n    if (customers.length) {\n      merge('customers', customers.map(r => ({\n        id: r.id, name: r.name || '', phone: r.phone || '', email: r.email || '',\n        city: r.city || '', address: r.address || '', balance: r.balance || 0,\n        status: r.status || 'Active', createdAt: String(r.created_at || '').replace(' ', 'T'),\n        source: 'd1-table', isDeleted: 'No'\n      })));\n      console.log('[hydrate] customers', customers.length);\n    }\n  } catch (e) { console.warn('[hydrate] customers', e && e.message); }\n  try {\n    const calls = await d1All('SELECT id, customer_id, customer_name, phone, stage, record_type, follow_up_date, assigned_to, notes, date, created_at FROM calls LIMIT 2000');\n    if (calls.length) {\n      merge('calls', calls.filter(r => r && r.id && !String(r.id).startsWith('QBCALL')).map(r => ({\n        id: r.id, customerId: r.customer_id || '', customerName: r.customer_name || '', phone: r.phone || '',\n        stage: r.stage || '', recordType: r.record_type || '', followUpDate: r.follow_up_date || '',\n        assignedTo: r.assigned_to || '', notes: r.notes || '', date: r.date || '',\n        createdAt: String(r.created_at || '').replace(' ', 'T'), source: 'd1-table'\n      })));\n      console.log('[hydrate] calls', calls.length);\n    }\n  } catch (e) { console.warn('[hydrate] calls', e && e.message); }\n  try {\n    const sos = await d1All('SELECT id, so_no, customer_id, customer_name, total, status, created_at FROM sales_orders LIMIT 2000');\n    if (sos.length) {\n      const mapped = sos.map(r => ({\n        id: r.id, soNo: r.so_no || '', customerId: r.customer_id || '', customerName: r.customer_name || '',\n        total: r.total || 0, status: r.status || 'Open', createdAt: String(r.created_at || '').replace(' ', 'T'), source: 'd1-table'\n      }));\n      merge('salesOrders', mapped); merge('sales', mapped);\n      console.log('[hydrate] sales_orders', sos.length);\n    }\n  } catch (e) { console.warn('[hydrate] sales_orders', e && e.message); }\n  try {\n    const dels = await d1All('SELECT id, delivery_no, sale_id, sale_no, customer_name, status, driver, vehicle, destination, delivery_date, created_at FROM deliveries LIMIT 2000');\n    if (dels.length) {\n      merge('deliveries', dels.map(r => ({\n        id: r.id, deliveryNo: r.delivery_no || '', saleId: r.sale_id || '', saleNo: r.sale_no || '',\n        customerName: r.customer_name || '', status: r.status || 'pending', driver: r.driver || '',\n        vehicle: r.vehicle || '', destination: r.destination || '', deliveryDate: r.delivery_date || '',\n        createdAt: String(r.created_at || '').replace(' ', 'T'), source: 'd1-table'\n      })));\n      console.log('[hydrate] deliveries', dels.length);\n    }\n  } catch (e) { console.warn('[hydrate] deliveries', e && e.message); }\n  data._hydratedFromTables = new Date().toISOString();\n  return data;\n}\n`;
    src = src.replace('module.exports = {', inject + '\nmodule.exports = {');
    src = src.replace(
      'upsertStateRows,\n  ACCOUNT_ID,',
      'upsertStateRows,\n  dualWriteFromState,\n  hydrateFromNormalizedTables,\n  ACCOUNT_ID,'
    );
  }

  const hydrateHook = `try { if (pointerDoc.data && typeof hydrateFromNormalizedTables === 'function') await hydrateFromNormalizedTables(pointerDoc.data); } catch (e) { console.warn('[hydrate]', e && e.message); }\n    return pointerDoc;`;
  if (src.includes('return pointerDoc;\n  }') && !src.includes('hydrateFromNormalizedTables(pointerDoc')) {
    src = src.replace(
      `    return pointerDoc;\n  }\n  if (legacyDoc && legacyDoc.data) return legacyDoc;`,
      `    ${hydrateHook}\n  }\n  if (legacyDoc && legacyDoc.data) return legacyDoc;`
    );
  }
  return src;
}

function loadModule(code, filename) {
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(code, filename);
  return mod.exports;
}

async function getImpl() {
  if (cached) return cached;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    let code;
    try {
      if (fs.existsSync(CACHE) && fs.statSync(CACHE).size > 10000) {
        code = fs.readFileSync(CACHE, 'utf8');
      }
    } catch (_) {}
    if (!code || code.includes('PLACEHOLDER') || code.includes('TEMP - will be replaced') || code.length < 10000) {
      code = await fetchText(SOURCE_URL);
      if (!code || code.length < 10000) throw new Error('Failed to load d1Client source');
      try { fs.writeFileSync(CACHE, code); } catch (_) {}
    }
    code = applyV7Patches(code);
    cached = loadModule(code, path.join(__dirname, 'd1Client-full.js'));
    console.log('[d1Client] loader v7 ready exports=' + Object.keys(cached || {}).join(','));
    return cached;
  })();
  try {
    return await loadPromise;
  } catch (e) {
    loadPromise = null;
    throw e;
  }
}

function proxyAsync(name) {
  return async function () {
    const impl = await getImpl();
    if (!impl[name]) throw new Error('d1Client missing ' + name);
    return impl[name].apply(impl, arguments);
  };
}

const exportsObj = {
  d1Configured: proxyAsync('d1Configured'),
  d1Query: proxyAsync('d1Query'),
  d1All: proxyAsync('d1All'),
  d1First: proxyAsync('d1First'),
  getErpStateDocument: proxyAsync('getErpStateDocument'),
  saveErpStateDocument: proxyAsync('saveErpStateDocument'),
  cleanupStaleStageRows: proxyAsync('cleanupStaleStageRows'),
  parsePointer: function () { throw new Error('d1Client not loaded yet — call an async method first'); },
  readPointerVersion: proxyAsync('readPointerVersion'),
  warnMisconfigurationOnce: function () {},
  probeD1: proxyAsync('probeD1'),
  normalizedStateWritesEnabled: function () {
    const v = String(process.env.NORMALIZED_WRITES_DISABLED || process.env.FAST_SAVE_DISABLE || '').trim().toLowerCase();
    return !(v === '1' || v === 'true' || v === 'yes');
  },
  upsertStateRows: proxyAsync('upsertStateRows'),
  dualWriteFromState: proxyAsync('dualWriteFromState'),
  hydrateFromNormalizedTables: proxyAsync('hydrateFromNormalizedTables'),
  ACCOUNT_ID: String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim(),
  DATABASE_ID: String(process.env.CLOUDFLARE_D1_DATABASE_ID || '').trim(),
  _load: getImpl,
};

getImpl().then((impl) => {
  try {
    Object.assign(exportsObj, impl);
    console.log('[d1Client] warmed');
  } catch (_) {}
}).catch((e) => console.warn('[d1Client] warm failed', e && e.message));

module.exports = exportsObj;
