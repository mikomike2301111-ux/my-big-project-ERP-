#!/usr/bin/env node
/**
 * Always ensure api/rpc.js is the full known-good handler (not bootstrap/PLACEHOLDER).
 * apply-force-data-restore then patches full-year seed merge onto it.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const GOOD = '2a8c636f4c301871cf440ba61ca756210c5b7285';
const files = [
  { rel: 'api/rpc.js', mustInclude: ['saveErpStateDocument', 'PAGE_ACCESS', 'module.exports', 'applyQuickBooksSeed'] },
  { rel: 'src/main.jsx', mustInclude: ['createRoot', 'function App'] },
];

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

function isBad(cur, mustInclude) {
  if (!cur || cur.trim() === 'PLACEHOLDER') return true;
  if (cur.includes('ensureLoaded') && cur.includes('applyPatches') && cur.includes('GOOD_SHA')) return true;
  if (cur.length < 50000) return true;
  for (const s of mustInclude) {
    if (!cur.includes(s)) return true;
  }
  return false;
}

(async () => {
  for (const { rel, mustInclude } of files) {
    const p = path.join(root, rel);
    let cur = '';
    try { cur = fs.readFileSync(p, 'utf8'); } catch (_) {}
    if (!isBad(cur, mustInclude)) {
      console.log('[restore] ok', rel, cur.length);
      continue;
    }
    const url = `https://raw.githubusercontent.com/mikomike2301111-ux/my-big-project-ERP-/${GOOD}/${rel}`;
    console.log('[restore] repairing', rel, 'from', GOOD, '(was', cur.length, 'bytes)');
    const body = await get(url);
    if (isBad(body, mustInclude)) {
      throw new Error('restore failed integrity check for ' + rel + ' size=' + body.length);
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
