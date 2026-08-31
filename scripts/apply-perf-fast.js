/**
 * Site-wide speed: slim CRM/Accounts payloads, scoped cache, optimistic entry.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const rpcPath = path.join(root, 'api', 'rpc.js');
const mainPath = path.join(root, 'src', 'main.jsx');

function patchRpc() {
  if (!fs.existsSync(rpcPath)) return;
  let rpc = fs.readFileSync(rpcPath, 'utf8');

  if (!rpc.includes('/* perf-slim-finance-v1 */')) {
    const slimHelper = `\n    /* perf-slim-finance-v1 */\n    const _slim = (arr, n = 120) => Array.isArray(arr) ? arr.slice(0, n) : [];\n    const _liteProduct = p => p && ({ id: p.id, name: p.name, sku: p.sku, unitPrice: p.unitPrice || p.price, category: p.category });\n`;
    if (rpc.includes('getFinanceWorkspaceData(user, filters = {}) {')) {
      rpc = rpc.replace(
        'getFinanceWorkspaceData(user, filters = {}) {\n    try {\n    reqRole(user);',
        `getFinanceWorkspaceData(user, filters = {}) {\n    try {\n    reqRole(user);${slimHelper}`
      );
    }
    const replacements = [
      ['journals: allEntries,', 'journals: _slim(allEntries, 80),'],
      ['journalLines: allLines,', 'journalLines: _slim(allLines, 300),'],
      ['bankTransactions: generatedBankTransactions,', 'bankTransactions: _slim(generatedBankTransactions, 80),'],
      ['expenses: d.expenses,', 'expenses: _slim(d.expenses, 150),'],
      ['products: d.products || [],', 'products: (d.products || []).slice(0, 200).map(_liteProduct),'],
      ['inventory: d.inventory || [],', 'inventory: _slim(d.inventory, 100),'],
      ['payroll: d.payrollRecords,', 'payroll: _slim(d.payrollRecords, 50),'],
      ['taxes: d.taxRecords,', 'taxes: _slim(d.taxRecords, 40),'],
      ['assets: d.fixedAssets,', 'assets: _slim(d.fixedAssets, 40),'],
      ['budgets: d.budgets,', 'budgets: _slim(d.budgets, 40),'],
      ['costCenters: d.costCenters,', 'costCenters: _slim(d.costCenters, 40),'],
      ['forecasts: d.financialForecasts,', 'forecasts: _slim(d.financialForecasts, 20),'],
    ];
    for (const [a, b] of replacements) {
      if (rpc.includes(a) && !rpc.includes(b)) rpc = rpc.replace(a, b);
    }
    if (rpc.includes('ledger: [...(Array.isArray(d.financeManualLedger)') && !rpc.includes('ledger: _slim([')) {
      rpc = rpc.replace(
        /ledger: \[\.\.\.\(Array\.isArray\(d\.financeManualLedger\) \? d\.financeManualLedger : \[\]\), \.\.\.\(Array\.isArray\(d\.generalLedger\) \? d\.generalLedger : \[\]\)\],/,
        'ledger: _slim([...(Array.isArray(d.financeManualLedger) ? d.financeManualLedger : []), ...(Array.isArray(d.generalLedger) ? d.generalLedger : [])], 150),'
      );
    }
    if (rpc.includes('receivables,\n      payables,') && !rpc.includes('_slim(receivables')) {
      rpc = rpc.replace('receivables,\n      payables,', 'receivables: _slim(receivables, 150),\n      payables: _slim(payables, 100),');
    }
    console.log('[perf] finance slim applied');
  }

  if (!rpc.includes('/* perf-slim-crm-v1 */') && rpc.includes('getCRMWorkspaceData(user, filters = {}) {')) {
    rpc = rpc.replace(
      'getCRMWorkspaceData(user, filters = {}) {\n    reqRole(user);',
      'getCRMWorkspaceData(user, filters = {}) {\n    /* perf-slim-crm-v1 */\n    reqRole(user);'
    );
    const a = '      customers,\n      leads,\n      calls,\n      orders,\n      invoices,\n      deliveries: deliveryReports,';
    const b = '      customers: (customers || []).slice(0, 250),\n      leads: (leads || []).slice(0, 150),\n      calls: (calls || []).slice(0, 150),\n      orders: (orders || []).slice(0, 150),\n      invoices: (invoices || []).slice(0, 150),\n      deliveries: (deliveryReports || []).slice(0, 100),';
    if (rpc.includes(a)) {
      rpc = rpc.replace(a, b);
      console.log('[perf] crm lists capped');
    }
  }

  if (!rpc.includes('getFinanceOverviewFast')) {
    const inject = `\n  getFinanceOverviewFast(user, filters = {}) {\n    reqRole(user);\n    const d = data();\n    const invoices = d.invoices || [];\n    const expenses = d.expenses || [];\n    const sales = d.sales || [];\n    const revenue = invoices.reduce((s, i) => s + Number(i.total || 0), 0);\n    const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);\n    const ar = invoices.reduce((s, i) => s + Number(i.balance || 0), 0);\n    return {\n      overview: {\n        revenue: Math.round(revenue),\n        expenses: Math.round(expenseTotal),\n        netProfit: Math.round(revenue - expenseTotal),\n        accountsReceivable: Math.round(ar),\n        salesCount: sales.length,\n        invoiceCount: invoices.length\n      },\n      trendWeekly: [], trend: [], fast: true\n    };\n  },\n  getCRMOverviewFast(user) {\n    reqRole(user);\n    const d = data();\n    const customers = d.customers || [];\n    const leads = d.leads || [];\n    const calls = d.calls || [];\n    return {\n      overview: {\n        totalCustomers: customers.length,\n        opportunities: leads.filter(l => !['Won', 'Lost'].includes(l.stage)).length,\n        pendingFollowups: calls.filter(c => c.stage !== 'Already Called').length,\n        revenue: (d.sales || []).reduce((s, x) => s + Number(x.total || 0), 0)\n      },\n      customers: customers.slice(0, 50).map(c => ({ id: c.id, name: c.name, phone: c.phone, city: c.city, status: c.status })),\n      leads: leads.slice(0, 30),\n      fast: true\n    };\n  },\n`;
    if (rpc.includes('getFinanceWorkspaceData(user, filters = {}) {')) {
      rpc = rpc.replace('getFinanceWorkspaceData(user, filters = {}) {', inject + '\n  getFinanceWorkspaceData(user, filters = {}) {');
      console.log('[perf] fast overview RPCs added');
    }
  }

  if (rpc.includes('const SYNC_AFTER_RPC = {') && !rpc.includes('getFinanceOverviewFast:')) {
    rpc = rpc.replace(
      'const SYNC_AFTER_RPC = {',
      'const SYNC_AFTER_RPC = {\n  getFinanceOverviewFast: [],\n  getCRMOverviewFast: [],'
    );
  }

  fs.writeFileSync(rpcPath, rpc);
  console.log('[perf] rpc', rpc.length);
}

