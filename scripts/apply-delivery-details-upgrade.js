#!/usr/bin/env node
/**
 * apply-delivery-details-upgrade-v2
 * Helpers MUST sit outside the api {} object (before invokeRpc).
 * Enriches destination + products + qty for Delivery, Sales, CRM.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MAIN = path.join(root, 'src', 'main.jsx');
const MARK = '/* delivery-details-upgrade-v2 */';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[delivery-up] SYNTAX', (r.stderr || r.stdout || '').slice(0, 900));
    process.exit(1);
  }
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[delivery-up] rpc PLACEHOLDER');
  process.exit(1);
}

// Remove any v1 helper that may have been injected inside the api object
rpc = rpc.replace(/\/\* delivery-details-upgrade-v1 \*\/[\s\S]*?function enrichDeliveriesList\([\s\S]*?\n\}/g, '');

if (!rpc.includes(MARK)) {
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
      row.destination, row.shipTo, row.deliveryAddress, row.shipToLocation, row.shipToName,
      invoice.shipTo, invoice.deliveryAddress, invoice.shipToLocation, invoice.shipToName, invoice.billingAddress,
      sale.shipTo, sale.destination, sale.location, sale.deliveryAddress,
      customer.location, customer.address, customer.physicalAddress,
      [customer.city, customer.county, customer.country].filter(Boolean).join(', ')
    ].map((x) => String(x || '').trim()).find((x) => x && x !== '-' && x.toLowerCase() !== 'undefined') || '';
    let items = alive(d0.deliveryItems).filter((it) => it.deliveryId === row.id || it.deliveryId === row.deliveryId);
    if (!items.length) items = alive(d0.saleItems).filter((it) => it.saleId === row.saleId || it.saleId === sale.id || it.invoiceId === row.invoiceId || it.invoiceId === invoice.id);
    if (!items.length) items = alive(d0.invoiceItems).filter((it) => it.invoiceId === row.invoiceId || it.invoiceId === invoice.id || it.invNo === row.invoiceNo);
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
  return (Array.isArray(list) ? list : []).map((r) => enrichDeliveryRow(r, d0));
}
`;

  // ALWAYS inject before invokeRpc (outside api object)
  if (rpc.includes('async function invokeRpc')) {
    rpc = rpc.replace('async function invokeRpc', helper + '\nasync function invokeRpc');
    console.log('[delivery-up] helper before invokeRpc');
  } else {
    rpc = helper + '\n' + rpc;
    console.log('[delivery-up] helper prepend');
  }

  // Destination field expansions in source mapping
  rpc = rpc.replace(
    /destination:\s*delivery\.destination\s*\|\|\s*invoice\.deliveryAddress\s*\|\|\s*invoice\.shipToLocation\s*\|\|\s*customer\.city\s*\|\|\s*''/g,
    "destination: delivery.destination || delivery.shipTo || invoice.shipTo || invoice.deliveryAddress || invoice.shipToLocation || invoice.billingAddress || sale.shipTo || sale.location || customer.location || customer.address || customer.city || ''"
  );
  rpc = rpc.replace(
    /destination:\s*inv\.deliveryAddress\s*\|\|\s*inv\.shipToLocation\s*\|\|\s*sale\.location\s*\|\|\s*customer\.city\s*\|\|\s*''/g,
    "destination: inv.deliveryAddress || inv.shipTo || inv.shipToLocation || inv.billingAddress || sale.shipTo || sale.location || customer.location || customer.address || customer.city || ''"
  );

  // Hook into success enrich return OR non-mutating branch
  if (rpc.includes('return __finR;') && !rpc.includes('delivery-details-upgrade-v2-invoke')) {
    rpc = rpc.replace(
      'return __finR;',
      `/* delivery-details-upgrade-v2-invoke */
    if ((fn === 'getDeliveryWorkspaceData' || fn === 'getSalesWorkspaceData' || fn === 'getCRMWorkspaceData') && __finR && typeof __finR === 'object') {
      try {
        const d0 = (typeof data === 'function' ? data() : {}) || {};
        if (fn === 'getDeliveryWorkspaceData') {
          if (Array.isArray(__finR.deliveries)) __finR.deliveries = enrichDeliveriesList(__finR.deliveries, d0);
          if (Array.isArray(__finR.rows)) __finR.rows = enrichDeliveriesList(__finR.rows, d0);
        }
        if (fn === 'getSalesWorkspaceData') {
          if (Array.isArray(__finR.deliveries) && __finR.deliveries.length) {
            __finR.deliveries = enrichDeliveriesList(__finR.deliveries, d0);
          } else {
            const invs = (d0.invoices || []).filter((x) => x && x.isDeleted !== 'Yes' && !['Void','Cancelled'].includes(x.status));
            __finR.deliveries = enrichDeliveriesList(invs.slice(0, 300).map((inv) => ({
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
          const key = Array.isArray(__finR.orders) ? 'orders' : (Array.isArray(__finR.sales) ? 'sales' : null);
          if (key) {
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
          if (Array.isArray(__finR.deliveries) && __finR.deliveries.length) {
            __finR.deliveries = enrichDeliveriesList(__finR.deliveries, d0);
          } else {
            __finR.deliveries = enrichDeliveriesList((d0.deliveries || []).filter((x) => x && x.isDeleted !== 'Yes').slice(0, 200), d0);
          }
        }
      } catch (e) { console.error('[delivery-up]', e && e.message); }
    }
    return __finR;`
    );
    console.log('[delivery-up] hooked on __finR');
  }

  // Default delivery period Year
  rpc = rpc.replace(
    /periodRange\(filters\.period \|\| 'Month'\)/g,
    "periodRange(filters.period || 'Year')"
  );
}

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[delivery-up] rpc ok', rpc.length);

let main = fs.readFileSync(MAIN, 'utf8');
if (main.trim() !== 'PLACEHOLDER' && main.length > 5000 && !main.includes('delivery-details-upgrade-v2-ui')) {
  main = main.replace(
    /getDeliveryWorkspaceData',\s*\[\{\s*period:\s*r\s*\}\]/,
    "getDeliveryWorkspaceData', [{ period: (r === 'Month' || !r) ? 'Year' : r }] /* delivery-details-upgrade-v2-ui */"
  );
  fs.writeFileSync(MAIN, main);
  console.log('[delivery-up] main');
}
console.log('[delivery-up] done');
