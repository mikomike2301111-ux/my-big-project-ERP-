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
const TEST_SUBSTRINGS = ['test', 'demo', 'temp', 'probe', 'verify', 'local', 'repro', 'qa', 'dev', 'probe'];
const TEST_EMAIL_PATTERNS = [
  /\+.*@/i,                 // plus-alias (name+anything@)
  /@(farmtrack\.com|example\.|test\.|localhost|example\.com)$/i,
  /^test/, /^demo/, /^dev/, /^qa/, /^local/, /^verify/,
  /@test/i
];

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
const byEmail = new Map();
for (const u of users) {
  const k = normEmail(u.email);
  if (!byEmail.has(k)) byEmail.set(k, []);
  byEmail.get(k).push(u);
}
console.log('--- Exact-email duplicates ---');
let dupGroups = 0;
for (const [email, arr] of byEmail) {
  if (email && arr.length > 1) {
    dupGroups++;
    console.log(`  ${email} (${arr.length}) → ${arr.map(u => `${u.name || '?'} [${u.id}] (${u.status || ''})`).join(' | ')}`);
  }
}
if (!dupGroups) console.log('  none');

const normName = n => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const nameCount = new Map();
for (const u of users) {
  const k = normName(u.name);
  if (k) nameCount.set(k, (nameCount.get(k) || 0) + 1);
}
console.log('\n--- Near-duplicate names ---');
let nameDups = 0;
for (const [k, c] of nameCount) {
  if (c > 1) {
    nameDups++;
    const matches = users.filter(u => normName(u.name) === k);
    console.log(`  "${matches[0].name}" (×${c}) → ${matches.map(u => u.email).join(' | ')}`);
  }
}
if (!nameDups) console.log('  (none)');

console.log('\n--- Likely test / dev / probe accounts ---');
let flagged = 0;
for (const u of users) {
  const email = normEmail(u.email);
  const name = String(u.name || '').toLowerCase();
  const pat = TEST_EMAIL_PATTERNS.some(r => (r instanceof RegExp ? r.test(email) : r.test(email)));
  const sub = TEST_SUBSTRINGS.some(s => email.includes(s) || name.includes(s));
  if (pat || sub) {
    flagged++;
    console.log(`  ${u.email || '(empty)'} | ${u.name || '?'} | ${u.role || ''} | ${u.status || ''}`);
  }
}
if (!flagged) console.log('  (none)');

console.log(`\nSummary: ${users.length} users, ${dupGroups} email-dup group(s), ${nameDups} name-dup group(s), ${flagged} flagged test/dev account(s).\n`);