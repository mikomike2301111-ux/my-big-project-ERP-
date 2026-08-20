/**
 * Idempotent: inject R2 attachment RPCs + Delivery proof UI.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const rpcPath = path.join(root, 'api', 'rpc.js');
const mainPath = path.join(root, 'src', 'main.jsx');

const RPC_SNIPPET = `
  async uploadDeliveryAttachment(user, deliveryId, payload = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.DELIVERY, ROLES.SALES, ROLES.WAREHOUSE, ROLES.EXECUTIVE, ROLES.DEV);
    const d = data();
    d.deliveries = Array.isArray(d.deliveries) ? d.deliveries : [];
    const delivery = d.deliveries.find(row => row.id === deliveryId || row.deliveryNo === deliveryId);
    if (!delivery) throw new Error('Delivery not found. Open the delivery and try again.');
    const base64 = String(payload.base64 || payload.content || '').replace(/^data:[^;]+;base64,/, '');
    if (!base64) throw new Error('No file data');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 12 * 1024 * 1024) throw new Error('File too large (max 12 MB)');
    const kind = clean(payload.kind) || (String(payload.contentType || '').startsWith('image/') ? 'photo' : 'document');
    const safeName = clean(payload.fileName || payload.name || ('file-' + Date.now())).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
    const contentType = clean(payload.contentType) || 'application/octet-stream';
    const key = 'deliveries/' + delivery.id + '/' + Date.now() + '-' + kind + '-' + safeName;
    const r2 = require('../server/r2Client');
    if (!r2.configured()) throw new Error('Cloudflare R2 is not configured on the server');
    const uploaded = await r2.putObject({ key, body: buffer, contentType });
    delivery.attachments = Array.isArray(delivery.attachments) ? delivery.attachments : [];
    const meta = {
      id: gid(), key: uploaded.key, url: uploaded.url, fileName: safeName, contentType,
      size: uploaded.size, kind, note: clean(payload.note), uploadedBy: u.name,
      uploadedAt: new Date().toISOString(), storage: 'r2',
    };
    delivery.attachments.unshift(meta);
    delivery.updatedAt = new Date().toISOString();
    delivery.noteHistory = Array.isArray(delivery.noteHistory) ? delivery.noteHistory : [];
    delivery.noteHistory.unshift({ at: new Date().toISOString(), by: u.name, text: 'Attached ' + kind + ': ' + safeName });
    log(u, 'Upload Delivery Attachment', 'Delivery', (delivery.deliveryNo || delivery.id) + ' · ' + safeName);
    return { success: true, attachment: meta, deliveryId: delivery.id };
  },

  async uploadPurchaseOrderAttachment(user, poId, payload = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PROCUREMENT, ROLES.EXECUTIVE, ROLES.DEV);
    const d = data();
    d.purchaseOrders = Array.isArray(d.purchaseOrders) ? d.purchaseOrders : [];
    const po = d.purchaseOrders.find(p => p.id === poId || p.poNo === poId);
    if (!po) throw new Error('Purchase order not found');
    const base64 = String(payload.base64 || payload.content || '').replace(/^data:[^;]+;base64,/, '');
    if (!base64) throw new Error('No file data');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 12 * 1024 * 1024) throw new Error('File too large (max 12 MB)');
    const kind = clean(payload.kind) || (String(payload.contentType || '').startsWith('image/') ? 'photo' : 'document');
    const safeName = clean(payload.fileName || payload.name || ('file-' + Date.now())).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
    const contentType = clean(payload.contentType) || 'application/octet-stream';
    const key = 'purchase-orders/' + po.id + '/' + Date.now() + '-' + kind + '-' + safeName;
    const r2 = require('../server/r2Client');
    if (!r2.configured()) throw new Error('Cloudflare R2 is not configured on the server');
    const uploaded = await r2.putObject({ key, body: buffer, contentType });
    po.attachments = Array.isArray(po.attachments) ? po.attachments : [];
    const meta = {
      id: gid(), key: uploaded.key, url: uploaded.url, fileName: safeName, contentType,
      size: uploaded.size, kind, note: clean(payload.note), uploadedBy: u.name,
      uploadedAt: new Date().toISOString(), storage: 'r2',
    };
    po.attachments.unshift(meta);
    po.updatedAt = new Date().toISOString();
    log(u, 'Upload PO Attachment', 'Procurement', (po.poNo || po.id) + ' · ' + safeName);
    return { success: true, attachment: meta, poId: po.id };
  },

  async storePurchaseOrderPdfToR2(user, poId) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PROCUREMENT, ROLES.EXECUTIVE, ROLES.DEV);
    const d = data();
    const po = (d.purchaseOrders || []).find(p => p.id === poId || p.poNo === poId);
    if (!po) throw new Error('Purchase order not found');
    const items = (d.purchaseOrderItems || []).filter(i => i.poId === po.id);
    const supplier = (d.suppliers || []).find(s => s.id === po.supplierId || s.name === po.supplierName) || {};
    const { purchaseOrderPdfBuffer } = require('../server/purchaseOrderPdf');
    const buffer = await purchaseOrderPdfBuffer({ po, items, supplier, settings: d.settings || {} });
    const r2 = require('../server/r2Client');
    if (!r2.configured()) throw new Error('Cloudflare R2 is not configured on the server');
    const fileName = 'PO-' + String(po.poNo || po.id).replace(/[^a-zA-Z0-9._-]+/g, '_') + '.pdf';
    const key = 'purchase-orders/' + po.id + '/pdf/' + fileName;
    const uploaded = await r2.putObject({ key, body: buffer, contentType: 'application/pdf' });
    po.attachments = Array.isArray(po.attachments) ? po.attachments : [];
    const meta = {
      id: gid(), key: uploaded.key, url: uploaded.url, fileName, contentType: 'application/pdf',
      size: uploaded.size, kind: 'po-pdf', uploadedBy: u.name, uploadedAt: new Date().toISOString(), storage: 'r2',
    };
    po.attachments = [meta, ...po.attachments.filter(a => a.kind !== 'po-pdf')];
    po.pdfR2Key = key;
    po.pdfUrl = uploaded.url;
    po.updatedAt = new Date().toISOString();
    log(u, 'Store PO PDF to R2', 'Procurement', po.poNo || po.id);
    return { success: true, attachment: meta, base64: buffer.toString('base64'), fileName };
  },
`;

if (fs.existsSync(rpcPath)) {
  let rpc = fs.readFileSync(rpcPath, 'utf8');
  if (!rpc.includes('uploadDeliveryAttachment')) {
    if (rpc.includes('async emailTaxInvoice')) {
      rpc = rpc.replace('  async emailTaxInvoice', RPC_SNIPPET + '\n  async emailTaxInvoice');
      fs.writeFileSync(rpcPath, rpc);
      console.log('[r2] RPC methods injected');
    } else {
      console.warn('[r2] emailTaxInvoice not found — RPC inject skipped');
    }
  } else {
    console.log('[r2] RPC already present');
  }
}

if (fs.existsSync(mainPath)) {
  let m = fs.readFileSync(mainPath, 'utf8');
  if (!m.includes('function DeliveryAttachments')) {
    const helper = `
function DeliveryAttachments({ user, deliveryId, attachments = [], onChanged }) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  async function uploadFile(file, kind) {
    if (!file || !deliveryId) return;
    setBusy(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await rpc('uploadDeliveryAttachment', [user, deliveryId, {
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        base64,
        kind: kind || (file.type && file.type.startsWith('image/') ? 'photo' : 'document'),
      }]);
      onChanged?.();
    } catch (err) {
      alert(err.message || 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  }
  return (
    <div className="delivery-attachments" style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="mini-action" disabled={busy || !deliveryId} onClick={() => cameraRef.current?.click()}>
          {busy ? 'Uploading…' : '📷 Take photo'}
        </button>
        <button type="button" className="mini-action" disabled={busy || !deliveryId} onClick={() => fileRef.current?.click()}>
          📎 Attach document
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => uploadFile(e.target.files?.[0], 'photo')} />
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={e => uploadFile(e.target.files?.[0], 'document')} />
      </div>
      {(attachments || []).length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
          {attachments.map(att => (
            <li key={att.id || att.key}>
              <a href={att.url || ('/api/r2-file?key=' + encodeURIComponent(att.key))} target="_blank" rel="noreferrer">
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
    if (m.includes('function DeliveryWorkspace')) {
      m = m.replace('function DeliveryWorkspace', helper + '\nfunction DeliveryWorkspace');
    }
  }
  if (!m.includes('Proof of delivery')) {
    const marker = 'Panel title="Notes">';
    const pos = m.indexOf(marker);
    if (pos > 0) {
      const endPanel = m.indexOf('</Panel>', pos);
      if (endPanel > 0) {
        const inject = `
            <Panel title="Proof of delivery" action="Photo · Document · R2">
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#667085' }}>Take a picture on site or attach a signed document. Files are stored on Cloudflare R2.</p>
              <DeliveryAttachments user={user} deliveryId={selected.deliveryId || selected.id} attachments={selected.attachments || []} onChanged={() => { refresh(); }} />
            </Panel>`;
        m = m.slice(0, endPanel + 8) + inject + m.slice(endPanel + 8);
      }
    }
  }
  m = m.replace(
    'Confirm products from invoices and sales orders, add notes, and keep CRM and Sales updated.',
    'Confirm deliveries, take proof photos or attach documents (stored on Cloudflare R2), and keep CRM and Sales updated.'
  );
  fs.writeFileSync(mainPath, m);
  console.log('[r2] UI wiring done');
}
