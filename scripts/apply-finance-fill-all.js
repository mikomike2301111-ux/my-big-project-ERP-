#!/usr/bin/env node
/** finance-fill-all-v1 compact - see repo history for full source */
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
// Load payload from sibling file if present, else fail soft
const payloadPath = path.join(__dirname, 'finance-fill-payload.b64');
if (!fs.existsSync(payloadPath)) {
  console.error('[finance-fill] missing finance-fill-payload.b64');
  process.exit(1);
}
const NEW_FN = Buffer.from(fs.readFileSync(payloadPath, 'utf8').trim(), 'base64').toString('utf8');
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
