// Quick experiment: does a tiny INSERT into erp_state persist in D1 cab39...?
const T = process.env.CF_TOKEN;
const A = '228098755f87923ef8ee22459f97ca03';
const D = 'cab39f70-b0f9-4fd3-b9d9-253ed69db46e';
(async () => {
  const q = (sql) => fetch(`https://api.cloudflare.com/client/v4/accounts/${A}/d1/database/${D}/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql })
  }).then(r => r.json());
  console.log('INSERT:', JSON.stringify(await q("INSERT INTO erp_state (id, data, updated_at) VALUES ('test1', 'hello world', datetime('now'));")));
  console.log('COUNT:', JSON.stringify(await q("SELECT COUNT(*) AS c FROM erp_state;")));
  console.log('SCHEMA:', JSON.stringify(await q("SELECT sql FROM sqlite_master WHERE name='erp_state';")));
})().catch(e => { console.error(e); process.exit(1); });