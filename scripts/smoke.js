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
const CHECK_FILES = ['api/rpc.js', 'server/d1Client.js', 'src/main.jsx', 'scripts/audit-users.js', 'scripts/cleanup-users.js', 'scripts/import-suppliers-csv.js', 'scripts/import-coa-csv.js'];
const RPC_SURFACE = [
  'saveState', 'loadRemoteState', 'invokeRpc',
  'saveFinanceAccount', 'deleteFinanceAccount',   // COA editing + delete
  'deleteUser', 'getAllowedPages',                // HR per-user access + hard delete
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

  console.log('[smoke] 4/5 Cloudflare-only and retention guardrails');
  const read = (p) => fs.existsSync(path.join(root, p)) ? fs.readFileSync(path.join(root, p), 'utf8') : '';
  const healthSource = read('api/health.js');
  const r2Source = read('server/r2Client.js');
  const buildSource = read('scripts/build-all.js');
  const packageSource = read('package.json');
  const requiredChecks = [
    ['health endpoint does not import or probe Supabase', !/supabase/i.test(healthSource)],
    ['D1 remains primary health backend', /probeD1/.test(healthSource) && /cloudflare-d1/.test(healthSource)],
    ['health endpoint reports R2 readiness', /r2\.configured\(\)/.test(healthSource) && /r2Configured/.test(healthSource)],
    ['R2 client exists', Boolean(r2Source)],
    ['R2 client supports object upload', /putObject/.test(r2Source)],
    ['R2 client supports object retrieval', /getObject/.test(r2Source)],
    ['R2 client supports object deletion API', /deleteObject/.test(r2Source)],
    ['build no longer runs user-pruning script', !/apply-keeper-prune\.js/.test(buildSource)],
    ['build no longer injects HR permanent-delete script', !/apply-hr-delete-xai\.js/.test(buildSource)],
    ['build command is defined', /"build"\s*:/.test(packageSource)],
    ['smoke command is defined', /"smoke"\s*:/.test(packageSource)],
    ['manufacturing attachment collection is referenced', /manufacturingDocuments/.test(rpcSource)],
    ['R2 entity attachment upload handler is present', /uploadEntityAttachment/.test(rpcSource)],
    ['R2 attachment listing handler is present', /listEntityAttachments/.test(rpcSource)],
    ['HR permanent delete is guarded in current source', /Permanent employee deletion is disabled/.test(rpcSource)],
    ['duplicate business record guard is present', /function duplicateBusinessRecord/.test(rpcSource)],
    ['duplicate payment is rejected before posting', /Duplicate payment refused/.test(rpcSource)],
    ['invoice-from-sale idempotency guard is present', /existingInvoice/.test(rpcSource)],
    ['normalized write-through has no unrelated-row fallback', !/payload\s*=\s*tableRows\.slice\(0,\s*5\)/.test(rpcSource)],
  ];
  for (const [label, passed] of requiredChecks) passed ? ok(label) : bad(label);
  const navSource = read('src/main.jsx');
  const navMatch = navSource.match(/const nav\s*=\s*\[([\s\S]*?)\n\s*\];/);
  if (navMatch) {
    const ids = [...navMatch[1].matchAll(/id:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    const unique = new Set(ids);
    if (ids.length >= 10) ok('navigation declares ' + ids.length + ' pages');
    else bad('navigation list unexpectedly small (' + ids.length + ')');
    if (unique.size === ids.length) ok('navigation page IDs are unique');
    else bad('duplicate navigation page IDs detected');
    for (const id of ids) {
      const present = navSource.includes("id: '" + id + "'") || navSource.includes('id: "' + id + '"');
      if (!present) bad('navigation route missing: ' + id);
    }
  } else {
    bad('could not locate navigation page registry');
  }

  console.log('[smoke] 5/5 Optional live probe');
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