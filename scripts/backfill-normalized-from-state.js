#!/usr/bin/env node
'use strict';

/**
 * Non-destructive, insert-only recovery of normalized Cloudflare D1 rows.
 * erp_state remains authoritative and is never modified or deleted.
 *
 * Requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN
 * with D1 read/write permissions. Safe to re-run.
 */
const d1 = require('../server/d1Client');

const MAP = [
  ['customers','customers'],['calls','calls'],['invoices','invoices'],['payments','payments'],
  ['expenses','expenses'],['requisitions','requisitions'],['sales_orders','salesOrders'],
  ['sales','sales'],['deliveries','deliveries'],['suppliers','suppliers'],['products','products'],
  ['finance_accounts','financeAccounts'],['finance_accounts','chartOfAccounts'],
  ['inventory','inventory'],['inventory_transactions','inventoryTransactions'],
  ['purchase_orders','purchaseOrders'],['journal_entries','journalEntries'],
  ['journal_entries','financeJournalEntries'],['journal_entries','financeManualJournals'],
  ['journal_lines','journalLines'],['journal_lines','financeJournalLines'],
  ['journal_lines','financeManualJournalLines'],['production_jobs','productionJobs'],
  ['production_batches','productionBatches'],['leads','leads'],['employees','employees'],
  ['attendance','attendance'],['leave_applications','leaveApplications'],['notifications','notifications'],
  ['invoice_items','invoiceItems'],['sale_items','saleItems'],['bank_transactions','bankTransactions'],
  ['sales_visits','salesVisits'],['activity_log','activity'],['business_events','businessEvents'],
  ['requisition_items','requisitionItems'],['requisition_audit_trail','requisitionAuditTrail'],
  ['hr_timeline','hrTimeline'],['employee_history','employeeHistory'],['hr_audit_log','hrAuditLog'],
  ['login_audit_logs','loginAuditLogs'],['finance_manual_journals','financeManualJournals'],
  ['finance_manual_journal_lines','financeManualJournalLines'],['finance_manual_ledger','financeManualLedger'],
  ['finance_manual_audit_logs','financeManualAuditLogs'],['unit_of_measure','unitOfMeasure'],
  ['unit_conversions','unitConversions'],['email_logs','emailLog']
];

function rowKey(table, row) {
  return table + ':' + String(row && row.id || '');
}

