#!/usr/bin/env node
/**
 * Backend-only delivery item resolution.
 * Leaves src/main.jsx and all styling untouched.
 * Older delivery records reference invoices, while their dedicated
 * deliveryItems collection is empty; resolve product lines from invoiceItems
 * first, then linked saleItems, without fabricating delivery quantities.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const rpcPath = path.join(__dirname, '..', 'api', 'rpc.js');
const MARK = '/* delivery-item-resolution-v1 */';
let rpc = fs.readFileSync(rpcPath, 'utf8');
if (!rpc || rpc.trim() === 'PLACEHOLDER' || rpc.length < 50000) {
  throw new Error('rpc.js not restored before delivery patch');
}
if (!rpc.includes(MARK)) {
  const old = [
    '      // Delivery product details fall back to the linked sale items so existing /',
    '      // legacy deliveries (with no deliveryItems rows) still show products.',
    '      const items = (d.deliveryItems || []).filter(item => item.deliveryId === delivery.id);',
    '      const resolvedItems = (items.length ? items : (d.saleItems || []).filter(item => item.saleId === delivery.saleId || (sale && item.saleId === sale.id) || item.invoiceId === delivery.invoiceId))',
    '        .map(i => ({ ...i, quantity: num(i.quantity) }));'
  ].join('\n');
  const next = [
    '      // ' + MARK + ' Resolve legacy deliveries by invoice line items before sale lines.',
    '      // Do not create product rows or quantities when the source has no matching lines.',
    "      const items = (d.deliveryItems || []).filter(item => item && item.deliveryId === delivery.id && item.isDeleted !== 'Yes' && item.isDeleted !== true);",
    "      const invoiceItems = (d.invoiceItems || []).filter(item => item && item.isDeleted !== 'Yes' && item.isDeleted !== true && (",
    '        (delivery.invoiceId && item.invoiceId === delivery.invoiceId) ||',
    '        (invoice.id && item.invoiceId === invoice.id) ||',
    '        (delivery.invoiceNo && (item.invoiceNo === delivery.invoiceNo || item.invNo === delivery.invoiceNo))',
    '      ));',
    "      const saleItems = (d.saleItems || []).filter(item => item && item.isDeleted !== 'Yes' && item.isDeleted !== true && (",
    '        (delivery.saleId && item.saleId === delivery.saleId) ||',
    '        (sale.id && item.saleId === sale.id) ||',
    '        (invoice.saleId && item.saleId === invoice.saleId)',
    '      ));',
    '      const sourceItems = items.length ? items : (invoiceItems.length ? invoiceItems : saleItems);',
    '      const resolvedItems = sourceItems.map(i => ({ ...i, quantity: num(i.quantity) }));'
  ].join('\n');
  if (!rpc.includes(old)) throw new Error('Delivery row resolution block not found; no change applied');
  rpc = rpc.replace(old, next);

  const oldInvoiceLookup = "      const invoice = (d.invoices || []).find(inv => inv.id === delivery.invoiceId || inv.saleId === delivery.saleId || inv.saleNo === delivery.saleNo) || {};";
  const newInvoiceLookup = "      const invoice = (d.invoices || []).find(inv => inv.id === delivery.invoiceId || inv.id === delivery.saleId || inv.saleId === delivery.saleId || inv.saleNo === delivery.saleNo || (delivery.invoiceNo && (inv.invNo === delivery.invoiceNo || inv.invoiceNo === delivery.invoiceNo))) || {};";
  if (rpc.includes(oldInvoiceLookup)) rpc = rpc.replace(oldInvoiceLookup, newInvoiceLookup);
  else if (!rpc.includes(newInvoiceLookup)) throw new Error('Delivery invoice lookup not found');

  const oldKeys = "    const existingKeys = new Set(deliveryRows.map(row => [row.invoiceNo, row.saleNo, row.invoiceId, row.saleId].filter(Boolean).join('|')).filter(Boolean));";
  const newKeys = [
    "    const existingInvoiceIds = new Set(deliveryRows.flatMap(row => [row.invoiceId, row.saleId].filter(Boolean).map(value => String(value).trim().toLowerCase())));",
    "    const existingInvoiceNumbers = new Set(deliveryRows.flatMap(row => [row.invoiceNo, row.saleNo].filter(Boolean).map(value => String(value).trim().toLowerCase())));"
  ].join('\\n');
  if (rpc.includes(oldKeys)) rpc = rpc.replace(oldKeys, newKeys);
  else if (!rpc.includes('const existingInvoiceIds = new Set(deliveryRows.flatMap')) throw new Error('Delivery deduplication keys not found');
  const oldKeyCheck = "      const key = [inv.invNo || inv.invoiceNo, inv.saleNo, inv.id, inv.saleId].filter(Boolean).join('|');\n      if (existingKeys.has(key)) return null;";
  const newKeyCheck = [
    "      const invoiceIds = [inv.id, inv.saleId].filter(Boolean).map(value => String(value).trim().toLowerCase());",
    "      const invoiceNumbers = [inv.invNo, inv.invoiceNo, inv.saleNo].filter(Boolean).map(value => String(value).trim().toLowerCase());",
    "      if (invoiceIds.some(value => existingInvoiceIds.has(value)) || invoiceNumbers.some(value => existingInvoiceNumbers.has(value))) return null;"
  ].join('\\n');
  if (rpc.includes(oldKeyCheck)) rpc = rpc.replace(oldKeyCheck, newKeyCheck);
  else if (!rpc.includes('invoiceIds.some(value => existingInvoiceIds.has(value))')) throw new Error('Delivery/invoice duplicate guard not found');

  const customerLine = "      const customer = (d.customers || []).find(c => c.id === inv.customerId || c.name === inv.customerName || c.id === sale.customerId || c.name === sale.customerName) || {};";
  const customerNext = customerLine + [
    '',
    "      const invoiceSaleItems = (d.saleItems || []).filter(item => item && item.isDeleted !== 'Yes' && item.isDeleted !== true && (",
    '        (inv.saleId && item.saleId === inv.saleId) || (sale.id && item.saleId === sale.id) || item.invoiceId === inv.id',
    '      ));',
    "      const invoiceLineItems = (d.invoiceItems || []).filter(item => item && item.invoiceId === inv.id && item.isDeleted !== 'Yes' && item.isDeleted !== true);",
    '      const resolvedInvoiceItems = invoiceSaleItems.length ? invoiceSaleItems : invoiceLineItems;'
  ].join('\n');
  if (!rpc.includes(customerLine)) throw new Error('Invoice delivery mapping anchor not found');
  rpc = rpc.replace(customerLine, customerNext);

  const itemStartText = 'items: (d.saleItems || []).filter(item => item.saleId === inv.saleId || item.invoiceId === inv.id),';
  const itemStart = rpc.indexOf(itemStartText);
  const confirmed = rpc.indexOf('        confirmed: false,', itemStart);
  if (itemStart < 0 || confirmed < 0) throw new Error('Invoice-row item summary bounds not found');
  const oldSegment = rpc.slice(itemStart, confirmed);
  if (!oldSegment.includes('productSummaryOf(') || !oldSegment.includes('productSummary:')) {
    throw new Error('Invoice-row item summary block did not match expected structure');
  }
  const newSegment = [
    'items: resolvedInvoiceItems,',
    '        ...productSummaryOf(resolvedInvoiceItems),',
    "        productSummary: resolvedInvoiceItems.map(i => String(i.productName || i.description || i.name || 'Item') + ' x' + num(i.quantity)).join(', '),",
    ''
  ].join('\n');
  rpc = rpc.slice(0, itemStart) + newSegment + rpc.slice(confirmed);

  const method = '  getDeliveryWorkspaceData(user, filters = {}) {';
  if (!rpc.includes(method)) throw new Error('Delivery workspace method not found');
  rpc = rpc.replace(method, method + '\n    ' + MARK);
  fs.writeFileSync(rpcPath, rpc);
}
const check = spawnSync(process.execPath, ['--check', rpcPath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(check.stderr || check.stdout || 'rpc.js syntax check failed');
console.log('[delivery-item-resolution] backend patch verified; frontend files unchanged');
