#!/usr/bin/env node
/** Finance KPIs from invoices + safe fallback (never blank Accounts). */
const fs = require('fs');
const path = require('path');
const rpcPath = path.join(__dirname, '..', 'api', 'rpc.js');
let rpc = fs.readFileSync(rpcPath, 'utf8');
if (rpc.includes('/* finance-show-data-v1 */') && rpc.includes('finance-show-data-v1 fallback')) {
  console.log('[finance-show] already applied');
  process.exit(0);
}
const oldRev = 'const revenue = Math.round(periodSales.reduce((s, x) => s + num(x.total), 0));';
const newRev = `/* finance-show-data-v1 */
    const periodInvoices = (d.invoices || []).filter(inv => inv.status !== 'Deleted' && inv.isDeleted !== 'Yes' && inDateRange(inv, scope));
    const invoiceRevenue = periodInvoices.reduce((s, x) => s + num(x.total), 0);
    const salesRevenue = periodSales.reduce((s, x) => s + num(x.total), 0);
    const revenue = Math.round(invoiceRevenue > 0 ? invoiceRevenue : salesRevenue);`;
if (rpc.includes(oldRev)) {
  rpc = rpc.replace(oldRev, newRev);
  console.log('[finance-show] revenue from invoices');
}
rpc = rpc.replace(
  /const ar = Math\.round\([^;]+;/,
  "const ar = Math.round((d.invoices || []).filter(inv => inv.status !== 'Deleted' && inv.isDeleted !== 'Yes' && inv.status !== 'Cancelled').reduce((s, inv) => s + Math.max(0, num(inv.balance)), 0));"
);
console.log('[finance-show] ar from invoices');

const start = rpc.indexOf('  getFinanceWorkspaceData(user, filters = {}) {');
const end = rpc.indexOf('\n  getAccountsData(user)', start);
if (start < 0 || end < 0) {
  console.error('[finance-show] function bounds missing');
  process.exit(1);
}
let fn = rpc.slice(start, end);
const c = fn.indexOf('catch (err)');
if (c < 0) { console.error('no catch'); process.exit(1); }
const before = fn.slice(0, c);
const catchBlock = `catch (err) {
      console.error('getFinanceWorkspaceData', err && err.message);
      /* finance-show-data-v1 fallback */
      try {
        const d0 = data();
        const invs = (d0.invoices || []).filter(i => i && i.status !== 'Deleted' && i.isDeleted !== 'Yes');
        const exps = Array.isArray(d0.expenses) ? d0.expenses : [];
        const pays = Array.isArray(d0.payments) ? d0.payments : [];
        const rev = invs.reduce((s, i) => s + num(i.total), 0);
        const exp = exps.reduce((s, i) => s + num(i.amount), 0);
        const ar0 = invs.reduce((s, i) => s + Math.max(0, num(i.balance)), 0);
        const receivables0 = invs.filter(i => num(i.balance) > 0).slice(0, 200).map(inv => ({
          id: 'AR-' + inv.id, invoiceId: inv.id, invNo: inv.invNo || inv.invoiceNo, customerName: inv.customerName,
          dueDate: inv.dueDate, total: num(inv.total), paid: num(inv.paid), balance: num(inv.balance), status: inv.status
        }));
        return {
          filters: { dateRange: 'All data (safe mode)', currency: 'KES', entity: 'Farmtrack Biosciences Ltd' },
          overview: {
            revenue: Math.round(rev), expenses: Math.round(exp), grossProfit: Math.round(rev - exp), netProfit: Math.round(rev - exp),
            cashPosition: Math.round(pays.reduce((s, p) => s + num(p.amount), 0)),
            accountsReceivable: Math.round(ar0), accountsPayable: 0, inventoryValue: 0, payrollCost: 0, taxLiability: 0,
            bankBalances: 0, operatingCashFlow: 0, budgetVariance: 0, monthlyProfit: 0, yearlyProfit: Math.round(rev - exp),
            financialHealthScore: 60
          },
          integrity: { journals: 0, lines: 0, unbalanced: 0, immutable: true },
          trend: [], trendWeekly: [], accounts: (d0.financeAccounts || []).slice(0, 200), accountBalances: [],
          journals: [], journalLines: [], ledger: [], receivables: receivables0, payables: [],
          bankAccounts: d0.bankAccounts || [], bankTransactions: [], expenses: exps.slice(0, 150),
          payroll: [], taxes: [], assets: [], budgets: [], costCenters: [], forecasts: [], reports: [],
          audit: [], ai: [], customerFinance: [], agingSummary: [], collectionQueue: receivables0.slice(0, 50),
          paymentTermsSummary: [], statementPreview: [], quotations: (d0.quotations || []).slice(0, 50),
          payments: pays.slice(0, 100),
          accountingIntegrity: { assets: 0, liabilities: 0, equity: 0, difference: 0, balanced: true, status: 'SAFE_MODE', trialBalance: { totalDebit: 0, totalCredit: 0 }, accountCount: 0 },
          balanceSheetSections: [], paymentMethodsSummary: [], paymentAccountsSummary: [],
          sourceFlows: [
            { module: 'Invoices', records: invs.length },
            { module: 'Payments', records: pays.length },
            { module: 'Expenses', records: exps.length }
          ],
          errorSafe: true, errorMessage: (err && err.message) || 'partial',
          creditNotes: d0.creditNotes || [], creditNoteItems: [], productReturns: [], taxSettings: [],
          invoiceHistory: invs.slice(0, 100), accountingAuditTrail: [], warehouses: [], products: (d0.products || []).slice(0, 100)
        };
      } catch (e2) {
        return {
          filters: { dateRange: 'Error', currency: 'KES', entity: 'Farmtrack Biosciences Ltd' },
          overview: { revenue: 0, expenses: 0, grossProfit: 0, netProfit: 0, cashPosition: 0, accountsReceivable: 0, accountsPayable: 0, inventoryValue: 0, payrollCost: 0, taxLiability: 0, bankBalances: 0, operatingCashFlow: 0, budgetVariance: 0, monthlyProfit: 0, yearlyProfit: 0, financialHealthScore: 50 },
          integrity: { journals: 0, lines: 0, unbalanced: 0, immutable: true },
          trend: [], trendWeekly: [], accounts: [], accountBalances: [], journals: [], journalLines: [], ledger: [], receivables: [], payables: [],
          bankAccounts: [], bankTransactions: [], expenses: [], payroll: [], taxes: [], assets: [], budgets: [],
          costCenters: [], forecasts: [], reports: [], audit: [], ai: [], customerFinance: [], agingSummary: [],
          collectionQueue: [], paymentTermsSummary: [], statementPreview: [], quotations: [], payments: [],
          accountingIntegrity: { assets: 0, liabilities: 0, equity: 0, difference: 0, balanced: true, status: 'ERROR', trialBalance: { totalDebit: 0, totalCredit: 0 }, accountCount: 0 },
          balanceSheetSections: [], paymentMethodsSummary: [], paymentAccountsSummary: [],
          sourceFlows: [], errorSafe: true, errorMessage: ((err && err.message) || '') + ' | ' + ((e2 && e2.message) || ''),
          creditNotes: [], creditNoteItems: [], productReturns: [], taxSettings: [], invoiceHistory: [], accountingAuditTrail: [], warehouses: []
        };
      }
    }
  },
`;
fn = before + catchBlock;
rpc = rpc.slice(0, start) + fn + rpc.slice(end);
fs.writeFileSync(rpcPath, rpc);
console.log('[finance-show] done', rpc.length);
