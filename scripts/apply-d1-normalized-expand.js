/**
 * Expands server/d1Client.js NORMALIZE_TABLE_DEFS + adds syncFullStateToNormalizedTables.
 * Idempotent. Does not touch erp_state write path safety.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'server', 'd1Client.js');
if (!fs.existsSync(file)) {
  console.warn('[d1-expand] missing d1Client.js');
  process.exit(0);
}
let src = fs.readFileSync(file, 'utf8');
if (src.includes('syncFullStateToNormalizedTables')) {
  console.log('[d1-expand] already applied');
  process.exit(0);
}

if (!src.includes('customers: [')) {
  src = src.replace(
    `  calls: [\n    ['id', 'id'],\n    ['customer_id', 'customerId'],\n    ['customer_name', 'customerName'],\n    ['phone', 'phone'],\n    ['stage', 'stage'],\n    ['record_type', 'recordType'],\n    ['follow_up_date', 'followUpDate'],\n    ['assigned_to', 'assignedTo'],\n    ['notes', 'notes'],\n    ['date', 'date'],\n  ],\n};`,
    `  calls: [\n    ['id', 'id'],\n    ['customer_id', 'customerId'],\n    ['customer_name', 'customerName'],\n    ['phone', 'phone'],\n    ['stage', 'stage'],\n    ['record_type', 'recordType'],\n    ['follow_up_date', 'followUpDate'],\n    ['assigned_to', 'assignedTo'],\n    ['notes', 'notes'],\n    ['date', 'date'],\n  ],\n  customers: [\n    ['id', 'id'], ['name', 'name'], ['phone', 'phone'], ['email', 'email'],\n    ['city', 'city'], ['address', 'address'], ['balance', 'balance'], ['status', 'status'],\n  ],\n  suppliers: [\n    ['id', 'id'], ['name', 'name'], ['phone', 'phone'], ['email', 'email'],\n    ['category', 'category'], ['status', 'status'],\n  ],\n  products: [\n    ['id', 'id'], ['sku', 'sku'], ['name', 'name'], ['category', 'category'],\n    ['type', 'type'], ['unit', 'unit'], ['cost_price', 'costPrice', 'cost'],\n    ['selling_price', 'sellingPrice', 'price'], ['min_stock', 'minStock'], ['status', 'status'],\n  ],\n  finance_accounts: [\n    ['id', 'id'], ['code', 'code'], ['name', 'name'], ['type', 'type'],\n    ['parent', 'parent'], ['status', 'status'],\n  ],\n  journal_entries: [\n    ['id', 'id'], ['journal_date', 'date', 'journalDate'], ['reference', 'reference'],\n    ['description', 'description'], ['source_module', 'sourceModule'],\n    ['status', 'approvalStatus', 'status'],\n  ],\n  journal_lines: [\n    ['id', 'id'], ['journal_entry_id', 'journalEntryId'], ['account_id', 'accountId'],\n    ['account_code', 'accountCode'], ['account_name', 'accountName'],\n    ['debit', 'debit'], ['credit', 'credit'], ['source_module', 'sourceModule'],\n    ['reference', 'reference'],\n  ],\n  credit_notes: [\n    ['id', 'id'], ['credit_no', 'creditNo'], ['customer_id', 'customerId'],\n    ['customer_name', 'customerName'], ['invoice_id', 'invoiceId'],\n    ['amount', 'amount'], ['reason', 'reason'], ['status', 'status'],\n  ],\n  quotations: [\n    ['id', 'id'], ['quote_no', 'quoteNo'], ['customer_id', 'customerId'],\n    ['customer_name', 'customerName'], ['total', 'total'], ['status', 'status'],\n    ['valid_until', 'validUntil'],\n  ],\n  invoice_items: [\n    ['id', 'id'], ['invoice_id', 'invoiceId'], ['product_id', 'productId'],\n    ['product_name', 'productName'], ['quantity', 'quantity'],\n    ['unit_price', 'unitPrice'], ['discount', 'discount'], ['total', 'total'],\n  ],\n};`
  );
  console.log('[d1-expand] table defs expanded');
}

const syncFn = `\nasync function syncFullStateToNormalizedTables(state) {\n  if (!normalizedStateWritesEnabled() || !state || typeof state !== 'object') {\n    return { ok: false, reason: 'disabled_or_empty' };\n  }\n  if (!d1Configured()) return { ok: false, reason: 'd1_not_configured' };\n  const entries = [];\n  const pushAll = (table, rows) => {\n    if (!Array.isArray(rows)) return;\n    for (const row of rows) {\n      if (row && row.id) entries.push({ table, row });\n    }\n  };\n  pushAll('customers', state.customers);\n  pushAll('suppliers', state.suppliers);\n  pushAll('products', state.products);\n  pushAll('finance_accounts', state.financeAccounts);\n  pushAll('invoices', state.invoices);\n  for (const inv of (state.invoices || [])) {\n    if (!Array.isArray(inv.items)) continue;\n    for (const it of inv.items) {\n      if (!it) continue;\n      entries.push({\n        table: 'invoice_items',\n        row: {\n          id: it.id || (inv.id + '-' + (it.productId || it.productName || Math.random().toString(36).slice(2, 8))),\n          invoiceId: inv.id,\n          productId: it.productId,\n          productName: it.productName || it.description,\n          quantity: it.quantity,\n          unitPrice: it.unitPrice || it.price,\n          discount: it.discount,\n          total: it.total,\n        },\n      });\n    }\n  }\n  pushAll('payments', state.payments);\n  pushAll('expenses', state.expenses);\n  pushAll('credit_notes', state.creditNotes);\n  pushAll('quotations', state.quotations);\n  pushAll('requisitions', state.requisitions);\n  pushAll('calls', state.calls);\n  pushAll('journal_entries', [...(state.financeJournalEntries || []), ...(state.financeManualJournals || [])]);\n  for (const line of [...(state.financeJournalLines || []), ...(state.financeManualJournalLines || [])]) {\n    if (!line) continue;\n    entries.push({\n      table: 'journal_lines',\n      row: {\n        id: line.id || ('JL-' + Math.random().toString(36).slice(2, 10)),\n        journalEntryId: line.journalEntryId,\n        accountId: line.accountId,\n        accountCode: line.accountCode,\n        accountName: line.accountName,\n        debit: line.debit,\n        credit: line.credit,\n        sourceModule: line.sourceModule,\n        reference: line.reference,\n      },\n    });\n  }\n  const MAX = 400;\n  const batch = entries.slice(0, MAX);\n  try {\n    const results = await upsertStateRows(batch);\n    const ok = results.filter(r => r.ok).length;\n    return { ok: true, attempted: batch.length, succeeded: ok, deferred: Math.max(0, entries.length - MAX) };\n  } catch (e) {\n    console.warn('[d1] syncFullStateToNormalizedTables failed:', (e && e.message) || e);\n    return { ok: false, error: (e && e.message) || String(e) };\n  }\n}\n`;

if (!src.includes('async function syncFullStateToNormalizedTables')) {
  src = src.replace('module.exports = {', syncFn + 'module.exports = {');
  src = src.replace(
    '  upsertStateRows,\n  ACCOUNT_ID,\n  DATABASE_ID,\n};',
    '  upsertStateRows,\n  syncFullStateToNormalizedTables,\n  ACCOUNT_ID,\n  DATABASE_ID,\n};'
  );
  console.log('[d1-expand] syncFullStateToNormalizedTables added');
}

fs.writeFileSync(file, src);
console.log('[d1-expand] done');
