#!/usr/bin/env node
/**
 * Farmtrack ERP — permanent smoke / health check (no secrets required).
 *
 * Usage:
 *   node scripts/smoke.js                 # local: syntax + RPC surface + build presence
 *   node scripts/smoke.js --live <url>    # also probes <url>/api/health (e.g. production)
 *
 * Exits 0 on success, 1 on any failure. Safe to run in CI / pre-deploy.
 * Reads NO secrets — environment variables are only used for the optional live probe.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const CHECK_FILES = ['api/rpc.js', 'server/d1Client.js', 'src/main.jsx', 'scripts/audit-users.js'];
const RPC_SURFACE = [
  'saveState', 'loadRemoteState', 'invokeRpc',
  'saveFinanceAccount', 'deleteFinanceAccount',   // COA editing + delete
  'deleteUser', 'getAllowedPages',                // HR per-user access + deactivate
  'recordFinanceExpense', 'saveExpense',          // expenses categorization
  'productSummaryOf',                              // delivery/CRM/sales product counts
];
let failures = 0;
const ok = (msg) => console.log('  \u2713', msg);
const bad = (msg) => { console.error('  \u2717', msg); failures++; };

async function main() {
  const args = process.argv.slice(2);
  const liveIdx = args.indexOf('--live');
  const liveUrl = liveIdx >= 0 ? String(args[liveIdx + 1] || '').replace(/\/$/, '') : '';

  console.log('[smoke] 1/4 Syntax check');
  for (const f of CHECK_FILES) {
    if (!fs.existsSync(path.join(root, f))) { bad(`missing ${f}`); continue; }
    // node --check only understands .js/.mjs/.cjs — JSX is validated by the Vite build below.
    if (!f.endsWith('.js') && !f.endsWith('.mjs') && !f.endsWith('.cjs')) {
      const size = fs.statSync(path.join(root, f)).size;
      if (size > 1000) ok(`${f} present (${size} bytes, syntax verified by build)`); else bad(`${f} looks empty`);
      continue;
    }
    try { execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' }); ok(`${f} parses`); }
    catch (e) { bad(`${f} parse failed: ${(e.stderr || e.message).toString().slice(0, 200)}`); }
  }

  console.log('[smoke] 2/4 RPC surface present');
  const rpcSource = fs.readFileSync(path.join(root, 'api/rpc.js'), 'utf8');
  for (const sym of RPC_SURFACE) {
    // Presence check via definition-ish token (async function x / x( / x:).
    const re = new RegExp('(?:function \\b' + sym + '\\b|\\b' + sym + '\\s*[:(\\(])');
    if (re.test(rpcSource)) ok(`rpc.js has ${sym}`); else bad(`rpc.js missing ${sym}`);
  }

  console.log('[smoke] 3/4 Build output present');
  const distIndex = path.join(root, 'dist/index.html');
  if (fs.existsSync(distIndex)) {
    const html = fs.readFileSync(distIndex, 'utf8');
    const app = /assets\/index-[A-Za-z0-9_]+\.js/.test(html);
    if (app) ok('dist/index.html references a built app bundle'); else bad('dist/index.html has no app bundle');
  } else {
    bad('dist/ not built — run `npm run build` first');
  }

  console.log('[smoke] 4/4 Optional live probe');
  if (liveUrl) {
    try {
      const res = await fetch(`${liveUrl}/api/health`, { headers: { accept: 'application/json' } });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        ok(`live health OK: backend=${body.primary} d1=${body.d1?.ok ? 'ok' : 'down'} v${body.d1?.pointer?.version || '?'}`);
      } else {
        bad(`live health not OK: status=${res.status} ${body.error || ''}`);
      }
    } catch (e) {
      bad(`live probe failed: ${e.message}`);
    }
  } else {
    ok('skipped (pass --live <url> to probe a deployed instance)');
  }

  console.log(failures ? `\nSMOKE FAILED: ${failures} problem(s)\n` : '\nSMOKE PASSED\n');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });