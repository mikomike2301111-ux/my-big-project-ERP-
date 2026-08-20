/**
 * Applies ordered patches under patches/ (idempotent; non-fatal if already applied).
 * Then wires PO Email UI buttons.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const patches = [
  { file: 'patches/rpc-d1.patch', marker: "require('../server/d1Client')", optional: true },
  { file: 'patches/po-invoice-rpc.patch', marker: 'generatePurchaseOrderPdf', optional: true },
  { file: 'patches/create-formal-po.patch', marker: 'createFormalPurchaseOrder' },
  { file: 'patches/po-admin-ui.patch', marker: 'Create PO & download PDF' },
  { file: 'patches/po-email-resend.patch', marker: 'sendPurchaseOrderToSupplier', target: 'server/resend-service-core.js' },
  { file: 'patches/po-email-rpc.patch', marker: 'emailPurchaseOrder' },
];

for (const p of patches) {
  const patchPath = path.join(root, p.file);
  if (!fs.existsSync(patchPath)) {
    console.warn('[apply] missing', p.file);
    continue;
  }
  const searchRoots = p.target
    ? [path.join(root, p.target)]
    : [
        path.join(root, 'api', 'rpc.js'),
        path.join(root, 'src', 'main.jsx'),
        path.join(root, 'server', 'resend-service-core.js'),
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

// UI email buttons
try {
  execSync('node scripts/apply-po-email-ui.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.warn('[apply] po-email-ui soft-fail', e.message);
}
