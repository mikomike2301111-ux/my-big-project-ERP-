/**
 * Deploy patch: wire QBO finance seed (preserve HR/CRM) + Procurement nav labels.
 * Honors data/qbo-force.json to force re-apply on boot.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rpcPath = path.join(root, 'api', 'rpc.js');
const mainPath = path.join(root, 'src', 'main.jsx');

function patchRpc() {
  if (!fs.existsSync(rpcPath)) return console.log('skip rpc');
  let s = fs.readFileSync(rpcPath, 'utf8');
  if (s.includes('qbo-force.json') && s.includes('importQboFinanceSeed')) {
    console.log('rpc already has QBO force + import wiring');
    return;
  }
  const marker = 'function applyQuickBooksSeed() {';
  const idx = s.indexOf(marker);
  const end = idx >= 0 ? s.indexOf('\nfunction data()', idx) : -1;
  const replacement = `function applyQuickBooksSeed() {
  try {
    var qboSeed = null;
    try { qboSeed = require('../data/qbo-finance-seed.json'); } catch (_) {
      try { qboSeed = require('../data/quickbooks-seed.json'); } catch (__) { return false; }
    }
    if (!db || !qboSeed) return false;
    var force = false;
    try { var f = require('../data/qbo-force.json'); force = !!(f && f.force); } catch (_) {}
    const version = String((qboSeed.meta && (qboSeed.meta.forceVersion || qboSeed.meta.importedAt)) || (force ? 'forced-' + Date.now() : 'qbo-v1'));
    if (!force && db.quickBooksImport && db.quickBooksImport.version === version && db.quickBooksImport.source === 'qbo-finance-seed') return false;
    const FINANCE = ['customers','invoices','payments','products','inventory','suppliers','purchaseOrders','expenses','chartOfAccounts','financeAccounts','estimates','quotations','analyticsMonthlyTrend','analyticsSummary'];
    for (const key of FINANCE) { if (qboSeed[key] !== undefined) db[key] = qboSeed[key]; }
    db.accountsReceivable = (qboSeed.invoices || []).filter(i => Number(i.balance) > 0).map(i => ({
      id: i.id, customerId: i.customerId, customerName: i.customerName, invoiceNo: i.invoiceNo || i.invNo,
      dueDate: i.dueDate, invoiceAmount: i.total, paidAmount: i.paid, outstandingBalance: i.balance, status: i.status, source: i.source || 'QuickBooks'
    }));
    db.procurement = { purchaseOrders: qboSeed.purchaseOrders || [], suppliers: qboSeed.suppliers || [], inventory: qboSeed.inventory || [], products: qboSeed.products || [], label: 'Procurement' };
    if (typeof ensureFarmtrackCatalogue === 'function') ensureFarmtrackCatalogue(db);
    db.quickBooksImport = { version, source: 'qbo-finance-seed', importedAt: new Date().toISOString(), counts: qboSeed.analyticsSummary || {}, forced: force };
    db.activity = Array.isArray(db.activity) ? db.activity : [];
    db.activity.unshift({ id: typeof gid === 'function' ? gid() : 'QBO-' + Date.now(), action: 'QuickBooks finance seed applied', module: 'Finance', detail: 'QBO finance modules replaced; HR/CRM preserved', user: 'System', createdAt: new Date().toISOString() });
    return true;
  } catch (e) { console.error('applyQuickBooksSeed', e && e.message); return false; }
}
`;
  if (idx >= 0 && end > idx) {
    s = s.slice(0, idx) + replacement + s.slice(end);
  } else if (!s.includes('function applyQuickBooksSeed')) {
    const dIdx = s.indexOf('function data()');
    if (dIdx > 0) s = s.slice(0, dIdx) + replacement + '\n' + s.slice(dIdx);
  }
  if (!s.includes('importQboFinanceSeed')) {
    const m = '  async importAccountingBundle(user, bundle = {}) {';
    if (s.includes(m)) {
      s = s.replace(m, `  async importQboFinanceSeed(user) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE);
    let seed; try { seed = require('../data/qbo-finance-seed.json'); } catch (e) {
      try { seed = require('../data/quickbooks-seed.json'); } catch (e2) { throw new Error('qbo seed missing'); }
    }
    const d = data();
    const FINANCE = ['customers','invoices','payments','products','inventory','suppliers','purchaseOrders','expenses','chartOfAccounts','financeAccounts','estimates','quotations','analyticsMonthlyTrend','analyticsSummary'];
    for (const key of FINANCE) { if (seed[key] !== undefined) d[key] = seed[key]; }
    d.accountsReceivable = (seed.invoices || []).filter(i => Number(i.balance) > 0).map(i => ({ id: i.id, customerId: i.customerId, customerName: i.customerName, invoiceNo: i.invoiceNo || i.invNo, dueDate: i.dueDate, invoiceAmount: i.total, paidAmount: i.paid, outstandingBalance: i.balance, status: i.status, source: 'QuickBooks' }));
    d.procurement = { purchaseOrders: seed.purchaseOrders || [], suppliers: seed.suppliers || [], inventory: seed.inventory || [], products: seed.products || [], label: 'Procurement' };
    d.quickBooksImport = { version: String((seed.meta && (seed.meta.forceVersion || seed.meta.importedAt)) || 'force'), source: 'qbo-finance-seed', importedAt: new Date().toISOString(), counts: seed.analyticsSummary || {}, forcedBy: u.name || u.email };
    return { ok: true, counts: seed.analyticsSummary || {} };
  },\n` + m);
    }
  }
  if (!s.includes('applyQuickBooksSeed()') && s.includes('function loadState')) {
    s = s.replace(/function loadState\([^)]*\)\s*\{/, (m) => m + '\n  try { applyQuickBooksSeed(); } catch (_) {}');
  }
  fs.writeFileSync(rpcPath, s);
  console.log('patched api/rpc.js for QBO finance seed');
}

function patchMain() {
  if (!fs.existsSync(mainPath)) return;
  let s = fs.readFileSync(mainPath, 'utf8');
  let b = s.replace(/\{ id: 'inventory', label: 'Inventory', icon: Boxes \}/g, "{ id: 'inventory', label: 'Procurement', icon: Boxes }");
  b = b.replace(/\{ id: 'purchasing', label: 'Purchases', icon: ClipboardCheck \}/g, "{ id: 'purchasing', label: 'Purchase Orders', icon: ClipboardCheck }");
  b = b.replace(/Static sample charts/gi, 'Live from invoices, payments & expenses');
  if (b !== s) {
    fs.writeFileSync(mainPath, b);
    console.log('patched src/main.jsx nav labels → Procurement');
  } else console.log('nav labels already ok');
}

patchRpc();
patchMain();
