/**
 * Resend email service for Unity ERP / Farmtrack.
 * Sends transactional emails via the Resend API (https://resend.com).
 * Uses fetch (available on Node 18+ and Vercel serverless).
 *
 * From address: erpintergration@gmail.com (verified on Resend account).
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_X5NHDbx5_P1Ft6gGfx9wt3wHUATtq4xp3';
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'Unity ERP <erpintergration@gmail.com>';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Low-level send. Returns Resend's JSON response, or { error } on failure.
 * Failures are non-fatal — caller should continue the business operation.
 */
async function sendEmail({ to, subject, html, text, replyTo, cc, bcc, from } = {}) {
  if (!RESEND_API_KEY) {
    return { error: 'RESEND_API_KEY not configured', sent: false };
  }
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (recipients.length === 0) {
    return { error: 'No recipients provided', sent: false };
  }
  const body = {
    from: from || RESEND_FROM,
    to: recipients,
    subject,
    html: html || text || '',
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
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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

/* ─── Template helpers ─── */

function emailShell({ title, subtitle, bodyHtml, actionLabel, actionUrl, footerNote }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#101828;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(16,24,40,.06);">
        <tr><td style="background:#050505;padding:22px 32px;">
          <table width="100%"><tr>
            <td style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-.01em;">Unity ERP</td>
            <td align="right" style="color:#98a2b3;font-size:12px;">Farmtrack Bio Sciences</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 6px;font-size:22px;letter-spacing:-.02em;color:#101828;">${title}</h1>
          ${subtitle ? `<p style="margin:0 0 22px;font-size:14px;color:#475467;">${subtitle}</p>` : ''}
          ${bodyHtml || ''}
          ${actionLabel && actionUrl ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;"><tr><td align="center">
            <a href="${actionUrl}" style="display:inline-block;background:#175cd3;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 28px;border-radius:9px;">${actionLabel}</a>
          </td></tr></table>` : ''}
        </td></tr>
        <tr><td style="background:#f9fafb;padding:18px 32px;border-top:1px solid #eef0f3;">
          <p style="margin:0;font-size:12px;color:#667085;line-height:1.5;">${footerNote || 'This is an automated message from Unity ERP · Farmtrack Bio Sciences Ltd, Kenya.'}<br/>Sent from erpintergration@gmail.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function ksh(n) {
  const num = Number(n) || 0;
  return 'KSh ' + num.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function row(cells) {
  return `<tr>${cells.map(c => `<td style="padding:8px 10px;border-bottom:1px solid #eef0f3;font-size:13px;color:#344054;">${c}</td>`).join('')}</tr>`;
}

function tableHead(cells) {
  return `<tr>${cells.map(c => `<th style="padding:8px 10px;border-bottom:2px solid #d0d5dd;font-size:11px;font-weight:700;color:#667085;text-transform:uppercase;text-align:left;">${c}</th>`).join('')}</tr>`;
}

/* ─── High-level templates ─── */

async function sendInvoiceEmail({ to, customerName, invoiceNo, invoiceDate, dueDate, items, subtotal, tax, total, companyName, viewUrl }) {
  const itemsHtml = items && items.length ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:14px 0 18px;">
      <thead>${tableHead(['Item', 'Qty', 'Price', 'Total'])}</thead>
      <tbody>${items.map(it => row([it.name || it.description || '—', it.qty ?? it.quantity ?? 1, ksh(it.price ?? it.unitPrice ?? 0), ksh((it.qty ?? it.quantity ?? 1) * (it.price ?? it.unitPrice ?? 0))])).join('')}</tbody>
    </table>` : '';
  const totalsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 14px;">
      ${row(['Subtotal', `<strong>${ksh(subtotal)}</strong>`]).replace('<tr>', '<tr style="background:#f9fafb;">').replace(/<td/g, '<td colspan="1"')}
      ${row(['Tax', `<strong>${ksh(tax)}</strong>`])}
      ${row(['<strong>Total Due</strong>', `<strong style="color:#175cd3;font-size:15px;">${ksh(total)}</strong>`])}
    </table>`;
  const html = emailShell({
    title: `Invoice ${invoiceNo}`,
    subtitle: `Hi ${customerName}, here's your invoice from ${companyName || 'Farmtrack Bio Sciences'}.`,
    bodyHtml: `${itemsHtml}${totalsHtml}<p style="font-size:13px;color:#475467;margin:8px 0;">Due date: <strong>${dueDate || '—'}</strong> · Issued: ${invoiceDate || '—'}</p>`,
    actionLabel: viewUrl ? 'View Invoice' : null,
    actionUrl: viewUrl,
    footerNote: 'Please remit payment by the due date. Reply to this email if you have any questions.'
  });
  return sendEmail({ to, subject: `Invoice ${invoiceNo} from ${companyName || 'Farmtrack'}`, html, replyTo: 'erpintergration@gmail.com' });
}

async function sendPaymentReceiptEmail({ to, customerName, invoiceNo, amount, method, date, balance, companyName }) {
  const html = emailShell({
    title: 'Payment Received ✓',
    subtitle: `Thank you, ${customerName}. We've received your payment.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        ${row(['Amount Paid', `<strong style="color:#078236;font-size:16px;">${ksh(amount)}</strong>`]).replace('<tr>', '<tr style="background:#e8f8ee;">')}
        ${row(['Invoice', invoiceNo || '—'])}
        ${row(['Method', method || '—'])}
        ${row(['Date', date || '—'])}
        ${row(['Outstanding Balance', balance != null ? ksh(balance) : '—'])}
      </table>`,
    footerNote: 'Thank you for your business! Reply to this email if you need a stamped receipt.'
  });
  return sendEmail({ to, subject: `Payment receipt — ${ksh(amount)} received`, html, replyTo: 'erpintergration@gmail.com' });
}

async function sendSalesOrderEmail({ to, customerName, saleNo, items, total, deliveryStatus, companyName, viewUrl }) {
  const itemsHtml = items && items.length ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0 16px;">
      <thead>${tableHead(['Item', 'Qty'])}</thead>
      <tbody>${items.map(it => row([it.name || it.description || '—', it.qty ?? it.quantity ?? 1])).join('')}</tbody>
    </table>` : '<p style="font-size:13px;color:#475467;">See order details in the ERP.</p>';
  const html = emailShell({
    title: `Order ${saleNo} Confirmed`,
    subtitle: `Hi ${customerName}, we've received and confirmed your order.`,
    bodyHtml: `${itemsHtml}<p style="font-size:13px;color:#475467;margin:8px 0;">Order total: <strong>${ksh(total)}</strong><br/>Delivery status: <strong>${deliveryStatus || 'Pending'}</strong></p>`,
    actionLabel: viewUrl ? 'Track Order' : null,
    actionUrl: viewUrl
  });
  return sendEmail({ to, subject: `Order ${saleNo} confirmed`, html, replyTo: 'erpintergration@gmail.com' });
}

