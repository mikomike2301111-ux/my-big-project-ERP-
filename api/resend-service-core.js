/**
 * FarmTrack ERP - Enterprise Email Service Core
 * Centralized email service with full tracking, logging, retry logic
 * Uses Resend API for email delivery
 * Integrates with Supabase for persistence
 */

const RESEND_API_KEY = String(process.env.RESEND_API_KEY || 're_X5NHDbx5_P1Ft6gGfx9wt3wHUATtq4xp3').trim();
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Supabase client setup
const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://qiwggxoaqeptdqzpwgft.supabase.co').trim().replace(/\/$/, '');
const SUPABASE_SERVICE_KEY = String(process.env.SUPABASE_SERVICE_KEY || '').trim();

// Sender addresses configured in Resend (verified domain: staff.farmtrack.co.ke)
const SENDERS = {
  noreply: 'FarmTrack ERP <noreply@staff.farmtrack.co.ke>',
  support: 'FarmTrack Support <support@staff.farmtrack.co.ke>',
  hr: 'FarmTrack HR <hr@staff.farmtrack.co.ke>',
  leave: 'FarmTrack Leave <leave@staff.farmtrack.co.ke>',
  finance: 'FarmTrack Finance <finance@staff.farmtrack.co.ke>',
  procurement: 'FarmTrack Procurement <procurement@staff.farmtrack.co.ke>',
  assets: 'FarmTrack Assets <assets@staff.farmtrack.co.ke>'
};

const PLATFORM_NAME = 'FarmTrack ERP';
const PLATFORM_URL = 'https://erpftc.vercel.app';

/**
 * Generate a secure unique token for email links
 */
function generateSecureToken() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Fetch helper for Supabase REST API
 */
async function supabaseQuery(method, table, body = null) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=representation'
    }
  };
  if (body) options.body = JSON.stringify(body);
  try {
    const res = await fetch(url, options);
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Log email to database
 */
async function logEmail({ to, from, subject, module, referenceType, referenceId, status, trackingId, error }) {
  try {
    const record = {
      recipient: to,
      sender: from,
      subject,
      module_source: module || 'system',
      reference_type: referenceType || null,
      reference_id: referenceId || null,
      status: status || 'sent',
      tracking_id: trackingId || null,
      error_message: error || null,
      sent_at: new Date().toISOString()
    };
    await supabaseQuery('POST', 'email_logs', record);
  } catch (err) {
    console.error('Failed to log email:', err);
  }
}

/**
 * Update email tracking status (opens, clicks)
 */
async function updateEmailTracking(trackingId, updates) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/email_tracking?id=eq.${trackingId}`;
    await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify(updates)
    });
  } catch (err) {
    console.error('Failed to update tracking:', err);
  }
}

/**
 * Record email activity (open, click, bounce, etc.)
 */
async function recordEmailActivity(trackingId, activityType, metadata = {}) {
  try {
    const record = {
      tracking_id: trackingId,
      activity_type: activityType,
      ip_address: metadata.ip || null,
      user_agent: metadata.userAgent || null,
      timestamp: new Date().toISOString(),
      metadata: metadata
    };
    await supabaseQuery('POST', 'email_activities', record);
  } catch (err) {
    console.error('Failed to record activity:', err);
  }
}

/**
 * Low-level send via Resend API
 */
async function sendRawEmail({ to, subject, html, text, replyTo, cc, bcc, from }) {
  if (!RESEND_API_KEY) {
    return { error: 'RESEND_API_KEY not configured', sent: false };
  }
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (recipients.length === 0) {
    return { error: 'No recipients provided', sent: false };
  }
  const body = {
    from: from || SENDERS.noreply,
    to: recipients,
    subject,
    html: html || text || ''
  };
  if (text) body.text = text;
  if (replyTo) body.reply_to = replyTo;
  if (cc) body.cc = Array.isArray(cc) ? cc : [cc];
  if (bcc) body.bcc = Array.isArray(bcc) ? bcc : [bcc];

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data.message || `Resend API error ${res.status}`, sent: false, status: res.status };
    }
    return { sent: true, id: data.id, data };
  } catch (err) {
    return { error: err.message, sent: false };
  }
}

/**
 * Complete email shell template with tracking pixel and link wrapping
 */
function emailShell({ title, subtitle, bodyHtml, actionLabel, actionUrl, footerNote, trackingPixelUrl, trackingId }) {
  const wrappedActionUrl = actionUrl && trackingId
    ? `${PLATFORM_URL}/api/email-track/click?tracking_id=${trackingId}&redirect=${encodeURIComponent(actionUrl)}`
    : actionUrl;

  const trackingPixel = trackingPixelUrl
    ? `<img src="${trackingPixelUrl}" alt="" width="1" height="1" style="display:none;" />`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#101828;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(16,24,40,.06);">
        <tr><td style="background:#050505;padding:22px 32px;">
          <table width="100%"><tr>
            <td style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-.01em;">${PLATFORM_NAME}</td>
            <td align="right" style="color:#98a2b3;font-size:12px;">Farmtrack Bio Sciences Ltd</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 6px;font-size:22px;letter-spacing:-.02em;color:#101828;">${title}</h1>
          ${subtitle ? `<p style="margin:0 0 22px;font-size:14px;color:#475467;">${subtitle}</p>` : ''}
          ${bodyHtml || ''}
          ${actionLabel && wrappedActionUrl ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
            <tr><td align="center">
              <a href="${wrappedActionUrl}" style="display:inline-block;background:#175cd3;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 28px;border-radius:9px;">${actionLabel}</a>
            </td></tr>
          </table>` : ''}
        </td></tr>
        <tr><td style="background:#f9fafb;padding:18px 32px;border-top:1px solid #eef0f3;">
          <table width="100%"><tr>
            <td style="font-size:12px;color:#667085;line-height:1.5;">
              <p style="margin:0;">${footerNote || 'This is an automated message from Unity ERP · Farmtrack Bio Sciences Ltd, Kenya.'}</p>
              <p style="margin:4px 0 0;">${PLATFORM_URL}</p>
            </td>
            <td align="right" style="font-size:11px;color:#98a2b3;">
              <a href="${PLATFORM_URL}/email-preferences?tracking_id=${trackingId || ''}" style="color:#667085;text-decoration:underline;">Manage preferences</a>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${trackingPixel}
