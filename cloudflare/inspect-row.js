// Inspect the exact JSON shape D1 returns for a large TEXT column.
const T = process.env.CF_TOKEN;
const A = '228098755f87923ef8ee22459f97ca03';
const D = 'cab39f70-b0f9-4fd3-b9d9-253ed69db46e';
(async () => {
  const q = (sql) => fetch(`https://api.cloudflare.com/client/v4/accounts/${A}/d1/database/${D}/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql })
  }).then(r => r.json());
  const j = await q("SELECT id, data FROM erp_state WHERE id = 'FTC-STATE-001';");
  const row = j.result[0].results[0];
  console.log('row keys:', Object.keys(row));
  const data = row.data;
  console.log('typeof data:', typeof data, '| isArray:', Array.isArray(data));
  if (Array.isArray(data)) {
    console.log('segments:', data.length);
    console.log('seg[0] len:', String(data[0]).length, '| seg[0] head:', String(data[0]).slice(0, 120));
    if (data.length > 1) console.log('seg[1] len:', String(data[1]).length, '| head:', String(data[1]).slice(0, 120));
  } else {
    console.log('data len:', String(data).length, '| head:', String(data).slice(0, 120));
  }
})().catch(e => { console.error(e); process.exit(1); });