#!/usr/bin/env node
/**
 * Keep only login staff keepers; hard-prune all other users on load.
 * Adds visible Delete button on HR directory.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const RPC = path.join(ROOT, 'api', 'rpc.js');
const MAIN = path.join(ROOT, 'src', 'main.jsx');

function must(f) {
  if (!fs.existsSync(f)) throw new Error('Missing ' + f);
  return fs.readFileSync(f, 'utf8');
}

let rpc = must(RPC);

if (!rpc.includes('KEEPER_EMAILS')) {
  const rosterRe = /const STAFF_ROSTER = \[[\s\S]*?\n\];/;
  if (!rosterRe.test(rpc)) {
    console.warn('STAFF_ROSTER not found');
  } else {
    const newRoster = `const STAFF_ROSTER = [
  { name: 'Miko Admin', email: 'miko@gmail.com', password: 'MM@29315122', role: ROLES.DEV, department: 'Executive' },
  { name: 'Samuel Muchemi', email: 'smuchemi@gmail.com', password: 'Pass@2026', role: ROLES.EXECUTIVE, department: 'Executive' },
  { name: 'Office Admin', email: OFFICE_ADMIN_EMAIL, password: OFFICE_ADMIN_PASSWORD, role: ROLES.ADMIN, department: 'Administration' },
  { name: 'Shila HR', email: 'hr@farmtrack.co.ke', password: 'Hr2026!', role: ROLES.HR, department: 'HR' },
  { name: 'Accounts Officer', email: 'accounts@farmtrack.co.ke', password: 'Acc2026!', role: ROLES.ACCOUNTANT, department: 'Finance' },
  { name: 'Reception', email: 'reception@farmtrack.co.ke', password: 'Rec2026!', role: ROLES.RECEPTION, department: 'Administration' },
  { name: 'Edna', email: 'edna@farmtrack.co.ke', password: 'SalesEdna1!', role: ROLES.SALES, department: 'Sales' },
  { name: 'Joseph', email: 'joseph@farmtrack.co.ke', password: 'Pass2026', role: ROLES.SALES, department: 'Sales' },
  { name: 'Njoroge', email: 'njoroge@farmtrack.co.ke', password: 'SalesNjo1!', role: ROLES.SALES, department: 'Sales' },
  { name: 'Purity', email: 'purity@farmtrack.co.ke', password: 'SalesPur1!', role: ROLES.SALES, department: 'Sales' },
  { name: 'Moses Miano', email: 'mosesmiano@farmtrack.co.ke', password: 'Pass2026', role: ROLES.PRODUCTION, department: 'Bacteriology' },
  { name: 'Alex', email: 'alex@farmtrack.co.ke', password: 'Pass2026', role: ROLES.PRODUCTION, department: 'R&D' },
  { name: 'KK', email: 'kk@farmtrack.co.ke', password: 'Kk2026!', role: ROLES.CASUAL, department: 'Operations' }
];

const KEEPER_EMAILS = new Set(
  STAFF_ROSTER.map(r => String(r.email).toLowerCase()).concat([
    'kiarieadmin@gmail.com',
    'admin@farmtrack.co.ke'
  ])
);`;
    rpc = rpc.replace(rosterRe, newRoster);
    console.log('STAFF_ROSTER slimmed to keepers');
  }

  if (!rpc.includes('HARD prune')) {
    const mikoBlock = `  const miko = db.users.find(x => String(x.email || '').toLowerCase() === 'miko@gmail.com');
  if (miko) {
    miko.role = ROLES.DEV;
    miko.status = 'Active';
    miko.password = 'MM@29315122';
  }
  return db.users;
}`;
    const withPrune = `  // HARD prune: remove every login user not on the keeper list
  const before = db.users.length;
  db.users = db.users.filter(u => {
    const em = String(u.email || '').toLowerCase();
    if (!em) return false;
    if (u.isSystem) return true;
    if (typeof KEEPER_EMAILS !== 'undefined' && KEEPER_EMAILS.has(em)) return true;
    if (em === String(OFFICE_ADMIN_EMAIL || '').toLowerCase()) return true;
    return false;
  });
  if (db.users.length !== before) {
    db._usersPrunedAt = new Date().toISOString();
    db._usersPrunedCount = (db._usersPrunedCount || 0) + (before - db.users.length);
  }

  const miko = db.users.find(x => String(x.email || '').toLowerCase() === 'miko@gmail.com');
  if (miko) {
    miko.role = ROLES.DEV;
    miko.status = 'Active';
    miko.password = 'MM@29315122';
  }
  return db.users;
}`;
    if (rpc.includes(mikoBlock)) {
      rpc = rpc.replace(mikoBlock, withPrune);
      console.log('Injected hard prune in ensureStaffUsers');
    } else {
      console.warn('Could not inject prune block');
    }
  }

  if (!rpc.includes('pruneUsersToKeepers(')) {
    const marker = '  deleteUser(user, userId) {';
    if (rpc.includes(marker)) {
      rpc = rpc.replace(marker, `  pruneUsersToKeepers(user) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE, ROLES.HR);
    const d = data();
    ensureStaffUsers(d);
    const kept = (d.users || []).map(x => x.email);
    log(u, \`Prune users to keepers (\${kept.length} kept)\`, 'Settings');
    return { success: true, kept, count: kept.length, prunedAt: d._usersPrunedAt || null, prunedCount: d._usersPrunedCount || 0 };
  },
` + marker);
      console.log('Added pruneUsersToKeepers RPC');
    }
  }

  fs.writeFileSync(RPC, rpc);
  console.log('Wrote api/rpc.js');
} else {
  console.log('rpc already has KEEPER_EMAILS');
}

let main = must(MAIN);
if (main.includes('handleDeleteEmployeeHard') && !main.includes('danger-action')) {
  const needle = `<td className="row-actions" onClick={e => e.stopPropagation()}>
                        <button className="mini-action" title="Edit" onClick={() => setEditEmp(emp)}><UserCog size={14} /></button>`;
  const inject = `<td className="row-actions" onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="mini-action" title="Edit" onClick={() => setEditEmp(emp)}><UserCog size={14} /></button>
                        <button type="button" className="mini-action danger-action" title="Delete permanently" style={{ color: '#d92d20', borderColor: '#fecdca', background: '#fef3f2' }} onClick={() => handleDeleteEmployeeHard(emp)}><Trash2 size={14} /><span style={{ marginLeft: 4, fontSize: 11, fontWeight: 600 }}>Delete</span></button>`;
  if (main.includes(needle)) {
    main = main.replace(needle, inject);
    fs.writeFileSync(MAIN, main);
    console.log('Visible HR Delete button added');
  } else {
    console.warn('HR directory actions pattern not found');
  }
} else {
  console.log('HR delete UI ok');
}

console.log('apply-keeper-prune done');
