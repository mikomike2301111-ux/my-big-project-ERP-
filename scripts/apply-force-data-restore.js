#!/usr/bin/env node
/**
 * apply-force-data-restore-v4
 * - Skip when api/rpc.js is the runtime bootstrap (patches applied at cold start)
 * - On full rpc.js: inject forceRestore that MERGES full QBO seed when richer
 * - Expand periodRange so Year/All show full-year history (not 3-day window)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');

function check(p) {
  const s = fs.readFileSync(p, 'utf8');
  if (s.trim() === 'PLACEHOLDER' || s.length < 200) throw new Error('rpc too small after patch');
}

let rpc = fs.readFileSync(RPC, 'utf8');

if (rpc.includes('ensureLoaded') && rpc.includes('applyPatches') && rpc.includes('GOOD_SHA')) {
  console.log('[force-restore] bootstrap detected — skip static patch (runtime applyPatches handles full history)');
  process.exit(0);
}

// 1) periodRange → default Year, All = 2000 days
if (rpc.includes('function periodRange') && !rpc.includes("period = 'Year'")) {
  const re = /function periodRange\(period = 'Month'\) \{[\s\S]*?return \{ startDate: start\.toISOString\(\)\.slice\(0, 10\), endDate: end\.toISOString\(\)\.slice\(0, 10\), days, label \};\n\}/;
  if (re.test(rpc)) {
    rpc = rpc.replace(re, `function periodRange(period = 'Year') {
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
}`);
    console.log('[force-restore] periodRange expanded to Year/All');
  }
}

// 2) applyQuickBooksSeed — flatten .data + upgrade when seed richer
if (rpc.includes('function applyQuickBooksSeed') && !rpc.includes('qbo-v2-full-history')) {
  const oldStart = rpc.indexOf('function applyQuickBooksSeed()');
  if (oldStart >= 0) {
    let brace = 0, end = -1, started = false;
    for (let i = oldStart; i < rpc.length; i++) {
      if (rpc[i] === '{') { brace++; started = true; }
      else if (rpc[i] === '}') { brace--; if (started && brace === 0) { end = i + 1; break; } }
    }
    if (end > 0) {
      rpc = rpc.slice(0, oldStart) + `function applyQuickBooksSeed() {
  try {
    var qboSeed = null;
    try { qboSeed = require('../data/qbo-finance-seed.json'); } catch (_) {
      try { qboSeed = require('../data/quickbooks-seed.json'); } catch (__) { return false; }
    }
    if (!db || !qboSeed) return false;
    var source = (qboSeed.data && typeof qboSeed.data === 'object') ? Object.assign({}, qboSeed, qboSeed.data) : qboSeed;
    const version = String(qboSeed.importedAt || 'qbo-v2-full-history');
    const KEYS = [
      'customers','invoices','invoiceItems','payments','products','inventory','suppliers','purchaseOrders',
      'expenses','chartOfAccounts','financeAccounts','sales','saleItems','paymentMethods','leads','calls',
      'bankTransactions','productionOrders','rawMaterials','rawMaterialBatches','unitOfMeasure','unitConversions',
      'productFormulas','formulaVersions','productionBatches','productionBatchCosts','deliveries','deliveryItems'
    ];
    let upgraded = 0;
    for (const key of KEYS) {
      if (source[key] === undefined) continue;
      const seedArr = source[key];
      const existing = db[key];
      const seedLen = Array.isArray(seedArr) ? seedArr.length : 0;
      const liveLen = Array.isArray(existing) ? existing.length : 0;
      if (seedLen === 0) continue;
      if (liveLen === 0) { db[key] = seedArr; upgraded++; }
      else if (seedLen > liveLen) {
        const byId = {};
        existing.forEach(r => { if (r && r.id) byId[r.id] = r; });
        seedArr.forEach(r => { if (r && r.id && !byId[r.id]) byId[r.id] = r; });
        db[key] = Object.values(byId);
        if (db[key].length < seedLen) {
          const liveIds = new Set(existing.map(r => r && r.id).filter(Boolean));
          db[key] = existing.concat(seedArr.filter(r => r && r.id && !liveIds.has(r.id)));
        }
        upgraded++;
      }
    }
    if (Array.isArray(db.productionOrders) && db.productionOrders.length && (!Array.isArray(db.production) || !db.production.length)) {
      db.production = db.productionOrders;
    }
    if (typeof ensureFarmtrackCatalogue === 'function') ensureFarmtrackCatalogue(db);
    db.quickBooksImport = { version, source: 'qbo-finance-seed', importedAt: new Date().toISOString(), upgraded };
    return upgraded > 0;
  } catch (e) { console.error('applyQuickBooksSeed', e && e.message); return false; }
}` + rpc.slice(end);
      console.log('[force-restore] applyQuickBooksSeed full-history merge');
    }
  }
}

// 3) forceRestoreSystemData — always upgrade to full seed
const method = `
  forceRestoreSystemData(user) {
    try {
      reqRole(user, ROLES.DEV, ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.EXECUTIVE, ROLES.MANAGER);
      const d = data();
      let seed = null;
      try { seed = require('../data/quickbooks-seed.json'); } catch (e) { seed = null; }
      const source = (seed && seed.data) ? Object.assign({}, seed, seed.data) : (seed || {});
      const keys = ['customers','invoices','invoiceItems','expenses','products','inventory','sales','saleItems','leads','calls','bankTransactions','productionOrders','rawMaterials','rawMaterialBatches','productFormulas','formulaVersions','productionBatches','unitOfMeasure','unitConversions','paymentMethods','deliveries','deliveryItems','suppliers','purchaseOrders'];
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
          else if (srcArr.length > d[k].length) { d[k] = srcArr.slice(); filled++; }
        }
        counts[k] = Array.isArray(d[k]) ? d[k].length : 0;
      }
      if (Array.isArray(d.productionOrders) && d.productionOrders.length) d.production = d.productionOrders;
      if (typeof saveState === 'function') {
        try { const p = saveState(); if (p && typeof p.then === 'function') p.catch(() => {}); } catch (_) {}
      }
      return { success: true, filled, counts, note: 'Full history merged from QBO seed (expenses/sales/CRM/manufacturing)' };
    } catch (e) {
      return { success: false, error: (e && e.message) || String(e) };
    }
  },
`;

if (rpc.includes('forceRestoreSystemData')) {
  const fsIdx = rpc.indexOf('forceRestoreSystemData');
  let methodStart = rpc.lastIndexOf('\n', fsIdx);
  let bi = rpc.indexOf('{', fsIdx);
  let brace = 0, methodEnd = bi;
  for (let i = bi; i < rpc.length; i++) {
    if (rpc[i] === '{') brace++;
    else if (rpc[i] === '}') { brace--; if (brace === 0) { methodEnd = i + 1; break; } }
  }
  if (rpc[methodEnd] === ',') methodEnd++;
  rpc = rpc.slice(0, methodStart + 1) + method + rpc.slice(methodEnd);
  console.log('[force-restore] forceRestoreSystemData replaced with full-history merge');
} else if (rpc.includes('saveUser(user, row)')) {
  const idx = rpc.indexOf('saveUser(user, row)');
  const brace = rpc.indexOf('},', idx);
  if (brace > 0) {
    rpc = rpc.slice(0, brace + 2) + method + rpc.slice(brace + 2);
    console.log('[force-restore] method inserted after saveUser');
  }
}

// 4) boot: fill when empty OR when seed is richer
if (!rpc.includes('force-data-restore-v4-boot') && rpc.includes('await loadState();')) {
  const boot = `
    /* force-data-restore-v4-boot */
    try {
      if (db) {
        let seedObj = null;
        try { seedObj = require('../data/quickbooks-seed.json'); } catch (e1) {}
        if (seedObj && seedObj.data) seedObj = Object.assign({}, seedObj, seedObj.data);
        if (seedObj) {
          for (const key of ['customers','invoices','invoiceItems','expenses','products','sales','saleItems','payments','leads','calls','suppliers','financeAccounts','bankTransactions','productionOrders','rawMaterials','productFormulas','productionBatches']) {
            const srcArr = seedObj[key];
            if (!Array.isArray(srcArr) || !srcArr.length) continue;
            if (!Array.isArray(db[key]) || db[key].length < srcArr.length) {
              if (!Array.isArray(db[key]) || db[key].length === 0) db[key] = srcArr.slice();
              else {
                const byId = {};
                db[key].forEach(r => { if (r && r.id) byId[r.id] = r; });
                srcArr.forEach(r => { if (r && r.id && !byId[r.id]) byId[r.id] = r; });
                db[key] = Object.values(byId);
              }
            }
          }
          if (Array.isArray(db.productionOrders) && db.productionOrders.length) db.production = db.productionOrders;
        }
      }
    } catch (e) { console.error('[force-restore-boot]', e && e.message); }
`;
  rpc = rpc.replace('await loadState();', 'await loadState();' + boot);
  console.log('[force-restore] boot hook v4 on loadState');
}

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[force-restore] done', rpc.length);
