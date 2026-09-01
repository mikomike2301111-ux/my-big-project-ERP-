#!/usr/bin/env node
/**
 * accounts-live-fill-v3
 * Safe inject AFTER function signature (never into default params).
 * Revenue/expenses from invoices; Year default; never blank when data exists.
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

const MARKER = '/* accounts-live-fill-v3 */';
if (rpc.includes(MARKER)) {
  console.log('[accounts-live] v3 already applied');
} else {
  // Find function and inject right after the body opening brace (after ") {")
  const sig = 'getFinanceWorkspaceData(user, filters = {})';
  let idx = rpc.indexOf(sig);
  if (idx < 0) {
    // may already be rewritten by finance-fill — look for name only
    idx = rpc.indexOf('getFinanceWorkspaceData(user, filters');
  }
  if (idx < 0) {
    console.error('[accounts-live] getFinanceWorkspaceData not found');
    process.exit(1);
  }
  // Walk to the first '{' that starts the function body: after the closing ')' of params
  const parenClose = rpc.indexOf(')', idx);
  const bodyOpen = rpc.indexOf('{', parenClose);
  if (bodyOpen < 0) {
    console.error('[accounts-live] body brace not found');
    process.exit(1);
  }
  const inject = `{\n    ${MARKER}\n    if (!filters || typeof filters !== 'object') filters = {};\n    if (!filters.period) filters.period = 'Year';\n`;
  rpc = rpc.slice(0, bodyOpen) + inject + rpc.slice(bodyOpen + 1);
  console.log('[accounts-live] Year default injected at', bodyOpen);

  // Revenue: prefer invoices; if period empty use all invoices
  const revenueNeedles = [
    "const revenue = Math.round(periodSales.reduce((s, x) => s + num(x.total), 0));",
    "const revenue = Math.round(__invRev > 0 ? __invRev : periodSales.reduce((s, x) => s + num(x.total), 0));"
  ];
  const newRev = `${MARKER}\n    const _allInv = (d.invoices || []).filter(inv => inv && inv.status !== 'Deleted' && inv.isDeleted !== 'Yes' && inv.status !== 'Cancelled');\n    const _periodInv = _allInv.filter(inv => inDateRange(inv, scope));\n    const _useInv = _periodInv.length ? _periodInv : _allInv;\n    const _salesRev = periodSales.reduce((s, x) => s + num(x.total), 0);\n    const _invRev = _useInv.reduce((s, x) => s + num(x.total), 0);\n    const revenue = Math.round(_invRev > 0 ? _invRev : _salesRev);`;
  let revDone = false;
  for (const n of revenueNeedles) {
    if (rpc.includes(n)) {
      rpc = rpc.replace(n, newRev);
      revDone = true;
      console.log('[accounts-live] revenue from invoices');
      break;
    }
  }
  // finance-show multi-line pattern
  if (!revDone) {
    const re = /\/\* finance-show-data-v1 \*\/[\s\S]{0,400}?const revenue = Math\.round\(invoiceRevenue > 0 \? invoiceRevenue : salesRevenue\);/;
    if (re.test(rpc)) {
      rpc = rpc.replace(re, newRev);
      revDone = true;
      console.log('[accounts-live] revenue replaced finance-show block');
    }
  }
  if (!revDone) console.warn('[accounts-live] revenue pattern not found');

  const oldExp = 'const expenses = Math.round(expensesList.filter(item => inDateRange(item, scope)).reduce((s, x) => s + num(x.amount), 0));';
  const newExp = `const _periodExp = expensesList.filter(item => inDateRange(item, scope));\n    const _useExp = _periodExp.length ? _periodExp : expensesList;\n    const expenses = Math.round(_useExp.reduce((s, x) => s + num(x.amount), 0));`;
  if (rpc.includes(oldExp)) {
    rpc = rpc.replace(oldExp, newExp);
    console.log('[accounts-live] expenses patched');
  }

  fs.writeFileSync(RPC, rpc);
  console.log('[accounts-live] rpc', rpc.length);
}

// Syntax check
try {
  require('vm').runInNewContext(fs.readFileSync(RPC, 'utf8').replace(/^/, 'var module={exports:{}}; var require=()=>({}); var exports={};\n'), Object.create(null), { timeout: 1000 });
} catch (e) {
  // soft — full require needs deps; use node --check via spawn if needed
}

let main = fs.readFileSync(MAIN, 'utf8');
if (main.trim() === 'PLACEHOLDER' || main.length < 5000) {
  console.error('[accounts-live] main is PLACEHOLDER — restore first');
  process.exit(1);
}
if (!main.includes('accounts-live-period-year-v3')) {
  const pairs = [
    ["getFinanceWorkspaceData', [{ period: globalPeriod }]", "getFinanceWorkspaceData', [{ period: (globalPeriod === 'Month' || !globalPeriod) ? 'Year' : globalPeriod }] /* accounts-live-period-year-v3 */"],
    ["getFinanceWorkspaceData', [{ period: globalPeriod || 'Year' }] /* finance-fill-period-year-v1 */", "getFinanceWorkspaceData', [{ period: (globalPeriod === 'Month' || !globalPeriod) ? 'Year' : globalPeriod }] /* accounts-live-period-year-v3 */"],
    ["getFinanceWorkspaceData', [{ period: (globalPeriod === 'Month' || !globalPeriod) ? 'Year' : globalPeriod }] /* accounts-live-period-year-v2 */", "getFinanceWorkspaceData', [{ period: (globalPeriod === 'Month' || !globalPeriod) ? 'Year' : globalPeriod }] /* accounts-live-period-year-v3 */"]
  ];
  for (const [a, b] of pairs) {
    if (main.includes(a)) main = main.split(a).join(b);
  }
  fs.writeFileSync(MAIN, main);
  console.log('[accounts-live] main Year default');
}

// Final syntax check with node --check
const { spawnSync } = require('child_process');
const chk = spawnSync(process.execPath, ['--check', RPC], { encoding: 'utf8' });
if (chk.status !== 0) {
  console.error('[accounts-live] SYNTAX ERROR after patch:');
  console.error(chk.stderr || chk.stdout);
  process.exit(1);
}
console.log('[accounts-live] syntax OK');
console.log('[accounts-live] done');
