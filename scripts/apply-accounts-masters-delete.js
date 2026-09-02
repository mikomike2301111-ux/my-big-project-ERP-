#!/usr/bin/env node
/**
 * apply-accounts-masters-v3
 * Force-attach customers, suppliers, invoices next to every sourceFlows block
 * in finance/accounts workspace returns. Syntax-safe.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MAIN = path.join(root, 'src', 'main.jsx');
const MARKER = '/* accounts-masters-v3 */';

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

// Clean broken prior injects
rpc = rpc.replace(/\/\* accounts-delete-collections-v1 \*\/[\s\S]{0,200}?const __accDelOk = \[[^\]]*\];\s*/g, '');

if (!rpc.includes(MARKER)) {
  const attach =
    `${MARKER} ` +
    `customers: ((typeof d0 !== 'undefined' && d0.customers) || (typeof data === 'function' && (data().customers)) || []).filter(c => c && c.isDeleted !== 'Yes').slice(0, 500), ` +
    `suppliers: ((typeof d0 !== 'undefined' && (d0.suppliers || d0.vendors)) || []).filter(s => s && s.isDeleted !== 'Yes').slice(0, 300), ` +
    `invoices: (typeof invs !== 'undefined' ? invs : ((typeof d0 !== 'undefined' && d0.invoices) || [])).slice(0, 400),`;

  let n = 0;
  // After every sourceFlows array that lists Invoices module
  rpc = rpc.replace(
    /(sourceFlows:\s*\[[\s\S]{0,400}?module:\s*['"]Expenses['"][\s\S]{0,80}?\]\s*,)/g,
    (m) => {
      if (m.includes('accounts-masters-v3')) return m;
      n++;
      return m + '\n          ' + attach;
    }
  );

  // products enrich
  for (const p of [
    'products: (d0.products || []).slice(0, 100)',
    'products: (d0.products || []).slice(0, 200)',
  ]) {
    if (rpc.includes(p) && !rpc.includes('accounts-masters-v3 products')) {
      rpc = rpc.split(p).join(
        `products: (d0.products || []).slice(0, 300) /* accounts-masters-v3 products */, customers: (d0.customers || []).filter(c => c && c.isDeleted !== 'Yes').slice(0, 500), suppliers: (d0.suppliers || d0.vendors || []).filter(s => s && s.isDeleted !== 'Yes').slice(0, 300), invoices: (typeof invs !== 'undefined' ? invs : (d0.invoices || [])).slice(0, 400)`
      );
      n++;
    }
  }

  // invoiceHistory expand
  if (rpc.includes('invoiceHistory: invs.slice(0, 100)')) {
    rpc = rpc.replace(
      /invoiceHistory:\s*invs\.slice\(0,\s*100\)/g,
      'invoiceHistory: invs.slice(0, 300)'
    );
    n++;
  }

  console.log('[masters] patches', n);
  if (!rpc.includes(MARKER) && !rpc.includes('accounts-masters-v3 products')) {
    // last resort: append customers near first receivables assignment in finance function
    const fr = rpc.indexOf('receivables: receivables0');
    if (fr > 0) {
      rpc = rpc.slice(0, fr) + attach + ' ' + rpc.slice(fr);
      console.log('[masters] last-resort inject at receivables0');
    }
  }
}

rpc = rpc.replace(/cash:\s*mRev\s*-\s*mExp/g,
  'cash: (typeof rev !== "undefined" ? rev : (typeof revenue !== "undefined" ? revenue : 0)) - (typeof exp !== "undefined" ? exp : (typeof expenses !== "undefined" ? expenses : 0))');

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[masters] rpc ok', rpc.length);

let main = fs.readFileSync(MAIN, 'utf8');
if (main.trim() !== 'PLACEHOLDER' && main.length > 5000 && !main.includes('accounts-masters-v3-ui')) {
  main = main.split("getFinanceWorkspaceData', [{ period: globalPeriod }]").join(
    "getFinanceWorkspaceData', [{ period: (globalPeriod === 'Month' || !globalPeriod) ? 'Year' : globalPeriod }] /* accounts-masters-v3-ui */"
  );
  fs.writeFileSync(MAIN, main);
  console.log('[masters] main');
}
console.log('[masters] done');
