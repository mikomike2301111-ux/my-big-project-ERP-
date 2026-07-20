const { invokeRpc } = require('./api/rpc.js');

const user = { id: 'USER001', name: 'Miko Admin', role: 'Admin' };

const tests = [
  { name: 'getDashboardData', args: [user] },
  { name: 'getSalesWorkspaceData', args: [user] },
  { name: 'getInventoryWorkspaceData', args: [user] },
  { name: 'getManufacturingWorkspaceData', args: [user] },
  { name: 'getFinanceWorkspaceData', args: [user] },
  { name: 'getCRMWorkspaceData', args: [user] },
  { name: 'getProcurementWorkspaceData', args: [user] },
  { name: 'getHRWorkspaceData', args: [user, { search: '', period: 'Month' }] },
  { name: 'getSettingsWorkspaceData', args: [user] },
  { name: 'getReportCenterData', args: [user, {}] },
  { name: 'getAnalyticsData', args: [user] },
  { name: 'getEmailLog', args: [user, { limit: 10 }] },
];

async function run() {
  for (const test of tests) {
    try {
      const result = await invokeRpc(test.name, test.args);
      console.log(`PASS: ${test.name} - returned ${Object.keys(result || {}).length} keys`);
    } catch (err) {
      console.error(`FAIL: ${test.name} - ${err.message}`);
      console.error(`       Stack: ${err.stack?.split('\n').slice(0, 3).join(' | ')}`);
    }
  }
}

run();
