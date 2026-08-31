// Upload each chunk .sql file to D1 via the query API (one statement per request).
const fs = require('fs');
const path = require('path');
const TOKEN = process.env.CF_TOKEN || '';
const ACCOUNT = '228098755f87923ef8ee22459f97ca03';
const DB = 'cab39f70-b0f9-4fd3-b9d9-253ed69db46e';

(async () => {
  if (!TOKEN) { console.error('Set CF_TOKEN env'); process.exit(1); }
  const dir = path.join(__dirname, 'import-chunks');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  console.log('chunk files to run:', files.length);
  for (let i = 0; i < files.length; i++) {
    const sql = fs.readFileSync(path.join(dir, files[i]), 'utf8').trim();
    const body = JSON.stringify({ sql });
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body
    }).catch(e => ({ ok: false, status: 0, text: function(){ return Promise.resolve(e.message); } }));
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`CHUNK ${files[i]} FAILED status=${res.status}`, text.slice(0, 300));
      process.exit(1);
    }
    const json = await res.json();
    const written = json?.result?.meta?.rows_written ?? 0;
    if (i % 10 === 0 || i === files.length - 1) console.log(`chunk ${i + 1}/${files.length} ok → wrote ${written} rows`);
  }
  console.log('ALL IMPORTED');
})().catch(e => { console.error(e); process.exit(1); });