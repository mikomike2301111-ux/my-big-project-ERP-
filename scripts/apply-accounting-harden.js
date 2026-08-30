/**
 * Safe, idempotent patches to api/rpc.js for:
 *  - accountingEngine integration (cents-accurate journals)
 *  - invoice/payment/expense journal completeness
 *  - normalized D1 table sync after saveState (no erp_state wipe)
 *  - expanded queue for invoices + payments
 * Does NOT change UI. Skips if already applied.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rpcPath = path.join(root, 'api', 'rpc.js');
const marker = "require('../server/accountingEngine')";

if (!fs.existsSync(rpcPath)) {
  console.warn('[accounting-harden] api/rpc.js missing — skip');
  process.exit(0);
}

let src = fs.readFileSync(rpcPath, 'utf8');
if (src.includes(marker)) {
  console.log('[accounting-harden] already applied');
  process.exit(0);
}

// 1) Import accounting engine
if (src.includes("require('../server/d1Client')")) {
  src = src.replace(
    "require('../server/d1Client');",
    "require('../server/d1Client');\nconst accountingEngine = require('../server/accountingEngine');"
  );
} else {
  src = src.replace(
    "const ExcelJS = require('exceljs');",
    "const ExcelJS = require('exceljs');\nconst accountingEngine = require('../server/accountingEngine');"
  );
}

// 2) Harden postFinanceJournal
const oldPost = `function postFinanceJournal(user, { date, sourceModule, sourceId, reference, description, debitAccountName, creditAccountName, amount }) {\n  const d = data();\n  d.financeManualJournals ||= [];\n  d.financeManualJournalLines ||= [];\n  d.financeManualLedger ||= [];\n  d.financeManualAuditLogs ||= [];\n  const debit = (d.financeAccounts || []).find(a => a.name === debitAccountName);\n  const credit = (d.financeAccounts || []).find(a => a.name === creditAccountName);\n  const value = Math.round(num(amount));\n  if (!debit || !credit || !value) return null;`;

const newPost = `function postFinanceJournal(user, { date, sourceModule, sourceId, reference, description, debitAccountName, creditAccountName, amount }) {\n  const d = data();\n  if (accountingEngine && accountingEngine.postBalancedJournal) {\n    return accountingEngine.postBalancedJournal(d, user, { date, sourceModule, sourceId, reference, description, debitAccountName, creditAccountName, amount });\n  }\n  d.financeManualJournals ||= [];\n  d.financeManualJournalLines ||= [];\n  d.financeManualLedger ||= [];\n  d.financeManualAuditLogs ||= [];\n  const debit = (d.financeAccounts || []).find(a => a.name === debitAccountName) || (d.financeAccounts || []).find(a => String(a.name||'').toLowerCase().includes(String(debitAccountName||'').toLowerCase()));\n  const credit = (d.financeAccounts || []).find(a => a.name === creditAccountName) || (d.financeAccounts || []).find(a => String(a.name||'').toLowerCase().includes(String(creditAccountName||'').toLowerCase()));\n  const value = Math.round(num(amount) * 100) / 100;\n  if (!debit || !credit || !value) return null;`;

if (src.includes(oldPost)) {
  src = src.replace(oldPost, newPost);
  console.log('[accounting-harden] postFinanceJournal hardened');
} else {
  console.warn('[accounting-harden] postFinanceJournal signature not exact — manual review may be needed');
}

// 3) Expand queue
const oldQueue = `function queueStateNormalizedWriteForSave(collection, saved) {\n  const table = { expenses: 'expenses', calls: 'calls', requisitions: 'requisitions' }[collection];\n  if (table) queueStateNormalizedWrite(table, saved);\n}`;
const newQueue = `function queueStateNormalizedWriteForSave(collection, saved) {\n  const table = {\n    expenses: 'expenses', calls: 'calls', requisitions: 'requisitions',\n    invoices: 'invoices', payments: 'payments', customers: 'customers',\n    creditNotes: 'credit_notes', quotations: 'quotations'\n  }[collection];\n  if (table) queueStateNormalizedWrite(table, saved);\n}`;
if (src.includes(oldQueue)) {
  src = src.replace(oldQueue, newQueue);
  console.log('[accounting-harden] normalized queue expanded');
}

// 4) After saveState success
const anchor = `lastGoodState = db;\n  try { persistLastGoodState(db); } catch (_) {}`;
const inject = `lastGoodState = db;\n  try { persistLastGoodState(db); } catch (_) {}\n  try {\n    if (d1 && d1.syncFullStateToNormalizedTables && normalizedWritesEnabled()) {\n      const snap = compactStateForPersistence(db);\n      d1.syncFullStateToNormalizedTables(snap).catch((e) => console.warn('[ERP] normalized sync:', e && e.message));\n    }\n  } catch (e) { console.warn('[ERP] normalized sync setup:', e && e.message); }\n  try {\n    if (accountingEngine) {\n      accountingEngine.recomputeCustomerBalances(db);\n      accountingEngine.recomputeAccountBalances(db);\n    }\n  } catch (_) {}`;

if (src.includes(anchor) && !src.includes('syncFullStateToNormalizedTables')) {
  src = src.replace(anchor, inject);
  console.log('[accounting-harden] saveState normalized sync hooked');
} else if (src.includes('syncFullStateToNormalizedTables')) {
  console.log('[accounting-harden] saveState sync already present');
} else {
  console.warn('[accounting-harden] saveState anchor not found');
}

// 5) createInvoiceFromEntry queue
const invNeedle = "emitBusinessEvent(u, 'invoice.created_from_entry', 'invoices', id, { invNo, customerName: invoice.customerName, total });\n    log(u, 'Create Invoice', 'Accounts', `${invNo} — ${total}`);\n    return { success: true, invoice };";
const invRepl = "emitBusinessEvent(u, 'invoice.created_from_entry', 'invoices', id, { invNo, customerName: invoice.customerName, total });\n    log(u, 'Create Invoice', 'Accounts', `${invNo} — ${total}`);\n    try { queueStateNormalizedWrite('invoices', invoice); } catch (_) {}\n    try { if (typeof accountingEngine !== 'undefined' && accountingEngine) accountingEngine.recomputeCustomerBalances(d); } catch (_) {}\n    return { success: true, invoice };";
if (src.includes("invoice.created_from_entry") && !src.includes("queueStateNormalizedWrite('invoices', invoice)")) {
  // softer: append after create invoice log if unique
  src = src.replace(
    "log(u, 'Create Invoice', 'Accounts', `${invNo} — ${total}`);\n    return { success: true, invoice };",
    "log(u, 'Create Invoice', 'Accounts', `${invNo} — ${total}`);\n    try { queueStateNormalizedWrite('invoices', invoice); } catch (_) {}\n    try { if (typeof accountingEngine !== 'undefined' && accountingEngine) accountingEngine.recomputeCustomerBalances(d); } catch (_) {}\n    return { success: true, invoice };"
  );
  console.log('[accounting-harden] createInvoice queue attempt');
}

fs.writeFileSync(rpcPath, src);
console.log('[accounting-harden] wrote', rpcPath, 'bytes=', src.length);
