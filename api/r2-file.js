const r2 = require('../server/r2Client');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET');
      return res.end('Method not allowed');
    }
    const url = new URL(req.url, 'http://localhost');
    const key = url.searchParams.get('key');
    if (!key || key.includes('..')) {
      res.statusCode = 400;
      return res.end('Missing or invalid key');
    }
    if (!r2.configured()) {
      res.statusCode = 503;
      return res.end('R2 not configured');
    }
    const { buffer, contentType } = await r2.getObject(key);
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="${key.split('/').pop()}"`);
    return res.end(buffer);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message || 'R2 error' }));
  }
};
