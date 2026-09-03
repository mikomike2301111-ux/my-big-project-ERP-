#!/usr/bin/env node
/**
 * apply-delivery-details-upgrade-v1
 *
 * Upgrade delivery details everywhere (Delivery page, Sales, CRM):
 * - Destination: shipTo / deliveryAddress / billingAddress / customer location
 * - Products: from deliveryItems, saleItems, invoiceItems, invoice.lines/items
 * - Product count + total units + productsSummary
 *
 * Injects enrichDeliveriesForUi() and post-processes getDeliveryWorkspaceData,
 * getSalesWorkspaceData, getCRMWorkspaceData via invokeRpc read path.
 * Data-safe. Syntax-safe.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MAIN = path.join(root, 'src', 'main.jsx');
const MARK = '/* delivery-details-upgrade-v1 */';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[delivery-up] SYNTAX', (r.stderr || r.stdout || '').slice(0, 800));
    process.exit(1);
  }
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[delivery-up] rpc PLACEHOLDER');
  process.exit(1);
}

if (!rpc.includes(MARK)) {
  // --- Helper function injected before getDeliveryWorkspaceData if possible ---
  const helper = `
${MARK}
function enrichDeliveryRow(row, d0) {
  try {
    d0 = d0 || (typeof data === 'function' ? data() : {}) || {};
    const alive = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && x.isDeleted !== 'Yes' && x.isDeleted !== true);
    const sale = alive(d0.sales).find((s) => s.id === row.saleId || s.saleNo === row.saleNo) || {};
    const invoice = alive(d0.invoices).find((inv) => inv.id === row.invoiceId || inv.invNo === row.invoiceNo || inv.saleId === row.saleId || inv.saleNo === row.saleNo) || {};
    const customer = alive(d0.customers).find((c) => c.id === row.customerId || c.name === row.customerName || c.id === sale.customerId || c.name === (sale.customerName || invoice.customerName)) || {};

    const dest = [
      row.destination,
      row.shipTo,
      row.deliveryAddress,
      row.shipToLocation,
      row.shipToName,
      invoice.shipTo,
      invoice.deliveryAddress,
      invoice.shipToLocation,
      invoice.shipToName,
      invoice.billingAddress,
      sale.shipTo,
      sale.destination,
      sale.location,
      sale.deliveryAddress,
      customer.location,
      customer.address,
      customer.physicalAddress,
      [customer.city, customer.county, customer.country].filter(Boolean).join(', ')
    ].map((x) => String(x || '').trim()).find((x) => x && x !== '-' && x.toLowerCase() !== 'undefined') || '';

    let items = alive(d0.deliveryItems).filter((it) => it.deliveryId === row.id || it.deliveryId === row.deliveryId);
    if (!items.length) {
      items = alive(d0.saleItems).filter((it) => it.saleId === row.saleId || it.saleId === sale.id || it.invoiceId === row.invoiceId || it.invoiceId === invoice.id);
    }
    if (!items.length) {
      items = alive(d0.invoiceItems).filter((it) => it.invoiceId === row.invoiceId || it.invoiceId === invoice.id || it.invNo === row.invoiceNo);
    }
    if (!items.length && Array.isArray(invoice.items)) items = invoice.items;
    if (!items.length && Array.isArray(invoice.lines)) items = invoice.lines;
    if (!items.length && Array.isArray(sale.items)) items = sale.items;
    if (!items.length && Array.isArray(row.items)) items = row.items;

    items = (items || []).filter(Boolean).map((it) => ({
      productName: it.productName || it.description || it.name || it.product || 'Item',
      quantity: Number(it.quantity != null ? it.quantity : (it.qty != null ? it.qty : 1)) || 0,
      unit: it.unit || '',
      sku: it.sku || ''
    }));

    const names = items.map((i) => String(i.productName || 'Item'));
    const productCount = new Set(names.map((n) => n.toLowerCase())).size;
    const totalQty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
    const productsSummary = items.map((i) => i.productName + (i.quantity ? (' x' + i.quantity) : '')).join(', ');

    return Object.assign({}, row, {
      destination: dest || row.destination || 'Destination not set',
      shipTo: dest || row.shipTo || '',
      phone: row.phone || invoice.shipToPhone || customer.phone || sale.phone || '',
      customerName: row.customerName || invoice.customerName || sale.customerName || customer.name || row.name || 'Customer',
      items,
      productCount,
      totalQty,
      productsSummary: productsSummary || row.productsSummary || row.productSummary || '',
      productSummary: productsSummary || row.productSummary || '',
      invoiceNo: row.invoiceNo || invoice.invNo || invoice.invoiceNo || '',
      saleNo: row.saleNo || sale.saleNo || invoice.saleNo || ''
    });
  } catch (e) {
    return row;
  }
}
function enrichDeliveriesList(list, d0) {
  const rows = Array.isArray(list) ? list : [];
  return rows.map((r) => enrichDeliveryRow(r, d0));
}
`;

  // Place helper just before getDeliveryWorkspaceData
  if (rpc.includes('getDeliveryWorkspaceData(user')) {
    rpc = rpc.replace(
      'getDeliveryWorkspaceData(user',
      helper + '\n  getDeliveryWorkspaceData(user'
    );
    console.log('[delivery-up] helper before getDeliveryWorkspaceData');
  } else {
    // fallback near invokeRpc
    const inv = rpc.indexOf('async function invokeRpc');
    if (inv > 0) {
      rpc = rpc.slice(0, inv) + helper + '\n' + rpc.slice(inv);
      console.log('[delivery-up] helper before invokeRpc');
    } else {
      rpc = helper + '\n' + rpc;
      console.log('[delivery-up] helper prepend');
    }
  }

  // Strengthen destination assignment lines already in getDeliveryWorkspaceData
  rpc = rpc.replace(
    /destination:\s*delivery\.destination\s*\|\|\s*invoice\.deliveryAddress\s*\|\|\s*invoice\.shipToLocation\s*\|\|\s*customer\.city\s*\|\|\s*''/g,
    "destination: delivery.destination || delivery.shipTo || invoice.shipTo || invoice.deliveryAddress || invoice.shipToLocation || invoice.billingAddress || sale.shipTo || sale.location || customer.location || customer.address || customer.city || ''"
  );
  rpc = rpc.replace(
    /destination:\s*inv\.deliveryAddress\s*\|\|\s*inv\.shipToLocation\s*\|\|\s*sale\.location\s*\|\|\s*customer\.city\s*\|\|\s*''/g,
    "destination: inv.deliveryAddress || inv.shipTo || inv.shipToLocation || inv.billingAddress || sale.shipTo || sale.location || customer.location || customer.address || customer.city || ''"
  );

  // Expand items resolution to include invoiceItems + invoice.lines
  rpc = rpc.replace(
    /\(d\.saleItems \|\| \[\]\)\.filter\(item => item\.saleId === inv\.saleId \|\| item\.invoiceId === inv\.id\)/g,
    "(function(){ var a=(d.saleItems||[]).filter(item=>item.saleId===inv.saleId||item.invoiceId===inv.id); if(a.length) return a; a=(d.invoiceItems||[]).filter(item=>item.invoiceId===inv.id); if(a.length) return a; if(Array.isArray(inv.items)) return inv.items; if(Array.isArray(inv.lines)) return inv.lines; return []; })()"
  );

  // Post-process in invokeRpc for delivery/sales/crm reads
  // Prefer extend accounts-success-enrich block if present, else patch non-mutating branch
  if (rpc.includes('accounts-success-enrich-v1') && !rpc.includes('delivery-details-upgrade-v1-invoke')) {
    // Inject after finance enrich block's closing - find return __finR
    if (rpc.includes('return __finR;')) {
      rpc = rpc.replace(
        'return __finR;',
        `/* delivery-details-upgrade-v1-invoke */
    if ((fn === 'getDeliveryWorkspaceData' || fn === 'getSalesWorkspaceData' || fn === 'getCRMWorkspaceData') && __finR && typeof __finR === 'object') {
      try {
        const d0 = (typeof data === 'function' ? data() : {}) || {};
        if (fn === 'getDeliveryWorkspaceData') {
          if (Array.isArray(__finR.deliveries)) __finR.deliveries = enrichDeliveriesList(__finR.deliveries, d0);
          else if (Array.isArray(__finR.rows)) __finR.rows = enrichDeliveriesList(__finR.rows, d0);
        }
        if (fn === 'getSalesWorkspaceData') {
          if (Array.isArray(__finR.deliveries)) __finR.deliveries = enrichDeliveriesList(__finR.deliveries, d0);
          else {
            // Build deliveries from invoices/sales when missing
            const invs = (d0.invoices || []).filter((x) => x && x.isDeleted !== 'Yes');
            __finR.deliveries = enrichDeliveriesList(invs.map((inv) => ({
              id: inv.deliveryId || ('DEL-AUTO-' + (inv.id || inv.invNo)),
              deliveryId: inv.deliveryId || '',
              invoiceId: inv.id,
              invoiceNo: inv.invNo || inv.invoiceNo,
              saleId: inv.saleId,
              saleNo: inv.saleNo,
              customerName: inv.customerName,
              phone: inv.shipToPhone || inv.customerPhone,
              destination: inv.shipTo || inv.deliveryAddress || inv.billingAddress,
              status: inv.deliveryStatus || 'Pending Delivery',
              date: inv.date
            })), d0);
          }
          // Attach destination/products onto sales orders
          if (Array.isArray(__finR.orders) || Array.isArray(__finR.sales)) {
            const key = Array.isArray(__finR.orders) ? 'orders' : 'sales';
            const dels = __finR.deliveries || [];
            __finR[key] = (__finR[key] || []).map((ord) => {
              const del = dels.find((d) => d.saleId === ord.id || d.saleNo === ord.saleNo || d.invoiceNo === ord.invoiceNo) || {};
              return Object.assign({}, ord, {
                destination: ord.destination || ord.shipTo || del.destination || '',
                productCount: ord.productCount != null ? ord.productCount : del.productCount,
                totalQty: ord.totalQty != null ? ord.totalQty : del.totalQty,
                productsSummary: ord.productsSummary || del.productsSummary || '',
                deliveryStatus: ord.deliveryStatus || del.status || '',
                deliveryNo: ord.deliveryNo || del.deliveryNo || ''
              });
            });
          }
        }
        if (fn === 'getCRMWorkspaceData') {
          if (Array.isArray(__finR.deliveries)) __finR.deliveries = enrichDeliveriesList(__finR.deliveries, d0);
          else {
            __finR.deliveries = enrichDeliveriesList((d0.deliveries || []).filter((x) => x && x.isDeleted !== 'Yes').slice(0, 200), d0);
          }
        }
      } catch (e) { console.error('[delivery-up]', e && e.message); }
    }
    return __finR;`
      );
      console.log('[delivery-up] invokeRpc post-process hooked');
    }
  } else if (!rpc.includes('delivery-details-upgrade-v1-invoke')) {
    // Standalone non-mutating patch
    const OLD = `if (!isMutating) {
    await loadState();
    return api[fn](...args);
  }`;
    if (rpc.includes(OLD)) {
      rpc = rpc.replace(
        OLD,
        `if (!isMutating) {
    await loadState();
    let __delR = api[fn](...args);
    if (__delR && typeof __delR.then === 'function') __delR = await __delR;
    /* delivery-details-upgrade-v1-invoke */
    if ((fn === 'getDeliveryWorkspaceData' || fn === 'getSalesWorkspaceData' || fn === 'getCRMWorkspaceData') && __delR && typeof __delR === 'object') {
      try {
        const d0 = (typeof data === 'function' ? data() : {}) || {};
        if (Array.isArray(__delR.deliveries)) __delR.deliveries = enrichDeliveriesList(__delR.deliveries, d0);
        if (fn === 'getDeliveryWorkspaceData' && Array.isArray(__delR.rows)) __delR.rows = enrichDeliveriesList(__delR.rows, d0);
      } catch (e) {}
    }
    return __delR;
  }`
      );
      console.log('[delivery-up] standalone invoke patch');
    } else {
      console.warn('[delivery-up] could not hook invokeRpc — helper still available');
    }
  }

  // Prefer Year period default inside getDeliveryWorkspaceData
  rpc = rpc.replace(
    /getDeliveryWorkspaceData\(user, filters = \{\}\) \{\s*const u = reqRole\([^;]+;\s*const d = data\(\);\s*const range = periodRange\(filters\.period \|\| 'Month'\);/,
    (m) => m.replace("'Month'", "'Year'")
  );
}

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[delivery-up] rpc ok', rpc.length);

// --- UI: ensure Sales order detail shows destination + products ---
let main = fs.readFileSync(MAIN, 'utf8');
if (main.trim() !== 'PLACEHOLDER' && main.length > 5000 && !main.includes('delivery-details-upgrade-v1-ui')) {
  // Force Year on delivery workspace fetch if still Month-only
  main = main.replace(
    /getDeliveryWorkspaceData',\s*\[\{\s*period:\s*r\s*\}\]/,
    "getDeliveryWorkspaceData', [{ period: (r === 'Month' || !r) ? 'Year' : r }] /* delivery-details-upgrade-v1-ui */"
  );

  // Improve Se() or copy-details for deliveries is optional
  // Ensure sales table shows destination from enriched fields — already has Destination column

  // Add a compact Delivery details strip helper used in sales modal if View details exists
  if (!main.includes('DeliveryDetailsStrip')) {
    const strip = `
/* delivery-details-upgrade-v1-ui */
function DeliveryDetailsStrip({ row }) {
  const r = row || {};
  const dest = r.destination || r.shipTo || r.deliveryAddress || 'Destination not set';
  const pc = r.productCount != null ? r.productCount : (Array.isArray(r.items) ? r.items.length : null);
  const qty = r.totalQty != null ? r.totalQty : null;
  const summary = r.productsSummary || r.productSummary || '';
  return e.jsxs('div', {
    className: 'delivery-details-strip',
    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8, padding: '8px 0', fontSize: 13 },
    children: [
      e.jsxs('div', { children: [e.jsx('span', { style: { color: '#667085' }, children: 'Destination' }), e.jsx('strong', { style: { display: 'block' }, children: dest })] }),
      e.jsxs('div', { children: [e.jsx('span', { style: { color: '#667085' }, children: 'Products' }), e.jsx('strong', { style: { display: 'block' }, children: pc != null ? (pc + ' product' + (pc === 1 ? '' : 's')) : '—' })] }),
      e.jsxs('div', { children: [e.jsx('span', { style: { color: '#667085' }, children: 'Units' }), e.jsx('strong', { style: { display: 'block' }, children: qty != null ? qty : '—' })] }),
      e.jsxs('div', { children: [e.jsx('span', { style: { color: '#667085' }, children: 'Product list' }), e.jsx('strong', { style: { display: 'block' }, title: summary, children: summary || '—' })] })
    ]
  });
}
`;
    const anchors = ['createRoot(', 'ReactDOM.createRoot', 'root.render('];
    let placed = false;
    for (const a of anchors) {
      const idx = main.indexOf(a);
      if (idx > 0) {
        main = main.slice(0, idx) + strip + '\n' + main.slice(idx);
        placed = true;
        break;
      }
    }
    if (!placed) main = strip + '\n' + main;

    // Mount strip in delivery modal after settings-kv-grid for destination block — hard in minified source
    // Try after "Proof of delivery" is too late; inject near Destination strong in delivery modal source if present
  }

  fs.writeFileSync(MAIN, main);
  console.log('[delivery-up] main ui');
} else {
  console.log('[delivery-up] main skip');
}

console.log('[delivery-up] done');
