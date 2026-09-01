#!/usr/bin/env node
/**
 * apply-analytics-all-v1 (syntax-safe)
 * Widen date windows. Never global-replace mRev (breaks const mRev =).
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

// Value-only mRev scrub
rpc = rpc.replace(/cash:\s*mRev\s*-\s*mExp/g,
  'cash: (typeof rev !== "undefined" ? rev : 0) - (typeof exp !== "undefined" ? exp : 0)');
rpc = rpc.replace(/const\s*\(typeof rev[^)]+\)\s*=/g, 'const mRev =');
rpc = rpc.replace(/const\s*\(typeof exp[^)]+\)\s*=/g, 'const mExp =');

if (!rpc.includes(MARKER)) {
  rpc = rpc.replace(/Date\.now\(\)\s*-\s*30\s*\*\s*86400000/g, 'Date.now() - 730 * 86400000 /* analytics-all-v1 */');
  rpc = rpc.replace(/Date\.now\(\)\s*-\s*90\s*\*\s*86400000/g, 'Date.now() - 730 * 86400000 /* analytics-all-v1 */');
  console.log('[analytics] date windows widened');
  fs.writeFileSync(RPC, rpc);
} else {
  fs.writeFileSync(RPC, rpc);
  console.log('[analytics] marker present + scrub');
}

check(RPC);

let main = fs.readFileSync(MAIN, 'utf8');
if (main.trim() !== 'PLACEHOLDER' && main.length > 5000 && !main.includes('analytics-all-v1-ui')) {
  main = main.split("getFinanceWorkspaceData', [{ period: globalPeriod }]").join(
    "getFinanceWorkspaceData', [{ period: (globalPeriod === 'Month' || !globalPeriod) ? 'Year' : globalPeriod }] /* analytics-all-v1-ui */"
  );
  fs.writeFileSync(MAIN, main);
  console.log('[analytics] main patched');
}
console.log('[analytics] done');