async function main() {
  if (!d1.d1Configured()) throw new Error('Missing Cloudflare D1 credentials; no writes attempted.');
  const live = await d1.getErpStateDocument({ skipHydrate: true });
  if (!live || live.incomplete || live.parseError || !live.data || typeof live.data !== 'object') {
    throw new Error('Authoritative D1 state is missing or incomplete; no writes attempted.');
  }
  const initialPointer = await d1.readPointerVersion();
  if (!initialPointer.gen || !initialPointer.version) throw new Error('D1 pointer is unhealthy; no writes attempted.');
  if (String(live.baseGen || '').replace(/^FTC-G-/, '') !== initialPointer.gen ||
      Number(live.data._writeVersion || 0) !== Number(initialPointer.version)) {
    throw new Error('Loaded D1 state does not match the live pointer; no writes attempted.');
  }

  const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const backupName = 'erp_state_backup_' + date + '_' + Date.now();
  const sourceRows = Number((await d1.d1First('SELECT COUNT(*) AS n FROM erp_state'))?.n || 0);
  await d1.d1Query('CREATE TABLE ' + backupName + ' AS SELECT * FROM erp_state');
  const backupRows = Number((await d1.d1First('SELECT COUNT(*) AS n FROM ' + backupName))?.n || 0);
  if (!sourceRows || backupRows !== sourceRows) throw new Error('D1 safety snapshot verification failed; normalized writes aborted.');

  const currentPointer = await d1.readPointerVersion();
  if (currentPointer.gen !== initialPointer.gen || currentPointer.version !== initialPointer.version) {
    throw new Error('D1 state changed during safety snapshot; normalized writes aborted.');
  }

  const entries = [];
  const seen = new Set();
  for (const [table, key] of MAP) {
    const rows = Array.isArray(live.data[key]) ? live.data[key] : [];
    for (const row of rows) {
      if (!row || row.id == null || String(row.id) === '') continue;
      const k = rowKey(table, row);
      if (seen.has(k)) continue;
      seen.add(k);
      entries.push({ table, row });
    }
  }

  const tables = [...new Set(entries.map(x => x.table))];
  const existingIds = new Map();
  const beforeCounts = {};
  for (let i = 0; i < tables.length; i += 3) {
    const batch = tables.slice(i, i + 3);
    const results = await Promise.all(batch.map(async table => {
      const schema = await d1.d1All('PRAGMA table_info(' + table + ')');
      if (!schema.some(c => String(c.name) === 'id')) throw new Error('Missing normalized D1 table/id column: ' + table);
      const ids = await d1.d1All('SELECT id FROM ' + table + ' LIMIT 10000');
      const count = Number((await d1.d1First('SELECT COUNT(*) AS n FROM ' + table))?.n || 0);
      return { table, ids: new Set(ids.map(r => String(r.id))), count };
    }));
    for (const r of results) { existingIds.set(r.table, r.ids); beforeCounts[r.table] = r.count; }
  }

  const missing = entries.filter(e => !existingIds.get(e.table).has(String(e.row.id)));
  console.log('[D1 reconcile] verified snapshot:', { table: backupName, rows: backupRows });
  console.log('[D1 reconcile] source rows:', entries.length, 'missing IDs:', missing.length);
  const writes = await d1.upsertStateRows(missing, { insertOnly: true });
  const failed = writes.filter(x => !x || !x.ok);
  const afterCounts = {};
  const remainingMissing = {};
  for (const table of tables) {
    const ids = await d1.d1All('SELECT id FROM ' + table + ' LIMIT 10000');
    const idSet = new Set(ids.map(r => String(r.id)));
    const expected = entries.filter(e => e.table === table);
    const missingIds = expected.filter(e => !idSet.has(String(e.row.id))).map(e => String(e.row.id));
    afterCounts[table] = idSet.size;
    if (missingIds.length) remainingMissing[table] = missingIds.length;
  }
  const finalPointer = await d1.readPointerVersion();
  const pointerUnchanged = finalPointer.gen === initialPointer.gen && finalPointer.version === initialPointer.version;
  const summary = {};
  for (const table of tables) {
    summary[table] = {
      before: beforeCounts[table],
      after: afterCounts[table],
      inserted: afterCounts[table] - beforeCounts[table],
      expectedFromState: entries.filter(e => e.table === table).length,
      missingAfter: remainingMissing[table] || 0
    };
  }
  console.log('[D1 reconcile] summary:', JSON.stringify(summary, null, 2));
  console.log('[D1 reconcile] failed rows:', failed.length, 'pointer unchanged:', pointerUnchanged);
  if (failed.length || Object.keys(remainingMissing).length || !pointerUnchanged) {
    console.error('[D1 reconcile] INCOMPLETE; no erp_state rows were modified.', JSON.stringify({failed:failed.slice(0,10),remainingMissing,pointerUnchanged}));
    throw new Error('INCOMPLETE: ' + JSON.stringify({failed:failed.slice(0,10),remainingMissing,pointerUnchanged}));
  }
  console.log('[D1 reconcile] COMPLETE. erp_state remains untouched; only missing normalized IDs were inserted.');
  return { ok: true, backup: { table: backupName, rows: backupRows }, sourceRows: entries.length, initiallyMissing: missing.length, failedRows: failed.length, pointerUnchanged, summary };
}

if (require.main === module) {
  main().catch(error => {
    console.error('[D1 reconcile] ABORTED:', error && error.message || String(error));
    process.exitCode = 1;
  });
}
module.exports = main;
