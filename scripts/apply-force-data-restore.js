#!/usr/bin/env node
/**
 * apply-force-data-restore-v3
 * Self-contained restore: RPC method embeds fetch+fill (no external helper deps).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MARK = '/* force-data-restore-v3 */';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[force-restore] SYNTAX', (r.stderr || r.stdout || '').slice(0, 1200));
    process.exit(1);
  }
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[force-restore] rpc PLACEHOLDER');
  process.exit(1);
}

if (!rpc.includes(MARK)) {
  // Remove broken prior forceRestoreSystemData if present
  rpc = rpc.replace(/\n\s*async forceRestoreSystemData\(user\) \{[\s\S]*?\n\s*\},\n/g, '\n');
  rpc = rpc.replace(/\n\s*forceRestoreSystemData\(user\) \{[\s\S]*?\n\s*\},\n/g, '\n');

  const method = `
  ${MARK}
  async forceRestoreSystemData(user) {
    const u = reqRole(user, ROLES.DEV, ROLES.ADMIN);
    await loadState();
    if (!db) seed();
    const d = db;
    let seedObj = null;
    try { seedObj = require('../data/quickbooks-seed.json'); } catch (e1) {
      try { seedObj = require('../data/qbo-finance-seed.json'); } catch (e2) { seedObj = null; }
    }
    if (!seedObj) {
      const urls = [
        'https://raw.githubusercontent.com/mikomike2301111-ux/my-big-project-ERP-/main/data/quickbooks-seed.json',
        'https://cdn.jsdelivr.net/gh/mikomike2301111-ux/my-big-project-ERP-@main/data/quickbooks-seed.json'
      ];
      for (const url of urls) {
        try {
          const res = await fetch(url, { headers: { 'User-Agent': 'farmtrack-erp-restore' } });
          if (res.ok) { seedObj = await res.json(); break; }
        } catch (e) { console.error('[force-restore] fetch', url, e && e.message); }
      }
    }
    if (seedObj && seedObj.data && typeof seedObj.data === 'object') {
      seedObj = Object.assign({}, seedObj, seedObj.data);
    }
    if (!seedObj) return { success: false, message: 'Could not load seed file' };
    const keys = ['customers','invoices','invoiceItems','payments','products','inventory','suppliers','purchaseOrders','expenses','sales','saleItems','leads','calls','bankTransactions','financeAccounts','quotations'];
    let filled = 0;
    for (const key of keys) {
      if (!Array.isArray(seedObj[key]) || !seedObj[key].length) continue;
      if (!Array.isArray(d[key]) || d[key].length < 3) {
        d[key] = seedObj[key].slice();
        filled++;
      }
    }
    if (Array.isArray(d.invoices)) {
      d.accountsReceivable = d.invoices.filter(i => Number(i.balance) > 0).map(i => ({
        id: i.id, customerId: i.customerId, customerName: i.customerName,
        invoiceNo: i.invoiceNo || i.invNo, dueDate: i.dueDate,
        invoiceAmount: i.total, paidAmount: i.paid, outstandingBalance: i.balance,
        status: i.status, source: 'Restored'
      }));
    }
    d._forceRestoredAt = new Date().toISOString();
    try { if (typeof saveState === 'function') await Promise.resolve(saveState()); } catch (e) { console.error('[force-restore] save', e && e.message); }
    return {
      success: true,
      filled,
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
  },
`;

  // Insert method after saveUser line
  if (rpc.includes("saveUser(user, row)")) {
    const idx = rpc.indexOf('saveUser(user, row)');
    const brace = rpc.indexOf('},', idx);
    if (brace > 0) {
      rpc = rpc.slice(0, brace + 2) + method + rpc.slice(brace + 2);
      console.log('[force-restore] method inserted after saveUser');
    }
  } else if (rpc.includes('async function invokeRpc')) {
    // fallback: not ideal
    console.warn('[force-restore] saveUser not found');
  }

  // Also auto-fill on data() when empty — inline minimal call that schedules async restore via global
  // Safer: after await loadState in invokeRpc, if invoices empty, fetch and fill before dispatch
  if (!rpc.includes('force-data-restore-v3-boot')) {
    const boot = `
    /* force-data-restore-v3-boot */
    try {
      if (db && (!Array.isArray(db.invoices) || db.invoices.length < 3)) {
        let seedObj = null;
        try { seedObj = require('../data/quickbooks-seed.json'); } catch (e1) {}
        if (!seedObj) {
          try {
            const res = await fetch('https://raw.githubusercontent.com/mikomike2301111-ux/my-big-project-ERP-/main/data/quickbooks-seed.json');
            if (res.ok) seedObj = await res.json();
          } catch (e2) {}
        }
        if (seedObj && seedObj.data) seedObj = Object.assign({}, seedObj, seedObj.data);
        if (seedObj) {
          for (const key of ['customers','invoices','invoiceItems','expenses','products','sales','saleItems','payments','leads','calls','suppliers','financeAccounts']) {
            if (Array.isArray(seedObj[key]) && seedObj[key].length && (!Array.isArray(db[key]) || db[key].length < 3)) {
              db[key] = seedObj[key].slice();
            }
          }
        }
      }
    } catch (e) { console.error('[force-restore-boot]', e && e.message); }
`;
    // inject after first await loadState();
    if (rpc.includes('await loadState();')) {
      rpc = rpc.replace('await loadState();', 'await loadState();' + boot);
      console.log('[force-restore] boot hook on first loadState');
    }
  }
}

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[force-restore] done', rpc.length);
