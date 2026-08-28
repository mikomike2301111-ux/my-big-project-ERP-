#!/usr/bin/env node
/**
 * Farmtrack ERP — HR user audit (no secrets).
 * Loads the latest D1 state backup (or a file you pass) and reports:
 *   - every user (email · name · role · status · createdAt)
 *   - exact-email duplicates
 *   - near-duplicate names
 *   - likely test / probe / dev accounts
 * Usage:
 *   node scripts/audit-users.js                 # newest data/*.json backup
 *   node scripts/audit-users.js <path.json>     # specific file
 * Read-only: never writes or mutates anything. Exits 0 unless a problem arg.
 */
const fs = require('fs');
const path = require('path');

function findBackup(root) {
  const dir = path.join(root, 'data');
  if (!fs.existsSync(dir)) return null;
  const candidates = fs.readdirSync(dir)
    .filter(f => /d1-state-backup.*\.json$/.test(f))
    .sort();
  return candidates.length ? path.join(dir, candidates[candidates.length - 1]) : null;
}

// Heuristics for "test/dev/probe" accounts — adjust thresholds as you see fit.
const TEST_SUBSTRINGS = ['test', 'demo', 'temp', 'probe', 'verify', 'local', 'repro', 'qa', 'dev'];
const TEST_EMAIL_PATTERNS = [
  /\+.*@/i,                 // plus-alias (name+anything@)
  /@(farmtrack\.com|example\.|test\.|localhost|example\.com)$/i,
  /^test/, /^demo/, /^dev/, /^qa/, /^local/, /^verify/,
  /@test/i
];
// Emails/names that are clearly dev/test-established (confirmed from the live dump).
const KNOWN_TEST = [
  'boss@farmtrack.co.ke', 'mfg1@farmtrack.co.ke', 'mfg2@farmtrack.co.ke',
  'security@farmtrack.co.ke', 'casual2@farmtrack.co.ke', 'masharia@farmtrack.co.ke',
  'admin@farmtrack.co.ke', 'james@farmtrack.com', 'mary@farmtrack.com', 'peter@farmtrack.com'
];
// Emails that must NEVER be deleted (canonical real staff / owners).
const PROTECTED = [
  'miko@gmail.com', 'kiarieadmin@gmail.com', 'smuchemi@gmail.com',
  'farmtrackbiosciencesltd@gmail.com', 'hr@farmtrack.co.ke', 'accounts@farmtrack.co.ke',
  'reception@farmtrack.co.ke', 'edna@farmtrack.co.ke', 'joseph@farmtrack.co.ke',
  'njoroge@farmtrack.co.ke', 'purity@farmtrack.co.ke', 'mosesngeno@farmtrack.co.ke',
  'epf@farmtrack.co.ke', 'alex@farmtrack.co.ke', 'mosesmiano@farmtrack.co.ke',
  'macharia@farmtrack.co.ke', 'kk@farmtrack.co.ke'
];

function historyRefCount(state, email, id) {
  const collections = ['payments', 'expenses', 'leaves', 'leaveApplications', 'requisitions', 'sales', 'invoices', 'tasks', 'calls', 'activities', 'auditLogs', 'financeAuditLogs', 'notifications', 'businessEvents', 'attendance', 'payrollRecords'];
  let n = 0;
  const lookFor = [String(email || '').toLowerCase(), String(id || '')].filter(Boolean);
  for (const c of collections) {
    const arr = Array.isArray(state[c]) ? state[c] : [];
    for (const row of arr) {
      const vals = [row.userEmail, row.email, row.userId, row.user, row.applicantId, row.applicantEmail, row.requestedBy, row.createdBy, row.assignedTo, row.assignedToEmail, row.actorEmail, row.actor_id, row.employeeId];
      if (vals.some(v => { const s = String(v || '').toLowerCase(); return s && lookFor.some(l => s.includes(l) || l.includes(s)); })) { n++; break; }
    }
  }
  return n;
}

const argFile = process.argv[2];
const root = path.join(__dirname, '..');
const file = argFile ? path.resolve(argFile) : findBackup(root);
if (!file || !fs.existsSync(file)) {
  console.error('No state backup found. Run `npm run backup:d1` or pass a file path.');
  process.exit(1);
}
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const users = Array.isArray(state.users) ? state.users : [];
console.log(`\n=== User Audit — ${path.basename(file)} — ${users.length} users ===\n`);

const normEmail = e => String(e || '').toLowerCase().trim();
const normName = n => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const byEmail = new Map();
for (const u of users) { const k = normEmail(u.email); if (!byEmail.has(k)) byEmail.set(k, []); byEmail.get(k).push(u); }
const nameCount = new Map();
for (const u of users) { const k = normName(u.name); if (k) nameCount.set(k, (nameCount.get(k) || 0) + 1); }

console.log('--- 1) HIGHEST PRIORITY — definite test/dev/probe accounts (safe to remove) ---');
const candidates = users.filter(u => {
  const e = normEmail(u.email); const n = String(u.name || '').toLowerCase();
  if (KNOWN_TEST.includes(e)) return true;
  if (TEST_SUBSTRINGS.some(s => n.includes(s) || e.includes(s))) return true;
  return TEST_EMAIL_PATTERNS.some(r => r.test(e));
});
let totalHistory = 0;
for (const u of candidates) {
  const h = historyRefCount(state, u.email, u.id);
  totalHistory += h;
  console.log(`  [P1] ${u.email} | ${u.name} | ${u.role} | refs=${h}`);
}
if (!candidates.length) console.log('  (none)');

console.log('\n--- 2) MEDIUM priority — exact-email duplicates (keep 1 canonical, deactivate extras) ---');
let dupKeep = 0, dupRemove = 0;
for (const [email, arr] of byEmail) {
  if (!email || arr.length <= 1) continue;
  const canonical = arr.find(u => PROTECTED.includes(normEmail(u.email))) || arr[0];
  const others = arr.filter(u => u !== canonical);
  console.log(`  ${email} (${arr.length}) — KEEP: ${canonical.name} [${canonical.id}] → DEACTIVATE: ${others.map(u => `${u.name} [${u.id}] refs=${historyRefCount(state, u.email, u.id)}`).join('; ')}`);
  dupKeep++; dupRemove += others.length;
}
if (!dupKeep) console.log('  (none)');

console.log('\n--- 3) HUMAN REVIEW — near-duplicate names that are NOT exact-email dups (verify before acting) ---');
let nameOnly = 0;
for (const [k, c] of nameCount) {
  if (c <= 1) continue;
  const matches = users.filter(u => normName(u.name) === k);
  const emails = new Set(matches.map(u => normEmail(u.email)));
  if (emails.size <= 1) continue;
  nameOnly++;
  console.log(`  "${matches[0].name}" (×${c}) → ${matches.map(u => `${u.email} [${u.id}]`).join(' | ')}`);
}
if (!nameOnly) console.log('  (none)');

console.log('\n--- 4) PROTECTED (never auto-delete) ---');
console.log('  ' + PROTECTED.join(', '));

console.log(`\n=== SUMMARY ===
Total users: ${users.length}
  P1 test/dev to remove: ${candidates.length} (combined refs ${totalHistory})
  Duplicate groups: ${dupKeep} (deactivate ${dupRemove} extras)
  Near-dup name-only groups needing review: ${nameOnly}
  Protected (keep): ${PROTECTED.length}`);
console.log('\nNext step: run `npm run backup:d1`, review the P1 + duplicate lists, then I can generate\nscripts/cleanup-users.js that soft-deactivates (never hard-deletes) the confirmed accounts.\n');
