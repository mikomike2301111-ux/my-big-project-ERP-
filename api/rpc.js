const crypto = require('crypto');
module.exports = async function handler(req, res) {
  res.statusCode = 503;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'rpc temporarily restoring - retry in 60s' }));
};
