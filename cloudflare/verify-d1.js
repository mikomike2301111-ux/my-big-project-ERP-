// Delete the temp test1 row, then rebuild + validate the full JSON from D1 chunks.
const ACCOUNT = '228098755f87923ef8ee22459f97ca03';
const DB = 'cab39f70-b0f9-4fd3-b9d9-253ed69db46e';
const TOKEN = process.env.CF_TOKEN || '';

(async () => {
  if (!TOKEN) { console.error('Set CF_TOKEN'); process.exit(1); }
  const q = (sql) => fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql })
  }).then(r => r.json());
  await q("DELETE FROM erp_state WHERE id = 'test1';");
  const ids = await q("SELECT id FROM erp_state ORDER BY id;").then(j => (j?.result?.[0]?.results ?? []).map(r => r.id));
  console.log('rows in erp_state:', ids.length);
  let full = '';
  for (const id of ids) {
    const j = await q(`SELECT data FROM erp_state WHERE id = '${id}';`);
    if (!j?.success) { console.error('fetch fail', id, JSON.stringify(j).slice(0,200)); process.exit(1); }
    const data = j.result[0].results[0].data;
    full += Array.isArray(data) ? data.join('') : data;
  }
  console.log('reconstructed chars:', full.length, '(expected ~3.91M)');
  try {
    const obj = JSON.parse(full);
    console.log('JSON VALID ✔ top-level keys:', Object.keys(obj).slice(0, 30).join(', '));
    console.log('accounts sample keys:', Object.keys(obj.accounts || {}).slice(0, 10).join(', '));
  } catch (e) {
    console.error('JSON INVALID:', e.message);
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });