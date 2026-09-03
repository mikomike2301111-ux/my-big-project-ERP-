#!/usr/bin/env node
/**
 * Single Vercel build entry (buildCommand must be ≤256 chars).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const node = process.execPath;

const applies = [
  'restore-if-placeholder.js',
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
  'apply-accounts-masters-delete.js',
  'apply-accounts-editable-full.js',
  'apply-accounts-journals-editable.js',
  'apply-accounts-success-enrich.js',
  'apply-delivery-details-upgrade.js',
  'apply-hr-delete-fix.js'
];

function run(cmd, args) {
  console.log(`\n>>> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error(`FAILED: ${cmd} ${args.join(' ')} (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

for (const file of applies) {
  const full = path.join(root, 'scripts', file);
  if (!fs.existsSync(full)) {
    console.warn(`[build-all] skip missing ${file}`);
    continue;
  }
  run(node, [path.join('scripts', file)]);
}

run(node, ['--max-old-space-size=4096', path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build']);
console.log('\nbuild-all: OK');
