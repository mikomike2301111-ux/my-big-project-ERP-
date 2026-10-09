#!/usr/bin/env node
/**
 * DELIVERY_NO_PRODUCTS_V3
 * Runs AFTER restore-if-placeholder (full rpc + main.jsx).
 * - Strips product lists from delivery/CRM API responses
 * - Removes Products / Product list section from delivery detail UI
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MAIN = path.join(root, 'src', 'main.jsx');
const MARK = 'DELIVERY_NO_PRODUCTS_V3';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[no-products] SYNTAX', file, (r.stderr || r.stdout || '').slice(0, 600));
    process.exit(1);
  }
}

if (!fs.existsSync(RPC)) {
  console.warn('[no-products] no api/rpc.js');
  process.exit(0);
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 50000) {
  console.warn('[no-products] rpc still placeholder/small — skip (restore may have failed)');
  process.exit(0);
}

if (rpc.includes(MARK + '_DONE')) {
  console.log('[no-products] rpc already patched');
} else {
  if (!rpc.includes('function stripDeliveryProductLists')) {
    const helpers = `\nfunction stripDeliveryProductLists(d) { // ${MARK}\n  if (!d) return;\n  d.deliveryItems = [];\n  d.deliveries = Array.isArray(d.deliveries) ? d.deliveries : [];\n  d.deliveries = d.deliveries.filter(function(row) {\n    if (!row || row.isDeleted === 'Yes' || row.isDeleted === true) return false;\n    var s = String(row.source || ''), id = String(row.id || '');\n    if (s.indexOf('d1-deliveries-restore') >= 0) return false;\n    if (id.indexOf('DEL-QBINV') === 0 || id.indexOf('DEL-QB') === 0) return false;\n    return true;\n  });\n  d.deliveries.forEach(function(del) {\n    del.productCount = 0;\n    del.totalQty = 0;\n    del.productsSummary = '';\n    del.productSummary = '';\n    del.items = [];\n    del.products = [];\n    del.productList = '';\n  });\n}\nfunction stripDeliveryProductsOnRow(row) {\n  if (!row || typeof row !== 'object') return row;\n  row.productCount = 0;\n  row.totalQty = 0;\n  row.productsSummary = '';\n  row.productSummary = '';\n  row.items = [];\n  row.products = [];\n  row.productList = '';\n  return row;\n}\n`;
    const di = rpc.indexOf('function data()');
    if (di > 0) rpc = rpc.slice(0, di) + helpers + rpc.slice(di);
  }

  if (!rpc.includes('stripDeliveryProductLists(db)')) {
    rpc = rpc.replace(
      'function data() {\n  if (!db) seed();\n  applyQuickBooksSeed();',
      'function data() {\n  if (!db) seed();\n  applyQuickBooksSeed();\n  try { stripDeliveryProductLists(db); } catch (e) {} // ' + MARK
    );
  }

  rpc = rpc.replace(
    'const items = (d.deliveryItems || []).filter(item => item.deliveryId === delivery.id);',
    'const items = []; // ' + MARK
  );
  rpc = rpc.replace(
    "productSummary: items.map(i => `${i.productName} x${i.quantity}`).join(', '),",
    "productSummary: '', productCount: 0, totalQty: 0, productsSummary: '', // " + MARK
  );
  rpc = rpc.replace(
    'items: (d.saleItems || []).filter(item => item.saleId === inv.saleId || item.invoiceId === inv.id),',
    'items: [], // ' + MARK
  );
  rpc = rpc.replace(
    "productSummary: (d.saleItems || []).filter(item => item.saleId === inv.saleId || item.invoiceId === inv.id).map(i => `${i.productName} x${i.quantity}`).join(', '),",
    "productSummary: '', productCount: 0, totalQty: 0, productsSummary: '', // " + MARK
  );

  if (!rpc.includes(MARK + '_POST')) {
    rpc = rpc.replace(
      'deliveries: rows,\n      stats:',
      'deliveries: rows.map(function(r){ try { return stripDeliveryProductsOnRow(r); } catch(e){ return r; } }), // ' + MARK + '_POST\n      stats:'
    );
  }

  if (rpc.includes('function enrichDeliveriesList')) {
    rpc = rpc.replace(
      /function enrichDeliveriesList\s*\([^)]*\)\s*\{/,
      'function enrichDeliveriesList(list) { return (Array.isArray(list)?list:[]).map(function(r){ return stripDeliveryProductsOnRow(Object.assign({}, r)); }); if (false) {'
    );
  }
  if (rpc.includes('function enrichDeliveryRow')) {
    rpc = rpc.replace(
      /function enrichDeliveryRow\s*\([^)]*\)\s*\{/,
      'function enrichDeliveryRow(row) { return stripDeliveryProductsOnRow(row || {}); if (false) {'
    );
  }
  if (rpc.includes('function resolveInvoiceProductsForDelivery')) {
    rpc = rpc.replace(
      /function resolveInvoiceProductsForDelivery\s*\([^)]*\)\s*\{/,
      'function resolveInvoiceProductsForDelivery() { return { items: [], productCount: 0, totalQty: 0, productsSummary: "", productSummary: "" }; if (false) {'
    );
  }

  if (rpc.includes('getCRMWorkspaceData(user, filters = {})') && !rpc.includes(MARK + '_CRM')) {
    rpc = rpc.replace(
      'getCRMWorkspaceData(user, filters = {}) {\n    reqRole(user);',
      'getCRMWorkspaceData(user, filters = {}) {\n    reqRole(user);\n    try { stripDeliveryProductLists(data()); } catch (e) {} // ' + MARK + '_CRM'
    );
  }

  rpc = rpc + '\n/* ' + MARK + '_DONE */\n';
  fs.writeFileSync(RPC, rpc);
  check(RPC);
  console.log('[no-products] rpc patched', rpc.length);
}

