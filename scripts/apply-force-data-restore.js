#!/usr/bin/env node
/**
 * apply-force-data-restore-v1
 *
 * Guarantees transactional data is visible even when D1 erp_state was wiped:
 * - Loads quickbooks-seed.json (must be includeFiles in vercel.json)
 * - On every data() call, if invoices/customers/expenses are empty, fill from seed
 * - Adds forceRestoreSystemData RPC for admin/dev
 * - Triggers saveState once after restore so D1 gets the data back
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MARK = '/* force-data-restore-v1 */';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[force-restore] SYNTAX', (r.stderr || r.stdout || '').slice(0, 900));
    process.exit(1);
  }
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[force-restore] rpc PLACEHOLDER');
  process.exit(1);
}

if (!rpc.includes(MARK)) {
  const helper = `
${MARK}
function loadQboSeedFlat() {
  try {
    let s = null;
    try { s = require('../data/quickbooks-seed.json'); } catch (e1) {
      try { s = require('../data/qbo-finance-seed.json'); } catch (e2) { return null; }
    }
    if (!s) return null;
    if (s.data && typeof s.data === 'object') s = Object.assign({}, s, s.data);
    return s;
  } catch (e) {
    console.error('[force-restore] seed load', e && e.message);
    return null;
  }
}

function forceFillEmptyFromSeed(dbObj) {
  if (!dbObj || typeof dbObj !== 'object') return 0;
  const seed = loadQboSeedFlat();
  if (!seed) return 0;
  const keys = [
    'customers','invoices','invoiceItems','payments','products','inventory','suppliers',
    'purchaseOrders','expenses','sales','saleItems','leads','calls','bankTransactions',
    'financeAccounts','chartOfAccounts','quotations','estimates'
  ];
  let filled = 0;
  for (const key of keys) {
    if (!Array.isArray(seed[key]) || !seed[key].length) continue;
    if (!Array.isArray(dbObj[key]) || dbObj[key].length < 3) {
      dbObj[key] = seed[key].slice();
      filled++;
    }
  }
  // Always ensure AR derived list
  if (Array.isArray(dbObj.invoices) && dbObj.invoices.length) {
    dbObj.accountsReceivable = dbObj.invoices
      .filter((i) => Number(i.balance) > 0)
      .map((i) => ({
        id: i.id,
        customerId: i.customerId,
        customerName: i.customerName,
        invoiceNo: i.invoiceNo || i.invNo,
        dueDate: i.dueDate,
        invoiceAmount: i.total,
        paidAmount: i.paid,
        outstandingBalance: i.balance,
        status: i.status,
        source: i.source || 'Restored'
      }));
  }
  if (filled > 0) {
    dbObj._forceRestoredAt = new Date().toISOString();
    dbObj._forceRestoredCollections = filled;
    dbObj.activity = Array.isArray(dbObj.activity) ? dbObj.activity : [];
    dbObj.activity.unshift({
      id: 'FORCE-RESTORE-' + Date.now(),
      action: 'Force data restore',
      module: 'System',
      detail: 'Filled ' + filled + ' empty collections from QuickBooks seed',
      user: 'System',
      createdAt: new Date().toISOString()
    });
    // Persist once (fire-and-forget) so D1 is no longer empty
    try {
      if (typeof saveState === 'function' && !dbObj._forceRestoreSaved) {
        dbObj._forceRestoreSaved = true;
        Promise.resolve(saveState()).catch((e) => console.error('[force-restore] saveState', e && e.message));
      }
    } catch (e) {}
  }
  return filled;
}
`;

  // Inject helper before function data()
  if (rpc.includes('\nfunction data()')) {
    rpc = rpc.replace('\nfunction data()', helper + '\nfunction data()');
    console.log('[force-restore] helper injected');
  } else if (rpc.includes('function data()')) {
    rpc = rpc.replace('function data()', helper + '\nfunction data()');
  }

  // Call forceFillEmptyFromSeed at end of data() before return db
  // Match: return db;\n}\n\nconst UOM  OR return db;\n}
  if (!rpc.includes('forceFillEmptyFromSeed(db)')) {
    // Prefer first return db inside data()
    const dataIdx = rpc.indexOf('function data()');
    if (dataIdx > 0) {
      const retIdx = rpc.indexOf('return db;', dataIdx);
      if (retIdx > 0 && retIdx < dataIdx + 4000) {
        rpc =
          rpc.slice(0, retIdx) +
          'try { forceFillEmptyFromSeed(db); } catch (e) { console.error(\'[force-restore]\', e && e.message); }\n  ' +
          rpc.slice(retIdx);
        console.log('[force-restore] hooked data() return');
      }
    }
  }

  // Add API method forceRestoreSystemData near other admin methods if api object exists
  if (rpc.includes('saveUser(user, row)') && !rpc.includes('forceRestoreSystemData')) {
    rpc = rpc.replace(
      'saveUser(user, row) { const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER); return save(\'users\', u, row); },',
      `saveUser(user, row) { const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER); return save('users', u, row); },
  forceRestoreSystemData(user) {
    const u = reqRole(user, ROLES.DEV, ROLES.ADMIN);
    const d = data();
    // Reset flags so fill always runs
    d._forceRestoreSaved = false;
    const n = forceFillEmptyFromSeed(d);
    try { if (typeof saveState === 'function') Promise.resolve(saveState()).catch(() => {}); } catch (e) {}
    return {
      success: true,
      filled: n,
      counts: {
        customers: (d.customers || []).length,
        invoices: (d.invoices || []).length,
        expenses: (d.expenses || []).length,
        products: (d.products || []).length,
        sales: (d.sales || []).length,
        payments: (d.payments || []).length
      }
    };
  },`
    );
    console.log('[force-restore] RPC forceRestoreSystemData added');
  }
}

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[force-restore] done', rpc.length);
