const { invokeRpc } = require('./rpc');

function htmlPage({ ok, title, message }) {
  const color = ok ? '#078236' : '#d9534f';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="margin:0;background:#f8f9f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px;">
      <section style="width:min(620px,100%);background:#fff;border:1px solid #e0e8e0;border-radius:16px;box-shadow:0 10px 28px rgba(0,0,0,.06);padding:32px;">
        <img src="https://i.postimg.cc/Pqn0PJZH/logo-ftc.png" alt="FarmTrack BioSciences" width="170" style="display:block;margin-bottom:24px;">
        <p style="margin:0 0 8px;color:${color};font-weight:800;text-transform:uppercase;letter-spacing:.08em;font-size:12px;">Requisition Action</p>
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;color:#111827;">${title}</h1>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#4b5563;">${message}</p>
        <a href="https://erpftc.vercel.app/#/dashboard" style="display:inline-block;background:#078236;color:#fff;text-decoration:none;font-weight:800;border-radius:999px;padding:12px 20px;">Open ERP</a>
      </section>
    </main>
  </body></html>`;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const id = url.searchParams.get('id') || '';
  const action = url.searchParams.get('action') || '';
  const password = url.searchParams.get('password') || '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!id || !['approve', 'reject'].includes(action)) {
    return res.status(400).send(htmlPage({ ok: false, title: 'Invalid action link', message: 'This link is missing required information.' }));
  }
  if (password !== '123456789') {
    return res.status(403).send(htmlPage({ ok: false, title: 'Authentication failed', message: 'Invalid password. Please use the ERP system to approve or reject requisitions.' }));
  }

  try {
    const user = { id: 'APPROVER-EMAIL', name: 'Email Approver', email: 'approver@farmtrack.co.ke', role: 'Manager' };
    const fn = action === 'approve' ? 'approveRequisition' : 'rejectRequisition';
    const result = await invokeRpc(fn, [user, id, `${action}d via email approval link`]);
    const reqNo = result?.reqNo || id;
    return res.status(200).send(htmlPage({
      ok: true,
      title: `Requisition ${action === 'approve' ? 'Approved' : 'Rejected'}`,
      message: `Requisition ${reqNo} has been ${action === 'approve' ? 'approved' : 'rejected'} successfully. The requester has been notified.`
    }));
  } catch (error) {
    return res.status(200).send(htmlPage({ ok: false, title: 'Could not update requisition', message: error.message || 'The requisition could not be updated. It may have already been processed.' }));
  }
};
