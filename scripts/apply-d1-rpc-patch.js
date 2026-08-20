/**
 * Applies patches/rpc-d1.patch to api/rpc.js when not already applied.
 * Safe to run multiple times (idempotent).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const rpcPath = path.join(root, 'api', 'rpc.js');
const patchPath = path.join(root, 'patches', 'rpc-d1.patch');

if (!fs.existsSync(rpcPath)) {
  console.warn('[apply-d1] api/rpc.js missing — skip');
  process.exit(0);
}
const rpc = fs.readFileSync(rpcPath, 'utf8');
if (rpc.includes("require('../server/d1Client')") && rpc.includes('getErpStateDocument')) {
  console.log('[apply-d1] rpc.js already D1-wired — skip');
  process.exit(0);
}
if (!fs.existsSync(patchPath)) {
  console.warn('[apply-d1] patch missing — skip');
  process.exit(0);
}
try {
  execSync(`patch -p0 --forward --batch < "${patchPath}"`, { cwd: root, stdio: 'inherit' });
  console.log('[apply-d1] patch applied');
} catch (e) {
  const after = fs.readFileSync(rpcPath, 'utf8');
  if (after.includes("require('../server/d1Client')")) {
    console.log('[apply-d1] patch partially present — continue');
    process.exit(0);
  }
  console.error('[apply-d1] patch failed', e.message);
  process.exit(1);
}
