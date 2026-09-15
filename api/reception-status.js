/**
 * Public reception restore status — GET or POST /api/reception-status
 * No auth. Reports whether the 27 D1 calls file is present in the deploy bundle.
 */
const fs = require('fs');
const path = require('path');

function loadCalls() {
  const paths = [
    path.join(__dirname, '..', 'data', 'd1-reception-calls.json'),
    path.join(process.cwd(), 'data', 'd1-reception-calls.json'),
    path.join('/var/task', 'data', 'd1-reception-calls.json'),
  ];
  const tried = [];
  for (const p of paths) {
    tried.push(p);
    try {
      if (fs.existsSync(p)) {
        const snap = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (snap && Array.isArray(snap.calls)) {
          console.log('[reception-restore] status-endpoint LOADED', p, snap.calls.length);
          return { calls: snap.calls, loadedFrom: p, tried };
        }
      }
    } catch (e) {
      console.warn('[reception-restore] status-endpoint fail', p, e && e.message);
    }
  }
  try {
    const snap = require('../data/d1-reception-calls.json');
    if (snap && Array.isArray(snap.calls)) {
      return { calls: snap.calls, loadedFrom: 'require', tried };
    }
  } catch {}
  return { calls: [], loadedFrom: null, tried };
}

module.exports = async function handler(req, res) {
  try {
    const { calls, loadedFrom, tried } = loadCalls();
    const sample = calls.slice(0, 5).map((c) => ({
      id: c.id,
      customerName: c.customerName || c.customer_name,
      stage: c.stage,
      recordType: c.recordType || c.record_type,
      notes: String(c.notes || '').slice(0, 80),
      assignedTo: c.assignedTo || c.assigned_to,
    }));
    console.log('[reception-restore] status-endpoint count=' + calls.length + ' from=' + loadedFrom);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      version: 'v5-status-endpoint',
      message: 'Reception data file status — expected 27 real D1 calls',
      sourceCount: calls.length,
      expected: 27,
      loadedFrom,
      pathsTried: tried,
      sample,
      at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[reception-restore] status-endpoint error', e && e.message);
    return res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
};
