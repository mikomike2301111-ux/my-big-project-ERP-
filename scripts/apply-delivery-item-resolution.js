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
  const old = `      // Delivery product details fall back to the linked sale items so existing /
      // legacy deliveries (with no deliveryItems rows) still show products.
      const items = (d.deliveryItems || []).filter(item => item.deliveryId === delivery.id);
      const resolvedItems = (items.length ? items : (d.saleItems || []).filter(item => item.saleId === delivery.saleId || (sale && item.saleId === sale.id) || item.invoiceId === delivery.invoiceId))
        .map(i => ({ ...i, quantity: num(i.quantity) }));`;
  const next = `      // ${MARK} Resolve legacy deliveries by invoice line items before sale lines.
      // Do not create product rows or quantities when the source has no matching lines.
      const items = (d.deliveryItems || []).filter(item => item && item.deliveryId === delivery.id && item.isDeleted !== 'Yes' && item.isDeleted !== true);
      const invoiceItems = (d.invoiceItems || []).filter(item => item && item.isDeleted !== 'Yes' && item.isDeleted !== true && (
        (delivery.invoiceId && item.invoiceId === delivery.invoiceId) ||
        (invoice.id && item.invoiceId === invoice.id) ||
        (delivery.invoiceNo && (item.invoiceNo === delivery.invoiceNo || item.invNo === delivery.invoiceNo))
      ));
      const saleItems = (d.saleItems || []).filter(item => item && item.isDeleted !== 'Yes' && item.isDeleted !== true && (
        (delivery.saleId && item.saleId === delivery.saleId) ||
        (sale.id && item.saleId === sale.id) ||
        (invoice.saleId && item.saleId === invoice.saleId)
      ));
      const sourceItems = items.length ? items : (invoiceItems.length ? invoiceItems : saleItems);
      const resolvedItems = sourceItems.map(i => ({ ...i, quantity: num(i.quantity) }));`;
  if (!rpc.includes(old)) throw new Error('Delivery row resolution block not found; no change applied');
  rpc = rpc.replace(old, next);
  const customerLine = `      const customer = (d.customers || []).find(c => c.id === inv.customerId || c.name === inv.customerName || c.id === sale.customerId || c.name === sale.customerName) || {};`;
  const customerNext = customerLine + `
      const invoiceSaleItems = (d.saleItems || []).filter(item => item && item.isDeleted !== 'Yes' && item.isDeleted !== true && (
        (inv.saleId && item.saleId === inv.saleId) || (sale.id && item.saleId === sale.id) || item.invoiceId === inv.id
      ));
      const invoiceLineItems = (d.invoiceItems || []).filter(item => item && item.invoiceId === inv.id && item.isDeleted !== 'Yes' && item.isDeleted !== true);
      const resolvedInvoiceItems = invoiceSaleItems.length ? invoiceSaleItems : invoiceLineItems;`;
  if (!rpc.includes(customerLine)) throw new Error('Invoice delivery mapping anchor not found');
  rpc = rpc.replace(customerLine, customerNext);
  const oldItems = `items: (d.saleItems || []).filter(item => item.saleId === inv.saleId || item.invoiceId === inv.id),
        ...productSummaryOf((d.saleItems || []).filter(item => item.saleId === inv.saleId || item.invoiceId === inv.id)),
        productSummary: (d.saleItems || []).filter(item => item.saleId === inv.saleId || item.invoiceId === inv.id).map(i => \`\${i.productName} x\${i.quantity}\`).join(', '),`;
  const newItems = `items: resolvedInvoiceItems,
        ...productSummaryOf(resolvedInvoiceItems),
        productSummary: resolvedInvoiceItems.map(i => \`\${i.productName || i.description || i.name || 'Item'} x\${num(i.quantity)}\`).join(', '), // ${MARK}`;
  if (!rpc.includes(oldItems)) throw new Error('Invoice-row product summary block not found');
  rpc = rpc.replace(oldItems, newItems);
  rpc = rpc.replace('  getDeliveryWorkspaceData(user, filters = {}) {', '  getDeliveryWorkspaceData(user, filters = {}) {\n    ${MARK}');
  fs.writeFileSync(rpcPath, rpc);
}
const check = spawnSync(process.execPath, ['--check', rpcPath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(check.stderr || check.stdout || 'rpc.js syntax check failed');
console.log('[delivery-item-resolution] backend patch verified; frontend files unchanged');
