'use strict';
const crypto = require('crypto');
const reconcile = require('../scripts/backfill-normalized-from-state');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ok:false,error:'Method not allowed'}); }
  const expected = String(process.env.D1_RECONCILE_TOKEN || '');
  const supplied = String(req.headers['x-d1-reconcile-token'] || '');
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a,b)) return res.status(404).json({ok:false,error:'Not found'});
  try { return res.status(200).json(await reconcile()); }
  catch (e) { console.error('[D1 reconcile]', e && e.message || e); return res.status(503).json({ok:false,error:'Reconciliation incomplete'}); }
};
