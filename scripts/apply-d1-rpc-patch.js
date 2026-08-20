/**
 * Applies ordered patches under patches/ (idempotent; non-fatal if already applied).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const patches = [
  { file: 'patches/rpc-d1.patch', marker: "require('../server/d1Client')", optional: true },
  { file: 'patches/po-invoice-rpc.patch', marker: 'createFormalPurchaseOrder' },
  { file: 'patches/po-admin-ui.patch', marker: 'Create PO & download PDF' },
];

for (const p of patches) {
  const patchPath = path.join(root, p.file);
  if (!fs.existsSync(patchPath)) {
    console.warn('[apply] missing', p.file);
    continue;
  }
  const searchRoots = [
    path.join(root, 'api', 'rpc.js'),
    path.join(root, 'src', 'main.jsx'),
  ];
  const already = searchRoots.some(f => fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(p.marker));
  if (already) {
    console.log('[apply] skip (already applied):', p.file);
    continue;
  }
  try {
    execSync(`patch -p0 --forward --batch < "${patchPath}"`, { cwd: root, stdio: 'inherit' });
    console.log('[apply] applied', p.file);
  } catch (e) {
    const after = searchRoots.some(f => fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(p.marker));
    if (after) {
      console.log('[apply] partial ok', p.file);
      continue;
    }
    if (p.optional) {
      console.warn('[apply] optional patch skipped:', p.file);
      continue;
    }
    console.error('[apply] failed', p.file, e.message);
    process.exit(1);
  }
}
