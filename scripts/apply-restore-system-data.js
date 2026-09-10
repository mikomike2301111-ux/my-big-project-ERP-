#!/usr/bin/env node
/**
 * apply-restore-system-data-v1
 *
 * CRITICAL production recovery:
 * 1) Disable qbo-force forever in code path
 * 2) applyQuickBooksSeed must flatten seed.data and ONLY fill empty collections
 * 3) One-time recovery: if invoices/customers empty, load from quickbooks-seed.json
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const FORCE = path.join(root, 'data', 'qbo-force.json');
const MARK = '/* restore-system-data-v1 */';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[restore] SYNTAX', (r.stderr || r.stdout || '').slice(0, 900));
    process.exit(1);
  }
}

// Ensure force file is off
try {
  fs.writeFileSync(
    FORCE,
    JSON.stringify(
      {
        force: false,
        version: 'qbo-disabled-2026-09-10',
        note: 'FORCE DISABLED — do not set force:true in production',
        disabledAt: new Date().toISOString()
      },
      null,
      2
    )
  );
  console.log('[restore] qbo-force.json force=false');
} catch (e) {
  console.warn('[restore] could not write qbo-force', e && e.message);
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[restore] rpc PLACEHOLDER');
  process.exit(1);
}

if (!rpc.includes(MARK)) {
  // Replace applyQuickBooksSeed function body with a safe version
  const start = rpc.indexOf('function applyQuickBooksSeed');
  if (start < 0) {
    console.warn('[restore] applyQuickBooksSeed not found');
  } else {
    // Find matching closing brace of function — crude: next "\nfunction data("
    const endMarker = '\nfunction data()';
    let end = rpc.indexOf(endMarker, start);
    if (end < 0) end = rpc.indexOf('\nfunction data (', start);
    if (end < 0) {
      console.error('[restore] could not find end of applyQuickBooksSeed');
      process.exit(1);
    }

    const safeFn = `
function applyQuickBooksSeed() {
  ${MARK}
  try {
    // HARD DISABLE force flag — never wipe live production data
    var qboSeed = null;
    try { qboSeed = require('../data/qbo-finance-seed.json'); } catch (_) {
      try { qboSeed = require('../data/quickbooks-seed.json'); } catch (__) { return false; }
    }
    if (!db || !qboSeed) return false;

    // Flatten nested { data: { customers, invoices, ... } } shape
    if (qboSeed.data && typeof qboSeed.data === 'object') {
      qboSeed = Object.assign({}, qboSeed, qboSeed.data);
    }

    const version = String(
      (qboSeed.meta && (qboSeed.meta.forceVersion || qboSeed.meta.importedAt)) ||
      qboSeed.importedAt ||
      qboSeed.version ||
      'qbo-v-safe-1'
    );

    // Already recovered with this version — skip
    if (db.quickBooksImport && db.quickBooksImport.version === version && db.quickBooksImport.source === 'qbo-safe-restore') {
      return false;
    }

    const FINANCE = [
      'customers','invoices','invoiceItems','payments','products','inventory','suppliers',
      'purchaseOrders','expenses','chartOfAccounts','financeAccounts','estimates','quotations',
      'sales','saleItems','leads','calls','bankTransactions','accountsReceivable'
    ];

    let filled = 0;
    for (const key of FINANCE) {
      if (qboSeed[key] === undefined) continue;
      const existing = db[key];
      const hasLiveArr = Array.isArray(existing) && existing.length > 0;
      const hasLiveObj = existing && typeof existing === 'object' && !Array.isArray(existing) && Object.keys(existing).length > 0;
      // ONLY fill when empty — never overwrite live rows
      if (!hasLiveArr && !hasLiveObj) {
        db[key] = Array.isArray(qboSeed[key]) ? qboSeed[key].slice() : qboSeed[key];
        filled++;
      }
    }

    // One-time emergency recovery if still empty after prior wipe
    if ((!Array.isArray(db.invoices) || db.invoices.length < 5) && Array.isArray(qboSeed.invoices) && qboSeed.invoices.length) {
      db.invoices = qboSeed.invoices.slice();
      filled++;
    }
    if ((!Array.isArray(db.invoiceItems) || db.invoiceItems.length < 5) && Array.isArray(qboSeed.invoiceItems) && qboSeed.invoiceItems.length) {
      db.invoiceItems = qboSeed.invoiceItems.slice();
      filled++;
    }
    if ((!Array.isArray(db.expenses) || db.expenses.length < 5) && Array.isArray(qboSeed.expenses) && qboSeed.expenses.length) {
      db.expenses = qboSeed.expenses.slice();
      filled++;
    }
    if ((!Array.isArray(db.customers) || db.customers.length < 20) && Array.isArray(qboSeed.customers) && qboSeed.customers.length) {
      // Merge by id/name — prefer longer list
      const byKey = new Map();
      for (const c of (db.customers || [])) {
        const k = String(c.id || c.name || '').toLowerCase();
        if (k) byKey.set(k, c);
      }
      for (const c of qboSeed.customers) {
        const k = String(c.id || c.name || '').toLowerCase();
        if (k && !byKey.has(k)) byKey.set(k, c);
      }
      db.customers = Array.from(byKey.values());
      filled++;
    }
    if ((!Array.isArray(db.products) || db.products.length < 5) && Array.isArray(qboSeed.products)) {
      db.products = qboSeed.products.slice();
      filled++;
    }
    if ((!Array.isArray(db.payments) || db.payments.length < 1) && Array.isArray(qboSeed.payments)) {
      db.payments = qboSeed.payments.slice();
      filled++;
    }
    if ((!Array.isArray(db.sales) || db.sales.length < 1) && Array.isArray(qboSeed.sales)) {
      db.sales = qboSeed.sales.slice();
      filled++;
    }
    if ((!Array.isArray(db.saleItems) || db.saleItems.length < 1) && Array.isArray(qboSeed.saleItems)) {
      db.saleItems = qboSeed.saleItems.slice();
      filled++;
    }
    if ((!Array.isArray(db.suppliers) || db.suppliers.length < 1) && Array.isArray(qboSeed.suppliers)) {
      db.suppliers = qboSeed.suppliers.slice();
      filled++;
    }

    if (Array.isArray(db.invoices) && db.invoices.length) {
      db.accountsReceivable = db.invoices.filter(i => Number(i.balance) > 0).map(i => ({
        id: i.id,
        customerId: i.customerId,
        customerName: i.customerName,
        invoiceNo: i.invoiceNo || i.invNo,
        dueDate: i.dueDate,
        invoiceAmount: i.total,
        paidAmount: i.paid,
        outstandingBalance: i.balance,
        status: i.status,
        source: i.source || 'QuickBooks'
      }));
    }

    if (typeof ensureFarmtrackCatalogue === 'function') ensureFarmtrackCatalogue(db);

    db.quickBooksImport = {
      version,
      source: 'qbo-safe-restore',
      importedAt: new Date().toISOString(),
      filled,
      forced: false
    };
    db.activity = Array.isArray(db.activity) ? db.activity : [];
    if (filled > 0) {
      db.activity.unshift({
        id: typeof gid === 'function' ? gid() : 'QBO-SAFE-' + Date.now(),
        action: 'Safe data restore',
        module: 'System',
        detail: 'Filled ' + filled + ' empty collections from seed (no overwrite of live rows)',
        user: 'System',
        createdAt: new Date().toISOString()
      });
    }
    return filled > 0;
  } catch (e) {
    console.error('applyQuickBooksSeed safe', e && e.message);
    return false;
  }
}
`;

    rpc = rpc.slice(0, start) + safeFn + rpc.slice(end);
    console.log('[restore] replaced applyQuickBooksSeed with safe restore');
  }

  // Also neutralize any remaining force reads
  rpc = rpc.replace(
    /force = !!\(f && f\.force\)/g,
    'force = false /* restore-system-data-v1: force disabled */'
  );
}

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[restore] done', rpc.length);