</body>
</html>`;
}

/**
 * Create HTML table row helper
 */
function row(cells) {
  return `<tr>${cells.map(c => `<td style="padding:8px 10px;border-bottom:1px solid #eef0f3;font-size:13px;color:#344054;">${c}</td>`).join('')}</tr>`;
}

/**
 * Create HTML table header helper
 */
function tableHead(cells) {
  return `<tr>${cells.map(c => `<th style="padding:8px 10px;border-bottom:2px solid #d0d5dd;font-size:11px;font-weight:700;color:#667085;text-transform:uppercase;text-align:left;">${c}</th>`).join('')}</tr>`;
}

/**
 * Currency formatter
 */
function ksh(n) {
  const num = Number(n) || 0;
  return 'KSh ' + num.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Send an email with full tracking and logging
 */
async function sendWithTracking({ to, from, subject, html, text, replyTo, cc, bcc, module, referenceType, referenceId, trackingMetadata }) {
  const trackingId = generateSecureToken();
  const appBaseUrl = PLATFORM_URL;
  const trackingPixelUrl = `${appBaseUrl}/api/email-track/open?tracking_id=${trackingId}`;

  // Inject tracking pixel into HTML
  const trackedHtml = html.includes('</body>')
    ? html.replace('</body>', `<img src="${trackingPixelUrl}" alt="" width="1" height="1" style="display:none;" />\n</body>`)
    : html + `<img src="${trackingPixelUrl}" alt="" width="1" height="1" style="display:none;" />`;

  // Create tracking record
  try {
    await supabaseQuery('POST', 'email_tracking', {
      id: trackingId,
      recipient: Array.isArray(to) ? to.join(', ') : to,
      sender: from || SENDERS.noreply,
      subject,
      module_source: module || 'system',
      reference_type: referenceType || null,
      reference_id: referenceId || null,
      metadata: trackingMetadata || {},
      sent_at: new Date().toISOString(),
      status: 'pending'
    });
  } catch (err) {
    console.error('Failed to create tracking record:', err);
  }

  // Send email
  const result = await sendRawEmail({
    to, from, subject, html: trackedHtml, text, replyTo, cc, bcc
  });

  // Update tracking status
  if (result.sent) {
    await updateEmailTracking(trackingId, { 
      status: 'sent', 
      resend_id: result.id,
      delivered_at: new Date().toISOString()
    });
  } else {
    await updateEmailTracking(trackingId, { 
      status: 'failed', 
      error_message: result.error,
      failed_at: new Date().toISOString()
    });
  }

  // Log email
  await logEmail({
    to: Array.isArray(to) ? to.join(', ') : to,
    from: from || SENDERS.noreply,
    subject,
    module,
    referenceType,
    referenceId,
    status: result.sent ? 'sent' : 'failed',
    trackingId,
    error: result.error
  });

  return { ...result, trackingId };
}

// =============================================
// LEAVE MANAGEMENT EMAIL TEMPLATES
// =============================================

async function sendLeaveRequestSubmitted({ to, employeeName, department, leaveType, startDate, endDate, days, reason, leaveId, managerEmail }) {
  const bodyHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
      <thead>${tableHead(['Detail', 'Information'])}</thead>
      <tbody>
        ${row(['Employee', `<strong>${employeeName}</strong>`])}
        ${row(['Department', department || '—'])}
        ${row(['Leave Type', `<strong>${leaveType}</strong>`])}
        ${row(['Start Date', startDate])}
        ${row(['End Date', endDate])}
        ${row(['Duration', `${days} day${days === 1 ? '' : 's'}`])}
        ${reason ? row(['Reason', reason]) : ''}
      </tbody>
    </table>
    <p style="font-size:13px;color:#475467;margin:12px 0 0;">Please review and take action on this leave request.</p>`;

  // Send confirmation to employee
  const employeeHtml = emailShell({
    title: 'Leave Request Submitted ✓',
    subtitle: `Hi ${employeeName}, your ${leaveType} leave request has been submitted for approval.`,
    bodyHtml: `<table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
      ${row(['Leave Type', `<strong>${leaveType}</strong>`])}
      ${row(['Duration', `${startDate} → ${endDate} (${days} day${days === 1 ? '' : 's'})`])}
      ${row(['Status', '<strong style="color:#175cd3;">Pending Approval</strong>'])}
    </table>`,
    footerNote: 'You will be notified once your leave is approved or rejected.'
  });

  // Send notification to manager
  const managerHtml = emailShell({
    title: `Leave Approval Required — ${employeeName}`,
    subtitle: `${employeeName} (${department || '—'}) is requesting ${leaveType} leave.`,
    bodyHtml,
    actionLabel: 'View Request',
    actionUrl: `${PLATFORM_URL}/leaves/${leaveId}`,
    footerNote: 'Login required to approve or reject this request.'
  });

  const results = [];
  
  // Send to employee
  const empResult = await sendWithTracking({
    to,
    from: SENDERS.leave,
    subject: `Leave Request Submitted — ${leaveType} (${days}d)`,
    html: employeeHtml,
    module: 'leaves',
    referenceType: 'leave',
    referenceId: leaveId
  });
  results.push(empResult);

  // Send to manager(s)
  if (managerEmail) {
    const mgrResult = await sendWithTracking({
      to: managerEmail,
      from: SENDERS.leave,
      subject: `Leave Approval Required — ${employeeName} (${leaveType})`,
      html: managerHtml,
      module: 'leaves',
      referenceType: 'leave',
      referenceId: leaveId,
      replyTo: to
    });
    results.push(mgrResult);
  }

  return results;
}

async function sendLeaveApproved({ to, employeeName, leaveType, startDate, endDate, days, leaveId, approvedBy }) {
  const html = emailShell({
    title: 'Leave Approved ✓',
    subtitle: `Great news ${employeeName}! Your ${leaveType} leave has been approved.`,
    bodyHtml: `
      <div style="background:#e8f8ee;border-radius:10px;padding:16px 20px;margin:12px 0;">
        <p style="margin:0 0 4px;font-size:14px;color:#078236;font-weight:600;">Approved</p>
        <p style="margin:0;font-size:13px;color:#344054;">${leaveType} · ${startDate} → ${endDate} (${days} day${days === 1 ? '' : 's'})</p>
        ${approvedBy ? `<p style="margin:4px 0 0;font-size:12px;color:#667085;">Approved by: ${approvedBy}</p>` : ''}
      </div>`,
    actionLabel: 'View Leave',
    actionUrl: `${PLATFORM_URL}/leaves/${leaveId}`,
    footerNote: 'Enjoy your leave! Please ensure all pending tasks are handed over properly.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.leave,
    subject: `Leave Approved — ${leaveType} (${days}d)`,
    html,
    module: 'leaves',
    referenceType: 'leave',
    referenceId: leaveId
  });
}

