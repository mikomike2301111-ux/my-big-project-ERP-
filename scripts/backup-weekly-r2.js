/**
 * Weekly full backup: D1 erp_state → Cloudflare R2 (gzipped)
 * Env: CLOUDFLARE_API_TOKEN, R2_ACCOUNT_ID/CLOUDFLARE_ACCOUNT_ID, R2_BUCKET_NAME, D1 ids
 * Usage: node scripts/backup-weekly-r2.js [--tag=manual]
 */
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch (_) {}

const d1 = require('../server/d1Client');
const r2 = require('../server/r2Client');
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);

function weekStamp(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week, label: `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}` };
}

function arrayCounts(data) {
  const counts = {};
  if (!data || typeof data !== 'object') return counts;
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) counts[k] = v.length;
  }
  return counts;
}

async function run(opts = {}) {
  if (!d1.d1Configured()) throw new Error('D1 not configured');
  if (!r2.configured()) throw new Error('R2 not configured (CLOUDFLARE_API_TOKEN, R2_ACCOUNT_ID, R2_BUCKET_NAME)');

  const tag = opts.tag || 'weekly';
  const stamp = weekStamp();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = `backups/${tag}/${stamp.label}`;

  console.log('[backup] reading erp_state from D1…');
  const doc = await d1.getErpStateDocument();
  if (!doc || !doc.data) throw new Error('No erp_state document returned from D1');

  const data = doc.data;
  const counts = arrayCounts(data);
  const rawJson = JSON.stringify(data);
  const rawBytes = Buffer.byteLength(rawJson, 'utf8');
  console.log('[backup] state bytes', rawBytes, 'arrays', Object.keys(counts).length);

  const gz = await gzip(Buffer.from(rawJson, 'utf8'), { level: 9 });
  const stateKey = `${prefix}/erp_state-${ts}.json.gz`;
  const metaKey = `${prefix}/manifest-${ts}.json`;
  const latestKey = `backups/${tag}/latest-manifest.json`;

  console.log('[backup] uploading compressed state →', stateKey, `(${gz.length} bytes gz)`);
  const stateUp = await r2.putObject({
    key: stateKey,
    body: gz,
    contentType: 'application/gzip',
  });

  const manifest = {
    type: 'farmtrack-erp-weekly-backup',
    tag,
    isoWeek: stamp.label,
    createdAt: new Date().toISOString(),
    source: 'd1:erp_state',
    chunks: doc.chunks || null,
    generation: doc.generation || data._generation || null,
    version: doc.version || data._writeVersion || null,
    uncompressedBytes: rawBytes,
    compressedBytes: gz.length,
    stateKey,
    arrayCounts: counts,
    collectionTotals: Object.values(counts).reduce((s, n) => s + n, 0),
    r2: { bucket: stateUp.bucket, key: stateUp.key, size: stateUp.size },
  };

  await r2.putObject({
    key: metaKey,
    body: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
    contentType: 'application/json',
  });
  await r2.putObject({
    key: latestKey,
    body: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
    contentType: 'application/json',
  });

  console.log('[backup] OK', JSON.stringify({ stateKey, metaKey, latestKey, uncompressedBytes: rawBytes, compressedBytes: gz.length }));
  return manifest;
}

if (require.main === module) {
  const tagArg = process.argv.find(a => a.startsWith('--tag='));
  const tag = tagArg ? tagArg.split('=')[1] : 'weekly';
  run({ tag })
    .then(() => process.exit(0))
    .catch(e => {
      console.error('[backup] FAILED', e.message || e);
      process.exit(1);
    });
}

module.exports = { run, weekStamp };
