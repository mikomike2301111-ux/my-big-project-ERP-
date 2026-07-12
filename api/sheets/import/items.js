const { invokeRpc } = require('../../rpc');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const result = await invokeRpc('importItemsFromGoogleSheets', [body.user, body.options || {}]);
    return res.status(200).json({ result });
  } catch (error) {
    console.error('import items error:', error.message || String(error));
    return res.status(500).json({ error: error.message || String(error) });
  }
};
