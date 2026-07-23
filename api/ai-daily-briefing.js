module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const CRON_SECRET = process.env.CRON_SECRET || 'farmtrack-ai-cron-2026';
  const authHeader = req.headers.authorization || '';
  const providedSecret = authHeader.replace('Bearer ', '') || req.query.secret || '';
  if (providedSecret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { invokeRpc } = require('./rpc.js');
    const result = invokeRpc('generateDailyAINotifications', [null]);
    return res.status(200).json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: err.message, timestamp: new Date().toISOString() });
  }
};
