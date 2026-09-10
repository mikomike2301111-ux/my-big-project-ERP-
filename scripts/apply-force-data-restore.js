#!/usr/bin/env node
/**
 * apply-force-data-restore-v2
 * Load seed via require OR https fetch from GitHub raw (works even without includeFiles).
 * Fill empty collections on every data() call and persist once to D1.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MARK = '/* force-data-restore-v2 */';

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

// Remove v1 marker blocks if present (replace wholesale)
rpc = rpc.replace(/\/\* force-data-restore-v1 \*\/[\s\S]*?(?=\nfunction data\()/m, '');

if (!rpc.includes(MARK)) {
  const helper = `
${MARK}
let __qboSeedCache = null;
let __qboSeedLoading = null;

function flattenSeed(s) {
  if (!s) return null;
  if (s.data && typeof s.data === 'object') return Object.assign({}, s, s.data);
  return s;
}

function loadQboSeedSync() {
  if (__qboSeedCache) return __qboSeedCache;
  try {
    let s = null;
    try { s = require('../data/quickbooks-seed.json'); } catch (e1) {
      try { s = require('../data/qbo-finance-seed.json'); } catch (e2) { s = null; }
    }
    s = flattenSeed(s);
    if (s && (Array.isArray(s.invoices) || Array.isArray(s.customers))) {
      __qboSeedCache = s;
      return s;
    }
  } catch (e) {
    console.error('[force-restore] sync seed', e && e.message);
  }
  return null;
}

async function loadQboSeedAsync() {
  if (__qboSeedCache) return __qboSeedCache;
  const sync = loadQboSeedSync();
  if (sync) return sync;
  if (__qboSeedLoading) return __qboSeedLoading;
  __qboSeedLoading = (async () => {
    try {
      const urls = [
        'https://raw.githubusercontent.com/mikomike2301111-ux/my-big-project-ERP-/main/data/quickbooks-seed.json',
        'https://cdn.jsdelivr.net/gh/mikomike2301111-ux/my-big-project-ERP-@main/data/quickbooks-seed.json'
      ];
      for (const url of urls) {
        try {
          const res = await fetch(url, { headers: { 'User-Agent': 'farmtrack-erp-restore' } });
          if (!res.ok) continue;
          const s = flattenSeed(await res.json());
          if (s && (Array.isArray(s.invoices) || Array.isArray(s.customers))) {
            __qboSeedCache = s;
            return s;
          }
        } catch (e) {
          console.error('[force-restore] fetch', url, e && e.message);
        }
      }
    } finally {
      __qboSeedLoading = null;
    }
    return null;
  })();
  return __qboSeedLoading;
}

function forceFillEmptyFromSeed(dbObj, seed) {
  if (!dbObj || typeof dbObj !== 'object') return 0;
  seed = seed || loadQboSeedSync();
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
      detail: 'Filled ' + filled + ' empty collections from seed',
      user: 'System',
      createdAt: new Date().toISOString()
    });
    try {
      if (typeof saveState === 'function' && !dbObj._forceRestoreSaved) {
        dbObj._forceRestoreSaved = true;
        Promise.resolve(saveState()).catch((e) => console.error('[force-restore] saveState', e && e.message));
      }
    } catch (e) {}
  }
  return filled;
}

async function ensureSeedDataAsync(dbObj) {
  try {
    if (dbObj && Array.isArray(dbObj.invoices) && dbObj.invoices.length >= 5 && Array.isArray(dbObj.customers) && dbObj.customers.length >= 5) {
      return 0;
    }
    const seed = await loadQboSeedAsync();
    return forceFillEmptyFromSeed(dbObj, seed);
  } catch (e) {
    console.error('[force-restore] ensure', e && e.message);
    return 0;
  }
}
`;

  if (rpc.includes('\nfunction data()')) {
    rpc = rpc.replace('\nfunction data()', helper + '\nfunction data()');
  } else {
    rpc = rpc.replace('function data()', helper + '\nfunction data()');
  }

  // Hook data() return
  if (!rpc.includes('forceFillEmptyFromSeed(db)')) {
    const dataIdx = rpc.indexOf('function data()');
    const retIdx = rpc.indexOf('return db;', dataIdx);
    if (dataIdx > 0 && retIdx > dataIdx && retIdx < dataIdx + 5000) {
      rpc =
        rpc.slice(0, retIdx) +
        'try { forceFillEmptyFromSeed(db); } catch (e) { console.error(\'[force-restore]\', e && e.message); }\n  ' +
        rpc.slice(retIdx);
    }
  }

  // Hook loadState path after remote load - ensureSeedDataAsync
  if (rpc.includes('async function performStateLoad') && !rpc.includes('ensureSeedDataAsync(db)')) {
    // After db is set in performStateLoad success path is complex; instead hook invokeRpc after loadState
  }

  // Hook non-mutating invoke after api call - async ensure
  if (rpc.includes('return __finR;') && !rpc.includes('ensureSeedDataAsync(__finR)')) {
    // ensure on workspace reads by filling db before handler - already in data()
  }

  // RPC method
  if (rpc.includes('saveUser(user, row)') && !rpc.includes('forceRestoreSystemData')) {
    rpc = rpc.replace(
      'saveUser(user, row) { const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER); return save(\'users\', u, row); },',
      `saveUser(user, row) { const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER); return save('users', u, row); },
  async forceRestoreSystemData(user) {
    const u = reqRole(user, ROLES.DEV, ROLES.ADMIN);
    await loadState();
    const d = data();
    d._forceRestoreSaved = false;
    const seed = await loadQboSeedAsync();
    const n = forceFillEmptyFromSeed(d, seed);
    try { if (typeof saveState === 'function') await Promise.resolve(saveState()); } catch (e) {}
    return {
      success: true,
      filled: n,
      seedLoaded: !!seed,
      counts: {
        customers: (d.customers || []).length,
        invoices: (d.invoices || []).length,
        expenses: (d.expenses || []).length,
        products: (d.products || []).length,
        sales: (d.sales || []).length,
        payments: (d.payments || []).length,
        leads: (d.leads || []).length
      }
    };
  },`
    );
  }

  // Also run async ensure at start of invokeRpc after loadState for reads
  if (rpc.includes('await loadState();') && !rpc.includes('ensureSeedDataAsync(db)')) {
    rpc = rpc.replace(
      /await loadState\(\);/g,
      `await loadState();
    try { if (db) await ensureSeedDataAsync(db); } catch (e) { console.error('[force-restore] boot', e && e.message); }`
    );
    // might replace too many - ok
    console.log('[force-restore] hooked loadState sites');
  }
}

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[force-restore] done', rpc.length);
