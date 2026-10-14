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
  const newInvoiceLookup = "      const invoice = (d.invoices || []).find(inv => inv.id === delivery.invoiceId || inv.id === delivery.saleId || inv.saleId === delivery.saleId || inv.saleNo === delivery.saleNo || (delivery.invoiceNo && (inv.invNo === delivery.invoiceNo || inv.invoiceNo === delivery.invoiceNo)) || (delivery.saleNo && (inv.invNo === delivery.saleNo || inv.invoiceNo === delivery.saleNo))) || {};";
  if (rpc.includes(oldInvoiceLookup)) rpc = rpc.replace(oldInvoiceLookup, newInvoiceLookup);
  else if (!rpc.includes(newInvoiceLookup)) throw new Error('Delivery invoice lookup not found');

  const oldKeys = "    const existingKeys = new Set(deliveryRows.map(row => [row.invoiceNo, row.saleNo, row.invoiceId, row.saleId].filter(Boolean).join('|')).filter(Boolean));";
  const newKeys = [
    "    // Drop only older normalized-table duplicates; keep the most recently updated delivery record.",
    "    const deliveryIdentity = row => [row.invoiceId, row.saleId, row.invoiceNo, row.saleNo].filter(Boolean).map(value => String(value).trim().toLowerCase());",
    "    const deliveryStamp = row => Date.parse(row.updatedAt || row.createdAt || row.date || '') || 0;",
    "    const allDeliveryRows = deliveryRows.slice();",
    "    const dedupedDeliveryRows = allDeliveryRows.filter(row => {",
    "      if (String(row.source || '') !== 'd1-table') return true;",
    "      const identity = new Set(deliveryIdentity(row));",
    "      return !allDeliveryRows.some(other => other !== row && deliveryStamp(other) > deliveryStamp(row) && deliveryIdentity(other).some(key => identity.has(key)));",
    "    });",
    "    deliveryRows.splice(0, deliveryRows.length, ...dedupedDeliveryRows);",
    "    const existingInvoiceIds = new Set(deliveryRows.flatMap(row => [row.invoiceId, row.saleId].filter(Boolean).map(value => String(value).trim().toLowerCase())));",
    "    const existingInvoiceNumbers = new Set(deliveryRows.flatMap(row => [row.invoiceNo, row.saleNo].filter(Boolean).map(value => String(value).trim().toLowerCase())));"
  ].join('\n');
  if (rpc.includes(oldKeys)) rpc = rpc.replace(oldKeys, newKeys);
  else if (!rpc.includes('const existingInvoiceIds = new Set(deliveryRows.flatMap')) throw new Error('Delivery deduplication keys not found');
  const oldKeyCheck = "      const key = [inv.invNo || inv.invoiceNo, inv.saleNo, inv.id, inv.saleId].filter(Boolean).join('|');\n      if (existingKeys.has(key)) return null;";
  const newKeyCheck = [
    "      const invoiceIds = [inv.id, inv.saleId].filter(Boolean).map(value => String(value).trim().toLowerCase());",
    "      const invoiceNumbers = [inv.invNo, inv.invoiceNo, inv.saleNo].filter(Boolean).map(value => String(value).trim().toLowerCase());",
    "      if (invoiceIds.some(value => existingInvoiceIds.has(value)) || invoiceNumbers.some(value => existingInvoiceNumbers.has(value))) return null;"
  ].join('\n');
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

// D1-only mode: legacy Supabase write-through was still firing on saves and
// causing schema errors/timeouts. Keep the old integration code dormant rather
// than deleting it; Cloudflare D1 remains the only persistence source.
rpc = fs.readFileSync(rpcPath, 'utf8');
const D1_ONLY_MARK = '/* d1-only-mode-v1 */';
if (!rpc.includes(D1_ONLY_MARK)) {
  const oldSupabaseEnabled = "function supabaseEnabled() {\n  return Boolean(SUPABASE_URL && SUPABASE_KEY);\n}";
  const newSupabaseEnabled = "function supabaseEnabled() {\n  " + D1_ONLY_MARK + "\n  return false;\n}";
  if (!rpc.includes(oldSupabaseEnabled)) throw new Error('Supabase enable guard not found');
  rpc = rpc.replace(oldSupabaseEnabled, newSupabaseEnabled);

  // Remove all environment-driven hosted-database credentials from the generated
  // production handler. Legacy helper functions remain unreachable because the
  // guard above is hard-false; D1 is the only authoritative backend.
  const D1_ONLY_CONFIG_MARK = '/* d1-only-config-v1 */';
  if (!rpc.includes(D1_ONLY_CONFIG_MARK)) {
    const configPattern = /const RAW_SUPABASE_URL = String\(process\.env\.SUPABASE_URL[\s\S]*?const SUPABASE_JWKS_URL = String\(process\.env\.SUPABASE_JWKS_URL[\s\S]*?\)\.trim\(\);/;
    if (!configPattern.test(rpc)) throw new Error('Legacy database configuration block not found');
    rpc = rpc.replace(configPattern,
      "const SUPABASE_URL = '';\nconst SUPABASE_KEY = '';\nconst SUPABASE_JWKS_URL = ''; // " + D1_ONLY_CONFIG_MARK);
  }

  const oldHealth = "persistence: supabaseReady ? 'supabase' : 'memory'";
  const newHealth = "persistence: d1 && d1.d1Configured && d1.d1Configured() ? 'cloudflare-d1' : 'unavailable'";
  if (!rpc.includes(oldHealth)) throw new Error('Persistence health label not found');
  rpc = rpc.replace(oldHealth, newHealth);

  const oldProbe = "async function probeSupabaseStatus() {\n  try {\n    const { probeSupabase } = require('../server/supabaseClient');\n    return await probeSupabase();\n  } catch (e) {\n    return { ok: false, error: e.message || String(e), url: SUPABASE_URL || '' };\n  }\n}";
  const newProbe = "async function probeSupabaseStatus() { return { ok: false, disabled: true, mode: 'cloudflare-d1-only', reason: 'Supabase is disabled; Cloudflare D1 is authoritative.' }; }";
  if (rpc.includes(oldProbe)) rpc = rpc.replace(oldProbe, newProbe);

  rpc = rpc.replace("Supabase unavailable or sync already running", "Supabase disabled; Cloudflare D1 is authoritative");
  fs.writeFileSync(rpcPath, rpc);
}
const check = spawnSync(process.execPath, ['--check', rpcPath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(check.stderr || check.stdout || 'rpc.js syntax check failed');
console.log('[delivery-item-resolution] backend patch verified; frontend files unchanged');
