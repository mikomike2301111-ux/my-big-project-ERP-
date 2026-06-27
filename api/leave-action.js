const crypto = require('crypto');
const { invokeRpc } = require('./rpc');

function baseUrl(value) {
  const raw = String(value || 'https://erpftc.vercel.app').replace(/\/+$/, '');
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

const PLATFORM_URL = baseUrl(process.env.PLATFORM_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL);
const ACTION_SECRET = String(
  process.env.LEAVE_ACTION_SECRET ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.RESEND_API_KEY ||
  'farmtrack-leave-actions'
);

function sign(payload) {
  return crypto.createHmac('sha256', ACTION_SECRET).update(payload).digest('hex');
}

function htmlPage({ ok, title, message }) {
  const color = ok ? '#35f035' : '#d9534f';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="margin:0;background:#f8f9f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px;">
      <section style="width:min(560px,100%);background:#fff;border:1px solid #e0e8e0;border-radius:16px;box-shadow:0 10px 28px rgba(0,0,0,.06);padding:32px;">
        <img src="https://i.postimg.cc/Pqn0PJZH/logo-ftc.png" alt="FarmTrack BioSciences" width="170" style="display:block;margin-bottom:24px;">
        <p style="margin:0 0 8px;color:${color};font-weight:800;text-transform:uppercase;letter-spacing:.08em;font-size:12px;">Leave Action</p>
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;color:#111827;">${title}</h1>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#4b5563;">${message}</p>
        <a href="${PLATFORM_URL}/#/leaves/approvals" style="display:inline-block;background:#35f035;color:#fff;text-decoration:none;font-weight:800;border-radius:999px;padding:12px 20px;">Open ERP</a>
      </section>
    </main>
  </body></html>`;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const leaveId = url.searchParams.get('id') || '';
  const action = url.searchParams.get('action') || '';
  const email = url.searchParams.get('email') || 'email-approver@farmtrack.co.ke';
  const exp = Number(url.searchParams.get('exp') || 0);
  const token = url.searchParams.get('token') || '';
  const decision = action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!leaveId || !decision || !token) {
    return res.status(400).send(htmlPage({ ok: false, title: 'Invalid leave link', message: 'This leave approval link is missing required information.' }));
  }
  if (exp && Date.now() > exp) {
    return res.status(410).send(htmlPage({ ok: false, title: 'Approval link expired', message: 'Please open FarmTrack ERP and approve or reject the request from the Leaves page.' }));
  }
  const payload = `${leaveId}|${action}|${email}|${exp}`;
  const expected = sign(payload);
  const valid = expected.length === token.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  if (!valid) {
    return res.status(403).send(htmlPage({ ok: false, title: 'Approval link not verified', message: 'This link could not be verified. Please use the ERP approvals page.' }));
  }

  try {
    const result = await invokeRpc('decideLeave', [
      { id: `EMAIL-${email}`, name: `Email Approver (${email})`, email, role: 'Manager' },
      leaveId,
      { decision, note: `${decision} from email button by ${email}` }
    ]);
    const app = result?.application || {};
    return res.status(200).send(htmlPage({
      ok: true,
      title: `Leave ${decision.toLowerCase()}`,
      message: `${app.applicantName || 'The employee'}'s ${app.type || ''} leave request has been ${decision.toLowerCase()} and updated in FarmTrack ERP.`
    }));
  } catch (error) {
    return res.status(200).send(htmlPage({ ok: false, title: 'Could not update leave', message: error.message || 'The leave request could not be updated.' }));
  }
};
