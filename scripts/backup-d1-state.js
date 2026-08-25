// Backup: export current D1 erp_state doc to data/d1-state-backup-<ts>.json (non-destructive read)
const fs = require('fs');
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch (_) {}
const d1 = require('../server/d1Client');
(async () => {
  if (!d1.d1Configured()) throw new Error('D1 not configured');
  const doc = await d1.getErpStateDocument();
  if (!doc || !doc.data) throw new Error('No state read');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(__dirname, '..', 'data', `d1-state-backup-${ts}.json`);
  fs.writeFileSync(out, JSON.stringify(doc.data, null, 1));
  const keys = Object.keys(doc.data).filter(k => Array.isArray(doc.data[k]));
  const counts = {};
  keys.forEach(k => counts[k] = doc.data[k].length);
  console.log('Backup written:', out);
  console.log('chunks:', doc.chunks, 'bytes:', JSON.stringify(doc.data).length);
  console.log('array-count sample:', JSON.stringify(counts).slice(0, 1200));
})().catch(e => { console.error('BACKUP FAILED:', (e && e.message) || e); process.exit(1); });
