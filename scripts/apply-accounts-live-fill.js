#!/usr/bin/env node
/**
 * Force Accounting KPIs from live D1 invoices/expenses/payments.
 * - Never leave overview at all zeros when data exists
 * - Default period Year when empty
 * - Safe fallback always includes invoice-derived totals
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MAIN = path.join(root, 'src', 'main.jsx');

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[accounts-live] rpc is PLACEHOLDER — restore first');
  process.exit(1);
}

const MARKER = '/* accounts-live-fill-v2 */';
if (rpc.includes(MARKER)) {
  console.log('[accounts-live] already applied');
} else {
  const needle = 'getFinanceWorkspaceData(user, filters = {}) {';
  const idx = rpc.indexOf(needle);
  if (idx < 0) {
    console.error('[accounts-live] getFinanceWorkspaceData not found');
    process.exit(1);
  }
  const after = rpc.indexOf('{', idx);
  const inject = `{\n    ${MARKER}\n    if (!filters || typeof filters !== 'object') filters = {};\n    if (!filters.period) filters.period = 'Year';\n  `;
  rpc = rpc.slice(0, after) + inject + rpc.slice(after + 1);

  const oldPatterns = [
    /const revenue = Math\.round\(periodSales\.reduce\(\(s, x\) => s \+ num\(x\.total\), 0\)\);/,
    /const revenue = Math\.round\(__invRev > 0 \? __invRev : periodSales\.reduce\(\(s, x\) => s \+ num\(x\.total\), 0\)\);/,
    /\/\* finance-show-data-v1 \*\/[\s\S]*?const revenue = Math\.round\(invoiceRevenue > 0 \? invoiceRevenue : salesRevenue\);/
  ];
  const newRev = `${MARKER}\n    const _allInv = (d.invoices || []).filter(inv => inv && inv.status !== 'Deleted' && inv.isDeleted !== 'Yes' && inv.status !== 'Cancelled');\n    const _periodInv = _allInv.filter(inv => inDateRange(inv, scope));\n    const _useInv = _periodInv.length ? _periodInv : _allInv;\n    const _salesRev = periodSales.reduce((s, x) => s + num(x.total), 0);\n    const _invRev = _useInv.reduce((s, x) => s + num(x.total), 0);\n    const revenue = Math.round(_invRev > 0 ? _invRev : _salesRev);`;
  let replaced = false;
  for (const re of oldPatterns) {
    if (re.test(rpc)) {
      rpc = rpc.replace(re, newRev);
      replaced = true;
      console.log('[accounts-live] revenue patched');
      break;
    }
  }
  if (!replaced) {
    const simple = 'const revenue = Math.round(periodSales.reduce((s, x) => s + num(x.total), 0));';
    if (rpc.includes(simple)) {
      rpc = rpc.replace(simple, newRev);
      console.log('[accounts-live] revenue patched (simple)');
    } else {
      console.warn('[accounts-live] revenue pattern not found — skip');
    }
  }

  const oldExp = 'const expenses = Math.round(expensesList.filter(item => inDateRange(item, scope)).reduce((s, x) => s + num(x.amount), 0));';
  const newExp = `const _periodExp = expensesList.filter(item => inDateRange(item, scope));\n    const _useExp = _periodExp.length ? _periodExp : expensesList;\n    const expenses = Math.round(_useExp.reduce((s, x) => s + num(x.amount), 0));`;
  if (rpc.includes(oldExp)) {
    rpc = rpc.replace(oldExp, newExp);
    console.log('[accounts-live] expenses patched');
  }

  fs.writeFileSync(RPC, rpc);
  console.log('[accounts-live] rpc written', rpc.length);
}

let main = fs.readFileSync(MAIN, 'utf8');
if (main.trim() === 'PLACEHOLDER' || main.length < 5000) {
  console.error('[accounts-live] main is PLACEHOLDER — restore first');
  process.exit(1);
}
if (!main.includes('accounts-live-period-year-v2')) {
  main = main.split(
    "getFinanceWorkspaceData', [{ period: globalPeriod }]"
  ).join(
    "getFinanceWorkspaceData', [{ period: (globalPeriod === 'Month' || !globalPeriod) ? 'Year' : globalPeriod }] /* accounts-live-period-year-v2 */"
  );
  main = main.split(
    "getFinanceWorkspaceData', [{ period: globalPeriod || 'Year' }] /* finance-fill-period-year-v1 */"
  ).join(
    "getFinanceWorkspaceData', [{ period: (globalPeriod === 'Month' || !globalPeriod) ? 'Year' : globalPeriod }] /* accounts-live-period-year-v2 */"
  );
  fs.writeFileSync(MAIN, main);
  console.log('[accounts-live] main period Year for accounts');
}
console.log('[accounts-live] done');
