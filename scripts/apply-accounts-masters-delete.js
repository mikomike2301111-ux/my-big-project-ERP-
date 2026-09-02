#!/usr/bin/env node
/**
 * apply-accounts-masters-delete-v2 (syntax-safe)
 * Finance/Accounts workspace always returns customers, suppliers, products, invoices.
 * No structural injects into deleteRecord (that broke builds).
 * Invoice/expense delete already uses deleteRecord in the UI.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MAIN = path.join(root, 'src', 'main.jsx');
const MARKER = '/* accounts-masters-v2 */';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[masters] SYNTAX', file, r.stderr || r.stdout);
    process.exit(1);
  }
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[masters] rpc PLACEHOLDER');
  process.exit(1);
}

// Remove any broken prior inject of __accDelOk
rpc = rpc.replace(/\/\* accounts-delete-collections-v1 \*\/[\s\S]{0,200}?const __accDelOk = \[[^\]]*\];\s*/g, '');

if (!rpc.includes(MARKER)) {
  const enrich =
    `products: (d0.products || []).slice(0, 300), ${MARKER} ` +
    `customers: (d0.customers || []).filter(c => c && c.isDeleted !== 'Yes').slice(0, 500), ` +
    `suppliers: (d0.suppliers || d0.vendors || []).filter(s => s && s.isDeleted !== 'Yes').slice(0, 300), ` +
    `invoices: (typeof invs !== 'undefined' ? invs : (d0.invoices || [])).slice(0, 400)`;

  let n = 0;
  for (const p of [
    'products: (d0.products || []).slice(0, 100)',
    'products: (d0.products || []).slice(0, 200)',
    'products: (d0.products || []).slice(0, 300)',
  ]) {
    if (rpc.includes(p)) {
      rpc = rpc.split(p).join(enrich);
      n++;
    }
  }

  // Also on invoiceHistory lines in safe returns
  if (rpc.includes('invoiceHistory: invs.slice(0, 100)') && !rpc.includes(MARKER)) {
    rpc = rpc.replace(
      /invoiceHistory:\s*invs\.slice\(0,\s*100\)/g,
      `invoiceHistory: invs.slice(0, 300), ${MARKER} customers: (d0.customers || []).filter(c => c && c.isDeleted !== 'Yes').slice(0, 500), suppliers: (d0.suppliers || d0.vendors || []).filter(s => s && s.isDeleted !== 'Yes').slice(0, 300), invoices: invs.slice(0, 400)`
    );
    n++;
  }

  console.log('[masters] enrich patches', n);
}

// mRev value-only
rpc = rpc.replace(/cash:\s*mRev\s*-\s*mExp/g,
  'cash: (typeof rev !== "undefined" ? rev : (typeof revenue !== "undefined" ? revenue : 0)) - (typeof exp !== "undefined" ? exp : (typeof expenses !== "undefined" ? expenses : 0))');

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[masters] rpc ok', rpc.length);

let main = fs.readFileSync(MAIN, 'utf8');
if (main.trim() !== 'PLACEHOLDER' && main.length > 5000 && !main.includes('accounts-masters-v2-ui')) {
  main = main.split("getFinanceWorkspaceData', [{ period: globalPeriod }]").join(
    "getFinanceWorkspaceData', [{ period: (globalPeriod === 'Month' || !globalPeriod) ? 'Year' : globalPeriod }] /* accounts-masters-v2-ui */"
  );
  fs.writeFileSync(MAIN, main);
  console.log('[masters] main period');
}
console.log('[masters] done');
