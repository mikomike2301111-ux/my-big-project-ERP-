/**
 * Import QuickBooks finance seed into ERP state (D1 or local JSON).
 * PRESERVES: HR (employees, leave, attendance, payroll, departments, staff)
 *            CRM (leads, calls, pipeline, visits)
 * REPLACES:  customers, invoices, payments, products, inventory,
 *            suppliers, purchaseOrders, expenses, chartOfAccounts,
 *            finance accounts, estimates/quotations
 *
 * Usage:
 *   node scripts/import-qbo-to-d1-state.js [--seed=path] [--dry-run]
 *
 * Env (for live D1 via REST — same as d1Client):
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_D1_DATABASE_ID
 *   ERP_STATE_ID (default: farmtrack-demo)
 */
const fs = require('fs');
const path = require('path');

const SEED_PATH = process.argv.find(a => a.startsWith('--seed='))?.split('=')[1]
  || path.join(__dirname, '..', 'data', 'qbo-finance-seed.json');
const DRY = process.argv.includes('--dry-run');
const STATE_ID = process.env.ERP_STATE_ID || 'farmtrack-demo';
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
const D1_ID = process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.CF_D1_DATABASE_ID;

const HR_CRM_KEYS = new Set([
  'employees', 'staff', 'staffRoster', 'departments', 'attendance',
  'leaveApplications', 'leaveBalances', 'leaveTypes', 'payroll',
  'payslips', 'deductions', 'hrSettings', 'users', 'profiles',
  'leads', 'calls', 'pipeline', 'salesVisits', 'crmActivities',
  'crmSettings', 'opportunities', 'contacts'
]);

const FINANCE_KEYS = [
  'customers', 'invoices', 'payments', 'products', 'inventory',
  'suppliers', 'purchaseOrders', 'expenses', 'chartOfAccounts',
  'financeAccounts', 'estimates', 'quotations',
  'analyticsMonthlyTrend', 'analyticsSummary', 'qboImportSummary'
];

async function d1Query(sql, params = []) {
  if (!ACCOUNT_ID || !API_TOKEN || !D1_ID) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN / CLOUDFLARE_D1_DATABASE_ID');
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${D1_ID}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, params })
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(JSON.stringify(json.errors || json));
  }
  return json.result?.[0] || json.result;
}

async function loadState() {
  try {
    const meta = await d1Query(
      `SELECT data FROM erp_state WHERE id = ? LIMIT 1`,
      [STATE_ID]
    );
    const row = meta?.results?.[0];
    if (row?.data) {
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (_) {}

  try {
    const chunks = await d1Query(
      `SELECT chunk_index, data FROM erp_state_chunks WHERE id = ? ORDER BY chunk_index ASC`,
      [STATE_ID]
    );
    const rows = chunks?.results || [];
    if (rows.length) {
      const text = rows.map(r => r.data).join('');
      return JSON.parse(text);
    }
  } catch (_) {}

  return {};
}

async function saveState(state) {
  const json = JSON.stringify(state);
  const CHUNK = 30000;
  if (json.length <= CHUNK) {
    await d1Query(
      `INSERT INTO erp_state (id, data, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [STATE_ID, json]
    );
    return { mode: 'single', bytes: json.length };
  }
  try {
    await d1Query(`DELETE FROM erp_state_chunks WHERE id = ?`, [STATE_ID]);
  } catch (_) {}
  const parts = [];
  for (let i = 0; i < json.length; i += CHUNK) parts.push(json.slice(i, i + CHUNK));
  for (let i = 0; i < parts.length; i++) {
    await d1Query(
      `INSERT INTO erp_state_chunks (id, chunk_index, data) VALUES (?, ?, ?)
       ON CONFLICT(id, chunk_index) DO UPDATE SET data = excluded.data`,
      [STATE_ID, i, parts[i]]
    );
  }
  await d1Query(
    `INSERT INTO erp_state (id, data, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    [STATE_ID, JSON.stringify({ __chunked: true, chunks: parts.length, updatedAt: new Date().toISOString() }) ]
  );
  return { mode: 'chunked', chunks: parts.length, bytes: json.length };
}

function mergePreserveHrCrm(current, seed) {
  const next = { ...current };
  for (const key of FINANCE_KEYS) {
    if (seed[key] !== undefined) next[key] = seed[key];
  }
  next.accountsReceivable = (seed.invoices || []).filter(i => Number(i.balance) > 0).map(i => ({
    id: i.id,
    customerId: i.customerId,
    customerName: i.customerName,
    invoiceNo: i.invoiceNo || i.invNo,
    dueDate: i.dueDate,
    invoiceAmount: i.total,
    paidAmount: i.paid,
    outstandingBalance: i.balance,
    status: i.status,
    source: i.source
  }));
  next.procurement = {
    purchaseOrders: seed.purchaseOrders || [],
    suppliers: seed.suppliers || [],
    inventory: seed.inventory || [],
    products: seed.products || [],
    label: 'Procurement'
  };
  next.qboImportSummary = {
    importedAt: new Date().toISOString(),
    source: seed.meta?.source || 'QuickBooks',
    counts: seed.analyticsSummary || {},
    preservedModules: [...HR_CRM_KEYS]
  };
  for (const key of HR_CRM_KEYS) {
    if (current[key] !== undefined && next[key] === undefined) {
      next[key] = current[key];
    }
  }
  return next;
}

async function main() {
  if (!fs.existsSync(SEED_PATH)) {
    console.error('Seed file not found:', SEED_PATH);
    process.exit(1);
  }
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  console.log('Seed summary:', seed.analyticsSummary || seed.meta);

  if (DRY || !ACCOUNT_ID) {
    console.log('[dry-run or no CF env] Writing local merge preview only.');
    const preview = mergePreserveHrCrm({}, seed);
    const out = path.join(__dirname, '..', 'data', 'qbo-merged-preview.json');
    fs.writeFileSync(out, JSON.stringify({
      keys: Object.keys(preview),
      analyticsSummary: preview.analyticsSummary,
      sampleInvoice: preview.invoices?.[0],
      sampleCustomer: preview.customers?.[0],
      monthlyTrendLen: preview.analyticsMonthlyTrend?.length
    }, null, 2));
    console.log('Wrote', out);
    return;
  }

  console.log('Loading current erp_state from D1…');
  const current = await loadState();
  const preserved = {};
  for (const k of HR_CRM_KEYS) {
    if (current[k] !== undefined) preserved[k] = Array.isArray(current[k]) ? current[k].length : typeof current[k];
  }
  console.log('Preserving HR/CRM:', preserved);

  const merged = mergePreserveHrCrm(current, seed);
  console.log('Saving merged state…');
  const result = await saveState(merged);
  console.log(JSON.stringify({ ok: true, ...result, finance: seed.analyticsSummary }, null, 2));
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
