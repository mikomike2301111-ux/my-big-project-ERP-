#!/usr/bin/env node
/**
 * Safety net: restore core source from last known-good commit when
 * the working tree has PLACEHOLDER or truncated/corrupt files.
 * Runs first in Vercel build-all so production never ships broken rpc/main.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const GOOD = 'afd93d8a697b3588fad58d768f39afb68c1c21b7';
const files = [
  { rel: 'api/rpc.js', mustInclude: ['saveErpStateDocument', 'PAGE_ACCESS', 'module.exports'] },
  { rel: 'src/main.jsx', mustInclude: ['createRoot', 'AccountingWorkspace', 'function App'] },
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
  if (!cur || cur.trim() === 'PLACEHOLDER' || cur.length < 5000) return true;
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
      throw new Error('restore failed integrity check for ' + rel);
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
