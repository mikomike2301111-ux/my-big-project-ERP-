/**
 * ONE-WAY backfill: read erp_state → upsert into normalized D1 tables.
 * NEVER modifies or deletes erp_state. Safe to re-run.
 *
 * Usage (env CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN):
 *   node scripts/backfill-normalized-from-state.js
 */
const d1 = require('../server/d1Client');

async function main() {
  if (!d1.d1Configured()) {
    console.error('Missing CLOUDFLARE_* env');
    process.exit(1);
  }
  console.log('Loading erp_state document...');
  const doc = await d1.getErpStateDocument();
  if (!doc || !doc.data) {
    console.error('No erp_state document found — abort (no writes performed)');
    process.exit(1);
  }
  const state = doc.data;
  console.log('Collections:', {
    invoices: (state.invoices || []).length,
    payments: (state.payments || []).length,
    customers: (state.customers || []).length,
    expenses: (state.expenses || []).length,
    accounts: (state.financeAccounts || []).length,
    journals: ((state.financeJournalEntries || []).length + (state.financeManualJournals || []).length),
  });
  console.log('Syncing to normalized tables (erp_state untouched)...');
  let rounds = 0;
  let total = 0;
  while (rounds < 30) {
    rounds += 1;
    const res = await d1.syncFullStateToNormalizedTables(state);
    console.log('round', rounds, res);
    if (!res || !res.ok) break;
    total += res.succeeded || 0;
    if (!res.deferred) break;
    if (Array.isArray(state.invoices) && state.invoices.length > 200) {
      state.invoices = state.invoices.slice(150).concat(state.invoices.slice(0, 150));
    }
  }
  console.log('Done. Upserted approx', total, 'row operations. erp_state was NOT modified.');
}

main().catch(e => { console.error(e); process.exit(1); });