async function sendLeaveRejected({ to, employeeName, leaveType, startDate, endDate, days, leaveId, rejectedBy, reason }) {
  const html = emailShell({
    title: 'Leave Request Update',
    subtitle: `Hi ${employeeName}, your ${leaveType} leave request has been reviewed.`,
    bodyHtml: `
      <div style="background:#ffecec;border-radius:10px;padding:16px 20px;margin:12px 0;">
        <p style="margin:0 0 4px;font-size:14px;color:#d92d20;font-weight:600;">Not Approved</p>
        <p style="margin:0;font-size:13px;color:#344054;">${leaveType} · ${startDate} → ${endDate} (${days} day${days === 1 ? '' : 's'})</p>
        ${rejectedBy ? `<p style="margin:4px 0 0;font-size:12px;color:#667085;">Reviewed by: ${rejectedBy}</p>` : ''}
        ${reason ? `<p style="margin:8px 0 0;font-size:13px;color:#344054;background:#fff;padding:10px;border-radius:6px;"><strong>Reason:</strong> ${reason}</p>` : ''}
      </div>`,
    actionLabel: 'View Details',
    actionUrl: `${PLATFORM_URL}/leaves/${leaveId}`,
    footerNote: 'Please contact your manager or HR if you have any questions.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.leave,
    subject: `Leave Update — ${leaveType} Request`,
    html,
    module: 'leaves',
    referenceType: 'leave',
    referenceId: leaveId
  });
}

async function sendLeaveCancelled({ to, employeeName, leaveType, startDate, endDate, days, leaveId }) {
  const html = emailShell({
    title: 'Leave Cancelled',
    subtitle: `Hi ${employeeName}, your ${leaveType} leave has been cancelled.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        ${row(['Leave Type', `<strong>${leaveType}</strong>`])}
        ${row(['Original Dates', `${startDate} → ${endDate} (${days} day${days === 1 ? '' : 's'})`])}
        ${row(['Status', '<strong style="color:#d92d20;">Cancelled</strong>'])}
      </table>`,
    footerNote: 'If this was unexpected, please contact HR.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.hr,
    subject: `Leave Cancelled — ${leaveType}`,
    html,
    module: 'leaves',
    referenceType: 'leave',
    referenceId: leaveId
  });
}

async function sendLeaveBalanceReminder({ to, employeeName, annualBalance, sickBalance, personalBalance, carryForward }) {
  const html = emailShell({
    title: 'Leave Balance Reminder',
    subtitle: `Hi ${employeeName}, here's your current leave balance summary.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        <thead>${tableHead(['Leave Type', 'Days Remaining'])}</thead>
        <tbody>
          ${row(['Annual Leave', `<strong>${annualBalance || 0}</strong> days`])}
          ${row(['Sick Leave', `<strong>${sickBalance || 0}</strong> days`])}
          ${row(['Personal Leave', `<strong>${personalBalance || 0}</strong> days`])}
          ${carryForward ? row(['Carry Forward', `<strong>${carryForward}</strong> days`]) : ''}
        </tbody>
      </table>
      <p style="font-size:13px;color:#475467;">Please plan your leave for the current year. Unused leave may expire at year-end.</p>`,
    actionLabel: 'Apply for Leave',
    actionUrl: `${PLATFORM_URL}/leaves`,
    footerNote: 'Leave balances are updated after each approval.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.hr,
    subject: 'Your Leave Balance Summary',
    html,
    module: 'leaves',
    referenceType: 'leave-balance',
    referenceId: employeeName
  });
}

// =============================================
// INVOICE MANAGEMENT EMAIL TEMPLATES
// =============================================

async function sendInvoiceCreated({ to, customerName, invoiceNo, amount, dueDate, invoiceId, companyName }) {
  const html = emailShell({
    title: `Invoice ${invoiceNo}`,
    subtitle: `Hi ${customerName}, a new invoice has been created for you.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;background:#f9fafb;border-radius:8px;padding:12px;">
        ${row(['Invoice Number', `<strong>${invoiceNo}</strong>`])}
        ${row(['Amount', `<strong style="color:#175cd3;">${ksh(amount)}</strong>`])}
        ${row(['Due Date', dueDate || '—'])}
        ${row(['Status', '<span style="color:#175cd3;">Pending Payment</span>'])}
      </table>`,
    actionLabel: 'View Invoice',
    actionUrl: `${PLATFORM_URL}/invoices/${invoiceId}`,
    footerNote: 'Please remit payment by the due date to avoid late fees.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.finance,
    subject: `Invoice ${invoiceNo} — ${ksh(amount)} due ${dueDate || ''}`,
    html,
    module: 'invoices',
    referenceType: 'invoice',
    referenceId: invoiceId,
    replyTo: 'support@staff.farmtrack.co.ke'
  });
}

async function sendInvoiceSent({ to, customerName, invoiceNo, amount, dueDate, invoiceId }) {
  const html = emailShell({
    title: `Invoice ${invoiceNo} Sent`,
    subtitle: `Hi ${customerName}, your invoice has been dispatched.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        ${row(['Invoice', `<strong>${invoiceNo}</strong>`])}
        ${row(['Amount Due', ksh(amount)])}
        ${row(['Due Date', dueDate])}
      </table>`,
    actionLabel: 'View Invoice',
    actionUrl: `${PLATFORM_URL}/invoices/${invoiceId}`,
    footerNote: 'A PDF copy is attached for your records.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.finance,
    subject: `Invoice ${invoiceNo} Sent`,
    html,
    module: 'invoices',
    referenceType: 'invoice',
    referenceId: invoiceId,
    replyTo: 'support@staff.farmtrack.co.ke'
  });
}

