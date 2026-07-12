const { invokeRpc } = require('./rpc');
const { isValidActionToken, renderActionPage } = require('./action-link-utils');

module.exports = async (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const type = url.searchParams.get('type') || '';
  const id = url.searchParams.get('id') || '';
  const action = url.searchParams.get('action') || '';
  const email = url.searchParams.get('email') || 'email-approver@farmtrack.co.ke';
  const exp = Number(url.searchParams.get('exp') || 0);
  const token = url.searchParams.get('token') || '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!type || !id || !['approve', 'reject'].includes(action) || !token) {
    return res.status(400).send(renderActionPage({ ok: false, title: 'Invalid approval link', message: 'This approval link is missing required information.' }));
  }
  if (exp && Date.now() > exp) {
    return res.status(410).send(renderActionPage({ ok: false, title: 'Approval link expired', message: 'Please open FarmTrack ERP and review this request from the relevant module.' }));
  }

  const payload = `${type}|${id}|${action}|${email}|${exp}`;
  if (!isValidActionToken(payload, token)) {
    return res.status(403).send(renderActionPage({ ok: false, title: 'Approval link not verified', message: 'This link could not be verified. Please use the ERP approvals page.' }));
  }

  try {
    const user = { id: `EMAIL-${email}`, name: `Email Approver (${email})`, email, role: 'Manager' };
    if (type === 'purchase-request') {
      const fn = action === 'approve' ? 'approvePurchaseRequest' : 'rejectPurchaseRequest';
      const result = await invokeRpc(fn, [user, id, { note: `${action} from email button by ${email}` }]);
      const request = result?.request || {};
      return res.status(200).send(renderActionPage({
        ok: true,
        title: `Purchase request ${action === 'approve' ? 'approved' : 'rejected'}`,
        message: `${request.requestNo || 'The purchase request'} has been ${action === 'approve' ? 'approved' : 'rejected'} and updated in FarmTrack ERP.`,
        modulePath: '/#/purchases'
      }));
    }
    return res.status(400).send(renderActionPage({ ok: false, title: 'Unsupported approval type', message: 'This approval type is not supported yet.' }));
  } catch (error) {
    return res.status(200).send(renderActionPage({ ok: false, title: 'Could not update request', message: error.message || 'The request could not be updated.' }));
  }
};
