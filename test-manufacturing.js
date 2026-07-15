const { invokeRpc } = require('./api/rpc.js');

// Mock user
const user = { id: 'USER001', name: 'Miko Admin', role: 'Admin' };

async function test() {
  try {
    const result = await invokeRpc('getManufacturingWorkspaceData', [user]);
    console.log('SUCCESS: getManufacturingWorkspaceData returned');
    console.log('Keys:', Object.keys(result));
    console.log('Overview:', result.overview);
    console.log('Health count:', result.health?.length);
    console.log('Raw materials count:', result.rawMaterials?.length);
  } catch (err) {
    console.error('ERROR:', err.message);
    console.error('Stack:', err.stack);
  }
}

test();
