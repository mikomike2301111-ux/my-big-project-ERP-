/**
 * GET/POST /api/health — operational smoke test
 * Primary backend: Cloudflare D1
 * Optional: Supabase (only if env still present)
 */
const { probeD1, d1Configured } = require('../server/d1Client');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const out = {
    ok: false,
    timestamp: new Date().toISOString(),
    primary: 'd1',
    d1: null,
    supabase: null,
  };

  try {
    out.d1 = await probeD1();
  } catch (e) {
    out.d1 = { ok: false, error: e.message || String(e), backend: 'd1' };
  }

  // Soft probe Supabase only if credentials remain (migration period)
  const hasSb = Boolean(
    process.env.SUPABASE_URL &&
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)
  );
  if (hasSb) {
    try {
      const { probeSupabase } = require('../server/supabaseClient');
      out.supabase = await probeSupabase();
    } catch (e) {
      out.supabase = { ok: false, error: e.message || String(e) };
    }
  } else {
    out.supabase = { ok: false, skipped: true, reason: 'Supabase env removed — D1 is primary' };
  }

  out.ok = Boolean(out.d1 && out.d1.ok);
  out.d1Configured = d1Configured();
  res.status(out.ok ? 200 : 503).json(out);
};
