#!/usr/bin/env node
/**
 * apply-analytics-all-v1 (syntax-safe)
 * Widen date windows + fix trend cash lines WITHOUT introducing undefined vars.
 * Never global-replace mRev (breaks `const mRev = ...`).
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

// Always scrub broken patterns from prior bad deploys (value-position only)
rpc = rpc.replace(/cash:\s*mRev\s*-\s*mExp/g, 'cash: (typeof rev !== "undefined" ? rev : 0) - (typeof exp !== "undefined" ? exp : 0)');
// Fix accidental `const (typeof...) =` from previous bad global replace
rpc = rpc.replace(/const\s*\(typeof rev[^)]+\)\s*=/g, 'const mRev =');
rpc = rpc.replace(/const\s*\(typeof exp[^)]+\)\s*=/g, 'const mExp =');
rpc = rpc.replace(/const\s*\(typeof revenue[^)]+\)\s*=/g, 'const mRev =');
rpc = rpc.replace(/const\s*\(typeof expenses[^)]+\)\s*=/g, 'const mExp =');

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

  if (rpc.includes('cash: cashPosition') && !rpc.includes('keysForTrend')) {
    rpc = rpc.replace(/cash:\s*cashPosition,\n\s*ar,\n\s*ap/g,
      'cash: (typeof rev !== "undefined" ? rev : 0) - (typeof exp !== "undefined" ? exp : 0),\n        ar: 0,\n        ap: 0');
  }
  rpc = rpc.replace(
    /profit: rev - exp,\n\s*cash: cashPosition,\n\s*ar,\n\s*ap/g,
    "profit: rev - exp,\n        cash: rev - exp,\n        ar: 0,\n        ap: 0"
  );

  fs.writeFileSync(RPC, rpc);
  console.log('[analytics] rpc patched', rpc.length);
} else {
  fs.writeFileSync(RPC, rpc);
  console.log('[analytics] scrubbed + marker present');
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
