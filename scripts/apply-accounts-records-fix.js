#!/usr/bin/env node
/**
 * apply-accounts-records-fix (minimal, syntax-safe)
 * Only fixes the mRev/mExp ReferenceError that crashes getFinanceWorkspaceData.
 * Does NOT inject helpers (that broke class syntax on prior deploys).
 * Existing catch fallback already returns full invoice/expense KPIs.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MAIN = path.join(root, 'src', 'main.jsx');

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[records] SYNTAX', file, r.stderr || r.stdout);
    process.exit(1);
  }
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[records] rpc PLACEHOLDER');
  process.exit(1);
}

// Remove any prior broken helper injections that left class body invalid
rpc = rpc.replace(/\n\s*\/\* accounts-records-fix-v[0-9]+ \*\/[\s\S]{0,50}?__buildFinanceFromInvoices[\s\S]*?(?=\n  getFinanceWorkspaceData\()/g, '\n');
rpc = rpc.replace(/\n\s*function __buildFinanceFromInvoices[\s\S]*?(?=\n  getFinanceWorkspaceData\()/g, '\n');

// Value-position only (never touch `const mRev =`)
rpc = rpc.replace(/cash:\s*mRev\s*-\s*mExp/g,
  'cash: (typeof rev !== "undefined" ? rev : (typeof revenue !== "undefined" ? revenue : 0)) - (typeof exp !== "undefined" ? exp : (typeof expenses !== "undefined" ? expenses : 0))');

// Repair accidental broken assignments from older global replaces
rpc = rpc.replace(/const\s*\(typeof rev[^)]+\)\s*=/g, 'const mRev =');
rpc = rpc.replace(/const\s*\(typeof exp[^)]+\)\s*=/g, 'const mExp =');
rpc = rpc.replace(/const\s*\(typeof revenue[^)]+\)\s*=/g, 'const mRev =');
rpc = rpc.replace(/const\s*\(typeof expenses[^)]+\)\s*=/g, 'const mExp =');

// Ensure Year default near function entry (idempotent string insert once)
if (!rpc.includes('/* accounts-records-period */') && rpc.includes('getFinanceWorkspaceData(user, filters = {}) {')) {
  rpc = rpc.replace(
    'getFinanceWorkspaceData(user, filters = {}) {',
    "getFinanceWorkspaceData(user, filters = {}) {\n    /* accounts-records-period */\n    if (!filters || typeof filters !== 'object') filters = {};\n    if (!filters.period || filters.period === 'Month') filters.period = 'Year';"
  );
  console.log('[records] Year period forced');
}

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[records] rpc ok', rpc.length);

let main = fs.readFileSync(MAIN, 'utf8');
if (main.trim() !== 'PLACEHOLDER' && main.length > 5000) {
  if (!main.includes('accounts-records-fix-ui')) {
    main = main.split("getFinanceWorkspaceData', [{ period: globalPeriod }]").join(
      "getFinanceWorkspaceData', [{ period: (globalPeriod === 'Month' || !globalPeriod) ? 'Year' : globalPeriod }] /* accounts-records-fix-ui */"
    );
    fs.writeFileSync(MAIN, main);
    console.log('[records] main period patch');
  }
}
console.log('[records] done');