async function sendLeaveDecisionEmail({ to, applicantName, type, startDate, endDate, days, status, decidedBy, decisionNote }) {
  const approved = String(status).toLowerCase() === 'approved';
  const html = emailShell({
    title: approved ? 'Leave Approved ✓' : 'Leave Update',
    subtitle: `Hi ${applicantName}, your leave request has been ${String(status).toLowerCase()}.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        ${row(['Leave Type', type])}
        ${row(['Dates', `${startDate} → ${endDate} (${days} day${days === 1 ? '' : 's'})`])}
        ${row(['Status', `<strong style="color:${approved ? '#078236' : '#d92d20'};">${status}</strong>`])}
        ${decidedBy ? row(['Decided By', decidedBy]) : ''}
        ${decisionNote ? row(['Note', decisionNote]) : ''}
      </table>`,
    footerNote: 'This is an automated HR notification from Unity ERP.'
  });
  return sendEmail({ to, subject: `Your ${type} leave request — ${status}`, html });
}

async function sendLeaveApprovalRequestEmail({ to, applicantName, type, startDate, endDate, days, reason, department, viewUrl }) {
  const html = emailShell({
    title: 'Leave Approval Required',
    subtitle: `${applicantName} (${department || '—'} department) requested ${type} leave.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        ${row(['Employee', applicantName])}
        ${row(['Department', department || '—'])}
        ${row(['Leave Type', type])}
        ${row(['Dates', `${startDate} → ${endDate} (${days} day${days === 1 ? '' : 's'})`])}
        ${reason ? row(['Reason', reason]) : ''}
      </table>`,
    actionLabel: 'Review & Approve',
    actionUrl: viewUrl || 'https://erpftc.vercel.app/#/leaves/approve'
  });
  return sendEmail({ to, subject: `Leave approval required — ${applicantName} (${days}d ${type})`, html });
}