async function sendPaymentReceived({ to, customerName, invoiceNo, amount, paidAmount, balance, paymentMethod, invoiceId }) {
  const isFullyPaid = Number(balance) <= 0;
  const html = emailShell({
    title: isFullyPaid ? 'Payment Received — Invoice Paid ✓' : 'Partial Payment Received',
    subtitle: `Thank you ${customerName}, we have received your payment.`,
    bodyHtml: `
      <div style="background:${isFullyPaid ? '#e8f8ee' : '#fff7e6'};border-radius:10px;padding:16px 20px;margin:12px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row(['Invoice', invoiceNo])}
          ${row(['Amount Paid', `<strong style="color:#078236;">${ksh(paidAmount)}</strong>`])}
          ${row(['Payment Method', paymentMethod || '—'])}
          ${row(['Outstanding Balance', isFullyPaid ? '<strong style="color:#078236;">Paid in Full</strong>' : `<strong style="color:#d92d20;">${ksh(balance)}</strong>`])}
        </table>
      </div>`,
    actionLabel: 'View Invoice',
    actionUrl: `${PLATFORM_URL}/invoices/${invoiceId}`,
    footerNote: 'Thank you for your prompt payment!'
  });

  return sendWithTracking({
    to,
    from: SENDERS.finance,
    subject: `Payment Received — ${ksh(paidAmount)} for Invoice ${invoiceNo}`,
    html,
    module: 'invoices',
    referenceType: 'payment',
    referenceId: invoiceId
  });
}

async function sendInvoiceOverdue({ to, customerName, invoiceNo, amount, dueDate, daysOverdue, invoiceId }) {
  const html = emailShell({
    title: '⚠ Invoice Overdue',
    subtitle: `Dear ${customerName}, Invoice ${invoiceNo} is now overdue.`,
    bodyHtml: `
      <div style="background:#fff3f3;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin:12px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row(['Invoice', `<strong>${invoiceNo}</strong>`])}
          ${row(['Outstanding Amount', `<strong style="color:#d92d20;">${ksh(amount)}</strong>`])}
          ${row(['Due Date', dueDate])}
          ${row(['Days Overdue', `<strong style="color:#d92d20;">${daysOverdue || 0} day${daysOverdue === 1 ? '' : 's'}</strong>`])}
        </table>
        <p style="margin:8px 0 0;font-size:13px;color:#475467;">Please arrange payment at your earliest convenience to avoid any service interruption.</p>
      </div>`,
    actionLabel: 'Pay Now',
    actionUrl: `${PLATFORM_URL}/invoices/${invoiceId}`,
    footerNote: 'If you have already paid, please disregard this notice.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.finance,
    subject: `⚠ OVERDUE: Invoice ${invoiceNo} — ${ksh(amount)}`,
    html,
    module: 'invoices',
    referenceType: 'invoice',
    referenceId: invoiceId,
    replyTo: 'support@staff.farmtrack.co.ke'
  });
}

async function sendCreditNoteIssued({ to, customerName, creditNoteNo, invoiceNo, amount, reason, creditNoteId }) {
  const html = emailShell({
    title: `Credit Note ${creditNoteNo}`,
    subtitle: `Dear ${customerName}, a credit note has been issued against Invoice ${invoiceNo}.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        ${row(['Credit Note', `<strong>${creditNoteNo}</strong>`])}
        ${row(['Original Invoice', invoiceNo])}
        ${row(['Credit Amount', `<strong style="color:#078236;">${ksh(amount)}</strong>`])}
        ${reason ? row(['Reason', reason]) : ''}
      </table>`,
    actionLabel: 'View Credit Note',
    actionUrl: `${PLATFORM_URL}/invoices?credit_note=${creditNoteId}`,
    footerNote: 'This credit will be applied to your account balance.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.finance,
    subject: `Credit Note ${creditNoteNo} — ${ksh(amount)} credit`,
    html,
    module: 'invoices',
    referenceType: 'credit-note',
    referenceId: creditNoteId,
    replyTo: 'support@staff.farmtrack.co.ke'
  });
}

// =============================================
// PURCHASE ORDER EMAIL TEMPLATES
// =============================================

async function sendPurchaseRequisitionSubmitted({ to, requesterName, department, items, total, requisitionId, approverEmail }) {
  const itemsHtml = items && items.length ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0 16px;">
      <thead>${tableHead(['Item', 'Qty', 'Est. Cost', 'Total'])}</thead>
      <tbody>${items.map(it => row([
        it.name || it.description || 'Item',
        it.qty || it.quantity || 1,
        ksh(it.unitCost || it.price || 0),
        ksh((it.qty || it.quantity || 1) * (it.unitCost || it.price || 0))
      ])).join('')}</tbody>
    </table>` : '';

  const html = emailShell({
    title: 'Purchase Requisition Submitted',
    subtitle: `${requesterName} submitted a purchase requisition for ${department || 'their'} department.`,
    bodyHtml: `
      ${itemsHtml}
      <p style="font-size:13px;color:#475467;">Total estimated: <strong>${ksh(total)}</strong></p>`,
    actionLabel: 'View Requisition',
    actionUrl: `${PLATFORM_URL}/purchases/requisitions/${requisitionId}`,
    footerNote: 'Please review and approve this requisition.'
  });

  // Send to requester
  await sendWithTracking({
    to,
    from: SENDERS.procurement,
    subject: `Purchase Requisition Submitted — ${ksh(total)}`,
    html,
    module: 'purchasing',
    referenceType: 'requisition',
    referenceId: requisitionId
  });

  // Send to approver
  if (approverEmail) {
    const approverHtml = emailShell({
      title: `Purchase Requisition — Approval Required`,
      subtitle: `${requesterName} (${department || '—'}) needs approval for a purchase requisition.`,
      bodyHtml: `
        ${itemsHtml}
        <p style="font-size:13px;color:#475467;">Total: <strong>${ksh(total)}</strong></p>`,
      actionLabel: 'Review & Approve',
      actionUrl: `${PLATFORM_URL}/purchases/requisitions/${requisitionId}`,
      footerNote: 'Login required to approve.'
    });

    await sendWithTracking({
      to: approverEmail,
      from: SENDERS.procurement,
      subject: `Purchase Requisition — ${requesterName} requires approval`,
      html: approverHtml,
      module: 'purchasing',
      referenceType: 'requisition',
      referenceId: requisitionId,
      replyTo: to
    });
  }
}

async function sendPOAwaitingApproval({ to, supplierName, poNo, items, total, poId, department }) {
  const itemsHtml = items && items.length ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0 16px;">
      <thead>${tableHead(['Item', 'Qty', 'Unit Price', 'Total'])}</thead>
      <tbody>${items.map(it => row([
        it.name || it.description || 'Item',
        it.qty || it.quantity || 1,
        ksh(it.unitPrice || 0),
        ksh((it.qty || it.quantity || 1) * (it.unitPrice || 0))
      ])).join('')}</tbody>
    </table>` : '';

  const html = emailShell({
    title: `PO ${poNo} — Awaiting Approval`,
    subtitle: `Purchase Order from ${supplierName} requires your approval.`,
    bodyHtml: `
      ${itemsHtml}
      <p style="font-size:13px;color:#475467;">Department: ${department || '—'} · Total: <strong>${ksh(total)}</strong></p>`,
    actionLabel: 'Review & Approve',
    actionUrl: `${PLATFORM_URL}/purchases/orders/${poId}`,
    footerNote: 'Login required to approve or reject this purchase order.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.procurement,
    subject: `PO ${poNo} — ${ksh(total)} Awaiting Approval`,
    html,
    module: 'purchasing',
    referenceType: 'po',
    referenceId: poId
  });
}

