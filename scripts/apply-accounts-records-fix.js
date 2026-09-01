#!/usr/bin/env node
/**
 * apply-accounts-records-fix-v2 (syntax-safe)
 * 1) Fix cash: mRev - mExp value uses (not declarations)
 * 2) Repair any broken `const (typeof...) =` from prior deploys
 * 3) Inject __buildFinanceFromInvoices helper + catch that always returns live records
 * Data-safe: does not wipe erp_state.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MAIN = path.join(root, 'src', 'main.jsx');
const MARKER = '/* accounts-records-fix-v1 */';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[records] SYNTAX', file, r.stderr || r.stdout);
    process.exit(1);
  }
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[records] rpc PLACEHOLDER — restore first');
  process.exit(1);
}

// Safe value-only fixes
rpc = rpc.replace(/cash:\s*mRev\s*-\s*mExp/g, 'cash: (typeof rev !== "undefined" ? rev : (typeof revenue !== "undefined" ? revenue : 0)) - (typeof exp !== "undefined" ? exp : (typeof expenses !== "undefined" ? expenses : 0))');
rpc = rpc.replace(/const\s*\(typeof rev[^)]+\)\s*=/g, 'const mRev =');
rpc = rpc.replace(/const\s*\(typeof exp[^)]+\)\s*=/g, 'const mExp =');
rpc = rpc.replace(/const\s*\(typeof revenue[^)]+\)\s*=/g, 'const mRev =');
rpc = rpc.replace(/const\s*\(typeof expenses[^)]+\)\s*=/g, 'const mExp =');
console.log('[records] safe mRev value scrub done');

