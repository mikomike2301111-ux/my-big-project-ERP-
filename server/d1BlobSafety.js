/**
 * BLOB_SAFE_V10 — union-merge helpers so concurrent erp_state writes cannot
 * drop records. Incoming non-empty fields win on the same id; ids that exist
 * on either side are kept. QBCALL junk is stripped from calls.
 */
const MERGE_KEYS = [
  'customers', 'calls', 'invoices', 'payments', 'expenses',
  'salesOrders', 'sales', 'deliveries', 'suppliers', 'products',
  'financeAccounts', 'chartOfAccounts', 'quotations', 'requisitions',
  'creditNotes', 'employees', 'leads', 'purchaseOrders', 'journalEntries',
  'financeJournalEntries', 'financeManualJournals', 'financeJournalLines',
  'financeManualJournalLines', 'inventory', 'items',
];

function isEmptyVal(v) {
  return v === undefined || v === null || v === '';
}

function mergeRecord(existing, incoming) {
  const out = Object.assign({}, existing || {});
  if (!incoming || typeof incoming !== 'object') return out;
  for (const [k, v] of Object.entries(incoming)) {
    if (isEmptyVal(v)) continue;
    out[k] = v;
  }
  return out;
}

function isQbCall(row) {
  const id = String((row && row.id) || '');
  return id.startsWith('QBCALL') || id.startsWith('QB-CALL');
}

function mergeArrayById(incoming, remote, opts) {
  const byId = new Map();
  for (const r of remote || []) {
    if (!r || r.id == null) continue;
    if (opts && opts.stripQb && isQbCall(r)) continue;
    byId.set(String(r.id), r);
  }
  for (const r of incoming || []) {
    if (!r || r.id == null) continue;
    if (opts && opts.stripQb && isQbCall(r)) continue;
    const id = String(r.id);
    if (!byId.has(id)) byId.set(id, r);
    else byId.set(id, mergeRecord(byId.get(id), r));
  }
  return Array.from(byId.values());
}

function mergeStateDocuments(incoming, remote) {
  if (!incoming || typeof incoming !== 'object') return remote || incoming;
  if (!remote || typeof remote !== 'object') return incoming;
  const out = Object.assign({}, remote, incoming);
  for (const key of MERGE_KEYS) {
    const a = Array.isArray(incoming[key]) ? incoming[key] : null;
    const b = Array.isArray(remote[key]) ? remote[key] : null;
    if (!a && !b) continue;
    if (!a) { out[key] = key === 'calls' ? b.filter((r) => !isQbCall(r)) : b; continue; }
    if (!b) { out[key] = key === 'calls' ? a.filter((r) => !isQbCall(r)) : a; continue; }
    out[key] = mergeArrayById(a, b, { stripQb: key === 'calls' });
  }
  out._writeVersion = Number(remote._writeVersion || incoming._writeVersion || 0);
  out._d1BaseGen = remote._d1BaseGen || incoming._d1BaseGen;
  out._mergedFromConflict = true;
  out._blobSafety = 'v10';
  return out;
}

module.exports = {
  MERGE_KEYS,
  mergeRecord,
  mergeArrayById,
  mergeStateDocuments,
  isQbCall,
};