async function sendPOApproved({ to, supplierName, poNo, total, poId, approvedBy }) {
  const html = emailShell({
    title: `PO ${poNo} Approved ✓`,
    subtitle: `The Purchase Order for ${supplierName} has been approved.`,
    bodyHtml: `
      <div style="background:#e8f8ee;border-radius:10px;padding:16px 20px;margin:12px 0;">
        <p style="margin:0 0 4px;font-size:14px;color:#078236;font-weight:600;">Approved</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row(['PO Number', `<strong>${poNo}</strong>`])}
          ${row(['Supplier', supplierName])}
          ${row(['Total', ksh(total)])}
          ${approvedBy ? row(['Approved By', approvedBy]) : ''}
        </table>
      </div>`,
    actionLabel: 'View PO',
    actionUrl: `${PLATFORM_URL}/purchases/orders/${poId}`,
    footerNote: 'Proceed with procurement as planned.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.procurement,
    subject: `PO ${poNo} Approved — ${ksh(total)}`,
    html,
    module: 'purchasing',
    referenceType: 'po',
    referenceId: poId
  });
}

async function sendPORejected({ to, supplierName, poNo, total, poId, rejectedBy, reason }) {
  const html = emailShell({
    title: `PO ${poNo} — Not Approved`,
    subtitle: `The Purchase Order for ${supplierName} was not approved.`,
    bodyHtml: `
      <div style="background:#ffecec;border-radius:10px;padding:16px 20px;margin:12px 0;">
        <p style="margin:0 0 4px;font-size:14px;color:#d92d20;font-weight:600;">Rejected</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row(['PO Number', poNo])}
          ${row(['Supplier', supplierName])}
          ${row(['Total', ksh(total)])}
          ${rejectedBy ? row(['Reviewed By', rejectedBy]) : ''}
          ${reason ? row(['Reason', reason]) : ''}
        </table>
      </div>`,
    actionLabel: 'View Details',
    actionUrl: `${PLATFORM_URL}/purchases/orders/${poId}`,
    footerNote: 'Please review the feedback and resubmit if necessary.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.procurement,
    subject: `PO ${poNo} — Rejected`,
    html,
    module: 'purchasing',
    referenceType: 'po',
    referenceId: poId
  });
}

// =============================================
// ASSET MANAGEMENT EMAIL TEMPLATES
// =============================================

async function sendAssetAssigned({ to, employeeName, assetName, assetTag, serialNo, assignedDate, assetId }) {
  const html = emailShell({
    title: 'Asset Assigned to You ✓',
    subtitle: `Hi ${employeeName}, an asset has been assigned to you.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        ${row(['Asset', `<strong>${assetName}</strong>`])}
        ${row(['Asset Tag', assetTag || '—'])}
        ${serialNo ? row(['Serial Number', serialNo]) : ''}
        ${row(['Assigned Date', assignedDate])}
      </table>
      <p style="font-size:13px;color:#475467;">You are responsible for the safekeeping and proper use of this asset.</p>`,
    actionLabel: 'Accept Asset',
    actionUrl: `${PLATFORM_URL}/assets/${assetId}`,
    footerNote: 'Please acknowledge receipt of this asset by clicking Accept Asset.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.assets,
    subject: `Asset Assigned — ${assetName} (${assetTag || ''})`,
    html,
    module: 'assets',
    referenceType: 'asset',
    referenceId: assetId
  });
}

async function sendAssetReturned({ to, managerEmail, employeeName, assetName, assetTag, returnedDate, condition, assetId }) {
  const html = emailShell({
    title: 'Asset Returned',
    subtitle: `${employeeName} has returned ${assetName}.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        ${row(['Asset', `<strong>${assetName}</strong>`])}
        ${row(['Asset Tag', assetTag || '—'])}
        ${row(['Returned By', employeeName])}
        ${row(['Return Date', returnedDate])}
        ${condition ? row(['Condition', condition]) : ''}
      </table>`,
    actionLabel: 'View Asset',
    actionUrl: `${PLATFORM_URL}/assets/${assetId}`,
    footerNote: 'Please inspect the returned asset and update its status.'
  });

  if (managerEmail) {
    await sendWithTracking({
      to: managerEmail,
      from: SENDERS.assets,
      subject: `Asset Returned — ${assetName} by ${employeeName}`,
      html,
      module: 'assets',
      referenceType: 'asset',
      referenceId: assetId
    });
  }

  // Send confirmation to employee
  const empHtml = emailShell({
    title: 'Asset Return Confirmed',
    subtitle: `Hi ${employeeName}, your return of ${assetName} has been recorded.`,
    bodyHtml: `<p style="font-size:13px;color:#475467;">Asset Tag: ${assetTag || '—'}<br/>Return Date: ${returnedDate}</p>`,
    footerNote: 'Thank you for returning the asset in good order.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.assets,
    subject: `Asset Return Confirmed — ${assetName}`,
    html: empHtml,
    module: 'assets',
    referenceType: 'asset',
    referenceId: assetId
  });
}

async function sendAssetMaintenanceDue({ to, assetName, assetTag, maintenanceType, dueDate, description, assetId }) {
  const html = emailShell({
    title: '⚠ Asset Maintenance Due',
    subtitle: `${assetName} (${assetTag || ''}) requires maintenance.`,
    bodyHtml: `
      <div style="background:#fff7e6;border-radius:10px;padding:16px 20px;margin:12px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row(['Asset', `<strong>${assetName}</strong>`])}
          ${row(['Asset Tag', assetTag || '—'])}
          ${row(['Maintenance Type', maintenanceType || 'Routine'])}
          ${row(['Due Date', `<strong>${dueDate}</strong>`])}
          ${description ? row(['Description', description]) : ''}
        </table>
      </div>`,
    actionLabel: 'Schedule Maintenance',
    actionUrl: `${PLATFORM_URL}/assets/${assetId}`,
    footerNote: 'Timely maintenance extends asset life and reduces downtime.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.assets,
    subject: `Maintenance Due — ${assetName} (${dueDate})`,
    html,
    module: 'assets',
    referenceType: 'maintenance',
    referenceId: assetId
  });
}

