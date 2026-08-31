/**
 * Idempotent fixes:
 * 1) Sync system users ↔ HR employees for Leaves (balances + applications match)
 * 2) Auto-build Finance/Accounts report deck from live books (Manufacturing-style)
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const rpcPath = path.join(root, 'api', 'rpc.js');
const mainPath = path.join(root, 'src', 'main.jsx');

if (!fs.existsSync(rpcPath)) {
  console.warn('[leave-finance] rpc.js missing');
  process.exit(0);
}

let rpc = fs.readFileSync(rpcPath, 'utf8');

const SYNC_FN = `
function ensureEmployeesFromUsers() {
  if (!db) return;
  try { if (typeof ensureStaffUsers === 'function') ensureStaffUsers(db); } catch {}
  db.employees = Array.isArray(db.employees) ? db.employees : [];
  db.users = Array.isArray(db.users) ? db.users : [];
  db.leaveApplications = Array.isArray(db.leaveApplications) ? db.leaveApplications : [];
  const activeUsers = db.users.filter(u => {
    const st = String(u.status || 'Active').toLowerCase();
    return st !== 'deleted' && st !== 'inactive' && st !== 'disabled';
  });
  for (const u of activeUsers) {
    const email = String(u.email || '').toLowerCase().trim();
    if (!email) continue;
    let emp = db.employees.find(e => String(e.email || '').toLowerCase().trim() === email);
    if (!emp && u.name) {
      emp = db.employees.find(e => String(e.name || '').toLowerCase().trim() === String(u.name || '').toLowerCase().trim());
    }
    if (!emp) {
      emp = {
        id: u.id || ('EMP-' + email.replace(/[^a-z0-9]/g, '').slice(0, 12).toUpperCase()),
        employeeNo: 'EMP-' + email.replace(/[^a-z0-9]/g, '').slice(0, 10).toUpperCase(),
        name: u.name || email,
        email,
        department: u.department || (typeof roleDepartment === 'function' ? roleDepartment(u.role) : ''),
        position: u.role || 'Staff',
        role: u.role || 'Staff',
        status: 'Active',
        leaveBalanceAnnual: 21,
        leaveBalanceSick: 10,
        leaveBalanceCasual: 5,
        leaveBalanceMaternity: 90,
        leaveBalancePaternity: 14,
        leaveBalanceCompassionate: 5,
        createdAt: new Date().toISOString(),
        source: 'system-user-sync',
        userId: u.id
      };
      db.employees.push(emp);
    } else {
      emp.email = emp.email || email;
      emp.userId = emp.userId || u.id;
      emp.department = emp.department || u.department || emp.department;
      emp.position = emp.position || u.role || emp.position;
      if (String(emp.status || '') === 'Deleted') emp.status = 'Active';
      if (emp.leaveBalanceAnnual == null || emp.leaveBalanceAnnual === '') emp.leaveBalanceAnnual = 21;
      if (emp.leaveBalanceSick == null || emp.leaveBalanceSick === '') emp.leaveBalanceSick = 10;
      if (emp.leaveBalanceCasual == null || emp.leaveBalanceCasual === '') emp.leaveBalanceCasual = 5;
      if (emp.leaveBalanceMaternity == null) emp.leaveBalanceMaternity = 90;
      if (emp.leaveBalancePaternity == null) emp.leaveBalancePaternity = 14;
      if (emp.leaveBalanceCompassionate == null) emp.leaveBalanceCompassionate = 5;
    }
  }
  for (const leave of db.leaveApplications) {
    if (leave.applicantEmail) leave.applicantEmail = String(leave.applicantEmail).toLowerCase().trim();
    const email = String(leave.applicantEmail || '').toLowerCase().trim();
    if (email) {
      const emp = db.employees.find(e => String(e.email || '').toLowerCase().trim() === email);
      if (emp) {
        if (!leave.applicantId || String(leave.applicantId) !== String(emp.id)) leave.applicantId = emp.id;
        if (!leave.applicantName) leave.applicantName = emp.name;
        if (!leave.department) leave.department = emp.department;
      }
    }
  }
}
`;

if (!rpc.includes('function ensureEmployeesFromUsers')) {
  if (rpc.includes('function ensureHrData()')) {
    rpc = rpc.replace('function ensureHrData()', SYNC_FN + '\nfunction ensureHrData()');
    console.log('[leave-finance] ensureEmployeesFromUsers added');
  } else {
    console.warn('[leave-finance] ensureHrData not found');
  }
}

if (rpc.includes('function ensureHrData()') && !rpc.includes('ensureEmployeesFromUsers();')) {
  rpc = rpc.replace(
    "if (!db.settings.hr_email) db.settings.hr_email = 'hr@farmtrack.co.ke';\n}",
    "if (!db.settings.hr_email) db.settings.hr_email = 'hr@farmtrack.co.ke';\n  try { ensureEmployeesFromUsers(); } catch (e) { console.warn('ensureEmployeesFromUsers', e && e.message); }\n}"
  );
  console.log('[leave-finance] ensureHrData calls sync');
}

if (rpc.includes('getLeaveData(user, filters = {})') && !rpc.includes("ensureEmployeesFromUsers();\n    ensureLeaveData()")) {
  rpc = rpc.replace(
    'getLeaveData(user, filters = {}) {\n    const u = reqRole(user);\n    const d = data();\n    ensureLeaveData();',
    'getLeaveData(user, filters = {}) {\n    const u = reqRole(user);\n    const d = data();\n    try { ensureEmployeesFromUsers(); } catch {}\n    ensureLeaveData();'
  );
  console.log('[leave-finance] getLeaveData syncs users\u2192employees');
}

if (rpc.includes('applyLeave(user, form = {})') && !rpc.includes("ensureEmployeesFromUsers();\n    ensureLeaveData();")) {
  rpc = rpc.replace(
    'applyLeave(user, form = {}) {\n    // Any active role may apply for leave\n    const u = reqRole(user);\n    const d = data();\n    ensureStaffUsers(d);\n    ensureLeaveData();',
    'applyLeave(user, form = {}) {\n    // Any active role may apply for leave\n    const u = reqRole(user);\n    const d = data();\n    ensureStaffUsers(d);\n    try { ensureEmployeesFromUsers(); } catch {}\n    ensureLeaveData();'
  );
  console.log('[leave-finance] applyLeave syncs users\u2192employees');
}

rpc = rpc.replace(
  "const mine = (d.leaveApplications || []).filter(l => l.applicantEmail === u.email || l.applicantId === u.id).filter(inScope);",
  "const mine = (d.leaveApplications || []).filter(l => String(l.applicantEmail || '').toLowerCase() === String(u.email || '').toLowerCase() || l.applicantId === u.id || String(l.applicantName || '').toLowerCase() === String(u.name || '').toLowerCase()).filter(inScope);"
);

if (!rpc.includes('buildLiveFinancialReports')) {
  const retMarker = "    return {\n      filters: { dateRange: 'This Fiscal Year', currency: 'KES', entity: 'Farmtrack Biosciences Ltd' },";
  const idx = rpc.indexOf(retMarker);
  if (idx > 0) {
    const builder = `
    const buildLiveFinancialReports = () => {
      const invs = Array.isArray(d.invoices) ? d.invoices : [];
      const pays = Array.isArray(d.payments) ? d.payments : [];
      const exp = Array.isArray(d.expenses) ? d.expenses : [];
      const pos = Array.isArray(d.purchaseOrders) ? d.purchaseOrders : [];
      const salesRows = Array.isArray(d.sales) ? d.sales : [];
      const taxSum = invs.reduce((s, i) => s + num(i.tax), 0);
      const arOpen = (receivables || []).reduce((s, r) => s + num(r.dueBalance || r.balance), 0);
      const apOpen = (payables || []).reduce((s, r) => s + num(r.balance || r.amount), 0);
      const cash = num(cashPosition);
      const exports = ['PDF', 'Excel', 'CSV'];
      return [
        { name: 'Profit and Loss', records: allEntries.length, value: netProfit, exports, layout: 'pnl' },
        { name: 'Balance Sheet', records: (d.financeAccounts || []).length, value: cash, exports, layout: 'balance-sheet' },
        { name: 'Cashflow Statement', records: generatedBankTransactions.length, value: cash, exports, layout: 'cashflow' },
        { name: 'Trial Balance', records: (acctBalances || []).length, value: 0, exports, layout: 'trial-balance' },
        { name: 'General Ledger', records: allLines.length, value: 0, exports, layout: 'ledger' },
        { name: 'Accounts Receivable Aging', records: receivables.length, value: arOpen, exports, layout: 'ar-aging' },
        { name: 'Accounts Payable Aging', records: payables.length, value: apOpen, exports, layout: 'ap-aging' },
        { name: 'Customer Statements', records: customerFinance.length, value: arOpen, exports, layout: 'statements' },
        { name: 'VAT Summary', records: invs.length, value: taxSum, exports, layout: 'tax-summary' },
        { name: 'Tax Invoice Register', records: invs.length, value: invs.reduce((s, i) => s + num(i.total), 0), exports, layout: 'invoice-register' },
        { name: 'Sales Revenue Report', records: salesRows.length, value: revenue, exports, layout: 'revenue' },
        { name: 'Collections Report', records: pays.length, value: pays.reduce((s, p) => s + num(p.amount), 0), exports, layout: 'collections' },
        { name: 'Expense Report', records: exp.length, value: expenses, exports, layout: 'expenses' },
        { name: 'Bank Reconciliation', records: generatedBankTransactions.length, value: cash, exports, layout: 'bank-rec' },
        { name: 'Budget vs Actual', records: (d.budgets || []).length, value: Math.round(budget - actual), exports, layout: 'variance' },
        { name: 'Department Cost Report', records: (d.costCenters || []).length, value: expenses, exports, layout: 'department-performance' },
        { name: 'Payroll Cost Summary', records: (d.payrollRecords || []).length, value: payrollCost, exports, layout: 'payroll' },
        { name: 'Fixed Assets Register', records: (d.fixedAssets || []).length, value: 0, exports, layout: 'assets' },
        { name: 'Purchase Commitments', records: pos.length, value: pos.reduce((s, p) => s + num(p.total), 0), exports, layout: 'purchase-control' },
        { name: 'Audit Trail', records: ((d.financeAuditLogs || []).length + (d.financeManualAuditLogs || []).length), value: 0, exports, layout: 'audit' },
        { name: 'Financial Health Scorecard', records: 1, value: Math.max(1, Math.min(100, Math.round(70 + (netProfit > 0 ? 12 : -10) + (cash > apOpen ? 8 : -8)))), exports, layout: 'scorecard' },
        { name: 'Monthly Trend Pack', records: (trend || []).length, value: netProfit, exports, layout: 'trend' }
      ];
    };
    const liveFinancialReports = buildLiveFinancialReports();
`;
    rpc = rpc.slice(0, idx) + builder + '\n' + rpc.slice(idx);
    rpc = rpc.replace('reports: d.financialReports,', 'reports: liveFinancialReports,', 1);
    console.log('[leave-finance] live financial reports injected before return');
  } else {
    console.warn('[leave-finance] finance return marker not found');
  }
}

fs.writeFileSync(rpcPath, rpc);
console.log('[leave-finance] rpc.js updated', rpcPath);

if (fs.existsSync(mainPath)) {
  let m = fs.readFileSync(mainPath, 'utf8');
  if (!m.includes('Live books \u00b7 auto-calculated')) {
    m = m.replace(
      "{view === 'reports' && (\n        <div className=\"dashboard-grid\">\n          <InventoryReports reports={data.reports} user={user} module=\"Financial\" />",
      `{view === 'reports' && (
        <div className="dashboard-grid">
          <Panel className="span-12" title="Finance & Accounts Reports" action="Live books \u00b7 auto-calculated">
            <p style={{ margin: 0, fontSize: 13, color: '#667085' }}>
              Reports are built automatically from journals, invoices, payments, expenses, tax, payroll and bank movements \u2014 same idea as Manufacturing reports.
              Pick a card to export PDF, Excel or CSV.
            </p>
          </Panel>
          <InventoryReports reports={data.reports} user={user} module="Financial" />`
    );
    fs.writeFileSync(mainPath, m);
    console.log('[leave-finance] Accounts reports UI note added');
  } else {
    console.log('[leave-finance] UI note already present');
  }
}

console.log('[leave-finance] done');
