/**
 * Idempotent build-time wiring:
 * 1) Universal camera/file → R2 attachments (sales, CRM visits/calls, delivery, production/R&D, invoices)
 * 2) HR employees ↔ system users auto-link by email
 * 3) listAttachments for reports + integrations status for Settings
 * Does NOT wipe erp_state. Best-effort UI inject into main.jsx when markers exist.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const rpcPath = path.join(root, 'api', 'rpc.js');
const mainPath = path.join(root, 'src', 'main.jsx');

const RPC_BLOCK = `
  /** Universal attachment upload → Cloudflare R2. entityType: sale|call|visit|delivery|production|invoice|employee|trial */
  async uploadEntityAttachment(user, entityType, entityId, payload = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.DELIVERY, ROLES.SALES, ROLES.WAREHOUSE, ROLES.EXECUTIVE, ROLES.DEV, ROLES.HR, ROLES.PRODUCTION, ROLES.FIELD, ROLES.RECEPTION, ROLES.ACCOUNTANT);
    const type = String(entityType || '').toLowerCase().trim();
    const allowed = {
      sale: { coll: 'sales', idKeys: ['id', 'saleNo'], folder: 'sales' },
      call: { coll: 'calls', idKeys: ['id'], folder: 'crm/calls' },
      visit: { coll: 'calls', idKeys: ['id'], folder: 'crm/visits' },
      delivery: { coll: 'deliveries', idKeys: ['id', 'deliveryNo'], folder: 'deliveries' },
      production: { coll: 'production', idKeys: ['id', 'jobNo'], folder: 'production' },
      productionjob: { coll: 'productionOrders', idKeys: ['id', 'jobNo', 'orderNo'], folder: 'production' },
      invoice: { coll: 'invoices', idKeys: ['id', 'invNo', 'invoiceNo'], folder: 'invoices' },
      employee: { coll: 'employees', idKeys: ['id', 'employeeNo'], folder: 'hr/employees' },
      trial: { coll: 'trials', idKeys: ['id', 'trialNo'], folder: 'rnd/trials' },
      lead: { coll: 'leads', idKeys: ['id'], folder: 'crm/leads' },
    };
    const cfg = allowed[type];
    if (!cfg) throw new Error('Unsupported attachment type: ' + entityType);
    const d = data();
    let collName = cfg.coll;
    let arr = Array.isArray(d[collName]) ? d[collName] : [];
    if (!arr.length && type === 'production') {
      collName = 'productionOrders';
      arr = Array.isArray(d.productionOrders) ? d.productionOrders : [];
    }
    if (!arr.length && type === 'trial') {
      arr = Array.isArray(d.trials) ? d.trials : (Array.isArray(d.rndTrials) ? d.rndTrials : []);
      collName = Array.isArray(d.trials) ? 'trials' : 'rndTrials';
      d[collName] = arr;
    }
    const entity = arr.find(row => cfg.idKeys.some(k => row[k] === entityId) || row.id === entityId);
    if (!entity) throw new Error(type + ' not found. Save the record first, then attach.');
    const base64 = String(payload.base64 || payload.content || '').replace(/^data:[^;]+;base64,/, '');
    if (!base64) throw new Error('No file data');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 12 * 1024 * 1024) throw new Error('File too large (max 12 MB)');
    const kind = clean(payload.kind) || (String(payload.contentType || '').startsWith('image/') ? 'photo' : 'document');
    const safeName = clean(payload.fileName || payload.name || ('file-' + Date.now())).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
    const contentType = clean(payload.contentType) || 'application/octet-stream';
    const key = cfg.folder + '/' + entity.id + '/' + Date.now() + '-' + kind + '-' + safeName;
    const r2 = require('../server/r2Client');
    if (!r2.configured()) throw new Error('Cloudflare R2 is not configured. Set CLOUDFLARE_API_TOKEN, R2_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID), R2_BUCKET_NAME.');
    const uploaded = await r2.putObject({ key, body: buffer, contentType });
    entity.attachments = Array.isArray(entity.attachments) ? entity.attachments : [];
    const meta = {
      id: gid(), key: uploaded.key, url: uploaded.url, fileName: safeName, contentType,
      size: uploaded.size, kind, note: clean(payload.note), uploadedBy: u.name,
      uploadedAt: new Date().toISOString(), storage: 'r2', entityType: type, entityId: entity.id,
      module: type, reportable: true,
    };
    entity.attachments.unshift(meta);
    entity.updatedAt = new Date().toISOString();
    entity.hasPhotos = entity.attachments.some(a => a.kind === 'photo');
    entity.attachmentCount = entity.attachments.length;
    if (type === 'employee' && kind === 'photo') entity.profilePhotoUrl = meta.url;
    d.erpAttachments = Array.isArray(d.erpAttachments) ? d.erpAttachments : [];
    d.erpAttachments.unshift({ ...meta, entityLabel: entity.saleNo || entity.deliveryNo || entity.invNo || entity.name || entity.id });
    if (d.erpAttachments.length > 5000) d.erpAttachments = d.erpAttachments.slice(0, 5000);
    log(u, 'Upload ' + type + ' attachment', type, (entity.saleNo || entity.deliveryNo || entity.invNo || entity.name || entity.id) + ' · ' + safeName);
    return { success: true, attachment: meta, entityId: entity.id, entityType: type };
  },

  listEntityAttachments(user, filters = {}) {
    reqRole(user);
    const d = data();
    const type = String(filters.entityType || filters.type || '').toLowerCase();
    const id = filters.entityId || filters.id || '';
    const out = [];
    const pushFrom = (coll, etype) => {
      for (const row of (d[coll] || [])) {
        if (id && row.id !== id && row.saleNo !== id && row.deliveryNo !== id && row.invNo !== id) continue;
        if (type && etype !== type) continue;
        for (const a of (row.attachments || [])) {
          out.push({ ...a, entityType: etype, entityId: row.id, entityLabel: row.saleNo || row.deliveryNo || row.invNo || row.name || row.id });
        }
      }
    };
    pushFrom('sales', 'sale');
    pushFrom('calls', 'call');
    pushFrom('deliveries', 'delivery');
    pushFrom('production', 'production');
    pushFrom('productionOrders', 'production');
    pushFrom('invoices', 'invoice');
    pushFrom('employees', 'employee');
    pushFrom('trials', 'trial');
    pushFrom('rndTrials', 'trial');
    pushFrom('leads', 'lead');
    for (const a of (d.erpAttachments || [])) {
      if (type && a.entityType !== type) continue;
      if (id && a.entityId !== id) continue;
      if (!out.find(x => x.id === a.id || x.key === a.key)) out.push(a);
    }
    out.sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')));
    return { attachments: out.slice(0, 500), count: out.length };
  },

  autoLinkEmployeesToUsers(user) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.HR, ROLES.DEV, ROLES.MANAGER);
    const d = data();
    d.employees = Array.isArray(d.employees) ? d.employees : [];
    d.users = Array.isArray(d.users) ? d.users : [];
    let linked = 0;
    for (const emp of d.employees) {
      const email = String(emp.email || emp.companyEmail || '').toLowerCase().trim();
      if (!email) continue;
      const usr = d.users.find(x => String(x.email || '').toLowerCase().trim() === email);
      if (!usr) continue;
      if (emp.userId !== usr.id || usr.employeeId !== emp.id) {
        emp.userId = usr.id;
        usr.employeeId = emp.id;
        linked += 1;
      }
    }
    for (const usr of d.users) {
      if (usr.employeeId) continue;
      const email = String(usr.email || '').toLowerCase().trim();
      if (!email) continue;
      const emp = d.employees.find(e => String(e.email || e.companyEmail || '').toLowerCase().trim() === email);
      if (emp) {
        usr.employeeId = emp.id;
        emp.userId = usr.id;
        linked += 1;
      }
    }
    log(u, 'Auto-link HR employees to users', 'HR', linked + ' links');
    return { success: true, linked };
  },

  getIntegrationsStatus(user) {
    reqRole(user, ROLES.ADMIN, ROLES.DEV, ROLES.MANAGER);
    let r2 = { ok: false };
    try {
      const r2c = require('../server/r2Client');
      r2 = { ok: r2c.configured(), bucket: process.env.R2_BUCKET_NAME || 'farmtrack-erp' };
    } catch (e) { r2 = { ok: false, error: e.message }; }
    let d1s = { ok: false };
    try {
      const d1 = require('../server/d1Client');
      d1s = { ok: d1.d1Configured && d1.d1Configured(), databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID || '' };
    } catch (e) { d1s = { ok: false, error: e.message }; }
    return { r2, d1: d1s, resend: { ok: Boolean(process.env.RESEND_API_KEY) }, timestamp: new Date().toISOString() };
  },