if (fs.existsSync(MAIN)) {
  let main = fs.readFileSync(MAIN, 'utf8');
  if (main.trim() === 'PLACEHOLDER' || main.length < 50000) {
    console.warn('[no-products] main.jsx placeholder — skip UI');
  } else if (main.includes(MARK + '_UI')) {
    console.log('[no-products] main already patched');
  } else {
    main = main.replace(
      /<article><span>Products<\/span><strong>\{selected\.productCount[\s\S]*?<\/strong><\/article>\s*<article><span>Product list<\/span><strong[^>]*>\{selected\.productsSummary \|\| '—'\}<\/strong><\/article>/,
      '/* ' + MARK + '_UI products removed */'
    );
    main = main.replace(
      /<Panel title="Products" action=\{\`\$\{\(selected\.items \|\| \[\]\)\.length\} lines\`\}><SimpleTable rows=\{selected\.items \|\| \[\]\} columns=\{\['productName', 'quantity'\]\} \/><\/Panel>/,
      '/* ' + MARK + '_UI products panel removed */'
    );
    main = main.replace(
      /\{row\.productCount != null \? `\$\{row\.productCount\} product\$\{row\.productCount === 1 \? '' : 's'\}` : '—'\}/g,
      "'—'"
    );
    main = main.replace(
      /\{row\.productsSummary \|\| \(row\.items && row\.items\.length \? `\$\{row\.items\.length\} line\(s\)` : 'No products'\)\}/g,
      "''"
    );
    main = main.replace(
      /\{row\.productsSummary \|\| \(row\.items && row\.items\.length \? `\$\{row\.items\.length\} line\(s\)` : '—'\)\}/g,
      "''"
    );
    main = main.replace(
      /\{order\.productCount != null \? `\$\{order\.productCount\} product\$\{order\.productCount === 1 \? '' : 's'\}` : '—'\}/g,
      "'—'"
    );
    main = main.replace(
      /\{detailOrder\.productCount != null \? `\$\{detailOrder\.productCount\} product\$\{detailOrder\.productCount === 1 \? '' : 's'\} · \$\{detailOrder\.totalQty \|\| 0\} units` : \(detailOrder\.items && detailOrder\.items\.length \? `\$\{detailOrder\.items\.length\} line\(s\)` : '—'\)\}/g,
      "'—'"
    );
    main = main.replace(
      /<article><span>Product list<\/span><strong title=\{detailOrder\.productsSummary\}>\{detailOrder\.productsSummary \|\| '—'\}<\/strong><\/article>/g,
      '/* ' + MARK + '_UI detail product list removed */'
    );
    if (!main.includes(MARK + '_UI')) {
      main = main.replace('function App', '/* ' + MARK + '_UI */\nfunction App');
    }
    fs.writeFileSync(MAIN, main);
    console.log('[no-products] main.jsx patched', main.length);
  }
}

console.log('[no-products] done');
