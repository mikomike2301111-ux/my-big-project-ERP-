#!/usr/bin/env node
/**
 * Apply role-level page-access checkboxes in Settings > Permissions.
 * Additive only — does not wipe erp_state or existing user allowedPages.
 * Email Approve/Reject links already exist for leave + purchase + requisition
 * via api/leave-action.js and api/approval-action.js (signed tokens).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RPC = path.join(ROOT, 'api', 'rpc.js');
const MAIN = path.join(ROOT, 'src', 'main.jsx');

function must(file) {
  if (!fs.existsSync(file)) throw new Error('Missing: ' + file);
  return fs.readFileSync(file, 'utf8');
}
function write(file, content) {
  fs.writeFileSync(file, content);
  console.log('Updated', path.relative(ROOT, file));
}

let rpc = must(RPC);

const NEW_ROLE_CAN = `function getRolePageAccessMap() {
  try {
    const d = (typeof data === 'function') ? data() : null;
    const map = d && d.settings && d.settings.rolePageAccess;
    return (map && typeof map === 'object') ? map : {};
  } catch (_) {
    return {};
  }
}

function defaultPagesForRole(role) {
  return Object.keys(PAGE_ACCESS).filter(pageId => {
    const allowed = PAGE_ACCESS[pageId];
    if (!allowed) return false;
    if (allowed.includes('*')) return true;
    if (role === ROLES.ADMIN || role === ROLES.DEV || role === ROLES.EXECUTIVE) return true;
    if (allowed.includes(role)) return true;
    const uWords = String(role || '').toLowerCase().split(/\\W+/).filter(w => w.length >= 3);
    if (!uWords.length) return false;
    return allowed.some(ar => {
      const arl = String(ar || '').toLowerCase();
      if (arl === String(role || '').toLowerCase()) return true;
      const aWords = arl.split(/\\W+/).filter(w => w.length >= 3);
      return aWords.some(aw => uWords.includes(aw));
    });
  });
}

function roleCanAccessPage(role, pageId) {
  const allowed = PAGE_ACCESS[pageId];
  if (!allowed) return false;
  if (allowed.includes('*')) return true;
  if (role === ROLES.ADMIN || role === ROLES.DEV || role === ROLES.EXECUTIVE) return true;
  const custom = getRolePageAccessMap();
  if (custom && Array.isArray(custom[role])) {
    return custom[role].includes(pageId) || custom[role].includes('*');
  }
  if (allowed.includes(role)) return true;
  const uWords = String(role || '').toLowerCase().split(/\\W+/).filter(w => w.length >= 3);
  if (!uWords.length) return false;
  return allowed.some(ar => {
    const arl = String(ar || '').toLowerCase();
    if (arl === String(role || '').toLowerCase()) return true;
    const aWords = arl.split(/\\W+/).filter(w => w.length >= 3);
    return aWords.some(aw => uWords.includes(aw));
  });
}`;

if (rpc.includes('function roleCanAccessPage(role, pageId)') && !rpc.includes('getRolePageAccessMap')) {
  rpc = rpc.replace(/function roleCanAccessPage\(role, pageId\) \{[\s\S]*?\n\}/, NEW_ROLE_CAN);
  console.log('Patched roleCanAccessPage');
} else if (rpc.includes('getRolePageAccessMap')) {
  console.log('roleCanAccessPage already patched');
}

if (!rpc.includes('saveRolePageAccess(')) {
  const saveUserIdx = rpc.indexOf('saveSettingsUser(user, payload = {})');
  if (saveUserIdx > 0) {
    const insertAt = rpc.lastIndexOf('\n', saveUserIdx);
    const method = `
  saveRolePageAccess(user, payload = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE, ROLES.MANAGER);
    const d = data();
    d.settings = d.settings && typeof d.settings === 'object' ? d.settings : {};
    const incoming = payload && typeof payload === 'object' ? payload : {};
    if (incoming.matrix && typeof incoming.matrix === 'object') {
      d.settings.rolePageAccess = { ...(d.settings.rolePageAccess || {}), ...incoming.matrix };
    } else if (incoming.role) {
      const pages = Array.isArray(incoming.pages) ? incoming.pages.filter(Boolean) : [];
      d.settings.rolePageAccess = d.settings.rolePageAccess || {};
      if (pages.length === 0) delete d.settings.rolePageAccess[incoming.role];
      else d.settings.rolePageAccess[incoming.role] = pages;
    } else {
      throw new Error('Provide role+pages or matrix');
    }
    const forceFull = [ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE];
    forceFull.forEach(r => {
      if (d.settings.rolePageAccess[r]) d.settings.rolePageAccess[r] = Object.keys(PAGE_ACCESS);
    });
    log(u, 'settings', 'role-page-access', 'Updated role page access matrix');
    return { success: true, rolePageAccess: d.settings.rolePageAccess };
  },
  getRolePageAccess(user) {
    reqRole(user, ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.HR, ROLES.ACCOUNTANT);
    const d = data();
    const roles = Object.values(ROLES);
    const pages = Object.keys(PAGE_ACCESS);
    const custom = (d.settings && d.settings.rolePageAccess) || {};
    const matrix = roles.map(role => {
      const isCustom = Array.isArray(custom[role]);
      const pagesFor = isCustom ? custom[role] : defaultPagesForRole(role);
      return { role, pages: pagesFor, isCustom, defaults: defaultPagesForRole(role) };
    });
    return { pages, roles, matrix, rolePageAccess: custom };
  },
`;
    rpc = rpc.slice(0, insertAt) + method + rpc.slice(insertAt);
    console.log('Inserted saveRolePageAccess + getRolePageAccess');
  }
}

if (!rpc.includes('rolePageMatrix:')) {
  rpc = rpc.replace(
    /permissionMatrix: roles\.map\(role => \(\{[\s\S]*?manage: \[ROLES\.DEV, ROLES\.ADMIN\]\.includes\(role\)\n\s*\}\)\),/,
    (match) => match + `
      rolePageMatrix: (() => {
        const custom = (d.settings && d.settings.rolePageAccess) || {};
        const pageIds = Object.keys(PAGE_ACCESS);
        return Object.values(ROLES).map(role => {
          const isCustom = Array.isArray(custom[role]);
          const pages = isCustom ? custom[role] : (typeof defaultPagesForRole === 'function' ? defaultPagesForRole(role) : pageIds.filter(p => roleCanAccessPage(role, p)));
          const row = { role, isCustom: !!isCustom };
          pageIds.forEach(p => { row[p] = pages.includes(p) || pages.includes('*'); });
          return row;
        });
      })(),
      pageAccessIds: Object.keys(PAGE_ACCESS),
`
  );
  console.log('Enriched getSettingsWorkspaceData with rolePageMatrix');
}

write(RPC, rpc);

let main = must(MAIN);
const NEW_PERM = `      {view === 'permissions' && (
        <RolePageAccessPanel user={user} data={data} onSaved={() => { flash('Role page access saved.'); refresh(); }} />
      )}`;

if (main.includes("view === 'permissions'") && !main.includes('RolePageAccessPanel')) {
  main = main.replace(/\{view === 'permissions' && \([\s\S]*?<\/div>\s*\)\}/, NEW_PERM);
  console.log('Replaced permissions tab with RolePageAccessPanel');
}

if (!main.includes('function RolePageAccessPanel')) {
  const component = `
function RolePageAccessPanel({ user, data, onSaved }) {
  const pageIds = Array.isArray(data.pageAccessIds) && data.pageAccessIds.length
    ? data.pageAccessIds
    : ['dashboard','analytics','sales','purchasing','inventory','finance','accounts','production','customers','delivery','reports','inputs','notifications','email','profile','email-admin','hr','leaves','requisitions','settings','admin-ops'];
  const PAGE_LABELS = {
    dashboard: 'Dashboard', analytics: 'Analytics', sales: 'Sales', purchasing: 'Purchasing',
    inventory: 'Inventory', finance: 'Finance', accounts: 'Accounts', accounting: 'Accounting',
    production: 'Production', customers: 'CRM / Customers', delivery: 'Delivery', reports: 'Reports',
    inputs: 'Inputs', notifications: 'Notifications', email: 'Email', profile: 'Profile',
    'email-admin': 'Email Admin', hr: 'HR', leaves: 'Leaves', requisitions: 'Requisitions',
    settings: 'Settings', 'admin-ops': 'Admin Ops'
  };
  const seed = {};
  (data.rolePageMatrix || []).forEach(row => {
    seed[row.role] = pageIds.filter(p => row[p]);
  });
  if (!Object.keys(seed).length && Array.isArray(data.permissionMatrix)) {
    (data.roles || []).forEach(role => { seed[role] = pageIds.slice(); });
  }
  const [matrix, setMatrix] = useState(seed);
  const [selectedRole, setSelectedRole] = useState(Object.keys(seed)[0] || 'Sales Officer');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const roles = Object.keys(matrix).length ? Object.keys(matrix) : (data.roles || []);

  useEffect(() => {
    const next = {};
    (data.rolePageMatrix || []).forEach(row => {
      next[row.role] = pageIds.filter(p => row[p]);
    });
    if (Object.keys(next).length) {
      setMatrix(next);
      if (!next[selectedRole]) setSelectedRole(Object.keys(next)[0]);
    }
  }, [data.rolePageMatrix]);

  const toggle = (pageId) => {
    setDirty(true);
    setMatrix(prev => {
      const cur = Array.isArray(prev[selectedRole]) ? prev[selectedRole] : [];
      const next = cur.includes(pageId) ? cur.filter(x => x !== pageId) : [...cur, pageId];
      return { ...prev, [selectedRole]: next };
    });
  };
  const setAll = (grant) => {
    setDirty(true);
    setMatrix(prev => ({ ...prev, [selectedRole]: grant ? pageIds.slice() : [] }));
  };
  const save = async () => {
    setSaving(true);
    try {
      await rpc('saveRolePageAccess', [user, { matrix }]);
      setDirty(false);
      onSaved && onSaved();
    } catch (err) {
      alert(err.message || 'Could not save role page access');
    } finally {
      setSaving(false);
    }
  };
  const selectedPages = new Set(matrix[selectedRole] || []);
  const isPrivileged = ['Administrator', 'Developer', 'Executive'].includes(selectedRole);

  return (
    <div className="dashboard-grid">
      <Panel className="span-4" title="Roles" action={\`\${roles.length} roles\`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflow: 'auto' }}>
          {roles.map(role => {
            const count = (matrix[role] || []).length;
            const active = role === selectedRole;
            return (
              <button key={role} type="button" onClick={() => setSelectedRole(role)}
                style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10,
                  border: active ? '1.5px solid #078236' : '1px solid var(--line)',
                  background: active ? '#eef9f1' : '#fff', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontWeight: active ? 700 : 500 }}>
                <span>{role}</span>
                <span style={{ fontSize: 11, color: '#667085' }}>{count} pages</span>
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel className="span-8" title={\`Page access · \${selectedRole}\`} action={dirty ? 'Unsaved changes' : 'Saved'}>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#667085' }}>
          Tick the pages this role can open in the sidebar. Changes apply to every user with this role
          (unless that user has a personal page override in Users).
          {isPrivileged && <strong style={{ color: '#078236' }}> Admin / Developer / Executive always keep full access.</strong>}
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button type="button" className="mini-action" onClick={() => setAll(true)} disabled={isPrivileged}>Select all</button>
          <button type="button" className="mini-action" onClick={() => setAll(false)} disabled={isPrivileged}>Clear all</button>
          <button type="button" className="primary-action" onClick={save} disabled={saving || !dirty || isPrivileged}>
            {saving ? 'Saving…' : 'Save page access'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
          {pageIds.map(id => {
            const on = isPrivileged || selectedPages.has(id);
            return (
              <label key={id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10,
                border: on ? '1.5px solid #078236' : '1px solid var(--line)',
                background: on ? '#f0fdf4' : '#fff', cursor: isPrivileged ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: on ? 600 : 500, opacity: isPrivileged ? 0.85 : 1
              }}>
                <input type="checkbox" checked={on} disabled={isPrivileged} onChange={() => toggle(id)}
                  style={{ width: 16, height: 16, accentColor: '#078236' }} />
                {PAGE_LABELS[id] || id}
              </label>
            );
          })}
        </div>
        <p style={{ marginTop: 14, fontSize: 11, color: '#98a2b3' }}>
          Tip: for one person only, edit that user under Users → Page access. Role settings here are the default for everyone in the role.
        </p>
      </Panel>
      <Panel className="span-5" title="Permission Actions"><SettingsPillList items={data.permissionActions} /></Panel>
      <Panel className="span-7" title="Action matrix"><SimpleTable rows={data.permissionMatrix} columns={['role', 'view', 'create', 'edit', 'approve', 'export', 'delete', 'manage']} /></Panel>
    </div>
  );
}

`;
  const anchor = main.indexOf('function SettingsPage({ user })');
  if (anchor > 0) {
    main = main.slice(0, anchor) + component + '\n' + main.slice(anchor);
    console.log('Injected RolePageAccessPanel component');
  }
}

write(MAIN, main);
console.log('Done. Role page checkboxes ready. Email Approve/Reject links already live for leave, purchase-request, and requisition.');