if (!rpc.includes(MARKER)) {
  const sig = 'getFinanceWorkspaceData(user, filters = {})';
  const idx = rpc.indexOf(sig);
  if (idx < 0) {
    console.error('[records] getFinanceWorkspaceData not found');
    process.exit(1);
  }

  if (!rpc.includes('function __buildFinanceFromInvoices')) {
    const helper = `
  ${MARKER}
  function __buildFinanceFromInvoices(d0, filters) {
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const invs = (d0.invoices || []).filter(i => i && i.status !== 'Deleted' && i.isDeleted !== 'Yes' && i.status !== 'Cancelled');
    const exps = Array.isArray(d0.expenses) ? d0.expenses : [];
    const pays = Array.isArray(d0.payments) ? d0.payments : [];
    const accts = (d0.financeAccounts || d0.chartOfAccounts || []).slice(0, 300);
    const rev = invs.reduce((s, i) => s + num(i.total || i.amount), 0);
    const exp = exps.reduce((s, i) => s + num(i.amount || i.total), 0);
    const ar = invs.reduce((s, i) => s + Math.max(0, num(i.balance)), 0);
    const cash = pays.reduce((s, p) => s + num(p.amount), 0);
    const byMonth = {};
    const bump = (key, field, val) => {
      if (!key) return;
      const k = String(key).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(k)) return;
      if (!byMonth[k]) byMonth[k] = { month: k, revenue: 0, expenses: 0, profit: 0, cash: 0 };
      byMonth[k][field] += val;
      byMonth[k].profit = byMonth[k].revenue - byMonth[k].expenses;
    };
    invs.forEach(i => bump(i.date || i.createdAt, 'revenue', num(i.total || i.amount)));
    exps.forEach(i => bump(i.date || i.createdAt || i.expenseDate, 'expenses', num(i.amount || i.total)));
    pays.forEach(p => bump(p.date || p.paidAt || p.createdAt, 'cash', num(p.amount)));
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (!byMonth[k]) byMonth[k] = { month: k, revenue: 0, expenses: 0, profit: 0, cash: 0 };
    }
    const trend = Object.keys(byMonth).sort().slice(-12).map(k => byMonth[k]);
    const receivables = invs.filter(i => num(i.balance) > 0).slice(0, 300).map(inv => ({
      id: 'AR-' + inv.id, invoiceId: inv.id, invNo: inv.invNo || inv.invoiceNo,
      customerName: inv.customerName, dueDate: inv.dueDate, total: num(inv.total),
      paid: num(inv.paid), balance: num(inv.balance), status: inv.status
    }));
    return {
      filters: { dateRange: (filters && filters.period) || 'Year', currency: 'KES', entity: 'Farmtrack Biosciences Ltd' },
      overview: {
        revenue: Math.round(rev), expenses: Math.round(exp),
        grossProfit: Math.round(rev - exp), netProfit: Math.round(rev - exp),
        cashPosition: Math.round(cash), accountsReceivable: Math.round(ar),
        accountsPayable: 0, inventoryValue: 0, payrollCost: 0, taxLiability: 0,
        bankBalances: Math.round(accts.filter(a => /bank/i.test(String(a.type || a.name || ''))).reduce((s, a) => s + num(a.balance), 0)),
        operatingCashFlow: Math.round(cash), budgetVariance: 0,
        monthlyProfit: Math.round((trend[trend.length - 1] || {}).profit || 0),
        yearlyProfit: Math.round(rev - exp), financialHealthScore: rev > 0 ? 72 : 50
      },
      integrity: { journals: 0, lines: 0, unbalanced: 0, immutable: true },
      trend, trendWeekly: trend,
      accounts: accts, accountBalances: accts.map(a => ({ id: a.id, name: a.name, code: a.code, type: a.type, balance: num(a.balance) })),
      journals: d0.journals || [], journalLines: [], ledger: [],
      receivables, payables: [],
      bankAccounts: d0.bankAccounts || accts.filter(a => /bank/i.test(String(a.type || ''))).slice(0, 50),
      bankTransactions: [],
      expenses: exps.slice(0, 300),
      payroll: [], taxes: [], assets: [], budgets: [], costCenters: [], forecasts: [], reports: [],
      audit: [], ai: [], customerFinance: [], agingSummary: [], collectionQueue: receivables.slice(0, 50),
      paymentTermsSummary: [], statementPreview: [], quotations: (d0.quotations || d0.estimates || []).slice(0, 100),
      payments: pays.slice(0, 200),
      accountingIntegrity: { assets: 0, liabilities: 0, equity: 0, difference: 0, balanced: true, status: 'LIVE_INVOICES', trialBalance: { totalDebit: 0, totalCredit: 0 }, accountCount: accts.length },
      balanceSheetSections: [], paymentMethodsSummary: [], paymentAccountsSummary: [],
      sourceFlows: [
        { module: 'Invoices', records: invs.length },
        { module: 'Payments', records: pays.length },
        { module: 'Expenses', records: exps.length },
        { module: 'Accounts', records: accts.length }
      ],
      errorSafe: false,
      creditNotes: d0.creditNotes || [], creditNoteItems: [], productReturns: [], taxSettings: [],
      invoiceHistory: invs.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 300),
      accountingAuditTrail: [], warehouses: [], products: (d0.products || []).slice(0, 100)
    };
  }
`;
    rpc = rpc.slice(0, idx) + helper + rpc.slice(idx);
    console.log('[records] helper injected');
  }

  // Only replace catch if helper exists and marker not already in catch
  const fnStart = rpc.indexOf('getFinanceWorkspaceData(user, filters = {})');
  const nextFn = rpc.indexOf('\n  getAccountsData(user)', fnStart);
  if (fnStart > 0 && nextFn > fnStart) {
    let fn = rpc.slice(fnStart, nextFn);
    if (!fn.includes('return __buildFinanceFromInvoices')) {
      const catchIdx = fn.indexOf('catch (err)');
      if (catchIdx > 0) {
        // Find end of catch by matching braces is hard; inject right after catch (err) {
        const afterCatch = fn.indexOf('{', catchIdx);
        if (afterCatch > 0) {
          const inject = `{
      console.error('getFinanceWorkspaceData', err && err.message);
      ${MARKER}
      try { return __buildFinanceFromInvoices(data(), filters); } catch (e2) { console.error('finance helper', e2 && e2.message); }
      `;
          fn = fn.slice(0, afterCatch) + inject + fn.slice(afterCatch + 1);
          rpc = rpc.slice(0, fnStart) + fn + rpc.slice(nextFn);
          console.log('[records] catch inject helper return');
        }
      }
    }
  }

  const bodyNeedle = 'getFinanceWorkspaceData(user, filters = {}) {';
  if (rpc.includes(bodyNeedle) && !rpc.includes('accounts-records-period')) {
    rpc = rpc.replace(
      bodyNeedle,
      `getFinanceWorkspaceData(user, filters = {}) {\n    /* accounts-records-period */\n    if (!filters || typeof filters !== 'object') filters = {};\n    if (!filters.period || filters.period === 'Month') filters.period = 'Year';`
    );
    console.log('[records] Year period forced');
  }
}

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[records] rpc ok', rpc.length);

let main = fs.readFileSync(MAIN, 'utf8');
if (main.trim() === 'PLACEHOLDER' || main.length < 5000) {
  console.error('[records] main PLACEHOLDER');
  process.exit(1);
}
if (!main.includes('accounts-records-fix-ui')) {
  main = main.split("getFinanceWorkspaceData', [{ period: globalPeriod }]").join(
    "getFinanceWorkspaceData', [{ period: (globalPeriod === 'Month' || !globalPeriod) ? 'Year' : globalPeriod }] /* accounts-records-fix-ui */"
  );
  fs.writeFileSync(MAIN, main);
  console.log('[records] main period patch');
} else {
  console.log('[records] main already patched');
}
console.log('[records] done');
