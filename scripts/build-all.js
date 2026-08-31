#!/usr/bin/env node
/**
 * Single Vercel build entry (buildCommand must be ≤256 chars).
 * Runs surgical apply patches then Vite production build.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const node = process.execPath;

const applies = [
  'apply-hr-delete-xai.js',
  'apply-d1-rpc-patch.js',
  'apply-role-pages-email-links.js',
  'apply-keeper-prune.js',
  'apply-accounts-404-fix.js'
];

function run(cmd, args, opts = {}) {
  console.log(`\n>>> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    ...opts
  });
  if (r.status !== 0) {
    console.error(`FAILED: ${cmd} ${args.join(' ')} (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

for (const file of applies) {
  run(node, [path.join('scripts', file)]);
}

// Vite build with more heap for large main.jsx
run(node, ['--max-old-space-size=4096', path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build']);
console.log('\nbuild-all: OK');
