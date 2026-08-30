/**
 * Applies ordered patches under patches/ then R2 + leave/finance + accounting wiring.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const patches = [
  { file: 'patches/rpc-d1.patch', marker: "require('../server/d1Client')", optional: true },
  { file: 'patches/po-invoice-rpc.patch', marker: 'generatePurchaseOrderPdf', optional: true },
  { file: 'patches/create-formal-po.patch', marker: 'createFormalPurchaseOrder', optional: true },
  { file: 'patches/po-admin-ui.patch', marker: 'Create PO & download PDF', optional: true },
  { file: 'patches/po-email-resend.patch', marker: 'sendPurchaseOrderToSupplier', target: 'server/resend-service-core.js', optional: true },
  { file: 'patches/po-email-rpc.patch', marker: 'emailPurchaseOrder', optional: true },
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

try {
  if (fs.existsSync(path.join(root, 'scripts/apply-po-email-ui.js'))) {
    execSync('node scripts/apply-po-email-ui.js', { cwd: root, stdio: 'inherit' });
  }
} catch (e) {
  console.warn('[apply] po-email-ui soft-fail', e.message);
}

try {
  if (fs.existsSync(path.join(root, 'scripts/apply-r2-attachments.js'))) {
    execSync('node scripts/apply-r2-attachments.js', { cwd: root, stdio: 'inherit' });
  }
} catch (e) {
  console.warn('[apply] r2-attachments soft-fail', e.message);
}

try {
  if (fs.existsSync(path.join(root, 'scripts/apply-leave-finance-fix.js'))) {
    execSync('node scripts/apply-leave-finance-fix.js', { cwd: root, stdio: 'inherit' });
  }
  if (fs.existsSync(path.join(root, 'scripts/apply-qbo-finance-seed.js'))) {
    execSync('node scripts/apply-qbo-finance-seed.js', { cwd: root, stdio: 'inherit' });
  }
} catch (e) {
  console.warn('[apply] leave-finance/qbo soft-fail', e.message);
}

try {
  if (fs.existsSync(path.join(root, 'scripts/apply-accounting-harden.js'))) {
    execSync('node scripts/apply-accounting-harden.js', { cwd: root, stdio: 'inherit' });
  }
} catch (e) {
  console.warn('[apply] accounting-harden soft-fail', e.message);
}

try {
  if (fs.existsSync(path.join(root, 'scripts/apply-d1-normalized-expand.js'))) {
    execSync('node scripts/apply-d1-normalized-expand.js', { cwd: root, stdio: 'inherit' });
  }
} catch (e) {
  console.warn('[apply] d1-normalized-expand soft-fail', e.message);
}
