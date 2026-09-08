#!/usr/bin/env node
/**
 * apply-delivery-invoice-products-v1
 *
 * When the accountant creates an invoice (createInvoiceFromEntry),
 * also create a linked delivery + deliveryItems so Delivery/Sales/CRM
 * show the exact products and quantities from that invoice.
 *
 * Also strengthens runtime enrichment: resolve products from invoiceItems
 * by invoiceId / invNo for existing invoices.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MARK = '/* delivery-invoice-products-v1 */';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[del-inv-prod] SYNTAX', (r.stderr || r.stdout || '').slice(0, 900));
    process.exit(1);
  }
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[del-inv-prod] rpc PLACEHOLDER');
  process.exit(1);
}

if (!rpc.includes(MARK)) {
  // 1) After accountant invoice line items are saved, create delivery + deliveryItems
  const NEEDLE =
    'items.forEach(it => { it.invoiceId = id; d.invoiceItems.push(it); });';
  const INSERT =
    NEEDLE +
    `
    ${MARK}
    // Auto-create delivery so Delivery desk shows the same products as the invoice
    try {
      d.deliveries = Array.isArray(d.deliveries) ? d.deliveries : [];
      d.deliveryItems = Array.isArray(d.deliveryItems) ? d.deliveryItems : [];
      const deliveryId = gid();
      const deliveryNo = 'DEL-' + String(Date.now()).slice(-10);
      const productCount = new Set(items.map(i => String(i.productName || 'Item').toLowerCase())).size;
      const totalQty = items.reduce((s, i) => s + num(i.quantity), 0);
      const productsSummary = items.map(i => (i.productName || 'Item') + ' x' + num(i.quantity)).join(', ');
      d.deliveries.unshift({
        id: deliveryId,
        deliveryNo,
        invoiceId: id,
        invoiceNo: invNo,
        saleId: '',
        saleNo: clean(row.orderNumber || row.ordNo || ''),
        customerId: invoice.customerId || '',
        customerName: invoice.customerName || '',
        phone: invoice.customerPhone || '',
        destination: clean(row.shipTo || row.shippingAddress || row.deliveryAddress || row.billingAddress || ''),
        shipTo: clean(row.shipTo || row.shippingAddress || ''),
        deliveryAddress: clean(row.shipTo || row.shippingAddress || row.deliveryAddress || ''),
        method: clean(row.deliveryMethod || 'Company Vehicle'),
        deliveryMethod: clean(row.deliveryMethod || 'Company Vehicle'),
        driver: '',
        vehicle: '',
        status: 'Pending Delivery',
        deliveredConfirmed: false,
        date: invoice.date || today(),
        notes: clean(row.memo || row.notes || ''),
        productCount,
        totalQty,
        productsSummary,
        sourceModule: 'Accounts Invoice',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDeleted: 'No'
      });
      items.forEach(i => {
        d.deliveryItems.push({
          id: gid(),
          deliveryId,
          invoiceId: id,
          productId: i.productId || '',
          productName: i.productName || i.description || 'Item',
          quantity: num(i.quantity),
          unitPrice: num(i.unitPrice),
          total: num(i.total)
        });
      });
    } catch (e) {
      console.error('[del-inv-prod] auto delivery', e && e.message);
    }
`;

  if (rpc.includes(NEEDLE)) {
    // Only first occurrence in createInvoiceFromEntry (not every forEach)
    const idx = rpc.indexOf(NEEDLE);
    // Prefer the one near createInvoiceFromEntry
    const entryIdx = rpc.indexOf('createInvoiceFromEntry(user');
    let target = -1;
    let searchFrom = entryIdx > 0 ? entryIdx : 0;
    while (true) {
      const j = rpc.indexOf(NEEDLE, searchFrom);
      if (j < 0) break;
      target = j;
      break; // first after createInvoiceFromEntry is the right one
    }
    if (target < 0) target = idx;
    rpc = rpc.slice(0, target) + INSERT + rpc.slice(target + NEEDLE.length);
    console.log('[del-inv-prod] createInvoiceFromEntry -> delivery+items');
  } else {
    console.warn('[del-inv-prod] needle for invoiceItems push not found');
  }

  // 2) When updateInvoiceFull replaces items, sync deliveryItems for linked delivery
  const UPD =
    'd.invoiceItems = (d.invoiceItems || []).filter(it => it.invoiceId !== invoice.id);\n      items.forEach(it => d.invoiceItems.push(it));';
  if (rpc.includes(UPD) && !rpc.includes('delivery-invoice-products-v1-sync')) {
    rpc = rpc.replace(
      UPD,
      UPD +
        `
      /* delivery-invoice-products-v1-sync */
      try {
        d.deliveryItems = Array.isArray(d.deliveryItems) ? d.deliveryItems : [];
        d.deliveries = Array.isArray(d.deliveries) ? d.deliveries : [];
        let del = d.deliveries.find(x => x.invoiceId === invoice.id || x.invoiceNo === invoice.invNo);
        if (!del) {
          const deliveryId = gid();
          del = {
            id: deliveryId,
            deliveryNo: 'DEL-' + String(Date.now()).slice(-10),
            invoiceId: invoice.id,
            invoiceNo: invoice.invNo,
            customerId: invoice.customerId || '',
            customerName: invoice.customerName || '',
            phone: invoice.customerPhone || '',
            destination: invoice.shipTo || invoice.billingAddress || '',
            status: 'Pending Delivery',
            date: invoice.date || today(),
            sourceModule: 'Accounts Invoice',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isDeleted: 'No'
          };
          d.deliveries.unshift(del);
        }
        d.deliveryItems = d.deliveryItems.filter(it => it.deliveryId !== del.id && it.invoiceId !== invoice.id);
        items.forEach(i => {
          d.deliveryItems.push({
            id: gid(),
            deliveryId: del.id,
            invoiceId: invoice.id,
            productId: i.productId || '',
            productName: i.productName || i.description || 'Item',
            quantity: num(i.quantity),
            unitPrice: num(i.unitPrice),
            total: num(i.total)
          });
        });
        del.productCount = new Set(items.map(i => String(i.productName || 'Item').toLowerCase())).size;
        del.totalQty = items.reduce((s, i) => s + num(i.quantity), 0);
        del.productsSummary = items.map(i => (i.productName || 'Item') + ' x' + num(i.quantity)).join(', ');
        del.updatedAt = new Date().toISOString();
      } catch (e) { console.error('[del-inv-prod] sync', e && e.message); }
`
    );
    console.log('[del-inv-prod] updateInvoiceFull syncs delivery items');
  }

  // 3) Runtime enrich helper — strengthen product resolution from invoiceItems by invNo
  // Replace or extend enrichDeliveryRow if v2 present; else inject before invokeRpc
  if (rpc.includes('function enrichDeliveryRow') && !rpc.includes('delivery-invoice-products-v1-enrich')) {
    // Patch the items resolution block to also match invNo on invoiceItems
    const OLD_ITEMS =
      'if (!items.length) items = alive(d0.invoiceItems).filter((it) => it.invoiceId === row.invoiceId || it.invoiceId === invoice.id || it.invNo === row.invoiceNo);';
    const NEW_ITEMS =
      `if (!items.length) items = alive(d0.invoiceItems).filter((it) => it.invoiceId === row.invoiceId || it.invoiceId === invoice.id || it.invNo === row.invoiceNo || it.invoiceNo === row.invoiceNo || (invoice.invNo && (it.invNo === invoice.invNo || it.invoiceNo === invoice.invNo))); /* delivery-invoice-products-v1-enrich */`;
    if (rpc.includes(OLD_ITEMS)) {
      rpc = rpc.replace(OLD_ITEMS, NEW_ITEMS);
      console.log('[del-inv-prod] enriched invoiceItems match');
    } else {
      // insert after first saleItems filter line inside enrichDeliveryRow
      const marker =
        'if (!items.length) items = alive(d0.saleItems).filter((it) => it.saleId === row.saleId || it.saleId === sale.id || it.invoiceId === row.invoiceId || it.invoiceId === invoice.id);';
      if (rpc.includes(marker)) {
        rpc = rpc.replace(
          marker,
          marker +
            `\n    if (!items.length) items = alive(d0.invoiceItems).filter((it) => it.invoiceId === row.invoiceId || it.invoiceId === invoice.id || String(it.invNo||'') === String(row.invoiceNo||'') || String(it.invoiceNo||'') === String(row.invoiceNo||'') || (invoice.invNo && (String(it.invNo||'') === String(invoice.invNo) || String(it.invoiceNo||'') === String(invoice.invNo)))); /* delivery-invoice-products-v1-enrich */`
        );
        console.log('[del-inv-prod] added invoiceItems resolve in enrich');
      }
    }
  } else if (!rpc.includes('function enrichDeliveryRow')) {
    // Minimal enrich before invokeRpc
    const helper = `
${MARK}
function enrichDeliveryRow(row, d0) {
  try {
    d0 = d0 || (typeof data === 'function' ? data() : {}) || {};
    const alive = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && x.isDeleted !== 'Yes' && x.isDeleted !== true);
    const invoice = alive(d0.invoices).find((inv) => inv.id === row.invoiceId || inv.invNo === row.invoiceNo || inv.saleId === row.saleId) || {};
    let items = alive(d0.deliveryItems).filter((it) => it.deliveryId === row.id || it.deliveryId === row.deliveryId);
    if (!items.length) items = alive(d0.invoiceItems).filter((it) => it.invoiceId === row.invoiceId || it.invoiceId === invoice.id || String(it.invNo||'') === String(row.invoiceNo||invoice.invNo||'') || String(it.invoiceNo||'') === String(row.invoiceNo||invoice.invNo||''));
    if (!items.length) items = alive(d0.saleItems).filter((it) => it.saleId === row.saleId || it.invoiceId === row.invoiceId || it.invoiceId === invoice.id);
    if (!items.length && Array.isArray(invoice.items)) items = invoice.items;
    if (!items.length && Array.isArray(row.items)) items = row.items;
    items = (items || []).filter(Boolean).map((it) => ({
      productName: it.productName || it.description || it.name || it.product || 'Item',
      quantity: Number(it.quantity != null ? it.quantity : (it.qty != null ? it.qty : 1)) || 0,
      unit: it.unit || '',
      sku: it.sku || ''
    }));
    const productCount = new Set(items.map((i) => String(i.productName || 'Item').toLowerCase())).size;
    const totalQty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
    const productsSummary = items.map((i) => i.productName + (i.quantity ? (' x' + i.quantity) : '')).join(', ');
    const dest = [row.destination, row.shipTo, invoice.shipTo, invoice.billingAddress].map((x) => String(x || '').trim()).find(Boolean) || row.destination || 'Destination not set';
    return Object.assign({}, row, {
      destination: dest,
      items,
      productCount,
      totalQty,
      productsSummary: productsSummary || row.productsSummary || '',
      productSummary: productsSummary || row.productSummary || '',
      invoiceNo: row.invoiceNo || invoice.invNo || invoice.invoiceNo || '',
      customerName: row.customerName || invoice.customerName || row.name || 'Customer'
    });
  } catch (e) { return row; }
}
function enrichDeliveriesList(list, d0) {
  return (Array.isArray(list) ? list : []).map((r) => enrichDeliveryRow(r, d0));
}
`;
    if (rpc.includes('async function invokeRpc')) {
      rpc = rpc.replace('async function invokeRpc', helper + '\nasync function invokeRpc');
    } else {
      rpc = helper + '\n' + rpc;
    }
    console.log('[del-inv-prod] injected enrich helpers');
  }

  // 4) Ensure invoke post-process enriches getDeliveryWorkspaceData deliveries
  if (rpc.includes("fn === 'getDeliveryWorkspaceData'") && rpc.includes('enrichDeliveriesList') && !rpc.includes('delivery-invoice-products-v1-hook')) {
    // already hooked by delivery-details-upgrade — ok
    console.log('[del-inv-prod] delivery enrich hook already present');
  } else if (!rpc.includes('delivery-invoice-products-v1-hook') && rpc.includes('return __finR;')) {
    rpc = rpc.replace(
      'return __finR;',
      `/* delivery-invoice-products-v1-hook */
    if ((fn === 'getDeliveryWorkspaceData' || fn === 'getSalesWorkspaceData' || fn === 'getCRMWorkspaceData') && __finR && typeof __finR === 'object' && typeof enrichDeliveriesList === 'function') {
      try {
        const d0 = (typeof data === 'function' ? data() : {}) || {};
        if (Array.isArray(__finR.deliveries)) __finR.deliveries = enrichDeliveriesList(__finR.deliveries, d0);
        if (Array.isArray(__finR.rows)) __finR.rows = enrichDeliveriesList(__finR.rows, d0);
      } catch (e) {}
    }
    return __finR;`
    );
    console.log('[del-inv-prod] hooked __finR');
  }
}

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[del-inv-prod] done', rpc.length);
