#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const node = process.execPath;

const applies = [
  'restore-if-placeholder.js',
  'apply-force-data-restore.js',
  'apply-hr-delete-xai.js',
  'apply-d1-rpc-patch.js',
  'apply-role-pages-email-links.js',
  'apply-keeper-prune.js',
  'apply-accounts-404-fix.js',
  'apply-accounts-crm-access.js',
  'apply-finance-show-data.js',
  'apply-finance-fill-all.js',
  'apply-accounts-live-fill.js',
  'apply-accounts-profile-v4.js',
  'apply-charts-profile-perf.js',
  'apply-analytics-all.js',
  'apply-accounts-records-fix.js',
  'apply-delivery-details-upgrade.js',
  'apply-delivery-invoice-products.js',
  'apply-crm-delivery-invoice-products.js',
  'apply-add-moses-ngeno.js',
  'apply-restore-system-data.js',
  'apply-hr-delete-fix.js'
];

function run(cmd, args, soft) {
  console.log(`\n>>> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    if (soft) {
      console.warn(`[build-all] soft-fail ${args.join(' ')} exit ${r.status}`);
      return;
    }
    console.error(`FAILED: ${cmd} ${args.join(' ')} (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

run(node, ['scripts/restore-if-placeholder.js']);
run(node, ['scripts/apply-force-data-restore.js']);

for (const file of applies) {
  if (file === 'restore-if-placeholder.js' || file === 'apply-force-data-restore.js') continue;
  const full = path.join(root, 'scripts', file);
  if (!fs.existsSync(full)) {
    console.warn(`[build-all] skip missing ${file}`);
    continue;
  }
  run(node, [path.join('scripts', file)], true);
}

run(node, ['--max-old-space-size=4096', path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build']);
console.log('\nbuild-all: OK');
