#!/usr/bin/env node
/**
 * Safety net: if a prior bad push left PLACEHOLDER in core files,
 * restore from last known-good commit on GitHub, then continue.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const GOOD = 'afd93d8a697b3588fad58d768f39afb68c1c21b7';
const files = ['api/rpc.js', 'src/main.jsx'];

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'erp-restore' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode + ' ' + url));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

(async () => {
  for (const rel of files) {
    const p = path.join(root, rel);
    let cur = '';
    try { cur = fs.readFileSync(p, 'utf8'); } catch (_) {}
    const bad = !cur || cur.trim() === 'PLACEHOLDER' || cur.length < 1000;
    if (!bad) {
      console.log('[restore] ok', rel, cur.length);
      continue;
    }
    const url = `https://raw.githubusercontent.com/mikomike2301111-ux/my-big-project-ERP-/${GOOD}/${rel}`;
    console.log('[restore] fetching', rel, 'from', GOOD);
    const body = await get(url);
    if (body.length < 1000 || body.trim() === 'PLACEHOLDER') {
      throw new Error('restore failed for ' + rel);
    }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
    console.log('[restore] wrote', rel, body.length);
  }
  console.log('[restore] done');
})().catch((e) => {
  console.error('[restore] FATAL', e.message || e);
  process.exit(1);
});
