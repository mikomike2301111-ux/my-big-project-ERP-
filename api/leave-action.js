const { invokeRpc } = require('./rpc');
const { isValidActionToken, renderActionPage } = require('./action-link-utils');

const leaveActionPage = options => renderActionPage({
  ...options,
  badge: 'Leave Action',
  modulePath: '/#/leaves/approvals',
  maxWidth: 560
});

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
    return res.status(400).send(leaveActionPage({ ok: false, title: 'Invalid leave link', message: 'This leave approval link is missing required information.' }));
  }
  if (exp && Date.now() > exp) {
    return res.status(410).send(leaveActionPage({ ok: false, title: 'Approval link expired', message: 'Please open FarmTrack ERP and approve or reject the request from the Leaves page.' }));
  }
  const payload = `${leaveId}|${action}|${email}|${exp}`;
  if (!isValidActionToken(payload, token)) {
    return res.status(403).send(leaveActionPage({ ok: false, title: 'Approval link not verified', message: 'This link could not be verified. Please use the ERP approvals page.' }));
  }

  try {
    const result = await invokeRpc('decideLeave', [
      { id: `EMAIL-${email}`, name: `Email Approver (${email})`, email, role: 'Manager' },
      leaveId,
      { decision, note: `${decision} from email button by ${email}` }
    ]);
    const app = result?.application || {};
    return res.status(200).send(leaveActionPage({
      ok: true,
      title: `Leave ${decision.toLowerCase()}`,
      message: `${app.applicantName || 'The employee'}'s ${app.type || ''} leave request has been ${decision.toLowerCase()} and updated in FarmTrack ERP.`
    }));
  } catch (error) {
    return res.status(200).send(leaveActionPage({ ok: false, title: 'Could not update leave', message: error.message || 'The leave request could not be updated.' }));
  }
};
