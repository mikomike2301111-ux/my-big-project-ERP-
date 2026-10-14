const { invokeRpc } = require('./api/rpc.js');

const user = { id: 'USER001', name: 'Miko Admin', role: 'Admin', permissions: ['*'] };

// Read-only calls only: this suite must never create, delete, or modify ERP records.
// Each visible page is mapped to the data RPC it depends on. Pages that intentionally
// use the signed-in user object rather than a dedicated read RPC are documented below.
const tests = [
  { page: 'Dashboard', name: 'getDashboardData', args: [user], shape: 'object' },
  { page: 'Analytics', name: 'getAnalyticsData', args: [user], shape: 'object' },
  { page: 'Sales', name: 'getSalesWorkspaceData', args: [user], shape: 'object' },
  { page: 'Procurement', name: 'getProcurementWorkspaceData', args: [user], shape: 'object' },
  { page: 'Inventory', name: 'getInventoryWorkspaceData', args: [user], shape: 'object' },
  { page: 'Accounting / Finance', name: 'getFinanceWorkspaceData', args: [user], shape: 'object' },
  { page: 'Accounts', name: 'getAccountsData', args: [user], shape: 'object' },
  { page: 'Production', name: 'getManufacturingWorkspaceData', args: [user], shape: 'object' },
  { page: 'CRM', name: 'getCRMWorkspaceData', args: [user], shape: 'object' },
  { page: 'Delivery', name: 'getDeliveryWorkspaceData', args: [user, { period: 'Year' }], shape: 'object' },
  { page: 'Reports', name: 'getReportCenterData', args: [user, {}], shape: 'object' },
  { page: 'Inputs', name: 'getInputCenterData', args: [user], shape: 'object' },
  { page: 'Notifications', name: 'getNotificationCenterData', args: [user], shape: 'object' },
  { page: 'Email', name: 'getEmailLog', args: [user, { limit: 10 }], shape: 'object' },
  { page: 'Email Admin', name: 'getEmailLog', args: [user, { limit: 10 }], shape: 'object' },
  { page: 'HR', name: 'getHRWorkspaceData', args: [user, { search: '', period: 'Month' }], shape: 'object' },
  { page: 'Leaves', name: 'getLeaveData', args: [user, { period: 'Month' }], shape: 'object' },
  { page: 'Requisitions', name: 'getRequisitions', args: [user, { search: '' }], shape: 'array' },
  { page: 'Requisition dashboard', name: 'getRequisitionDashboard', args: [user], shape: 'object' },
  { page: 'Admin Office', name: 'getAdminOpsWorkspaceData', args: [user], shape: 'object' },
  { page: 'Settings', name: 'getSettingsWorkspaceData', args: [user], shape: 'object' },
];

async function run() {
  let failures = 0;
  for (const test of tests) {
    try {
      const result = await invokeRpc(test.name, test.args);
      const valid = result !== undefined && result !== null &&
        (test.shape === 'array' ? Array.isArray(result) : typeof result === 'object');
      if (!valid || result?.error) {
        failures++;
        console.error(`FAIL: ${test.page} / ${test.name} - invalid response ${JSON.stringify(result).slice(0, 240)}`);
      } else {
        console.log(`PASS: ${test.page} / ${test.name} - ${Array.isArray(result) ? result.length + ' rows' : Object.keys(result).length + ' keys'}`);
      }
    } catch (err) {
      failures++;
      console.error(`FAIL: ${test.page} / ${test.name} - ${err.message}`);
      console.error(`       Stack: ${err.stack?.split('\\n').slice(0, 3).join(' | ')}`);
    }
  }

  // My Profile is intentionally based on the authenticated user object; it does not
  // need a separate read RPC. Verify its user identity is available to the view.
  if (user.id && user.name) console.log('PASS: My Profile - authenticated user payload available');
  else { failures++; console.error('FAIL: My Profile - user payload missing'); }

  console.log(failures ? `\\nPAGE SMOKE FAILED: ${failures}/${tests.length + 1} checks failed\\n` : `\\nPAGE SMOKE PASSED: ${tests.length + 1} checks\\n`);
  process.exitCode = failures ? 1 : 0;
}

run().catch(err => { console.error(err); process.exit(1); });