async function sendAssetDisposalRequest({ to, managerEmail, assetName, assetTag, reason, estimatedValue, assetId }) {
  const html = emailShell({
    title: 'Asset Disposal Request',
    subtitle: `A disposal request has been submitted for ${assetName}.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        ${row(['Asset', `<strong>${assetName}</strong>`])}
        ${row(['Asset Tag', assetTag || '—'])}
        ${reason ? row(['Reason', reason]) : ''}
        ${estimatedValue ? row(['Estimated Value', ksh(estimatedValue)]) : ''}
      </table>`,
    actionLabel: 'Review Request',
    actionUrl: `${PLATFORM_URL}/assets/${assetId}`,
    footerNote: 'Asset disposal requires management approval.'
  });

  if (managerEmail) {
    await sendWithTracking({
      to: managerEmail,
      from: SENDERS.assets,
      subject: `Asset Disposal Request — ${assetName}`,
      html,
      module: 'assets',
      referenceType: 'disposal',
      referenceId: assetId
    });
  }
}

// =============================================
// HR EMAIL TEMPLATES
// =============================================

async function sendEmployeeInvitation({ to, employeeName, role, department, invitationToken }) {
  const html = emailShell({
    title: 'Welcome to FarmTrack ERP!',
    subtitle: `Hi ${employeeName}, your employee account has been created.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        ${row(['Name', `<strong>${employeeName}</strong>`])}
        ${row(['Role', role || '—'])}
        ${row(['Department', department || '—'])}
      </table>
      <p style="font-size:13px;color:#475467;">Please activate your account to get started with FarmTrack ERP.</p>`,
    actionLabel: 'Activate Account',
    actionUrl: `${PLATFORM_URL}/activate?token=${invitationToken}`,
    footerNote: 'This link expires in 72 hours.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.hr,
    subject: `Welcome to FarmTrack ERP, ${employeeName}!`,
    html,
    module: 'hr',
    referenceType: 'invitation',
    referenceId: invitationToken
  });
}

async function sendEmployeeOnboarding({ to, employeeName, role, department, startDate, managerName, onboardingTasks }) {
  const tasksHtml = onboardingTasks && onboardingTasks.length ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
      <thead>${tableHead(['Task', 'Status'])}</thead>
      <tbody>${onboardingTasks.map(t => row([t.name || t, '<span style="color:#667085;">Pending</span>'])).join('')}</tbody>
    </table>` : '';

  const html = emailShell({
    title: 'Onboarding Checklist',
    subtitle: `Welcome aboard ${employeeName}! Here's your onboarding plan.`,
    bodyHtml: `
      <p style="font-size:13px;color:#475467;">Start Date: <strong>${startDate || '—'}</strong>${managerName ? ` · Manager: <strong>${managerName}</strong>` : ''}</p>
      ${tasksHtml}
      <p style="font-size:13px;color:#475467;">Please complete your onboarding tasks before your start date.</p>`,
    actionLabel: 'Open Staff Portal',
    actionUrl: `${PLATFORM_URL}/hr/onboarding`,
    footerNote: 'HR will follow up on your progress.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.hr,
    subject: `Onboarding Checklist — ${employeeName}`,
    html,
    module: 'hr',
    referenceType: 'onboarding',
    referenceId: employeeName
  });
}

async function sendProbationCompletion({ to, employeeName, role, department, probationEndDate, managerEmail }) {
  const html = emailShell({
    title: 'Probation Period Ending',
    subtitle: `${employeeName}'s probation period is ending soon.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        ${row(['Employee', `<strong>${employeeName}</strong>`])}
        ${row(['Role', role || '—'])}
        ${row(['Department', department || '—'])}
        ${row(['Probation End Date', `<strong>${probationEndDate}</strong>`])}
      </table>
      <p style="font-size:13px;color:#475467;">Please complete the probation review before the end date.</p>`,
    actionLabel: 'Complete Review',
    actionUrl: `${PLATFORM_URL}/hr/probation`,
    footerNote: 'Timely completion ensures smooth transition to permanent employment.'
  });

  // Send to manager
  if (managerEmail) {
    await sendWithTracking({
      to: managerEmail,
      from: SENDERS.hr,
      subject: `Probation Review — ${employeeName}`,
      html,
      module: 'hr',
      referenceType: 'probation',
      referenceId: employeeName
    });
  }

  // Send to employee
  const empHtml = emailShell({
    title: 'Probation Period Update',
    subtitle: `Hi ${employeeName}, your probation period is ending on ${probationEndDate}.`,
    bodyHtml: `<p style="font-size:13px;color:#475467;">Your manager will be conducting a performance review. Please prepare accordingly.</p>`,
    footerNote: 'Congratulations on reaching this milestone!'
  });

  return sendWithTracking({
    to,
    from: SENDERS.hr,
    subject: 'Probation Period — Important Update',
    html: empHtml,
    module: 'hr',
    referenceType: 'probation',
    referenceId: employeeName
  });
}

async function sendContractExpiryReminder({ to, employeeName, contractEndDate, contractType, managerEmail }) {
  const html = emailShell({
    title: '⚠ Contract Expiry Reminder',
    subtitle: `${employeeName}'s contract is expiring soon.`,
    bodyHtml: `
      <div style="background:#fff7e6;border-radius:10px;padding:16px 20px;margin:12px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row(['Employee', `<strong>${employeeName}</strong>`])}
          ${row(['Contract Type', contractType || '—'])}
          ${row(['Contract End Date', `<strong style="color:#d92d20;">${contractEndDate}</strong>`])}
        </table>
      </div>`,
    actionLabel: 'Review Contract',
    actionUrl: `${PLATFORM_URL}/hr/contracts`,
    footerNote: 'Please initiate renewal or termination process before expiry.'
  });

  if (managerEmail) {
    await sendWithTracking({
      to: managerEmail,
      from: SENDERS.hr,
      subject: `⚠ Contract Expiry — ${employeeName} (${contractEndDate})`,
      html,
      module: 'hr',
      referenceType: 'contract',
      referenceId: employeeName
    });
  }

  const empHtml = emailShell({
    title: 'Contract Expiry Notification',
    subtitle: `Dear ${employeeName}, your contract is ending on ${contractEndDate}.`,
    bodyHtml: `<p style="font-size:13px;color:#475467;">Please contact HR to discuss contract renewal or next steps.</p>`,
    actionLabel: 'Contact HR',
    actionUrl: `${PLATFORM_URL}/hr/contracts`,
    footerNote: 'We value your contribution and look forward to discussing your future with us.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.hr,
    subject: 'Contract Expiry — Next Steps',
    html: empHtml,
    module: 'hr',
    referenceType: 'contract',
    referenceId: employeeName
  });
}

