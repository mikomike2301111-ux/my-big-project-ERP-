#!/usr/bin/env node
/**
 * finance-fill-all-v3
 * 1) Default finance period to Year
 * 2) Revenue + AR from invoices (not sparse sales)
 */
const fs = require('fs');
const path = require('path');
const RPC = path.join(__dirname, '..', 'api', 'rpc.js');
const MAIN = path.join(__dirname, '..', 'src', 'main.jsx');

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.includes('/* finance-fill-all-v3 */')) {
  console.log('[finance-fill] v3 already applied');
} else {
  const needle = 'getFinanceWorkspaceData(user, filters = {}) {\n    try {\n    reqRole(user);';
  const inject = "getFinanceWorkspaceData(user, filters = {}) {\n    /* finance-fill-all-v3 */\n    try {\n    if (!filters || typeof filters !== 'object') filters = {};\n    if (!filters.period) filters.period = 'Year';\n    reqRole(user);";
  if (rpc.includes(needle)) {
    rpc = rpc.replace(needle, inject);
    console.log('[finance-fill] period Year inject');
  } else {
    console.warn('[finance-fill] inject point not found — continuing');
  }

  const oldRev = 'const revenue = Math.round(periodSales.reduce((s, x) => s + num(x.total), 0));';
  const newRev = "const __invRev = (d.invoices || []).filter(inv => inv.status !== 'Deleted' && inv.isDeleted !== 'Yes' && inDateRange(inv, scope)).reduce((s, x) => s + num(x.total), 0);\n    const revenue = Math.round(__invRev > 0 ? __invRev : periodSales.reduce((s, x) => s + num(x.total), 0));";
  if (rpc.includes(oldRev)) {
    rpc = rpc.replace(oldRev, newRev);
    console.log('[finance-fill] revenue from invoices');
  }

  rpc = rpc.replace(
    /const ar = Math\.round\([^;]+;/,
    "const ar = Math.round((d.invoices || []).filter(inv => inv.status !== 'Deleted' && inv.isDeleted !== 'Yes' && inv.status !== 'Cancelled').reduce((s, inv) => s + Math.max(0, num(inv.balance)), 0));"
  );
  console.log('[finance-fill] AR from invoices');

  fs.writeFileSync(RPC, rpc);
  console.log('[finance-fill] rpc', rpc.length);
}

let main = fs.readFileSync(MAIN, 'utf8');
if (!main.includes('finance-fill-period-year-v1')) {
  const before = main.length;
  main = main.split("getFinanceWorkspaceData', [{ period: globalPeriod }]").join(
    "getFinanceWorkspaceData', [{ period: globalPeriod || 'Year' }] /* finance-fill-period-year-v1 */"
  );
  if (main.length !== before) {
    fs.writeFileSync(MAIN, main);
    console.log('[finance-fill] UI period Year');
  }
}
console.log('[finance-fill] done');
