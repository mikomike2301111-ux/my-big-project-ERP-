#!/usr/bin/env node
/**
 * Farmtrack ERP — one-time HR user cleanup (no secrets).
 *
 * Reads the latest (or a provided) D1 state backup and, using the SAME
 * classification as scripts/audit-users.js, prints a ready-to-run deletion
 * plan for the confirmed accounts:
 *   - P1: definite test / dev / probe users
 *   - P2: duplicate extras (keep the canonical, hard-delete the extra)
 *   - P3: near-duplicate name-only groups  → REVIEW ONLY (never auto-delete)
 *
 * It NEVER deletes anything itself and NEVER hard-deletes protected accounts.
 * It outputs playbook commands (via the app RPCs deleteUser / deleteRecord)
 * that an Admin/HR performs in the live app after reviewing.
 *
 * Usage:
 *   node scripts/cleanup-users.js                  # newest data/*.json backup
 *   node scripts/cleanup-users.js <path.json>      # specific file
 *   node scripts/cleanup-users.js <path.json> --plain   # no ANSI, plain text
 */
const fs = require('fs');
const path = require('path');

function findBackup(root) {
  const dir = path.join(root, 'data');
  if (!fs.existsSync(dir)) return null;
  const candidates = fs.readdirSync(dir).filter(f => /d1-state-backup.*\.json$/.test(f)).sort();
  return candidates.length ? path.join(dir, candidates[candidates.length - 1]) : null;
}

const TEST_SUBSTRINGS = ['test', 'demo', 'temp', 'probe', 'verify', 'local', 'repro', 'qa', 'dev'];
const TEST_EMAIL_PATTERNS = [/\+.*@/i, /@(farmtrack\.com|example\.|test\.|localhost|example\.com)$/i, /^test/, /^demo/, /^dev/, /^qa/, /^local/, /^verify/, /@test/i];
const KNOWN_TEST = ['boss@farmtrack.co.ke', 'mfg1@farmtrack.co.ke', 'mfg2@farmtrack.co.ke', 'security@farmtrack.co.ke', 'casual2@farmtrack.co.ke', 'masharia@farmtrack.co.ke', 'admin@farmtrack.co.ke', 'james@farmtrack.com', 'mary@farmtrack.com', 'peter@farmtrack.com'];
const PROTECTED = ['miko@gmail.com', 'kiarieadmin@gmail.com', 'smuchemi@gmail.com', 'farmtrackbiosciencesltd@gmail.com', 'hr@farmtrack.co.ke', 'accounts@farmtrack.co.ke', 'reception@farmtrack.co.ke', 'edna@farmtrack.co.ke', 'joseph@farmtrack.co.ke', 'njoroge@farmtrack.co.ke', 'purity@farmtrack.co.ke', 'mosesngeno@farmtrack.co.ke', 'epf@farmtrack.co.ke', 'alex@farmtrack.co.ke', 'mosesmiano@farmtrack.co.ke', 'macharia@farmtrack.co.ke', 'kk@farmtrack.co.ke'];

const args = process.argv.slice(2);
const plain = args.includes('--plain');
const file = (args.find(a => !a.startsWith('-')) ? path.resolve(args.find(a => !a.startsWith('-'))) : findBackup(path.join(__dirname, '..')));
if (!file || !fs.existsSync(file)) { console.error('No backup found. Run `npm run backup:d1` or pass a file path.'); process.exit(1); }
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const users = Array.isArray(state.users) ? state.users : [];

const normEmail = e => String(e || '').toLowerCase().trim();
const normName = n => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const P1 = users.filter(u => {
  const e = normEmail(u.email), n = String(u.name || '').toLowerCase();
  if (KNOWN_TEST.includes(e)) return true;
  if (TEST_SUBSTRINGS.some(s => n.includes(s) || e.includes(s))) return true;
  return TEST_EMAIL_PATTERNS.some(r => r.test(e));
});

// P2: exact-email duplicates -> keep canonical (protected first, else first), delete the rest
const byEmail = new Map();
for (const u of users) { const k = normEmail(u.email); if (!byEmail.has(k)) byEmail.set(k, []); byEmail.get(k).push(u); }
const P2 = [];
for (const [email, arr] of byEmail) {
  if (!email || arr.length <= 1) continue;
  const canonical = arr.find(u => PROTECTED.includes(normEmail(u.email))) || arr[0];
  arr.filter(u => u !== canonical).forEach(u => P2.push({ extra: u, keep: canonical }));
}

console.log(`\n=== HR User Cleanup Plan — ${path.basename(file)} — ${users.length} users ===\n`);

if (!plain) process.stdout.write('\x1b[1m'); 
console.log('P1 — DELETE these test/dev accounts (hard delete via users view):');
if (!plain) process.stdout.write('\x1b[0m');
if (!P1.length) console.log('  (none)');
P1.forEach(u => console.log(`  • ${u.email}  [${u.name} | ${u.role || ''}] → Delete user (hard)`));

console.log('');
if (!plain) process.stdout.write('\x1b[1m');
console.log('P2 — KEEP canonical, DELETE duplicate extras:');
if (!plain) process.stdout.write('\x1b[0m');
if (!P2.length) console.log('  (none)');
P2.forEach(({ extra, keep }) => console.log(`  • KEEP ${keep.email} (${keep.name})  /  DELETE ${extra.email} (${extra.name} [${extra.id}])`));

console.log('');
if (!plain) process.stdout.write('\x1b[1m');
console.log('P3 — REVIEW ONLY (never auto-delete; do not touch unless you are 100% sure):');
if (!plain) process.stdout.write('\x1b[0m');
const nameCount = new Map();
for (const u of users) { const k = normName(u.name); if (k) nameCount.set(k, (nameCount.get(k) || 0) + 1); }
let p3 = 0;
for (const [k, c] of nameCount) {
  if (c <= 1) continue;
  const matches = users.filter(u => normName(u.name) === k);
  const emails = new Set(matches.map(u => normEmail(u.email)));
  if (emails.size <= 1) continue;
  p3++;
  console.log(`  ⚠ "${matches[0].name}" → ${matches.map(u => u.email).join(' | ')}`);
}
if (!p3) console.log('  (none)');

console.log(`\nNext: open Settings → Users & Roles, search each P1 email and choose "Delete user (hard)",`);
console.log('then do the same for each P2 "extra" (keep the canonical). Re-run `npm run audit:users` after to confirm 0 duplicates + 0 test accounts.\n');