// =============================================
// GOODS RECEIVED NOTES EMAIL TEMPLATES
// =============================================

async function sendGRNSubmitted({ to, grnNo, poNo, supplierName, items, receivedDate, grnId, managerEmail }) {
  const itemsHtml = items && items.length ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0 16px;">
      <thead>${tableHead(['Item', 'Qty Received', 'Qty Accepted', 'Qty Rejected'])}</thead>
      <tbody>${items.map(it => row([
        it.name || it.description || 'Item',
        it.qtyReceived || it.qty || 0,
        it.qtyAccepted || it.qty || 0,
        it.qtyRejected || 0
      ])).join('')}</tbody>
    </table>` : '';

  const html = emailShell({
    title: `GRN ${grnNo} Submitted`,
    subtitle: `Goods Received Note has been submitted for PO ${poNo} from ${supplierName}.`,
    bodyHtml: `
      <p style="font-size:13px;color:#475467;">Received: ${receivedDate || '—'}</p>
      ${itemsHtml}`,
    actionLabel: 'View GRN',
    actionUrl: `${PLATFORM_URL}/purchases/grn/${grnId}`,
    footerNote: 'Please review and approve this GRN.'
  });

  await sendWithTracking({
    to,
    from: SENDERS.procurement,
    subject: `GRN ${grnNo} — Goods Received`,
    html,
    module: 'purchasing',
    referenceType: 'grn',
    referenceId: grnId
  });

  if (managerEmail) {
    const mgrHtml = emailShell({
      title: `GRN ${grnNo} — Approval Required`,
      subtitle: `Goods Received Note for PO ${poNo} (${supplierName}) requires approval.`,
      bodyHtml: `${itemsHtml}`,
      actionLabel: 'Approve GRN',
      actionUrl: `${PLATFORM_URL}/purchases/grn/${grnId}`,
      footerNote: 'Inspect goods before approval.'
    });

    await sendWithTracking({
      to: managerEmail,
      from: SENDERS.procurement,
      subject: `GRN ${grnNo} — Requires Approval`,
      html: mgrHtml,
      module: 'purchasing',
      referenceType: 'grn',
      referenceId: grnId
    });
  }
}

async function sendGRNApproved({ to, grnNo, poNo, supplierName, approvedBy, grnId }) {
  const html = emailShell({
    title: `GRN ${grnNo} Approved ✓`,
    subtitle: `Goods Received Note ${grnNo} for PO ${poNo} has been approved.`,
    bodyHtml: `
      <div style="background:#e8f8ee;border-radius:10px;padding:16px 20px;margin:12px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row(['GRN', `<strong>${grnNo}</strong>`])}
          ${row(['PO Reference', poNo])}
          ${row(['Supplier', supplierName])}
          ${approvedBy ? row(['Approved By', approvedBy]) : ''}
        </table>
      </div>`,
    actionLabel: 'View GRN',
    actionUrl: `${PLATFORM_URL}/purchases/grn/${grnId}`,
    footerNote: 'Inventory updated with received quantities.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.procurement,
    subject: `GRN ${grnNo} Approved`,
    html,
    module: 'purchasing',
    referenceType: 'grn',
    referenceId: grnId
  });
}

async function sendGRNRejected({ to, grnNo, poNo, supplierName, rejectedBy, reason, grnId }) {
  const html = emailShell({
    title: `GRN ${grnNo} — Not Approved`,
    subtitle: `Goods Received Note ${grnNo} has been rejected.`,
    bodyHtml: `
      <div style="background:#ffecec;border-radius:10px;padding:16px 20px;margin:12px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row(['GRN', grnNo])}
          ${row(['PO Reference', poNo])}
          ${row(['Supplier', supplierName])}
          ${rejectedBy ? row(['Reviewed By', rejectedBy]) : ''}
          ${reason ? row(['Reason', reason]) : ''}
        </table>
      </div>`,
    actionLabel: 'View GRN',
    actionUrl: `${PLATFORM_URL}/purchases/grn/${grnId}`,
    footerNote: 'Please address the issues and resubmit.'
  });

  return sendWithTracking({
    to,
    from: SENDERS.procurement,
    subject: `GRN ${grnNo} — Rejected`,
    html,
    module: 'purchasing',
    referenceType: 'grn',
    referenceId: grnId
  });
}

// =============================================
// REPORTING EMAILS
// =============================================

async function sendScheduledReport({ to, reportName, period, summaryData, pdfBase64, reportType }) {
  const statsHtml = summaryData ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
      <thead>${tableHead(['Metric', 'Value'])}</thead>
      <tbody>${Object.entries(summaryData).map(([key, value]) => row([
        key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        `<strong>${typeof value === 'number' && value > 1000 ? ksh(value) : value}</strong>`
      ])).join('')}</tbody>
    </table>` : '';

  const html = emailShell({
    title: `${reportName} — ${period}`,
    subtitle: `Your scheduled ${reportType || 'report'} is ready.`,
    bodyHtml: `
      ${statsHtml}
      <p style="font-size:13px;color:#475467;">A detailed PDF report is attached to this email.</p>`,
    actionLabel: 'Open ERP',
    actionUrl: `${PLATFORM_URL}/reports`,
    footerNote: `This is an auto-generated ${reportType || 'report'} from FarmTrack ERP.`
  });

  const attachments = pdfBase64 ? [{
    filename: `${slug(reportName)}-${slug(period)}.pdf`,
    content: pdfBase64,
    encoding: 'base64',
    contentType: 'application/pdf'
  }] : [];

  const result = await sendRawEmail({
    to,
    from: SENDERS.noreply,
    subject: `${reportName} — ${period}`,
    html,
    // Note: actual attachment handling depends on Resend API capabilities
  });

  await logEmail({
    to: Array.isArray(to) ? to.join(', ') : to,
    subject: `${reportName} — ${period}`,
    module: 'reports',
    referenceType: 'report',
    referenceId: `${reportName}-${period}`,
    status: result.sent ? 'sent' : 'failed',
    error: result.error
  });

  return result;
}

// =============================================
// GENERIC ERP NOTIFICATION EMAIL
// =============================================

