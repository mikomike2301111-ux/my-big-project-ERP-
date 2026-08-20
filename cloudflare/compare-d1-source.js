// Byte-level integrity check: reconstruct from D1 and compare against erp-state.json.
const fs = require('fs');
const ACCOUNT = '228098755f87923ef8ee22459f97ca03';
const DB = 'cab39f70-b0f9-4fd3-b9d9-253ed69db46e';
const TOKEN = process.env.CF_TOKEN || '';

(async () => {
  if (!TOKEN) { console.error('Set CF_TOKEN'); process.exit(1); }
  const q = (sql) => fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql })
  }).then(r => r.json());
  const ids = await q("SELECT id FROM erp_state ORDER BY id;").then(j => (j?.result?.[0]?.results ?? []).map(r => r.id));
  let full = '';
  for (const id of ids) {
    const j = await q(`SELECT data FROM erp_state WHERE id = '${id}';`);
    const data = j.result[0].results[0].data;
    full += Array.isArray(data) ? data.join('') : data;
  }
  fs.writeFileSync('cloudflare/erp-state-d1-rebuilt.json', full);
  const source = fs.readFileSync('erp-state.json', 'utf8');
  const rebuilt = full;
  console.log('source chars:', source.length);
  console.log('rebuilt chars:', rebuilt.length);
  console.log('delta:', rebuilt.length - source.length);
  // compare first divergence point
  let diverge = -1;
  const n = Math.min(source.length, rebuilt.length);
  for (let i = 0; i < n; i += 1000) {
    const segSrc = source.slice(i, i + 1000);
    const segReb = rebuilt.slice(i, i + 1000);
    if (segSrc !== segReb) { diverge = i; break; }
  }
  console.log('first divergence at char:', diverge);
  if (diverge >= 0) {
    console.log('src :', JSON.stringify(source.slice(diverge, diverge + 80)));
    console.log('rebl:', JSON.stringify(rebuilt.slice(diverge, diverge + 80)));
  } else {
    // check trailing
    console.log('prefix identical through', n);
    if (source.length !== rebuilt.length) {
      console.log('src tail:', JSON.stringify(source.slice(n - 20)));
      console.log('reb tail:', JSON.stringify(rebuilt.slice(n - 20)));
    } else {
      console.log('BYTE-IDENTICAL ✔');
    }
  }
  try { JSON.parse(rebuilt); console.log('rebuilt parses ✔'); } catch (e) { console.error('rebuilt INVALID:', e.message); }
})().catch(e => { console.error(e); process.exit(1); });