function patchMain() {
  if (!fs.existsSync(mainPath)) {
    console.warn('[perf] no main.jsx');
    return;
  }
  let m = fs.readFileSync(mainPath, 'utf8');

  if (m.includes("invalidateCacheFor(fn);\n    serverInFlight.clear();")) {
    m = m.replace(
      "invalidateCacheFor(fn);\n    serverInFlight.clear();\n    window.dispatchEvent(new CustomEvent('erp:data-mutated', { detail: { fn } }));",
      `invalidateCacheFor(fn);
    try {
      for (const k of [...serverInFlight.keys()]) {
        if (String(k).includes(fn)) serverInFlight.delete(k);
      }
    } catch {}
    /* perf-debounce-mutate-v1 */
    if (!window.__erpMutDebounce) window.__erpMutDebounce = {};
    clearTimeout(window.__erpMutDebounce[fn]);
    window.__erpMutDebounce[fn] = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('erp:data-mutated', { detail: { fn } }));
    }, 80);`
    );
    console.log('[perf] scoped in-flight + debounce');
  }

  if (!m.includes('function prefetchCoreWorkspaces')) {
    const prefetch = `\n/* perf-prefetch-v1 */\nfunction prefetchCoreWorkspaces(user) {\n  if (!user) return;\n  const run = () => {\n    try {\n      cachedRpc(user, 'getCRMWorkspaceData', [{}], ['prefetch']).catch(() => {});\n      cachedRpc(user, 'getFinanceWorkspaceData', [{}], ['prefetch']).catch(() => {});\n      cachedRpc(user, 'getDashboardData', [], ['prefetch']).catch(() => {});\n    } catch {}\n  };\n  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2500 });\n  else setTimeout(run, 1200);\n}\n`;
    m = m.replace('function useDebouncedValue', prefetch + '\nfunction useDebouncedValue');
  }

  fs.writeFileSync(mainPath, m);
  console.log('[perf] main', m.length);
}

patchRpc();
patchMain();
console.log('[perf-fast] done');
