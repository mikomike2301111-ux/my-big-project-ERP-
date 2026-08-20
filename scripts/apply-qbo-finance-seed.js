/**
 * Deploy patch: wire QBO finance seed (preserve HR/CRM) + Procurement nav labels.
 * Safe to re-run.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rpcPath = path.join(root, 'api', 'rpc.js');
const mainPath = path.join(root, 'src', 'main.jsx');

function patchRpc() {
  if (!fs.existsSync(rpcPath)) return console.log('skip rpc');
  let s = fs.readFileSync(rpcPath, 'utf8');
  if (s.includes("require('../data/qbo-finance-seed.json')") && s.includes('importQboFinanceSeed')) {
    console.log('rpc already has QBO finance seed wiring');
    return;
  }
  const marker = 'function applyQuickBooksSeed() {';
  const idx = s.indexOf(marker);
  if (idx < 0) return console.log('applyQuickBooksSeed not found');
  const end = s.indexOf('\nfunction data()', idx);
  if (end < 0) return console.log('data() not found after applyQuickBooksSeed');
  const replacement = `function applyQuickBooksSeed() {
  try {
    var qboSeed = null;
    try { qboSeed = require('../data/qbo-finance-seed.json'); } catch (_) { return false; }
    if (!db || !qboSeed) return false;
    const version = String((qboSeed.meta && qboSeed.meta.importedAt) || 'qbo-v1');
    if (db.quickBooksImport && db.quickBooksImport.version === version && db.quickBooksImport.source === 'qbo-finance-seed') return false;
    const FINANCE = ['customers','invoices','payments','products','inventory','suppliers','purchaseOrders','expenses','chartOfAccounts','financeAccounts','estimates','quotations','analyticsMonthlyTrend','analyticsSummary'];
    for (const key of FINANCE) { if (qboSeed[key] !== undefined) db[key] = qboSeed[key]; }
    db.accountsReceivable = (qboSeed.invoices || []).filter(i => Number(i.balance) > 0).map(i => ({
      id: i.id, customerId: i.customerId, customerName: i.customerName, invoiceNo: i.invoiceNo || i.invNo,
      dueDate: i.dueDate, invoiceAmount: i.total, paidAmount: i.paid, outstandingBalance: i.balance, status: i.status, source: i.source || 'QuickBooks'
    }));
    db.procurement = { purchaseOrders: qboSeed.purchaseOrders || [], suppliers: qboSeed.suppliers || [], inventory: qboSeed.inventory || [], products: qboSeed.products || [], label: 'Procurement' };
    if (typeof ensureFarmtrackCatalogue === 'function') ensureFarmtrackCatalogue(db);
    db.quickBooksImport = { version, source: 'qbo-finance-seed', importedAt: new Date().toISOString(), counts: qboSeed.analyticsSummary || {} };
    db.activity = Array.isArray(db.activity) ? db.activity : [];
    db.activity.unshift({ id: gid(), action: 'QuickBooks finance seed applied', module: 'Finance', detail: 'QBO finance modules replaced; HR/CRM preserved', user: 'System', createdAt: new Date().toISOString() });
    return true;
  } catch (e) { console.error('applyQuickBooksSeed', e && e.message); return false; }
}
`;
  s = s.slice(0, idx) + replacement + s.slice(end);
  if (!s.includes('importQboFinanceSeed')) {
    const m = '  async importAccountingBundle(user, bundle = {}) {';
    if (s.includes(m)) {
      s = s.replace(m, `  async importQboFinanceSeed(user) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE);
    let seed; try { seed = require('../data/qbo-finance-seed.json'); } catch (e) { throw new Error('qbo-finance-seed.json missing'); }
    const d = data();
    const FINANCE = ['customers','invoices','payments','products','inventory','suppliers','purchaseOrders','expenses','chartOfAccounts','financeAccounts','estimates','quotations','analyticsMonthlyTrend','analyticsSummary'];
    for (const key of FINANCE) { if (seed[key] !== undefined) d[key] = seed[key]; }
    d.accountsReceivable = (seed.invoices || []).filter(i => Number(i.balance) > 0).map(i => ({ id: i.id, customerId: i.customerId, customerName: i.customerName, invoiceNo: i.invoiceNo || i.invNo, dueDate: i.dueDate, invoiceAmount: i.total, paidAmount: i.paid, outstandingBalance: i.balance, status: i.status, source: 'QuickBooks' }));
    d.procurement = { purchaseOrders: seed.purchaseOrders || [], suppliers: seed.suppliers || [], inventory: seed.inventory || [], products: seed.products || [], label: 'Procurement' };
    d.quickBooksImport = { version: String((seed.meta && seed.meta.importedAt) || 'force'), source: 'qbo-finance-seed', importedAt: new Date().toISOString(), counts: seed.analyticsSummary || {}, forcedBy: u.name || u.email };
    return { ok: true, counts: seed.analyticsSummary || {} };
  },
` + m);
    }
  }
  fs.writeFileSync(rpcPath, s);
  console.log('patched api/rpc.js for QBO finance seed');
}

function patchMain() {
  if (!fs.existsSync(mainPath)) return;
  let s = fs.readFileSync(mainPath, 'utf8');
  const a = s.replace("{ id: 'inventory', label: 'Inventory', icon: Boxes },", "{ id: 'inventory', label: 'Procurement', icon: Boxes },");
  const b = a.replace("{ id: 'purchasing', label: 'Purchases', icon: ClipboardCheck },", "{ id: 'purchasing', label: 'Purchase Orders', icon: ClipboardCheck },");
  if (b !== s) {
    fs.writeFileSync(mainPath, b);
    console.log('patched src/main.jsx nav labels → Procurement / Purchase Orders');
  } else {
    console.log('nav labels already updated or pattern not found');
  }
}

patchRpc();
patchMain();
