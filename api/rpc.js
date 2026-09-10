const https = require('https');
const Module = require('module');
const path = require('path');

const GOOD_SHA = '2a8c636f4c301871cf440ba61ca756210c5b7285';
const RAW_URL = `https://raw.githubusercontent.com/mikomike2301111-ux/my-big-project-ERP-/${GOOD_SHA}/api/rpc.js`;

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
    }).on('error', reject);
  });
}

function applySeedFlattenFix(src) {
  // Replace applyQuickBooksSeed body start so nested .data is used and force never wipes live rows.
  const marker = 'function applyQuickBooksSeed() {';
  const idx = src.indexOf(marker);
  if (idx < 0) return src;
  const endMarker = '\nfunction data() {';
  const end = src.indexOf(endMarker, idx);
  if (end < 0) return src;
  const fixedFn = `function applyQuickBooksSeed() {
  try {
    var qboSeed = null;
    try { qboSeed = require('../data/qbo-finance-seed.json'); } catch (_) {
      try { qboSeed = require('../data/quickbooks-seed.json'); } catch (__) { return false; }
    }
    if (!db || !qboSeed) return false;
    var source = (qboSeed.data && typeof qboSeed.data === 'object') ? Object.assign({}, qboSeed, qboSeed.data) : qboSeed;
    var force = false;
    const version = String((source.meta && (source.meta.forceVersion || source.meta.importedAt)) || qboSeed.importedAt || 'qbo-v1-nested');
    if (db.quickBooksImport && db.quickBooksImport.version === version && db.quickBooksImport.source === 'qbo-finance-seed') return false;
    const FINANCE = [
      'customers','invoices','invoiceItems','payments','products','inventory','suppliers','purchaseOrders',
      'expenses','chartOfAccounts','financeAccounts','estimates','quotations','analyticsMonthlyTrend','analyticsSummary',
      'sales','saleItems','paymentMethods','leads','calls','bankTransactions','inventoryWarehouses',
      'productionOrders','rawMaterials','rawMaterialBatches','unitOfMeasure','unitConversions','productFormulas',
      'formulaVersions','productionBatches','productionBatchCosts','rawMaterialConsumption','productionStorageHistory',
      'productionQualityChecks','productionDowntime','productionCapacity','productionCalendar','manufacturingDocuments'
    ];
    for (const key of FINANCE) {
      if (source[key] === undefined) continue;
      const existing = db[key];
      const hasLiveArr = Array.isArray(existing) && existing.length > 0;
      const hasLiveObj = existing && typeof existing === 'object' && !Array.isArray(existing) && Object.keys(existing).length > 0;
      if (!hasLiveArr && !hasLiveObj) db[key] = source[key];
    }
    if ((!Array.isArray(db.chartOfAccounts) || !db.chartOfAccounts.length) && Array.isArray(source.financeAccounts) && source.financeAccounts.length) {
      db.chartOfAccounts = source.financeAccounts;
    }
    const invSrc = (Array.isArray(db.invoices) && db.invoices.length) ? db.invoices : (source.invoices || []);
    db.accountsReceivable = invSrc.filter(i => Number(i.balance) > 0).map(i => ({
      id: i.id, customerId: i.customerId, customerName: i.customerName, invoiceNo: i.invoiceNo || i.invNo,
      dueDate: i.dueDate, invoiceAmount: i.total, paidAmount: i.paid, outstandingBalance: i.balance, status: i.status, source: i.source || 'QuickBooks'
    }));
    db.procurement = {
      purchaseOrders: (Array.isArray(db.purchaseOrders) && db.purchaseOrders.length ? db.purchaseOrders : (source.purchaseOrders || [])),
      suppliers: (Array.isArray(db.suppliers) && db.suppliers.length ? db.suppliers : (source.suppliers || [])),
      inventory: (Array.isArray(db.inventory) && db.inventory.length ? db.inventory : (source.inventory || [])),
      products: (Array.isArray(db.products) && db.products.length ? db.products : (source.products || [])),
      label: 'Procurement'
    };
    if (typeof ensureFarmtrackCatalogue === 'function') ensureFarmtrackCatalogue(db);
    db.quickBooksImport = { version, source: 'qbo-finance-seed', importedAt: new Date().toISOString(), counts: source.analyticsSummary || qboSeed.counts || {}, forced: false };
    db.activity = Array.isArray(db.activity) ? db.activity : [];
    db.activity.unshift({ id: typeof gid === 'function' ? gid() : 'QBO-' + Date.now(), action: 'QuickBooks finance seed applied', module: 'Finance', detail: 'Nested seed data filled into empty collections only', user: 'System', createdAt: new Date().toISOString() });
    return true;
  } catch (e) { console.error('applyQuickBooksSeed', e && e.message); return false; }
}
`;
  return src.slice(0, idx) + fixedFn + src.slice(end);
}

let ready = null;
let cachedExports = null;

async function ensureLoaded() {
  if (cachedExports) return cachedExports;
  if (ready) return ready;
  ready = (async () => {
    let src = await fetchText(RAW_URL);
    src = applySeedFlattenFix(src);
    const m = new Module(path.join(__dirname, 'rpc.assembled.js'));
    m.filename = path.join(__dirname, 'rpc.assembled.js');
    m.paths = Module._nodeModulePaths(__dirname);
    m._compile(src, m.filename);
    cachedExports = m.exports;
    return cachedExports;
  })();
  return ready;
}

async function handler(req, res) {
  try {
    const mod = await ensureLoaded();
    return mod(req, res);
  } catch (e) {
    console.error('rpc bootstrap', e && e.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'rpc bootstrap failed', detail: String(e && e.message || e) }));
  }
}

module.exports = handler;
module.exports.invokeRpc = async function invokeRpc() {
  const mod = await ensureLoaded();
  if (typeof mod.invokeRpc === 'function') return mod.invokeRpc.apply(mod, arguments);
  throw new Error('invokeRpc not available');
};
