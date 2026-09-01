#!/usr/bin/env node
/**
 * Fix HR permanent delete:
 * - Allow ADMIN, HR, MANAGER, DEV, EXECUTIVE
 * - ALWAYS await saveState so D1 persists the removal
 * - Soft-delete also awaits saveState
 * - Visible Delete button on directory rows
 * - Invalidate HR cache keys
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MAIN = path.join(root, 'src', 'main.jsx');

let rpc = fs.readFileSync(RPC, 'utf8');
let changed = 0;

const NEW_HARD = `  permanentlyDeleteEmployee(user, id) {
    /* hr-delete-fix-v1 */
    const u = reqRole(user, ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.DEV, ROLES.EXECUTIVE);
    const d = data();
    ensureHrData();
    const idx = (d.employees || []).findIndex(e => e.id === id || e.employeeNo === id);
    if (idx < 0) throw new Error('Employee not found');
    const [removed] = d.employees.splice(idx, 1);
    try {
      const em = String(removed.email || removed.companyEmail || '').toLowerCase();
      const keepers = typeof KEEPER_EMAILS !== 'undefined' ? KEEPER_EMAILS : new Set();
      if (em && !keepers.has(em) && Array.isArray(d.users)) {
        const ui = d.users.findIndex(x => String(x.email || '').toLowerCase() === em && !x.isSystem);
        if (ui >= 0) {
          d.users[ui].status = 'Inactive';
          d.users[ui].linkedEmployeeId = '';
        }
      }
    } catch (_) {}
    d.hrAuditLog = Array.isArray(d.hrAuditLog) ? d.hrAuditLog : [];
    d.hrAuditLog.unshift({
      id: gid(), employeeId: removed.id, action: 'Employee permanently deleted',
      employeeName: removed.name, by: u.name, at: new Date().toISOString(), restoreAvailable: false
    });
    log(u, \`Permanently delete employee \${removed.name}\`, 'HR');
    if (typeof saveState === 'function') {
      return Promise.resolve(saveState()).then(() => ({ success: true, removed: { id: removed.id, name: removed.name } }));
    }
    return { success: true, removed: { id: removed.id, name: removed.name } };
  },`;

if (rpc.includes('/* hr-delete-fix-v1 */')) {
  console.log('[hr-delete] already applied');
} else if (rpc.includes('permanentlyDeleteEmployee(user, id)')) {
  rpc = rpc.replace(
    /  permanentlyDeleteEmployee\(user, id\) \{[\s\S]*?\n  \},\n  saveDepartment/,
    NEW_HARD + '\n  saveDepartment'
  );
  changed++;
  console.log('[hr-delete] permanentlyDeleteEmployee rewritten');
} else {
  console.warn('[hr-delete] permanentlyDeleteEmployee not found');
}

if (rpc.includes("emp.status = 'Inactive';") && rpc.includes('Soft delete employee') && !rpc.includes('/* hr-soft-delete-await-v1 */')) {
  rpc = rpc.replace(
    /try \{ if \(typeof saveState === 'function'\) Promise\.resolve\(saveState\(\)\)\.catch\(\(\) => \{\}\); \} catch \{\}\s*\n\s*return \{ success: true, employee: emp \};\n  \},\n  recordAttendance/,
    `/* hr-soft-delete-await-v1 */
    if (typeof saveState === 'function') {
      return Promise.resolve(saveState()).then(() => ({ success: true, employee: emp }));
    }
    return { success: true, employee: emp };
  },
  recordAttendance`
  );
  changed++;
  console.log('[hr-delete] soft delete awaits saveState');
}

if (rpc.includes("deleteEmployee: ['Employees'") && !rpc.includes("permanentlyDeleteEmployee: ['Employees'")) {
  rpc = rpc.replace(
    "deleteEmployee: ['Employees', 'Departments', 'Dashboard', 'Activity'],",
    "deleteEmployee: ['Employees', 'Departments', 'Dashboard', 'Activity', 'HR'],\n  permanentlyDeleteEmployee: ['Employees', 'Departments', 'Dashboard', 'Activity', 'HR'],\n  restoreEmployee: ['Employees', 'Departments', 'Dashboard', 'Activity', 'HR'],"
  );
  changed++;
  console.log('[hr-delete] cache invalidation keys');
}

if (changed) fs.writeFileSync(RPC, rpc);
console.log('[hr-delete] rpc bytes', rpc.length);

let main = fs.readFileSync(MAIN, 'utf8');
let mChanged = 0;

const rowNeedle = `<td className="row-actions" onClick={e => e.stopPropagation()}>
                        <button className="mini-action" title="Edit" onClick={() => setEditEmp(emp)}><UserCog size={14} /></button>`;
const rowInject = `<td className="row-actions" onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="mini-action" title="Edit" onClick={() => setEditEmp(emp)}><UserCog size={14} /></button>
                        <button type="button" className="mini-action danger-action" title="Delete permanently" style={{ color: '#d92d20', borderColor: '#fecdca', background: '#fef3f2' }} onClick={() => handleDeleteEmployeeHard(emp)}><Trash2 size={14} /><span style={{ marginLeft: 4, fontSize: 11, fontWeight: 600 }}>Delete</span></button>`;
if (main.includes(rowNeedle) && !main.includes('danger-action')) {
  main = main.replace(rowNeedle, rowInject);
  mChanged++;
  console.log('[hr-delete] visible Delete button');
}

const newHandler = `const handleDeleteEmployeeHard = async (emp) => {
    /* hr-delete-fix-v1 */
    if (!confirm(\`PERMANENTLY delete employee "\${emp.name}" (\${emp.employeeNo || emp.id})?\\n\\nThis removes them from the HR directory and cannot be undone.\`)) return;
    try {
      await rpc('permanentlyDeleteEmployee', [user, emp.id]);
      try { if (window.__erpCache) window.__erpCache.clear(); } catch (_) {}
      setRefreshKey(k => k + 1);
      alert(\`Deleted: \${emp.name}\`);
    } catch (err) {
      alert((err && err.message) || 'Delete failed \u2014 you may need HR or Admin role.');
    }
  };`;
if (main.includes('handleDeleteEmployeeHard') && !main.includes('/* hr-delete-fix-v1 */')) {
  main = main.replace(
    /const handleDeleteEmployeeHard = async \(emp\) => \{[\s\S]*?\n  \};/,
    newHandler
  );
  mChanged++;
  console.log('[hr-delete] handler upgraded');
}

if (mChanged) fs.writeFileSync(MAIN, main);
console.log('[hr-delete] done main changes', mChanged);
