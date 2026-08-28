#!/usr/bin/env node
/**
 * Import the QuickBooks full Chart of Accounts CSV into ERP state.
 * Reads data/imports/chart-of-accounts.csv (columns: Full Name, Account Type,
 * Account Subtype, Description, Total Balance, Currency, Account) and MERGES
 * into financeAccounts (chartOfAccounts) — keeps ids stable per account name,
 * sets type / parent / description / balance / status. No hard delete: it only
 * adds missing accounts and updates balances for existing names.
 * Usage:
 *   node scripts/import-coa-csv.js --preview   # safe preview JSON only
 *   node scripts/import-coa-csv.js             # live D1 (needs CLOUDFLARE_* env)
 */
const fs = require('fs');
const path = require('path');

const CSV = path.join(__dirname, '..', 'data', 'imports', 'chart-of-accounts.csv');
const PREVIEW = path.join(__dirname, '..', 'data', 'imports', 'coa-preview.json');
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
function typeFor(qbType) {
  const t = String(qbType || '').toLowerCase();
  // Order matters: check payable before receivable so "Accounts payable (A/P)"
  // (which contains "payable") → Liability, not Asset.
  if (t.includes('payable')) return 'Liability';
  if (t.includes('bank') || t.includes('receivable') || t.includes('asset')) return 'Asset';
  if (t.includes('liab')) return 'Liability';
  if (t.includes('equity')) return 'Equity';
  if (t.includes('income')) return 'Revenue';
  if (t.includes('expense') || t.includes('cost')) return 'Expense';
  return 'Expense';
}
function gid(prefix) { return (prefix || 'ACC-') + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(); }

function buildAccounts() {
  if (!fs.existsSync(CSV)) { console.error('Missing', CSV); process.exit(1); }
  const lines = parseCSV(fs.readFileSync(CSV, 'utf8'));
  if (!lines.length) { console.error('Empty CSV'); process.exit(1); }
  const header = lines[0].map(h => h.trim());
  const I = { full: header.indexOf('Full Name'), type: header.indexOf('Account Type'), subtype: header.indexOf('Account Subtype'), desc: header.indexOf('Description'), balance: header.indexOf('Total Balance'), currency: header.indexOf('Currency'), acct: header.indexOf('Account') };
  const rows = lines.slice(1).filter(r => r[I.full] || r[I.acct]);
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const name = normalize(r[I.full]) || normalize(r[I.acct]);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const type = typeFor(r[I.type]);
    const parent = (() => {
      const parts = name.split(':').map(s => s.trim()).filter(Boolean);
      return parts.length > 1 ? parts.slice(0, -1).join(' ') : type;
    })();
    const bal = Number(parseFloat(String(r[I.balance] || '0').replace(/[^0-9.-]/g, ''))) || 0;
    out.push({ id: gid('ACC-'), code: String(out.length + 1).padStart(4, '0'), name, type, parent, description: normalize(r[I.desc]), currency: normalize(r[I.currency]) || 'KES', normalBalance: ['Asset','Expense'].includes(type) ? 'Debit' : 'Credit', balance: bal, status: 'Active', source: 'QuickBooks-coa-export', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  return out;
}

function runMerge(accounts, state) {
  const arr = Array.isArray(state.financeAccounts) ? state.financeAccounts : [];
  let added = 0, updated = 0, skipped = 0;
  const seen = new Set();
  for (const a of accounts) {
    const key = String(a.name).toLowerCase();
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    const existing = arr.find(x => String(x.name).toLowerCase() === key || String(x.description||'').toLowerCase() === key);
    if (existing) {
      existing.type = a.type || existing.type;
      existing.parent = a.parent || existing.parent;
      existing.description = a.description || existing.description;
      existing.currency = a.currency || existing.currency;
      existing.balance = a.balance;
      existing.source = 'QuickBooks-coa-export';
      existing.updatedAt = new Date().toISOString();
      updated++;
    } else { arr.push(a); added++; }
  }
  if (!state.financeAccounts) state.financeAccounts = arr;
  state.chartOfAccounts = arr;
  return { added, updated, skipped, total: arr.length };
}

module.exports = { parseCSV, buildAccounts, runMerge, normalize, typeFor, CSV, PREVIEW, PREVIEW_ONLY, STATE_ID, ACCOUNT_ID, API_TOKEN, D1_ID, gid };

if (require.main === module) {
  const accounts = buildAccounts();
  if (PREVIEW_ONLY || !(ACCOUNT_ID && API_TOKEN && D1_ID)) {
    fs.writeFileSync(PREVIEW, JSON.stringify({ importedCount: accounts.length, accounts }, null, 2));
    console.log(`[preview] ${accounts.length} accounts parsed -> ${PREVIEW}`);
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
    const r = runMerge(accounts, state);
    const json = JSON.stringify(state);
    await q("INSERT INTO erp_state (id, data, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at", [STATE_ID, json]);
    console.log(`[import] added=${r.added} updated=${r.updated} skipped=${r.skipped} total=${r.total} bytes=${json.length}`);
  })().catch(e => { console.error(e); process.exit(1); });
}