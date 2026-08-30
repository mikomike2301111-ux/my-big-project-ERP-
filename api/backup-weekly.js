/**
 * Vercel Cron / manual: GET|POST /api/backup-weekly
 * Auth: Authorization: Bearer <CRON_SECRET or BACKUP_SECRET>
 */
const { run } = require('../scripts/backup-weekly-r2');

function authorized(req) {
  const secret = process.env.CRON_SECRET || process.env.BACKUP_SECRET || '';
  if (!secret) return process.env.NODE_ENV !== 'production';
  const h = req.headers.authorization || req.headers.Authorization || '';
  const q = (req.query && (req.query.secret || req.query.key)) || '';
  if (h === `Bearer ${secret}`) return true;
  if (q && String(q) === secret) return true;
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!authorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const tag = (req.query && req.query.tag) || 'weekly';
    const manifest = await run({ tag: String(tag) });
    res.status(200).json({ ok: true, manifest });
  } catch (e) {
    console.error('[api/backup-weekly]', e);
    res.status(500).json({ ok: false, error: (e && e.message) || String(e) });
  }
};
