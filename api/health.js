/**
 * GET /api/health — operational smoke test.
 * Production data backend: Cloudflare D1. Supabase is deliberately not probed.
 */
const { probeD1, d1Configured } = require('../server/d1Client');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const out = {
    ok: false,
    timestamp: new Date().toISOString(),
    primary: 'd1',
    d1: null,
    d1Configured: d1Configured(),
  };

  try {
    out.d1 = await probeD1();
  } catch (e) {
    out.d1 = { ok: false, error: e.message || String(e), backend: 'd1' };
  }

  out.ok = Boolean(out.d1 && out.d1.ok && out.d1Configured);
  res.status(out.ok ? 200 : 503).json(out);
};
