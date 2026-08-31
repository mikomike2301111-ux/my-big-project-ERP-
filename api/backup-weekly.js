/**
 * GET|POST /api/backup-weekly — full D1 erp_state → R2 (gzip)
 * Auth: Authorization: Bearer <CRON_SECRET|BACKUP_SECRET>
 */
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);

function authorized(req) {
  const secret = process.env.CRON_SECRET || process.env.BACKUP_SECRET || '';
  if (!secret) return process.env.VERCEL_ENV !== 'production';
  const h = req.headers.authorization || req.headers.Authorization || '';
  const url = new URL(req.url || '/', 'http://localhost');
  const q = url.searchParams.get('secret') || url.searchParams.get('key') || '';
  if (h === `Bearer ${secret}`) return true;
  if (q && String(q) === secret) return true;
  return false;
}

function weekStamp(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  if (!authorized(req)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  try {
    const d1 = require('../server/d1Client');
    const r2 = require('../server/r2Client');
    if (!d1.d1Configured()) throw new Error('D1 not configured');
    if (!r2.configured()) throw new Error('R2 not configured');

    const url = new URL(req.url || '/', 'http://localhost');
    const tag = url.searchParams.get('tag') || 'weekly';
    const isoWeek = weekStamp();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = `backups/${tag}/${isoWeek}`;

    const doc = await d1.getErpStateDocument();
    if (!doc || !doc.data) throw new Error('No erp_state from D1');

    const counts = {};
    for (const [k, v] of Object.entries(doc.data)) {
      if (Array.isArray(v)) counts[k] = v.length;
    }
    const rawJson = JSON.stringify(doc.data);
    const rawBytes = Buffer.byteLength(rawJson, 'utf8');
    const gz = await gzip(Buffer.from(rawJson, 'utf8'), { level: 9 });

    const stateKey = `${prefix}/erp_state-${ts}.json.gz`;
    const metaKey = `${prefix}/manifest-${ts}.json`;
    const latestKey = `backups/${tag}/latest-manifest.json`;

    const stateUp = await r2.putObject({ key: stateKey, body: gz, contentType: 'application/gzip' });
    const manifest = {
      type: 'farmtrack-erp-weekly-backup',
      tag,
      isoWeek,
      createdAt: new Date().toISOString(),
      source: 'd1:erp_state',
      uncompressedBytes: rawBytes,
      compressedBytes: gz.length,
      stateKey,
      arrayCounts: counts,
      collectionTotals: Object.values(counts).reduce((s, n) => s + n, 0),
      r2: { bucket: stateUp.bucket, key: stateUp.key, size: stateUp.size },
    };
    const metaBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    await r2.putObject({ key: metaKey, body: metaBuf, contentType: 'application/json' });
    await r2.putObject({ key: latestKey, body: metaBuf, contentType: 'application/json' });

    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, manifest }));
  } catch (e) {
    console.error('[api/backup-weekly]', e);
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: (e && e.message) || String(e) }));
  }
};
