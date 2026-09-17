const fs = require('fs');
const path = require('path');

function load(rel) {
  const paths = [
    path.join(__dirname, '..', 'data', rel),
    path.join(process.cwd(), 'data', rel),
    path.join('/var/task', 'data', rel),
  ];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return { data: JSON.parse(fs.readFileSync(p, 'utf8')), path: p };
    } catch {}
  }
  return { data: null, path: null };
}

module.exports = async function handler(req, res) {
  try {
    const calls = load('d1-reception-calls.json');
    const cust = load('d1-customers.json');
    const sales = load('d1-sales-deliveries.json');
    const payload = {
      ok: true,
      version: 'v6-status',
      calls: (calls.data && calls.data.calls && calls.data.calls.length) || 0,
      customers: (cust.data && cust.data.customers && cust.data.customers.length) || 0,
      salesOrders: (sales.data && sales.data.salesOrders && sales.data.salesOrders.length) || 0,
      deliveries: (sales.data && sales.data.deliveries && sales.data.deliveries.length) || 0,
      invoices: (sales.data && sales.data.invoices && sales.data.invoices.length) || 0,
      paths: { calls: calls.path, customers: cust.path, sales: sales.path },
      sampleCustomers: ((cust.data && cust.data.customers) || []).slice(0, 3).map(c => ({ id: c.id, name: c.name })),
      sampleCalls: ((calls.data && calls.data.calls) || []).slice(0, 3).map(c => ({ id: c.id, customerName: c.customerName, stage: c.stage })),
      at: new Date().toISOString(),
    };
    console.log('[d1-merge] status', payload.customers, payload.calls, payload.salesOrders);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
};
