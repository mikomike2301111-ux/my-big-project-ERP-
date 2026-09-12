const https = require('https');
const Module = require('module');
const path = require('path');

const GOOD_SHA = '2a8c636f4c301871cf440ba61ca756210c5b7285';
const RAW_URL = `https://raw.githubusercontent.com/mikomike2301111-ux/my-big-project-ERP-/${GOOD_SHA}/api/rpc.js`;
const SEED_URL = `https://raw.githubusercontent.com/mikomike2301111-ux/my-big-project-ERP-/${GOOD_SHA}/data/quickbooks-seed.json`;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'erp-bootstrap' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error('fetch ' + url + ' status ' + res.statusCode));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function applyPatches(src) {
  // Expand periodRange so All/Year show full history (not only last few days)
  src = src.replace(
    /function periodRange\(period = 'Month'\) \{[\s\S]*?return \{ startDate: start\.toISOString\(\)\.slice\(0, 10\), endDate: end\.toISOString\(\)\.slice\(0, 10\), days, label \};\n\}/,
    `function periodRange(period = 'Year') {
  const cleanPeriod = String(period || 'Year').toLowerCase();
  let days = 365;
  if (cleanPeriod.includes('day') && !cleanPeriod.includes('all')) days = 1;
  else if (cleanPeriod.includes('week')) days = 7;
  else if (cleanPeriod.includes('month') && !cleanPeriod.includes('all')) days = 30;
  else if (cleanPeriod.includes('quarter')) days = 90;
  else if (cleanPeriod.includes('all') || cleanPeriod.includes('history') || cleanPeriod.includes('full')) days = 2000;
  else if (cleanPeriod.includes('year')) days = 800;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  const label = days === 1 ? 'Day' : days === 7 ? 'Week' : days === 90 ? 'Quarter' : days >= 800 ? (days >= 2000 ? 'All' : 'Year') : 'Month';
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), days, label };
}`
  );

  // Replace applyQuickBooksSeed — fill empty OR upgrade when seed has more rows
  const oldStart = src.indexOf('function applyQuickBooksSeed()');
  if (oldStart >= 0) {
    let brace = 0, end = -1, started = false;
    for (let i = oldStart; i < src.length; i++) {
      if (src[i] === '{') { brace++; started = true; }
      else if (src[i] === '}') { brace--; if (started && brace === 0) { end = i + 1; break; } }
    }
    if (end > 0) {
      const replacement = `function applyQuickBooksSeed() {
  try {
    var qboSeed = null;
    try { qboSeed = require('../data/qbo-finance-seed.json'); } catch (_) {
      try { qboSeed = require('../data/quickbooks-seed.json'); } catch (__) { return false; }
    }
    if (!db || !qboSeed) return false;
    var source = (qboSeed.data && typeof qboSeed.data === 'object') ? Object.assign({}, qboSeed, qboSeed.data) : qboSeed;
    const version = String(qboSeed.importedAt || 'qbo-v2-full-history');
    const FINANCE = [
      'customers','invoices','invoiceItems','payments','products','inventory','suppliers','purchaseOrders',
      'expenses','chartOfAccounts','financeAccounts','estimates','quotations','analyticsMonthlyTrend','analyticsSummary',
      'sales','saleItems','paymentMethods','leads','calls','bankTransactions','inventoryWarehouses',
      'productionOrders','rawMaterials','rawMaterialBatches','unitOfMeasure','unitConversions','productFormulas',
      'formulaVersions','productionBatches','productionBatchCosts','rawMaterialConsumption','productionStorageHistory',
      'productionQualityChecks','productionDowntime','productionCapacity','productionCalendar','manufacturingDocuments',
      'deliveries','deliveryItems'
    ];
    let upgraded = 0;
    for (const key of FINANCE) {
      if (source[key] === undefined) continue;
      const seedArr = source[key];
      const existing = db[key];
      const seedLen = Array.isArray(seedArr) ? seedArr.length : (seedArr && typeof seedArr === 'object' ? Object.keys(seedArr).length : 0);
      const liveLen = Array.isArray(existing) ? existing.length : (existing && typeof existing === 'object' ? Object.keys(existing).length : 0);
      if (seedLen === 0) continue;
      if (liveLen === 0) {
        db[key] = seedArr;
        upgraded++;
      } else if (Array.isArray(seedArr) && Array.isArray(existing) && seedLen > liveLen) {
        const byId = {};
        existing.forEach(r => { if (r && r.id) byId[r.id] = r; });
        seedArr.forEach(r => { if (r && r.id && !byId[r.id]) byId[r.id] = r; });
        db[key] = Object.values(byId);
        if (db[key].length < seedLen) {
          const liveIds = new Set(existing.map(r => r && r.id).filter(Boolean));
          const extras = seedArr.filter(r => r && r.id && !liveIds.has(r.id));
          db[key] = existing.concat(extras);
        }
        upgraded++;
      }
    }
    if ((!Array.isArray(db.chartOfAccounts) || !db.chartOfAccounts.length) && Array.isArray(source.financeAccounts) && source.financeAccounts.length) {
      db.chartOfAccounts = source.financeAccounts;
    }
    if (!Array.isArray(db.deliveries) || !db.deliveries.length) {
      const invs = Array.isArray(db.invoices) ? db.invoices : (source.invoices || []);
      const custs = Array.isArray(db.customers) ? db.customers : (source.customers || []);
      const byId = {};
      custs.forEach(c => { if (c && c.id) byId[c.id] = c; });
      db.deliveries = invs.slice(0, 80).map((inv, i) => {
        const cust = byId[inv.customerId] || {};
        const dest = [cust.city, cust.address, cust.name].filter(Boolean).join(' — ') || inv.customerName || 'Customer site';
        return {
          id: 'DEL-' + (inv.id || i), deliveryId: 'DEL-' + (inv.invNo || inv.id || i),
          invoiceId: inv.id, saleId: inv.saleId || inv.id, date: inv.date || inv.createdAt,
          saleNo: inv.saleNo || '', invoiceNo: inv.invNo || inv.invoiceNo || '',
          customerId: inv.customerId, customerName: inv.customerName, name: inv.customerName,
          phone: cust.phone || '', destination: dest, method: 'Road',
          status: Number(inv.balance) > 0 ? 'Pending' : 'Delivered',
          createdAt: inv.createdAt || new Date().toISOString()
        };
      });
    } else {
      const custs = Array.isArray(db.customers) ? db.customers : [];
      const byId = {};
      custs.forEach(c => { if (c && c.id) byId[c.id] = c; });
      db.deliveries = db.deliveries.map(del => {
        if (del.destination && del.destination !== 'Destination not set') return del;
        const cust = byId[del.customerId] || custs.find(c => c.name === del.customerName) || {};
        const dest = [cust.city, cust.address, cust.name || del.customerName].filter(Boolean).join(' — ') || del.customerName || 'Customer site';
        return Object.assign({}, del, { destination: dest });
      });
    }
    const invSrc = Array.isArray(db.invoices) ? db.invoices : [];
    db.accountsReceivable = invSrc.filter(i => Number(i.balance) > 0).map(i => ({
      id: i.id, customerId: i.customerId, customerName: i.customerName, invoiceNo: i.invoiceNo || i.invNo,
      dueDate: i.dueDate, invoiceAmount: i.total, paidAmount: i.paid, outstandingBalance: i.balance, status: i.status, source: i.source || 'QuickBooks'
    }));
    if (typeof ensureFarmtrackCatalogue === 'function') ensureFarmtrackCatalogue(db);
    db.quickBooksImport = { version, source: 'qbo-finance-seed', importedAt: new Date().toISOString(), counts: source.counts || {}, upgraded };
    return upgraded > 0;
  } catch (e) { console.error('applyQuickBooksSeed', e && e.message); return false; }
}`;
      src = src.slice(0, oldStart) + replacement + src.slice(end);
    }
  }

  // Quieter notifications
  src = src.replace('alerts: list.slice(0, 200),', 'alerts: list.filter(n => n.priority === "critical" || n.priority === "high" || !n.auto).slice(0, 25),');
  src = src.replace(
    'recent: [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8)',
    'recent: [...all].filter(n => n.priority === "critical" || n.priority === "high" || !n.auto).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5)'
  );
  src = src.replace(
    "else if (reorder && qty <= reorder) emit('inventory', 'high',",
    "else if (reorder && qty <= reorder && qty <= Math.max(1, reorder * 0.5)) emit('inventory', 'high',"
  );

  const forceFn = `
  forceRestoreSystemData(user) {
    try {
      reqRole(user, ROLES.DEV, ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.EXECUTIVE, ROLES.MANAGER);
      const d = data();
      let seed = null;
      try { seed = require('../data/quickbooks-seed.json'); } catch (e) { seed = null; }
      const source = (seed && seed.data) ? Object.assign({}, seed, seed.data) : (seed || {});
      const keys = ['customers','invoices','invoiceItems','expenses','products','inventory','sales','saleItems','leads','calls','bankTransactions','productionOrders','rawMaterials','rawMaterialBatches','productFormulas','formulaVersions','productionBatches','unitOfMeasure','unitConversions','paymentMethods','deliveries','deliveryItems','suppliers','purchaseOrders','productionBatchCosts','rawMaterialConsumption','productionQualityChecks'];
      let filled = 0;
      const counts = {};
      for (const k of keys) {
        const srcArr = source[k];
        if (!Array.isArray(srcArr) || !srcArr.length) {
          counts[k] = Array.isArray(d[k]) ? d[k].length : 0;
          continue;
        }
        if (!Array.isArray(d[k]) || d[k].length === 0) {
          d[k] = srcArr.slice();
          filled++;
        } else if (srcArr.length > d[k].length) {
          const byId = {};
          d[k].forEach(r => { if (r && r.id) byId[r.id] = r; });
          srcArr.forEach(r => { if (r && r.id && !byId[r.id]) byId[r.id] = r; });
          const merged = Object.values(byId);
          if (merged.length > d[k].length) { d[k] = merged; filled++; }
          else if (srcArr.length > d[k].length * 1.2) { d[k] = srcArr.slice(); filled++; }
        }
        counts[k] = Array.isArray(d[k]) ? d[k].length : 0;
      }
      if (Array.isArray(d.productionOrders) && d.productionOrders.length) {
        if (!Array.isArray(d.production) || !d.production.length) d.production = d.productionOrders;
      }
      if (typeof saveState === 'function') { try { const p = saveState(); if (p && typeof p.then === 'function') p.catch(() => {}); } catch (_) {} }
      return { success: true, filled, counts, note: 'Full history merged from QBO seed (expenses/sales/CRM/manufacturing)' };
    } catch (e) {
      return { success: false, error: (e && e.message) || String(e) };
    }
  },
`;
  if (src.includes('forceRestoreSystemData')) {
    const fs = src.indexOf('forceRestoreSystemData');
    let methodStart = src.lastIndexOf('\n', fs);
    let bi = src.indexOf('{', fs);
    let brace = 0, methodEnd = bi;
    for (let i = bi; i < src.length; i++) {
      if (src[i] === '{') brace++;
      else if (src[i] === '}') { brace--; if (brace === 0) { methodEnd = i + 1; break; } }
    }
    if (src[methodEnd] === ',') methodEnd++;
    src = src.slice(0, methodStart + 1) + forceFn + src.slice(methodEnd);
  } else {
    const marker = 'getFinanceWorkspaceData(';
    const mi = src.indexOf(marker);
    if (mi > 0) {
      let ins = mi;
      while (ins > 0 && src[ins] !== '\n') ins--;
      src = src.slice(0, ins + 1) + forceFn + src.slice(ins + 1);
    }
  }

  return src;
}

let cached = null;
let loadPromise = null;

async function ensureLoaded() {
  if (cached) return cached;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    let src = await fetchText(RAW_URL);
    src = applyPatches(src);
    const filename = path.join(__dirname, 'rpc.assembled.js');
    const m = new Module(filename);
    m.filename = filename;
    m.paths = Module._nodeModulePaths(__dirname);
    m._compile(src, filename);
    cached = m.exports;
    return cached;
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
    const mod = await ensureLoaded();
    if (typeof mod === 'function') return mod(req, res);
    if (mod && typeof mod.default === 'function') return mod.default(req, res);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'handler not found' }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: (e && e.message) || String(e) }));
  }
}

handler.invokeRpc = async function () {
  const mod = await ensureLoaded();
  if (mod && typeof mod.invokeRpc === 'function') return mod.invokeRpc.apply(mod, arguments);
  throw new Error('invokeRpc not available');
};

module.exports = handler;
module.exports.invokeRpc = handler.invokeRpc;
