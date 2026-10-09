/**
 * GET /api/health — Cloudflare-only operational probe.
 * No Supabase imports, URLs, credentials, or fallback paths.
 */
const { probeD1, d1Configured } = require('../server/d1Client');
const r2 = require('../server/r2Client');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const out = {
    ok: false,
    timestamp: new Date().toISOString(),
    primary: 'cloudflare-d1',
    d1Configured: d1Configured(),
    d1: null,
    r2Configured: r2.configured(),
    storage: { database: 'Cloudflare D1', objects: 'Cloudflare R2', cache: 'Cloudflare KV (optional)' },
  };
  try { out.d1 = await probeD1(); }
  catch (e) { out.d1 = { ok: false, error: e.message || String(e), backend: 'd1' }; }
  out.ok = Boolean(out.d1 && out.d1.ok);
  return res.status(out.ok ? 200 : 503).json(out);
};
