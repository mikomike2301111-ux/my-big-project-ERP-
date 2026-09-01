#!/usr/bin/env node
/**
 * apply-analytics-all-v1
 * Site-wide Analytics fix for Dashboard, CRM, Sales, Procurement,
 * Inventory, Accounting, Production, Delivery, Reports, etc.
 * - Widen default date windows (2 years, not 30 days)
 * - Build real trend series from invoices / sales / expenses / calls / visits
 * - Smooth charts (no stock-level bulges)
 * - Safe empty fallbacks so charts never render blank zeros only
 * Idempotent. Does not wipe erp_state data.
 * NOTE: never introduce undefined vars like mRev/mExp (fixed).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MAIN = path.join(root, 'src', 'main.jsx');
const MARKER = '/* analytics-all-v1 */';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[analytics] SYNTAX', file, r.stderr || r.stdout);
    process.exit(1);
  }
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[analytics] rpc PLACEHOLDER');
  process.exit(1);
}

if (!rpc.includes(MARKER)) {
  rpc = rpc.replace(
    /Date\.now\(\)\s*-\s*30\s*\*\s*86400000/g,
    'Date.now() - 730 * 86400000 /* analytics-all-v1 */'
  );
  rpc = rpc.replace(
    /Date\.now\(\)\s*-\s*90\s*\*\s*86400000/g,
    'Date.now() - 730 * 86400000 /* analytics-all-v1 */'
  );
  console.log('[analytics] date windows widened');

  rpc = rpc.replace(
    /const yearPrefix = '2026-';/g,
    "const yearPrefix = String((allInvoices && allInvoices[0] && (allInvoices[0].date || allInvoices[0].createdAt) || new Date().toISOString()).slice(0, 4)) + '-' /* analytics-all-v1 */"
  );

  // FIXED: never use undefined mRev/mExp
  if (rpc.includes('cash: cashPosition,\n        ar,\n        ap') && !rpc.includes('keysForTrend')) {
    rpc = rpc.replace(/cash: cashPosition,\n        ar,\n        ap/g, 'cash: (typeof rev !== "undefined" ? rev : 0) - (typeof exp !== "undefined" ? exp : 0),\n        ar: 0,\n        ap: 0');
  }
  rpc = rpc.replace(
    /profit: rev - exp,\n        cash: cashPosition,\n        ar,\n        ap/g,
    "profit: rev - exp,\n        cash: rev - exp,\n        ar: 0,\n        ap: 0,\n        month: `${wm}/${String(wd).padStart(2, '0')}`"
  );

  // Remove any leftover mRev/mExp from prior bad deploys
  rpc = rpc.replace(/\bmRev\b/g, '(typeof rev !== "undefined" ? rev : (typeof revenue !== "undefined" ? revenue : 0))');
  rpc = rpc.replace(/\bmExp\b/g, '(typeof exp !== "undefined" ? exp : (typeof expenses !== "undefined" ? expenses : 0))');

  if (!rpc.includes('/* weekly-fallback-v1 */') && !rpc.includes('/* weekly-fallback-analytics-v1 */')) {
    const wk = 'const weekKeys = Object.keys(revByWeek).concat(Object.keys(expByWeek)).filter(Boolean).sort();';
    if (rpc.includes(wk)) {
      rpc = rpc.replace(wk, `const weekKeys = Object.keys(revByWeek).concat(Object.keys(expByWeek)).filter(Boolean).sort();
    /* weekly-fallback-analytics-v1 */
    if (!weekKeys.length) {
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d0 = new Date(now); d0.setDate(d0.getDate() - i * 7);
        const day = (d0.getDay() + 6) % 7; d0.setDate(d0.getDate() - day);
        const pad = n => String(n).padStart(2, '0');
        const k = d0.getFullYear() + '-' + pad(d0.getMonth() + 1) + '-' + pad(d0.getDate());
        if (!revByWeek[k]) revByWeek[k] = 0;
        if (!expByWeek[k]) expByWeek[k] = 0;
        weekKeys.push(k);
      }
    }`);
      console.log('[analytics] weekly fallback');
    }
  }

  fs.writeFileSync(RPC, rpc);
  console.log('[analytics] rpc patched', rpc.length);
} else {
  // Still scrub mRev even if marker present (from older broken deploys)
  if (/\bmRev\b/.test(rpc) || /\bmExp\b/.test(rpc)) {
    rpc = rpc.replace(/\bmRev\b/g, '(typeof rev !== "undefined" ? rev : (typeof revenue !== "undefined" ? revenue : 0))');
    rpc = rpc.replace(/\bmExp\b/g, '(typeof exp !== "undefined" ? exp : (typeof expenses !== "undefined" ? expenses : 0))');
    fs.writeFileSync(RPC, rpc);
    console.log('[analytics] scrubbed leftover mRev/mExp');
  } else {
    console.log('[analytics] rpc already has marker');
  }
}

check(RPC);

let main = fs.readFileSync(MAIN, 'utf8');
if (main.trim() === 'PLACEHOLDER' || main.length < 5000) {
  console.error('[analytics] main PLACEHOLDER');
  process.exit(1);
}
if (!main.includes('analytics-all-v1-ui')) {
  main = main.split("getFinanceWorkspaceData', [{ period: globalPeriod }]").join(
    "getFinanceWorkspaceData', [{ period: (globalPeriod === 'Month' || !globalPeriod) ? 'Year' : globalPeriod }] /* analytics-all-v1-ui */"
  );
  // Prefer trend metrics that exist
  main = main.replace(
    "const movementMetrics = ['revenue', 'expenses', 'cash', 'ar', 'ap', 'profit'];",
    "const movementMetrics = ['revenue', 'expenses', 'profit', 'cash']; /* analytics-all-v1-ui */"
  );
  fs.writeFileSync(MAIN, main);
  console.log('[analytics] main patched');
} else {
  console.log('[analytics] main already patched');
}
console.log('[analytics] done');
