#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const failures = [];
function checkFile(p) {
  const r = spawnSync(process.execPath, ['--check', path.join(root, p)], { encoding: 'utf8' });
  if (r.status !== 0) failures.push(p + ' syntax: ' + (r.stderr || r.stdout || 'failed').slice(0, 500));
}
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
if (Object.keys(pkg.dependencies || {}).some(k => k.toLowerCase().includes('supabase'))) failures.push('package.json still declares a hosted-database SDK');
if (Object.keys(lock.packages || {}).some(k => k.toLowerCase().includes('supabase'))) failures.push('package-lock.json still contains hosted-database SDK packages');
for (const p of ['api/email-track.js','server/resend-service-core.js','server/d1EmailStore.js','server/d1Client.js','api/d1-reconcile.js']) {
  const src = read(p);
  if (/SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|@supabase\/|\/rest\/v1\//i.test(src)) failures.push(p + ' still contains an external database dependency');
  checkFile(p);
}
const rpc = read('api/rpc.js');
if (!rpc.includes('d1-only-mode-v1') || !rpc.includes('d1-only-config-v1')) failures.push('generated RPC lacks the mandatory D1-only guard');
if (/process\.env\.(SUPABASE|NEXT_PUBLIC_SUPABASE)|fetch\(\`\$\{SUPABASE_URL\}\/rest\/v1\//i.test(rpc)) failures.push('generated RPC still contains a hosted-database environment/network path');
checkFile('api/rpc.js');
if (failures.length) {
  console.error('[d1-only-audit] FAILED');
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}
console.log('[d1-only-audit] PASS — no SDK dependency, no hosted database network path, syntax checks passed.');
