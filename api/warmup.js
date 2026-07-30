const { invokeRpc } = require('./rpc');

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  try {
    const result = await invokeRpc('appHealth', []);
    res.status(200).json({ ok: true, warmed: true, health: result });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message });
  }
}

module.exports = handler;
