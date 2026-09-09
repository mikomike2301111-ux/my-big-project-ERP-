#!/usr/bin/env node
/**
 * apply-crm-delivery-invoice-products-v1
 *
 * Fix: CRM delivery confirmation was showing the SAME products on every row
 * because empty invoiceId/saleId matched the first invoice (e.g. INV-FTC-0015).
 *
 * Rules:
 * 1) Only match invoice / invoiceItems when IDs are non-empty strings
 * 2) Prefer deliveryItems for this deliveryId
 * 3) Else invoiceItems for this delivery.invoiceId / invNo
 * 4) Else saleItems for this saleId
 * 5) Never inherit products from an unrelated invoice
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MARK = '/* crm-delivery-invoice-products-v1 */';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[crm-del-prod] SYNTAX', (r.stderr || r.stdout || '').slice(0, 900));
    process.exit(1);
  }
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[crm-del-prod] rpc PLACEHOLDER');
  process.exit(1);
}

if (!rpc.includes(MARK)) {
  // ---- Strict product resolver (shared) ----
  const helper = `
${MARK}
function _nz(v) {
  const s = String(v == null ? '' : v).trim();
  return s && s !== 'undefined' && s !== 'null' ? s : '';
}
function resolveInvoiceProductsForDelivery(row, d0) {
  try {
    d0 = d0 || (typeof data === 'function' ? data() : {}) || {};
    const alive = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && x.isDeleted !== 'Yes' && x.isDeleted !== true);
    const invId = _nz(row.invoiceId);
    const invNo = _nz(row.invoiceNo || row.invNo);
    const saleId = _nz(row.saleId);
    const saleNo = _nz(row.saleNo);
    const delId = _nz(row.deliveryId || row.id);
    const customerName = _nz(row.customerName || row.name).toLowerCase();

    // 1) deliveryItems for THIS delivery only
    let items = delId
      ? alive(d0.deliveryItems).filter((it) => _nz(it.deliveryId) === delId)
      : [];

    // 2) Resolve the correct invoice — never match on empty ids
    let invoice = null;
    if (invId) invoice = alive(d0.invoices).find((inv) => _nz(inv.id) === invId) || null;
    if (!invoice && invNo) {
      invoice =
        alive(d0.invoices).find((inv) => _nz(inv.invNo) === invNo || _nz(inv.invoiceNo) === invNo) || null;
    }
    if (!invoice && saleId) {
      invoice = alive(d0.invoices).find((inv) => _nz(inv.saleId) === saleId) || null;
    }
    // Optional customer guard when using saleNo
    if (!invoice && saleNo) {
      const cands = alive(d0.invoices).filter((inv) => _nz(inv.saleNo) === saleNo);
      if (cands.length === 1) invoice = cands[0];
      else if (cands.length > 1 && customerName) {
        invoice =
          cands.find((inv) => _nz(inv.customerName).toLowerCase() === customerName) || null;
      }
    }

    // 3) invoiceItems for that invoice only
    if (!items.length && invoice && _nz(invoice.id)) {
      items = alive(d0.invoiceItems).filter((it) => _nz(it.invoiceId) === _nz(invoice.id));
    }
    if (!items.length && invId) {
      items = alive(d0.invoiceItems).filter((it) => _nz(it.invoiceId) === invId);
    }
    // also allow invNo stored on line items if present
    if (!items.length && invNo) {
      items = alive(d0.invoiceItems).filter(
        (it) => _nz(it.invNo) === invNo || _nz(it.invoiceNo) === invNo
      );
    }

    // 4) saleItems for this sale only
    if (!items.length && saleId) {
      items = alive(d0.saleItems).filter((it) => _nz(it.saleId) === saleId);
    }

    // 5) embedded lines on the invoice object
    if (!items.length && invoice) {
      if (Array.isArray(invoice.items) && invoice.items.length) items = invoice.items;
      else if (Array.isArray(invoice.lines) && invoice.lines.length) items = invoice.lines;
    }

    // 6) already on the row (trusted only if non-empty)
    if (!items.length && Array.isArray(row.items) && row.items.length) items = row.items;

    items = (items || []).filter(Boolean).map((it) => ({
      productName: it.productName || it.description || it.name || it.product || 'Item',
      quantity: Number(it.quantity != null ? it.quantity : it.qty != null ? it.qty : 1) || 0,
      unit: it.unit || '',
      sku: it.sku || '',
      unitPrice: it.unitPrice != null ? Number(it.unitPrice) : undefined
    }));

    // Aggregate duplicate product names for a clean summary
    const byName = new Map();
    for (const it of items) {
      const key = String(it.productName || 'Item').trim().toLowerCase();
      const prev = byName.get(key);
      if (prev) prev.quantity += Number(it.quantity || 0);
      else byName.set(key, { productName: it.productName || 'Item', quantity: Number(it.quantity || 0), unit: it.unit || '', sku: it.sku || '' });
    }
    const aggregated = Array.from(byName.values());
    const productCount = aggregated.length;
    const totalQty = aggregated.reduce((s, i) => s + Number(i.quantity || 0), 0);
    const productsSummary = aggregated
      .map((i) => i.productName + (i.quantity ? ' x' + i.quantity : ''))
      .join(', ');

    const dest = [
      row.destination,
      row.shipTo,
      row.deliveryAddress,
      invoice && invoice.shipTo,
      invoice && invoice.deliveryAddress,
      invoice && invoice.billingAddress
    ]
      .map((x) => _nz(x))
      .find(Boolean) || row.destination || 'Destination not set';

    return Object.assign({}, row, {
      destination: dest,
      invoiceId: invId || (invoice && invoice.id) || row.invoiceId || '',
      invoiceNo: invNo || (invoice && (invoice.invNo || invoice.invoiceNo)) || row.invoiceNo || '',
      customerName: row.customerName || (invoice && invoice.customerName) || row.name || 'Customer',
      items: aggregated.length ? aggregated : items,
      productCount,
      totalQty,
      productsSummary: productsSummary || '',
      productSummary: productsSummary || ''
    });
  } catch (e) {
    return row;
  }
}
function enrichDeliveriesListStrict(list, d0) {
  return (Array.isArray(list) ? list : []).map((r) => resolveInvoiceProductsForDelivery(r, d0));
}
`;

  // Inject helper before invokeRpc (outside api object)
  if (rpc.includes('async function invokeRpc')) {
    rpc = rpc.replace('async function invokeRpc', helper + '\nasync function invokeRpc');
    console.log('[crm-del-prod] helper before invokeRpc');
  } else {
    rpc = helper + '\n' + rpc;
    console.log('[crm-del-prod] helper prepend');
  }

  // Replace old loose enrichDeliveryRow body usages on delivery lists with strict resolver
  // Prefer post-process on CRM / Delivery / Sales reads
  if (rpc.includes('return __finR;') && !rpc.includes('crm-delivery-invoice-products-v1-hook')) {
    rpc = rpc.replace(
      'return __finR;',
      `/* crm-delivery-invoice-products-v1-hook */
    if ((fn === 'getCRMWorkspaceData' || fn === 'getDeliveryWorkspaceData' || fn === 'getSalesWorkspaceData') && __finR && typeof __finR === 'object') {
      try {
        const d0 = (typeof data === 'function' ? data() : {}) || {};
        if (Array.isArray(__finR.deliveries)) {
          __finR.deliveries = enrichDeliveriesListStrict(__finR.deliveries, d0);
        }
        if (Array.isArray(__finR.rows)) {
          __finR.rows = enrichDeliveriesListStrict(__finR.rows, d0);
        }
      } catch (e) { console.error('[crm-del-prod]', e && e.message); }
    }
    return __finR;`
    );
    console.log('[crm-del-prod] hooked __finR');
  }

  // Patch getCRMWorkspaceData deliveryReports items resolution to use invoiceItems strictly
  const OLD_CRM_ITEMS =
    "const items = (d.deliveryItems || []).filter(item => item.deliveryId === delivery.id);\n      const resolvedItems = (items.length ? items : (d.saleItems || []).filter(item => item.saleId === delivery.saleId || item.saleId === sale.id || item.invoiceId === delivery.invoiceId))";

  const NEW_CRM_ITEMS =
    `const items = (d.deliveryItems || []).filter(item => item.deliveryId && item.deliveryId === delivery.id);
      /* crm-delivery-invoice-products-v1 */
      let resolvedItems = items;
      if (!resolvedItems.length && delivery.invoiceId) {
        resolvedItems = (d.invoiceItems || []).filter(item => item.invoiceId && item.invoiceId === delivery.invoiceId);
      }
      if (!resolvedItems.length) {
        const inv = (d.invoices || []).find(row => (delivery.invoiceId && row.id === delivery.invoiceId) || (delivery.invoiceNo && (row.invNo === delivery.invoiceNo || row.invoiceNo === delivery.invoiceNo)));
        if (inv && inv.id) resolvedItems = (d.invoiceItems || []).filter(item => item.invoiceId === inv.id);
      }
      if (!resolvedItems.length && delivery.saleId) {
        resolvedItems = (d.saleItems || []).filter(item => item.saleId && item.saleId === delivery.saleId);
      }
      if (!resolvedItems.length && sale && sale.id) {
        resolvedItems = (d.saleItems || []).filter(item => item.saleId && item.saleId === sale.id);
      }
      resolvedItems = (resolvedItems || [])`;

  if (rpc.includes(OLD_CRM_ITEMS)) {
    rpc = rpc.replace(OLD_CRM_ITEMS, NEW_CRM_ITEMS);
    console.log('[crm-del-prod] patched CRM deliveryReports items');
  } else {
    // softer match
    const soft =
      'const items = (d.deliveryItems || []).filter(item => item.deliveryId === delivery.id);';
    if (rpc.includes(soft) && rpc.includes('deliveryReports')) {
      rpc = rpc.replace(
        soft,
        soft +
          `\n      /* crm-delivery-invoice-products-v1-soft */\n      // invoiceItems attached later via enrichDeliveriesListStrict`
      );
      console.log('[crm-del-prod] soft CRM mark');
    } else {
      console.warn('[crm-del-prod] CRM items block not exact-matched');
    }
  }

  // Also patch getDeliveryWorkspaceData loose saleItems filter that uses empty invoiceId
  // Replace common loose pattern if present
  rpc = rpc.replace(
    /\(d\.saleItems \|\| \[\]\)\.filter\(item => item\.saleId === delivery\.saleId \|\| \(sale && item\.saleId === sale\.id\) \|\| item\.invoiceId === delivery\.invoiceId\)/g,
    `(d.saleItems || []).filter(item => (delivery.saleId && item.saleId === delivery.saleId) || (sale && sale.id && item.saleId === sale.id) || (delivery.invoiceId && item.invoiceId === delivery.invoiceId))`
  );
}

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[crm-del-prod] done', rpc.length);
