const crypto = require('crypto');

function normalizeBaseUrl(value) {
  const raw = String(value || 'https://erpftc.vercel.app').replace(/\/+$/, '');
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

const platformUrl = normalizeBaseUrl(process.env.PLATFORM_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL);
const actionSecret = String(
  process.env.LEAVE_ACTION_SECRET ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.RESEND_API_KEY ||
  'farmtrack-leave-actions'
);

function signActionPayload(payload) {
  return crypto.createHmac('sha256', actionSecret).update(payload).digest('hex');
}

function isValidActionToken(payload, token) {
  const expected = signActionPayload(payload);
  return expected.length === token.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

function renderActionPage({
  ok,
  title,
  message,
  badge = 'Email Approval',
  modulePath = '/#/dashboard',
  maxWidth = 620
}) {
  const color = ok ? '#078236' : '#d9534f';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="margin:0;background:#f8f9f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px;">
      <section style="width:min(${maxWidth}px,100%);background:#fff;border:1px solid #e0e8e0;border-radius:16px;box-shadow:0 10px 28px rgba(0,0,0,.06);padding:32px;">
        <img src="https://i.postimg.cc/Pqn0PJZH/logo-ftc.png" alt="FarmTrack BioSciences" width="170" style="display:block;margin-bottom:24px;">
        <p style="margin:0 0 8px;color:${color};font-weight:800;text-transform:uppercase;letter-spacing:.08em;font-size:12px;">${badge}</p>
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;color:#111827;">${title}</h1>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#4b5563;">${message}</p>
        <a href="${platformUrl}${modulePath}" style="display:inline-block;background:#078236;color:#fff;text-decoration:none;font-weight:800;border-radius:999px;padding:12px 20px;">Open ERP</a>
      </section>
    </main>
  </body></html>`;
}

module.exports = {
  isValidActionToken,
  renderActionPage,
  signActionPayload
};
