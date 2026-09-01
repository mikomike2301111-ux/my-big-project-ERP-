#!/usr/bin/env node
/** finance-fill-all-v1 */
const fs = require('fs');
const path = require('path');
const RPC = path.join(__dirname, '..', 'api', 'rpc.js');
let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.includes('/* finance-fill-all-v1 */')) {
  console.log('[finance-fill] already applied');
  process.exit(0);
}
const start = rpc.indexOf('  getFinanceWorkspaceData(user, filters = {}) {');
const end = rpc.indexOf('\n  getAccountsData(user)', start);
if (start < 0 || end < 0) {
  console.error('[finance-fill] bounds not found');
  process.exit(1);
}
const a = path.join(__dirname, 'finance-fill-payload.a.b64');
const b = path.join(__dirname, 'finance-fill-payload.b.b64');
const single = path.join(__dirname, 'finance-fill-payload.b64');
let b64;
if (fs.existsSync(a) && fs.existsSync(b)) {
  b64 = fs.readFileSync(a, 'utf8').trim() + fs.readFileSync(b, 'utf8').trim();
} else if (fs.existsSync(single)) {
  b64 = fs.readFileSync(single, 'utf8').trim();
} else {
  console.error('[finance-fill] missing payload');
  process.exit(1);
}
const NEW_FN = Buffer.from(b64, 'base64').toString('utf8');
rpc = rpc.slice(0, start) + NEW_FN + rpc.slice(end);
fs.writeFileSync(RPC, rpc);
console.log('[finance-fill] done', rpc.length);
const MAIN = path.join(__dirname, '..', 'src', 'main.jsx');
let main = fs.readFileSync(MAIN, 'utf8');
if (!main.includes('finance-fill-period-year-v1')) {
  main = main.replace(
    /getFinanceWorkspaceData', \[\{ period: globalPeriod \}\]/g,
    "getFinanceWorkspaceData', [{ period: globalPeriod || 'Year' }] /* finance-fill-period-year-v1 */"
  );
  fs.writeFileSync(MAIN, main);
  console.log('[finance-fill] UI period Year');
}
