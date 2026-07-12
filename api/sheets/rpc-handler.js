const { invokeRpc } = require('../rpc');

function createSheetsRpcHandler(rpcName) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const result = await invokeRpc(rpcName, [body.user, body.options || {}]);
      return res.status(200).json({ result });
    } catch (error) {
      return res.status(200).json({ error: error.message || String(error) });
    }
  };
}

module.exports = { createSheetsRpcHandler };