async function sendNotificationEmail({ to, title, message, category, priority, viewUrl }) {
  const html = emailShell({
    title: title || 'ERP Notification',
    subtitle: category ? `${category} · ${priority || 'normal'} priority` : '',
    bodyHtml: `<p style="font-size:14px;color:#344054;line-height:1.6;margin:0 0 8px;">${message || ''}</p>`,
    actionLabel: viewUrl ? 'Open ERP' : null,
    actionUrl: viewUrl || 'https://erpftc.vercel.app/'
  });
  return sendEmail({ to, subject: `${title || 'Notification'}${priority === 'critical' || priority === 'high' ? ' ⚠' : ''}`, html });
}

async function sendWelcomeEmail({ to, name, temporaryPassword, role, loginUrl }) {
  const html = emailShell({
    title: 'Welcome to Unity ERP',
    subtitle: `Hi ${name}, your account has been created.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        ${row(['Email', to])}
        ${role ? row(['Role', role]) : ''}
        ${temporaryPassword ? row(['Temporary Password', `<strong style="color:#175cd3;">${temporaryPassword}</strong>`]) : ''}
      </table>
      <p style="font-size:13px;color:#d92d20;background:#ffecec;padding:10px 12px;border-radius:8px;margin:10px 0;">⚠ Please log in and change your password immediately.</p>`,
    actionLabel: 'Log In Now',
    actionUrl: loginUrl || 'https://erpftc.vercel.app/'
  });
  return sendEmail({ to, subject: 'Welcome to Unity ERP — your account is ready', html });
}

async function sendLowStockEmail({ to, itemName, currentStock, reorderLevel, sku, viewUrl }) {
  const html = emailShell({
    title: '⚠ Low Stock Alert',
    subtitle: `${itemName} is below its reorder level.`,
    bodyHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        ${row(['Item', `<strong>${itemName}</strong>`])}
        ${sku ? row(['SKU', sku]) : ''}
        ${row(['Current Stock', `<strong style="color:#d92d20;">${currentStock}</strong>`])}
        ${row(['Reorder Level', reorderLevel || '—'])}
      </table>`,
    actionLabel: 'View Inventory',
    actionUrl: viewUrl || 'https://erpftc.vercel.app/#/inventory'
  });
  return sendEmail({ to, subject: `Low stock: ${itemName} (${currentStock} left)`, html });
}

async function sendPurchaseOrderEmail({ to, supplierName, poNo, items, total, expectedDelivery, companyName }) {
  const itemsHtml = items && items.length ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0 16px;">
      <thead>${tableHead(['Item', 'Qty', 'Unit Price', 'Total'])}</thead>
      <tbody>${items.map(it => row([it.name || it.description || '—', it.qty ?? it.quantity ?? 1, ksh(it.unitPrice ?? 0), ksh((it.qty ?? it.quantity ?? 1) * (it.unitPrice ?? 0))])).join('')}</tbody>
    </table>` : '';
  const html = emailShell({
    title: `Purchase Order ${poNo}`,
    subtitle: `Dear ${supplierName}, please find our purchase order below.`,
    bodyHtml: `${itemsHtml}<p style="font-size:13px;color:#475467;margin:8px 0;">Order total: <strong>${ksh(total)}</strong>${expectedDelivery ? `<br/>Expected delivery: <strong>${expectedDelivery}</strong>` : ''}</p>`,
    footerNote: 'Please confirm receipt of this PO and expected delivery date. Reply to this email.'
  });
  return sendEmail({ to, subject: `Purchase Order ${poNo} from ${companyName || 'Farmtrack'}`, html, replyTo: 'erpintergration@gmail.com' });
}

module.exports = {
  sendEmail,
  emailShell,
  sendInvoiceEmail,
  sendPaymentReceiptEmail,
  sendSalesOrderEmail,
  sendLeaveDecisionEmail,
  sendLeaveApprovalRequestEmail,
  sendNotificationEmail,
  sendWelcomeEmail,
  sendLowStockEmail,
  sendPurchaseOrderEmail
};
