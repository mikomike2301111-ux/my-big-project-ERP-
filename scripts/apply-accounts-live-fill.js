#!/usr/bin/env node
/**
 * accounts-live-fill-v3
 * Inject AFTER function body brace (never into default params {}).
 * Revenue from invoices; Year default; syntax-checked.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MAIN = path.join(root, 'src', 'main.jsx');

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[accounts-live] rpc PLACEHOLDER');
  process.exit(1);
}

const MARKER = '/* accounts-live-fill-v3 */';
if (rpc.includes(MARKER)) {
  console.log('[accounts-live] v3 already applied');
} else {
  // Repair any prior broken inject into default params
  rpc = rpc.replace(
    /getFinanceWorkspaceData\(user, filters = \{\s*\/\* accounts-live-fill-v2 \*\/[\s\S]*?\}\)/,
    'getFinanceWorkspaceData(user, filters = {})'
  );

  const sig = 'getFinanceWorkspaceData(user, filters = {})';
  let idx = rpc.indexOf(sig);
  if (idx < 0) {
    console.error('[accounts-live] signature not found after repair');
    process.exit(1);
  }
  const parenClose = rpc.indexOf(')', idx + sig.length - 1);
  let bodyOpen = -1;
  for (let i = parenClose; i < parenClose + 20 && i < rpc.length; i++) {
    if (rpc[i] === '{') { bodyOpen = i; break; }
  }
  if (bodyOpen < 0) {
    console.error('[accounts-live] body brace not found');
    process.exit(1);
  }
  const inject = `{\n    ${MARKER}\n    if (!filters || typeof filters !== 'object') filters = {};\n    if (!filters.period) filters.period = 'Year';\n`;
  rpc = rpc.slice(0, bodyOpen) + inject + rpc.slice(bodyOpen + 1);
  console.log('[accounts-live] Year inject at', bodyOpen);

  const fnStart = rpc.indexOf(MARKER);
  const revSearchFrom = fnStart > 0 ? fnStart : 0;
  const simple = 'const revenue = Math.round(periodSales.reduce((s, x) => s + num(x.total), 0));';
  const pos = rpc.indexOf(simple, revSearchFrom);
  const newRev = `${MARKER}\n    const _allInv = (d.invoices || []).filter(inv => inv && inv.status !== 'Deleted' && inv.isDeleted !== 'Yes' && inv.status !== 'Cancelled');\n    const _periodInv = _allInv.filter(inv => inDateRange(inv, scope));\n    const _useInv = _periodInv.length ? _periodInv : _allInv;\n    const _salesRev = periodSales.reduce((s, x) => s + num(x.total), 0);\n    const _invRev = _useInv.reduce((s, x) => s + num(x.total), 0);\n    const revenue = Math.round(_invRev > 0 ? _invRev : _salesRev);`;
  if (pos >= 0) {
    rpc = rpc.slice(0, pos) + newRev + rpc.slice(pos + simple.length);
    console.log('[accounts-live] revenue patched at', pos);
  } else {
    const re = /\/\* finance-show-data-v1 \*\/[\s\S]{0,500}?const revenue = Math\.round\(invoiceRevenue > 0 \? invoiceRevenue : salesRevenue\);/;
    if (re.test(rpc)) {
      rpc = rpc.replace(re, newRev);
      console.log('[accounts-live] revenue replaced finance-show');
    } else if (rpc.includes('const revenue = Math.round(__invRev')) {
      console.log('[accounts-live] revenue already invoice-based');
    } else {
      console.warn('[accounts-live] revenue pattern missing');
    }
  }

  const oldExp = 'const expenses = Math.round(expensesList.filter(item => inDateRange(item, scope)).reduce((s, x) => s + num(x.amount), 0));';
  if (rpc.includes(oldExp)) {
    rpc = rpc.replace(oldExp, `const _periodExp = expensesList.filter(item => inDateRange(item, scope));\n    const _useExp = _periodExp.length ? _periodExp : expensesList;\n    const expenses = Math.round(_useExp.reduce((s, x) => s + num(x.amount), 0));`);
    console.log('[accounts-live] expenses patched');
  }

  fs.writeFileSync(RPC, rpc);
  console.log('[accounts-live] rpc', rpc.length);
}

const chk = spawnSync(process.execPath, ['--check', RPC], { encoding: 'utf8' });
if (chk.status !== 0) {
  console.error('[accounts-live] SYNTAX ERROR:');
  console.error(chk.stderr || chk.stdout);
  process.exit(1);
}
console.log('[accounts-live] syntax OK');

let main = fs.readFileSync(MAIN, 'utf8');
if (main.trim() === 'PLACEHOLDER' || main.length < 5000) {
  console.error('[accounts-live] main PLACEHOLDER');
  process.exit(1);
}
if (!main.includes('accounts-live-period-year-v3')) {
  main = main.split("getFinanceWorkspaceData', [{ period: globalPeriod }]").join(
    "getFinanceWorkspaceData', [{ period: (globalPeriod === 'Month' || !globalPeriod) ? 'Year' : globalPeriod }] /* accounts-live-period-year-v3 */"
  );
  main = main.split("getFinanceWorkspaceData', [{ period: globalPeriod || 'Year' }] /* finance-fill-period-year-v1 */").join(
    "getFinanceWorkspaceData', [{ period: (globalPeriod === 'Month' || !globalPeriod) ? 'Year' : globalPeriod }] /* accounts-live-period-year-v3 */"
  );
  main = main.split('accounts-live-period-year-v2').join('accounts-live-period-year-v3');
  fs.writeFileSync(MAIN, main);
  console.log('[accounts-live] main Year default');
}
console.log('[accounts-live] done');
