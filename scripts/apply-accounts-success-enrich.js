#!/usr/bin/env node
/**
 * apply-accounts-success-enrich-v1
 *
 * ROOT CAUSE (accountant "not there"):
 * - Safe-mode (auth fail) already returned customers/suppliers/journals.
 * - Logged-in Accountant hits the SUCCESS path of getFinanceWorkspaceData,
 *   which did NOT include customers/suppliers and had sparse journals.
 *
 * FIX: After every non-mutating invokeRpc call for getFinanceWorkspaceData
 * and getAccountsData, enrich the result from live erp_state (data()).
 * Syntax-safe. Never wipes data.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MARK = '/* accounts-success-enrich-v1 */';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[success-enrich] SYNTAX', (r.stderr || r.stdout || '').slice(0, 800));
    process.exit(1);
  }
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[success-enrich] rpc PLACEHOLDER');
  process.exit(1);
}

if (rpc.includes(MARK)) {
  console.log('[success-enrich] already applied');
  process.exit(0);
}

const OLD = `if (!isMutating) {
    await loadState();
    return api[fn](...args);
  }`;

const NEW = `if (!isMutating) {
    await loadState();
    ${MARK}
    let __finR = api[fn](...args);
    if (__finR && typeof __finR.then === 'function') __finR = await __finR;
    if ((fn === 'getFinanceWorkspaceData' || fn === 'getAccountsData') && __finR && typeof __finR === 'object') {
      try {
        const d0 = (typeof data === 'function' ? data() : {}) || {};
        const alive = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && x.isDeleted !== 'Yes' && x.isDeleted !== true);
        if (!Array.isArray(__finR.customers) || __finR.customers.length < 1) {
          __finR.customers = alive(d0.customers).slice(0, 500);
        }
        if (!Array.isArray(__finR.suppliers) || __finR.suppliers.length < 1) {
          __finR.suppliers = alive(d0.suppliers || d0.vendors).slice(0, 300);
        }
        if (!Array.isArray(__finR.invoices) || __finR.invoices.length < 1) {
          __finR.invoices = alive(d0.invoices).slice(0, 400);
        }
        if (!Array.isArray(__finR.invoiceHistory) || __finR.invoiceHistory.length < 20) {
          __finR.invoiceHistory = alive(__finR.invoices && __finR.invoices.length ? __finR.invoices : d0.invoices).slice(0, 300);
        }
        if (!Array.isArray(__finR.products) || __finR.products.length < 1) {
          __finR.products = alive(d0.products).slice(0, 300);
        }
        if (!Array.isArray(__finR.expenses) || __finR.expenses.length < 1) {
          __finR.expenses = alive(d0.expenses).slice(0, 200);
        }
        if (!Array.isArray(__finR.payments) || __finR.payments.length < 1) {
          __finR.payments = alive(d0.payments).slice(0, 200);
        }
        if (!Array.isArray(__finR.accounts) || __finR.accounts.length < 1) {
          __finR.accounts = alive(d0.accounts || d0.chartOfAccounts || d0.financeAccounts).slice(0, 300);
        }
        // Receivables from open invoices if missing
        if (!Array.isArray(__finR.receivables) || __finR.receivables.length < 1) {
          __finR.receivables = alive(__finR.invoices || d0.invoices)
            .filter((inv) => Number(inv.balance != null ? inv.balance : (Number(inv.total || 0) - Number(inv.paid || 0))) > 0)
            .slice(0, 200)
            .map((inv) => ({
              id: 'AR-' + inv.id,
              invoiceId: inv.id,
              invNo: inv.invNo,
              customerName: inv.customerName,
              dueDate: inv.dueDate,
              total: Number(inv.total || 0),
              paid: Number(inv.paid || 0),
              balance: Number(inv.balance != null ? inv.balance : (Number(inv.total || 0) - Number(inv.paid || 0))),
              status: inv.status || 'Pending'
            }));
        }
        // Journals / ledger from invoices+expenses when sparse
        if (!Array.isArray(__finR.journals) || __finR.journals.length < 40) {
          const inv = alive(__finR.invoices || d0.invoices).slice(0, 120);
          const exp = alive(__finR.expenses || d0.expenses).slice(0, 80);
          const out = [];
          inv.forEach((inv0) => {
            const t = Number(inv0.total || 0);
            out.push({
              id: 'JRN-INV-' + (inv0.id || inv0.invNo),
              journalNo: 'JRN-' + (inv0.invNo || inv0.id),
              date: inv0.date || inv0.createdAt || '',
              memo: 'Sales invoice ' + (inv0.invNo || '') + ' — ' + (inv0.customerName || ''),
              status: 'Posted',
              source: 'invoice',
              sourceId: inv0.id,
              totalDebit: t,
              totalCredit: t
            });
          });
          exp.forEach((ex) => {
            const t = Number(ex.amount || 0);
            out.push({
              id: 'JRN-EXP-' + (ex.id || ex.expNo),
              journalNo: 'JRN-' + (ex.expNo || ex.id),
              date: ex.date || ex.createdAt || '',
              memo: 'Expense ' + (ex.expNo || '') + ' — ' + (ex.category || ''),
              status: 'Posted',
              source: 'expense',
              sourceId: ex.id,
              totalDebit: t,
              totalCredit: t
            });
          });
          __finR.journals = out;
        }
        if (!__finR.overview || typeof __finR.overview !== 'object') __finR.overview = {};
        const ov = __finR.overview;
        const invAll = alive(__finR.invoices || d0.invoices);
        const expAll = alive(__finR.expenses || d0.expenses);
        if (!(Number(ov.revenue) > 0) && invAll.length) {
          ov.revenue = invAll.reduce((s, i) => s + Number(i.total || 0), 0);
        }
        if (!(Number(ov.expenses) > 0) && expAll.length) {
          ov.expenses = expAll.reduce((s, i) => s + Number(i.amount || 0), 0);
        }
        if (ov.netProfit == null || ov.netProfit === 0) {
          ov.netProfit = Number(ov.revenue || 0) - Number(ov.expenses || 0);
          ov.grossProfit = ov.netProfit;
          ov.yearlyProfit = ov.netProfit;
        }
        if (!(Number(ov.accountsReceivable) > 0) && Array.isArray(__finR.receivables)) {
          ov.accountsReceivable = __finR.receivables.reduce((s, r) => s + Number(r.balance || 0), 0);
        }
        if (!Array.isArray(__finR.sourceFlows) || !__finR.sourceFlows.length) {
          __finR.sourceFlows = [
            { module: 'Invoices', records: invAll.length },
            { module: 'Payments', records: alive(d0.payments).length },
            { module: 'Expenses', records: expAll.length }
          ];
        }
      } catch (__enrichErr) {
        console.error('[success-enrich]', __enrichErr && __enrichErr.message);
      }
    }
    return __finR;
  }`;

if (!rpc.includes(OLD)) {
  // try looser whitespace
  const loose = /if\s*\(\s*!isMutating\s*\)\s*\{\s*await loadState\(\);\s*return api\[fn\]\(\.\.\.args\);\s*\}/;
  if (loose.test(rpc)) {
    rpc = rpc.replace(loose, NEW);
    console.log('[success-enrich] patched via loose match');
  } else {
    console.error('[success-enrich] could not find invokeRpc non-mutating branch');
    // still exit 0? No — fail so we notice
    process.exit(1);
  }
} else {
  rpc = rpc.replace(OLD, NEW);
  console.log('[success-enrich] patched exact branch');
}

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[success-enrich] done', rpc.length);
