#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
const node = process.execPath;
function run(args) {
  const result = spawnSync(node, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    console.error('[build-finance-fix] failed:', args.join(' '));
    process.exit(result.status || 1);
  }
}
run(['scripts/restore-if-placeholder.js']);
run(['scripts/apply-dashboard-accuracy.js']);
run(['scripts/apply-dashboard-accuracy-ui.js']);
run(['scripts/apply-accounts-404-fix.js']);
run(['--max-old-space-size=4096', path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
console.log('[build-finance-fix] build completed');