async function sendERPNotification({ to, title, message, category, priority, module, referenceType, referenceId, actionLabel, actionUrl, from }) {
  const priorityIcon = priority === 'critical' ? '🔴' : priority === 'high' ? '🟠' : '🔵';
  const html = emailShell({
    title: `${priorityIcon} ${title}`,
    subtitle: category ? `${category}` : '',
    bodyHtml: `<p style="font-size:14px;color:#344054;line-height:1.6;margin:0 0 8px;">${message || ''}</p>`,
    actionLabel: actionLabel || 'Open ERP',
    actionUrl: actionUrl || PLATFORM_URL,
    footerNote: priority === 'critical' ? 'Action may be required.' : ''
  });

  return sendWithTracking({
    to,
    from: from || SENDERS.noreply,
    subject: `${title}${priority === 'critical' || priority === 'high' ? ' ⚠' : ''}`,
    html,
    module: module || 'system',
    referenceType,
    referenceId
  });
}

// =============================================
// EMAIL RESEND / RETRY
// =============================================

async function resendFailedEmail(logId) {
  try {
    // Fetch the failed email log
    const logs = await supabaseQuery('GET', `email_logs?id=eq.${logId}`);
    const log = Array.isArray(logs) ? logs[0] : null;
    if (!log || log.status !== 'failed') {
      return { error: 'Email not found or not in failed status', sent: false };
    }

    // Resend
    const result = await sendRawEmail({
      to: log.recipient,
      from: log.sender,
      subject: log.subject,
      html: log.html_content || log.subject
    });

    // Update log
    const url = `${SUPABASE_URL}/rest/v1/email_logs?id=eq.${logId}`;
    await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({
        status: result.sent ? 'sent' : 'failed',
        retry_count: (log.retry_count || 0) + 1,
        last_retry_at: new Date().toISOString(),
        error_message: result.error || null
      })
    });

    return result;
  } catch (err) {
    return { error: err.message, sent: false };
  }
}

// =============================================
// EMAIL PREFERENCES
// =============================================

async function getUserEmailPreferences(userEmail) {
  const prefs = await supabaseQuery('GET', `email_preferences?email=eq.${encodeURIComponent(userEmail)}`);
  if (Array.isArray(prefs) && prefs.length > 0) {
    return prefs[0];
  }
  // Return defaults
  return {
    email: userEmail,
    leave_notifications: true,
    invoice_notifications: true,
    asset_notifications: true,
    hr_notifications: true,
    report_notifications: true,
    system_alerts: true,
    marketing: false
  };
}

async function updateUserEmailPreferences(userEmail, preferences) {
  try {
    const existing = await supabaseQuery('GET', `email_preferences?email=eq.${encodeURIComponent(userEmail)}`);
    if (Array.isArray(existing) && existing.length > 0) {
      const url = `${SUPABASE_URL}/rest/v1/email_preferences?email=eq.${encodeURIComponent(userEmail)}`;
      await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({ ...preferences, updated_at: new Date().toISOString() })
      });
    } else {
      await supabaseQuery('POST', 'email_preferences', {
        email: userEmail,
        ...preferences,
        created_at: new Date().toISOString()
      });
    }
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}

// =============================================
// EMAIL STATS / DASHBOARD
// =============================================

async function getEmailDashboardStats() {
  try {
    const [sentResult, failedResult, pendingResult, recentResult] = await Promise.all([
      supabaseQuery('GET', `email_logs?status=eq.sent&select=count`),
      supabaseQuery('GET', `email_logs?status=eq.failed&select=count`),
      supabaseQuery('GET', `email_logs?status=eq.pending&select=count`),
      supabaseQuery('GET', `email_logs?order=sent_at.desc&limit=20`)
    ]);

    const moduleStats = await supabaseQuery('GET', `email_logs?select=module_source,count&group=module_source`);

    return {
      totalSent: Array.isArray(sentResult) ? sentResult.length : 0,
      totalFailed: Array.isArray(failedResult) ? failedResult.length : 0,
      totalPending: Array.isArray(pendingResult) ? pendingResult.length : 0,
      recentEmails: Array.isArray(recentResult) ? recentResult : [],
      moduleBreakdown: Array.isArray(moduleStats) ? moduleStats : [],
      deliveryRate: 0 // calculate from actual counts
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function getEmailActivityLog(filters = {}) {
  try {
    let query = 'email_logs?order=sent_at.desc';
    if (filters.module) query += `&module_source=eq.${filters.module}`;
    if (filters.status) query += `&status=eq.${filters.status}`;
    if (filters.recipient) query += `&recipient=ilike.*${encodeURIComponent(filters.recipient)}*`;
    if (filters.startDate && filters.endDate) {
      query += `&sent_at=gte.${filters.startDate}&sent_at=lte.${filters.endDate}`;
    }
    if (filters.limit) query += `&limit=${filters.limit}`;

    const logs = await supabaseQuery('GET', query);
    return Array.isArray(logs) ? logs : [];
  } catch (err) {
    return [];
  }
}

// =============================================
// UTILITY
// =============================================

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = {
  // Core
  sendRawEmail,
  sendWithTracking,
  emailShell,
  logEmail,
  updateEmailTracking,
  recordEmailActivity,
  
  // Leave Management
  sendLeaveRequestSubmitted,
  sendLeaveApproved,
  sendLeaveRejected,
  sendLeaveCancelled,
  sendLeaveBalanceReminder,
  
  // Invoice Management
  sendInvoiceCreated,
  sendInvoiceSent,
  sendPaymentReceived,
  sendInvoiceOverdue,
  sendCreditNoteIssued,
  
  // Purchase Orders
  sendPurchaseRequisitionSubmitted,
  sendPOAwaitingApproval,
  sendPOApproved,
  sendPORejected,
  
  // Asset Management
  sendAssetAssigned,
  sendAssetReturned,
  sendAssetMaintenanceDue,
  sendAssetDisposalRequest,
  
  // HR
  sendEmployeeInvitation,
  sendEmployeeOnboarding,
  sendProbationCompletion,
  sendContractExpiryReminder,
  
  // GRN
  sendGRNSubmitted,
  sendGRNApproved,
  sendGRNRejected,
  
  // Reports
  sendScheduledReport,
  
  // Generic
  sendERPNotification,
  
  // Admin
  resendFailedEmail,
  getUserEmailPreferences,
  updateUserEmailPreferences,
  getEmailDashboardStats,
  getEmailActivityLog,
  
  // Constants
  SENDERS,
  PLATFORM_URL,
  PLATFORM_NAME
};