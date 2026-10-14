#!/usr/bin/env node
/**
 * Remove the legacy full-state normalized-table sync scheduled after every save.
 * saveErpStateDocument now performs incremental changed-row writes before the
 * atomic blob pointer flip. Replaying all historical rows after every save
 * causes SQL-variable failures and Vercel 60-second timeouts.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const file = path.join(__dirname, '..', 'api', 'rpc.js');
const MARK = '/* disable-full-normalized-sync-v1 */';
let src = fs.readFileSync(file, 'utf8');
if (!src || src.trim() === 'PLACEHOLDER' || src.length < 50000) throw new Error('rpc.js not restored');
if (src.includes(MARK)) {
  console.log('[disable-full-normalized-sync] already applied');
  process.exit(0);
}
const pattern = /\n[ \t]*try\s*\{\s*if\s*\(d1\s*&&\s*d1\.syncFullStateToNormalizedTables\s*&&\s*normalizedWritesEnabled\(\)\)\s*\{\s*const snap = compactStateForPersistence\(db\);\s*d1\.syncFullStateToNormalizedTables\(snap\)\.catch\(\(e\) => console\.warn\('\[ERP\] normalized sync:', e && e\.message\)\);\s*\}\s*\}\s*catch \(e\) \{ console\.warn\('\[ERP\] normalized sync setup:', e && e\.message\); \}\n/;
if (!pattern.test(src)) {
  if (src.includes('syncFullStateToNormalizedTables(snap)')) {
    throw new Error('Full-state sync call found but safe removal pattern did not match');
  }
  console.log('[disable-full-normalized-sync] no full-state save hook present');
  process.exit(0);
}
src = src.replace(pattern, '\n  ' + MARK + '\n  // Incremental D1 writes are handled inside saveErpStateDocument.\n');
fs.writeFileSync(file, src);
const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (check.status !== 0) throw new Error((check.stderr || check.stdout || 'syntax check failed').slice(0, 1000));
console.log('[disable-full-normalized-sync] removed full-state post-save write hook');
