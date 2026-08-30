/** Applies patches + soft scripts including critical UI fixes. */
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
  if (!fs.existsSync(patchPath)) { console.warn('[apply] missing', p.file); continue; }
  const searchRoots = p.target ? [path.join(root, p.target)] : [path.join(root, 'api', 'rpc.js'), path.join(root, 'src', 'main.jsx'), path.join(root, 'server', 'resend-service-core.js')];
  const already = searchRoots.some(f => fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(p.marker));
  if (already) { console.log('[apply] skip', p.file); continue; }
  try {
    execSync(`patch -p0 --forward --batch < "${patchPath}"`, { cwd: root, stdio: 'inherit' });
  } catch (e) {
    if (p.optional) console.warn('[apply] optional skip', p.file);
    else { console.error('[apply] failed', p.file); process.exit(1); }
  }
}
const soft = [
  'scripts/apply-po-email-ui.js','scripts/apply-r2-attachments.js','scripts/apply-leave-finance-fix.js',
  'scripts/apply-qbo-finance-seed.js','scripts/apply-accounting-harden.js','scripts/apply-d1-normalized-expand.js',
  'scripts/apply-camera-r2-hr-deletes.js','scripts/apply-mobile-polish.js','scripts/apply-leave-email-polish.js',
  'scripts/apply-charts-profile-perf.js','scripts/apply-perf-fast.js','scripts/apply-r2-weekly-backup.js',
  'scripts/apply-critical-ui-fixes.js',
];
for (const rel of soft) {
  try {
    if (fs.existsSync(path.join(root, rel))) execSync('node ' + rel, { cwd: root, stdio: 'inherit' });
  } catch (e) { console.warn('[apply] soft-fail', rel, e.message); }
}
