#!/usr/bin/env node
/**
 * apply-add-moses-ngeno-v1
 * Ensure mosesngeno@farmtrack.co.ke exists as Production Supervisor / Manufacturing
 * with a known roster password so login works even if D1 writes are limited.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MARK = '/* add-moses-ngeno-v1 */';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[moses-ngeno] SYNTAX', (r.stderr || r.stdout || '').slice(0, 800));
    process.exit(1);
  }
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[moses-ngeno] rpc PLACEHOLDER');
  process.exit(1);
}

if (!rpc.includes(MARK)) {
  // Update existing roster line if present
  const oldLine =
    "{ name: 'Moses Ngeno', email: 'mosesngeno@farmtrack.co.ke', password: 'Pass@2026', role: ROLES.PRODUCTION, department: 'R&D' }";
  const newLine =
    "{ name: 'Moses Ngeno', email: 'mosesngeno@farmtrack.co.ke', password: 'Moses2026!', role: ROLES.PRODUCTION, department: 'Manufacturing' } /* add-moses-ngeno-v1 */";

  if (rpc.includes("email: 'mosesngeno@farmtrack.co.ke'")) {
    rpc = rpc.replace(
      /\{\s*name:\s*'Moses Ngeno'\s*,\s*email:\s*'mosesngeno@farmtrack\.co\.ke'\s*,\s*password:\s*'[^']*'\s*,\s*role:\s*ROLES\.PRODUCTION\s*,\s*department:\s*'[^']*'\s*\}/,
      newLine
    );
    console.log('[moses-ngeno] updated STAFF_ROSTER entry');
  } else if (rpc.includes('STAFF_ROSTER = [')) {
    // Insert before closing of roster near Moses Miano or end
    const insertAfter =
      "{ name: 'Moses Miano', email: 'mosesmiano@farmtrack.co.ke', password: 'Pass2026', role: ROLES.PRODUCTION, department: 'Bacteriology' }";
    if (rpc.includes(insertAfter)) {
      rpc = rpc.replace(
        insertAfter,
        insertAfter + ',\n  ' + newLine
      );
      console.log('[moses-ngeno] inserted after Moses Miano');
    } else {
      rpc = rpc.replace(
        'STAFF_ROSTER = [',
        'STAFF_ROSTER = [\n  ' + newLine + ','
      );
      console.log('[moses-ngeno] prepended to STAFF_ROSTER');
    }
  } else {
    console.warn('[moses-ngeno] STAFF_ROSTER not found');
  }

  // Force ensure on login: if still missing after ensureStaffUsers, push explicitly
  if (rpc.includes('function ensureStaffUsers') && !rpc.includes('add-moses-ngeno-v1-force')) {
    const force = `
  ${MARK} /* add-moses-ngeno-v1-force */
  {
    const email = 'mosesngeno@farmtrack.co.ke';
    let u = db.users.find(x => String(x.email || '').toLowerCase() === email);
    if (!u) {
      u = {
        id: 'USER-MOSESNGENO',
        name: 'Moses Ngeno',
        email,
        password: 'Moses2026!',
        role: ROLES.PRODUCTION,
        department: 'Manufacturing',
        status: 'Active',
        phone: '',
        warehouse: 'All',
        county: 'Nairobi',
        canChangePassword: true,
        source: 'roster',
        createdAt: new Date().toISOString()
      };
      db.users.push(u);
    } else {
      u.name = 'Moses Ngeno';
      u.role = ROLES.PRODUCTION;
      u.department = 'Manufacturing';
      u.password = 'Moses2026!';
      if (u.passwordHash) delete u.passwordHash;
      u.status = 'Active';
      u.isDeleted = 'No';
      u.source = u.source || 'roster';
    }
  }
`;
    // Inject before dedupe loop "const seen = new Set();" inside ensureStaffUsers
    const seenIdx = rpc.indexOf('const seen = new Set();');
    const ensureIdx = rpc.indexOf('function ensureStaffUsers');
    if (seenIdx > ensureIdx && ensureIdx > 0) {
      // only first seen inside ensureStaffUsers region (~2000 chars)
      const region = rpc.slice(ensureIdx, ensureIdx + 3500);
      const localSeen = region.indexOf('const seen = new Set();');
      if (localSeen > 0) {
        const abs = ensureIdx + localSeen;
        rpc = rpc.slice(0, abs) + force + '\n  ' + rpc.slice(abs);
        console.log('[moses-ngeno] force block in ensureStaffUsers');
      }
    }
  }
}

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[moses-ngeno] done', rpc.length);
