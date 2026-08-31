#!/usr/bin/env node
/**
 * Import QuickBooks suppliers/vendors CSV into ERP state (merge, upsert by name).
 * Usage:
 *   node scripts/import-suppliers-csv.js --preview   # safe preview JSON only
 *   node scripts/import-suppliers-csv.js             # live D1 (needs CLOUDFLARE_* env)
 */
const fs = require('fs');
const path = require('path');

const CSV = path.join(__dirname, '..', 'data', 'imports', 'suppliers.csv');
const PREVIEW = path.join(__dirname, '..', 'data', 'imports', 'suppliers-preview.json');
const PREVIEW_ONLY = process.argv.includes('--preview');
const STATE_ID = process.env.ERP_STATE_ID || 'farmtrack-demo';
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
const D1_ID = process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.CF_D1_DATABASE_ID;

function parseCSV(text) {
  const rows = []; let row = []; let cur = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
function normalize(v) { return String(v || '').trim(); }
function normName(v) { return normalize(v).replace(/\s+/g, ' ').toLowerCase(); }
function gid(prefix) { return (prefix || 'ID') + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(); }

function buildSuppliers() {
  if (!fs.existsSync(CSV)) { console.error('Missing', CSV); process.exit(1); }
  const lines = parseCSV(fs.readFileSync(CSV, 'utf8'));
  if (!lines.length) { console.error('Empty CSV'); process.exit(1); }
  const header = lines[0].map(h => h.trim());
  const I = { disp: header.indexOf('Supplier Display Name'), name: header.indexOf('Supplier'), email: header.indexOf('Email'), full: header.indexOf('Full Name'), addr: header.indexOf('Billing Address'), phone: header.indexOf('Phone'), deleted: header.indexOf('Deleted'), taxId: header.indexOf('Tax Id'), balance: header.indexOf('Balance'), modifiedBy: header.indexOf('Last Modified By'), created: header.indexOf('Created Date'), modified: header.indexOf('Last Modified Date') };
  const rows = lines.slice(1).filter(r => (r[I.disp] || r[I.name]));
  return rows.map(r => {
    const displayName = normalize(r[I.disp]) || normalize(r[I.name]) || normalize(r[I.full]);
    return { id: gid('SUP-'), name: displayName, supplierNo: 'SUP-' + displayName.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase().slice(0, 24), email: normalize(r[I.email]), phone: normalize(r[I.phone]), billingAddress: normalize(r[I.addr]), address: normalize(r[I.addr]), taxId: normalize(r[I.taxId]), balance: Number(parseFloat(String(r[I.balance] || '0').replace(/[^0-9.-]/g, ''))) || 0, status: String(r[I.deleted]).toLowerCase() === 'true' ? 'Inactive' : 'Active', source: 'QuickBooks-suppliers-export', createdBy: normalize(r[I.modifiedBy]), createdAt: normalize(r[I.created]) || new Date().toISOString(), updatedAt: normalize(r[I.modified]) || new Date().toISOString(), isDeleted: 'No' };
  });
}

function runMerge(suppliers, state) {
  state.suppliers = Array.isArray(state.suppliers) ? state.suppliers : [];
  const seen = new Map(); let added = 0, updated = 0, skipped = 0;
  for (const s of suppliers) {
    const key = normName(s.name);
    if (seen.has(key)) { skipped++; continue; }
    seen.set(key, true);
    const existing = state.suppliers.find(x => normName(x.name || x.supplierName || '') === key);
    if (existing) {
      existing.email = s.email || existing.email;
      existing.phone = s.phone || existing.phone;
      existing.billingAddress = s.billingAddress || existing.billingAddress;
      existing.address = s.billingAddress || existing.address;
      existing.taxId = s.taxId || existing.taxId;
      if (Math.abs(Number(existing.balance || 0)) === 0) existing.balance = s.balance;
      existing.updatedAt = new Date().toISOString();
      updated++;
    } else { state.suppliers.push(s); added++; }
  }
  state.suppliersByName = state.suppliers.reduce((m, s) => { m[normName(s.name || '')] = s.id; return m; }, {});
  return { added, updated, skipped, total: state.suppliers.length };
}

module.exports = { parseCSV, buildSuppliers, runMerge, normalize, normName, CSV, PREVIEW, PREVIEW_ONLY, STATE_ID, ACCOUNT_ID, API_TOKEN, D1_ID, gid };

if (require.main === module) {
  const suppliers = buildSuppliers();
  if (PREVIEW_ONLY || !(ACCOUNT_ID && API_TOKEN && D1_ID)) {
    fs.writeFileSync(PREVIEW, JSON.stringify({ importedCount: suppliers.length, suppliers }, null, 2));
    console.log(`[preview] ${suppliers.length} suppliers parsed -> ${PREVIEW}`);
    return;
  }
  (async () => {
    const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${D1_ID}/query`;
    const q = async (sql, params = []) => {
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(JSON.stringify(json.errors || json));
      return json.result?.[0] ?? json.result;
    };
    let state = {};
    try { const meta = await q('SELECT data FROM erp_state WHERE id = ? LIMIT 1', [STATE_ID]); const row = meta?.results?.[0]; if (row?.data) { const p = typeof row.data === 'string' ? JSON.parse(row.data) : row.data; if (p && typeof p === 'object') state = p; } } catch (_) {}
    const r = runMerge(suppliers, state);
    const json = JSON.stringify(state);
    await q("INSERT INTO erp_state (id, data, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at", [STATE_ID, json]);
    console.log(`[import] added=${r.added} updated=${r.updated} skipped=${r.skipped} total=${r.total} bytes=${json.length}`);
  })().catch(e => { console.error(e); process.exit(1); });
}