`;

function patchRpc() {
  if (!fs.existsSync(rpcPath)) {
    console.warn('[camera-r2-hr] no api/rpc.js');
    return;
  }
  let rpc = fs.readFileSync(rpcPath, 'utf8');
  if (rpc.includes('uploadEntityAttachment')) {
    console.log('[camera-r2-hr] RPC already has uploadEntityAttachment');
  } else {
    if (rpc.includes('async uploadDeliveryAttachment')) {
      rpc = rpc.replace('async uploadDeliveryAttachment', RPC_BLOCK + '\n  async uploadDeliveryAttachment');
    } else if (rpc.includes('const SYNC_AFTER_RPC')) {
      rpc = rpc.replace('const SYNC_AFTER_RPC', RPC_BLOCK + '\nconst SYNC_AFTER_RPC');
    } else {
      console.warn('[camera-r2-hr] could not find insert point for RPC');
    }
    console.log('[camera-r2-hr] RPC uploadEntityAttachment injected');
  }

  if (!rpc.includes('uploadEntityAttachment:')) {
    rpc = rpc.replace(
      'const SYNC_AFTER_RPC = {',
      `const SYNC_AFTER_RPC = {\n  uploadEntityAttachment: ['Sales', 'CRM', 'Delivery', 'Manufacturing', 'Invoices', 'Employees', 'Reports', 'Dashboard', 'Activity'],\n  listEntityAttachments: ['Reports', 'Sales', 'CRM', 'Delivery', 'Manufacturing'],\n  autoLinkEmployeesToUsers: ['Employees', 'Settings', 'Activity'],\n  getIntegrationsStatus: ['Settings'],`
    );
    console.log('[camera-r2-hr] SYNC_AFTER updated');
  }

  fs.writeFileSync(rpcPath, rpc);
  console.log('[camera-r2-hr] rpc written', rpc.length);
}

const UI_COMPONENT = `
function EntityCameraAttach({ user, entityType, entityId, attachments = [], onChanged, label }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const cameraRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const uploadFile = async (file, kind) => {
    if (!file || !entityId) return;
    setBusy(true); setErr('');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await rpc('uploadEntityAttachment', [user, entityType, entityId, {
        base64, fileName: file.name, contentType: file.type || 'application/octet-stream', kind: kind || (file.type && file.type.startsWith('image/') ? 'photo' : 'document')
      }]);
      if (onChanged) onChanged();
    } catch (e) {
      setErr((e && e.message) || String(e));
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  return (
    <div className="entity-camera-attach" style={{ marginTop: 8, padding: 10, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fafafa' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label || 'Photos & documents (R2)'}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="mini-action" disabled={busy || !entityId} onClick={() => cameraRef.current && cameraRef.current.click()}>
          {busy ? 'Uploading…' : '📷 Camera'}
        </button>
        <button type="button" className="mini-action" disabled={busy || !entityId} onClick={() => fileRef.current && fileRef.current.click()}>
          📎 File
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => uploadFile(e.target.files && e.target.files[0], 'photo')} />
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={e => uploadFile(e.target.files && e.target.files[0], 'document')} />
      </div>
      {!entityId && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#b45309' }}>Save the record first, then attach photos.</p>}
      {err && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#b91c1c' }}>{err}</p>}
      {(attachments || []).length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
          {(attachments || []).map(att => (
            <li key={att.id || att.key}>
              <a href={att.url || ('/api/r2-file?key=' + encodeURIComponent(att.key || ''))} target="_blank" rel="noreferrer">
                {att.kind === 'photo' ? '🖼️' : '📄'} {att.fileName || att.key}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
`;

function patchMain() {
  if (!fs.existsSync(mainPath)) {
    console.warn('[camera-r2-hr] no src/main.jsx — UI inject skipped (RPC still works)');
    return;
  }
  let m = fs.readFileSync(mainPath, 'utf8');
  if (!m.includes('function EntityCameraAttach')) {
    if (m.includes('function DeliveryAttachments')) {
      m = m.replace('function DeliveryAttachments', UI_COMPONENT + '\nfunction DeliveryAttachments');
    } else if (m.includes('function DeliveryWorkspace')) {
      m = m.replace('function DeliveryWorkspace', UI_COMPONENT + '\nfunction DeliveryWorkspace');
    } else {
      const idx = m.lastIndexOf('createRoot');
      if (idx > 0) m = m.slice(0, idx) + UI_COMPONENT + '\n' + m.slice(idx);
    }
    console.log('[camera-r2-hr] EntityCameraAttach component added');
  }
  fs.writeFileSync(mainPath, m);
  console.log('[camera-r2-hr] main.jsx touched');
}

patchRpc();
patchMain();
console.log('[camera-r2-hr] done');
