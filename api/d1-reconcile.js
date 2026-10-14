'use strict';

/**
 * One-time, token-gated, non-destructive D1 reconciliation.
 * Creates a point-in-time copy of erp_state first, then inserts only missing
 * normalized IDs from the authoritative state document. Existing business rows
 * are never deleted and are not replaced by this endpoint.
 */
const crypto = require('crypto');
const d1 = require('../server/d1Client');

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, tenant_id TEXT, sale_no TEXT, customer_id TEXT, customer_name TEXT, sale_date TEXT, subtotal REAL, tax REAL, total REAL, paid REAL, balance REAL, status TEXT, payment_method TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS sale_items (id TEXT PRIMARY KEY, tenant_id TEXT, sale_id TEXT, product_id TEXT, product_name TEXT, quantity REAL, unit_price REAL, cost REAL, total REAL, sales_rep_name TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS bank_transactions (id TEXT PRIMARY KEY, tenant_id TEXT, transaction_date TEXT, account_name TEXT, transaction_type TEXT, reference TEXT, payee TEXT, description TEXT, amount REAL, status TEXT, quickbooks_source TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS sales_visits (id TEXT PRIMARY KEY, tenant_id TEXT, salesperson TEXT, shop_or_customer TEXT, contact_person TEXT, location TEXT, phone TEXT, product_discussed TEXT, purpose TEXT, outcome TEXT, next_appointment TEXT, comments TEXT, status TEXT, visit_date TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS activity_log (id TEXT PRIMARY KEY, tenant_id TEXT, user_name TEXT, action TEXT, module TEXT, details TEXT, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS business_events (id TEXT PRIMARY KEY, tenant_id TEXT, event_type TEXT, aggregate_type TEXT, aggregate_id TEXT, payload TEXT, status TEXT, created_by TEXT, created_by_name TEXT, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS requisition_items (id TEXT PRIMARY KEY, tenant_id TEXT, requisition_id TEXT, item TEXT, description TEXT, quantity REAL, unit TEXT, estimated_price REAL, total REAL)`,
  `CREATE TABLE IF NOT EXISTS requisition_audit_trail (id TEXT PRIMARY KEY, tenant_id TEXT, requisition_id TEXT, action TEXT, \"user\" TEXT, \"timestamp\" TEXT, notes TEXT, old_value TEXT, new_value TEXT)`,
  `CREATE TABLE IF NOT EXISTS hr_timeline (id TEXT PRIMARY KEY, tenant_id TEXT, employee_id TEXT, action TEXT, description TEXT, \"by\" TEXT, \"at\" TEXT)`,
  `CREATE TABLE IF NOT EXISTS employee_history (id TEXT PRIMARY KEY, tenant_id TEXT, employee_id TEXT, employee_no TEXT, snapshot TEXT, changed_by TEXT, changed_at TEXT, reason TEXT)`,
  `CREATE TABLE IF NOT EXISTS hr_audit_log (id TEXT PRIMARY KEY, tenant_id TEXT, employee_id TEXT, action TEXT, old_name TEXT, new_name TEXT, old_email TEXT, new_email TEXT, \"by\" TEXT, \"at\" TEXT)`,
  `CREATE TABLE IF NOT EXISTS login_audit_logs (id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT, user_name TEXT, role TEXT, status TEXT, user_agent TEXT, device TEXT, timezone TEXT, language TEXT, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS finance_manual_journals (id TEXT PRIMARY KEY, tenant_id TEXT, journal_no TEXT, date TEXT, description TEXT, source_module TEXT, source_id TEXT, reference TEXT, total_debit REAL, total_credit REAL, approval_status TEXT, posted_by TEXT, immutable INTEGER, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS finance_manual_journal_lines (id TEXT PRIMARY KEY, tenant_id TEXT, journal_entry_id TEXT, account_id TEXT, account_code TEXT, account_name TEXT, account_type TEXT, debit REAL, credit REAL, source_module TEXT, reference TEXT, date TEXT)`,
  `CREATE TABLE IF NOT EXISTS finance_manual_ledger (id TEXT PRIMARY KEY, tenant_id TEXT, journal_entry_id TEXT, account_id TEXT, account_code TEXT, account_name TEXT, account_type TEXT, debit REAL, credit REAL, source_module TEXT, reference TEXT, date TEXT, running_balance REAL)`,
  `CREATE TABLE IF NOT EXISTS finance_manual_audit_logs (id TEXT PRIMARY KEY, tenant_id TEXT, "user" TEXT, date TEXT, module TEXT, action TEXT, reference TEXT, old_value TEXT, new_value TEXT, reason TEXT, approval TEXT, immutable INTEGER)`,
  `CREATE TABLE IF NOT EXISTS unit_of_measure (id TEXT PRIMARY KEY, tenant_id TEXT, code TEXT, name TEXT, family TEXT, status TEXT)`,
  `CREATE TABLE IF NOT EXISTS unit_conversions (id TEXT PRIMARY KEY, tenant_id TEXT, from_unit TEXT, to_unit TEXT, factor REAL, status TEXT)`,
  `CREATE TABLE IF NOT EXISTS email_logs (id TEXT PRIMARY KEY, tenant_id TEXT, recipient TEXT, sender TEXT, subject TEXT, module_source TEXT, reference_type TEXT, reference_id TEXT, status TEXT, tracking_id TEXT, error_message TEXT, sent_at TEXT, template TEXT, result TEXT, related_module TEXT, related_id TEXT, created_by TEXT, created_at TEXT, metadata TEXT, html_content TEXT, retry_count INTEGER DEFAULT 0, last_retry_at TEXT, sender_name TEXT)`
];

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}
function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }
  const expected = String(process.env.D1_RECONCILE_TOKEN || '');
  const supplied = String(req.query?.token || req.headers?.['x-d1-reconcile-token'] || '');
  if (!expected || !safeEqual(supplied, expected)) {
    return send(res, 404, { ok: false, error: 'Not found' });
  }

  try {
    const live = await d1.getErpStateDocument({ skipHydrate: true });
    if (!live || live.incomplete || !live.data || typeof live.data !== 'object') {
      return send(res, 409, { ok: false, error: 'Authoritative D1 state is missing or incomplete; no writes were attempted.' });
    }
    const ptr = await d1.readPointerVersion();
    if (!ptr.gen || !ptr.version) {
      return send(res, 409, { ok: false, error: 'D1 pointer metadata is not healthy; no writes were attempted.' });
    }

    const backupName = 'erp_state_backup_20261014';
    const existing = await d1.d1First("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [backupName]);
    let backupCreated = false;
    if (!existing) {
      await d1.d1Query('CREATE TABLE ' + backupName + ' AS SELECT * FROM erp_state');
      backupCreated = true;
    }
    const backupCountRow = await d1.d1First('SELECT COUNT(*) AS n FROM ' + backupName);
    const sourceCountRow = await d1.d1First('SELECT COUNT(*) AS n FROM erp_state');
    const latestPointer = await d1.readPointerVersion();
    if (latestPointer.gen !== ptr.gen || latestPointer.version !== ptr.version) {
      return send(res, 409, { ok: false, error: 'D1 state changed during the safety snapshot; no normalized writes were attempted. Retry safely.' });
    }
    if (String(live.baseGen || '').replace(/^FTC-G-/, '') !== ptr.gen || Number(live.data._writeVersion || 0) !== ptr.version) {
      return send(res, 409, { ok: false, error: 'Loaded state does not match the current D1 pointer; no normalized writes were attempted.' });
    }
    const backupRows = Number(backupCountRow?.n || 0);
    const sourceRows = Number(sourceCountRow?.n || 0);
    if (!backupRows || (backupCreated && backupRows !== sourceRows)) {
      return send(res, 500, { ok: false, error: 'Safety copy row-count verification failed; normalized writes were not attempted.', backupRows, sourceRows });
    }

    for (const sql of SCHEMA) await d1.d1Query(sql);
    const rounds = Math.max(1, Math.min(3, Number(req.query?.rounds) || 2));
    const maxMissingPerTable = Math.max(50, Math.min(250, Number(req.query?.batch) || 200));
    const results = [];
    for (let i = 0; i < rounds; i++) {
      const result = await d1.dualWriteFromState(live.data, {
        onlyChanged: true,
        compareState: live.data,
        maxPerTable: 2000,
        maxMissingPerTable
      });
      if (result?.skipped || (result?.ok === false && !Number(result?.total || 0))) {
        return send(res, 503, { ok: false, error: 'D1 normalized reconciliation is disabled or could not start.', reason: result?.reason || result?.error || 'unknown', backup: { table: backupName, rows: backupRows } });
      }
      results.push({ round: i + 1, wrote: Number(result?.wrote || 0), attempted: Number(result?.total || 0), failedRows: Array.isArray(result?.failed) ? result.failed.slice(0, 10) : [], skipped: result?.skipped || false, reason: result?.reason || null });
      if (result?.skipped || !result?.total || Number(result?.wrote || 0) === 0) break;
    }

    const counts = {};
    for (const table of ['customers','products','inventory','sales','sale_items','sales_orders','invoices','invoice_items','expenses','finance_accounts','journal_entries','journal_lines','bank_transactions','employees','leads','calls','sales_visits','deliveries','requisitions','requisition_items','requisition_audit_trail','leave_applications','notifications','business_events','email_logs']) {
      try { const row = await d1.d1First('SELECT COUNT(*) AS n FROM ' + table); counts[table] = Number(row?.n || 0); }
      catch (e) { counts[table] = 'ERROR'; }
    }
    const attempted = results.reduce((n, r) => n + r.attempted, 0);
    const wrote = results.reduce((n, r) => n + r.wrote, 0);
    const failures = Math.max(0, attempted - wrote);
    return send(res, failures ? 207 : 200, {
      ok: failures === 0,
      mode: 'd1-only-non-destructive',
      source: 'erp_state',
      pointer: { generation: ptr.gen, version: ptr.version, writerAt: ptr.writerAt || null },
      backup: { table: backupName, created: backupCreated, rows: backupRows, sourceRows },
      arrays: Object.fromEntries(Object.entries(live.data).filter(([,v]) => Array.isArray(v)).map(([k,v]) => [k,v.length])),
      rounds: results,
      attempted,
      wrote,
      failures,
      normalizedCounts: counts,
      next: failures ? 'Review per-table D1 errors before retrying.' : 'Run again until attempted is zero to confirm reconciliation is complete.'
    });
  } catch (e) {
    console.error('[d1-reconcile] failed:', e && e.message);
    return send(res, 500, { ok: false, error: e && e.message ? e.message : 'D1 reconciliation failed' });
  }
};
