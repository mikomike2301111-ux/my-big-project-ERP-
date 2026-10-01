#!/usr/bin/env node
/**
 * apply-delivery-clean-v1 — clear restored QB deliveries + max 10 unique products.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const DATA = path.join(root, 'data', 'd1-sales-deliveries.json');
const MARK = 'DELIVERY_CLEAN_V1';

try {
  if (fs.existsSync(DATA)) {
    const j = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    const before = Array.isArray(j.deliveries) ? j.deliveries.length : 0;
    j.deliveries = [];
    j.deliveryItems = [];
    j.meta = Object.assign({}, j.meta || {}, { deliveries: 0, clearedAt: new Date().toISOString(), note: 'deliveries cleared; max 10 products in RPC' });
    fs.writeFileSync(DATA, JSON.stringify(j));
    console.log('[delivery-clean] seed deliveries cleared was=', before);
  }
} catch (e) {
  console.warn('[delivery-clean] seed clear fail', e.message);
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.includes(MARK) && rpc.includes('cleanDeliveriesCapProducts')) {
  console.log('[delivery-clean] bootstrap already patched');
  process.exit(0);
}

if (rpc.includes("if (src.includes('RECEPTION_CALLS_RESTORE_V4')) return src;")) {
  rpc = rpc.replace(
    "if (src.includes('RECEPTION_CALLS_RESTORE_V4')) return src;",
    "if (src.includes('RECEPTION_CALLS_RESTORE_V4') && src.includes('DELIVERY_CLEAN_V1')) return src;"
  );
}

const injectBlock = `
  // --- DELIVERY_CLEAN_V1 start ---
  if (!src.includes('DELIVERY_CLEAN_V1')) {
    const delHelper = \`
function cleanDeliveriesCapProducts(d) { // DELIVERY_CLEAN_V1
  if (!d) return;
  var MAX_PRODUCTS = 10;
  d.deliveries = Array.isArray(d.deliveries) ? d.deliveries : [];
  d.deliveryItems = Array.isArray(d.deliveryItems) ? d.deliveryItems : [];
  var before = d.deliveries.length;
  d.deliveries = d.deliveries.filter(function(row) {
    if (!row) return false;
    var src = String(row.source || '');
    var id = String(row.id || '');
    if (src.indexOf('d1-deliveries-restore') >= 0) return false;
    if (id.indexOf('DEL-QBINV') === 0 || id.indexOf('DEL-QB') === 0) return false;
    if (row.isDeleted === 'Yes' || row.isDeleted === true) return false;
    return true;
  });
  var known = {};
  d.deliveries.forEach(function(x) { known[String(x.id)] = true; });
  var byDel = {};
  d.deliveryItems.forEach(function(it) {
    if (!it || !it.deliveryId) return;
    if (!known[String(it.deliveryId)]) return;
    var key = String(it.deliveryId);
    if (!byDel[key]) byDel[key] = [];
    byDel[key].push(it);
  });
  var kept = [];
  Object.keys(byDel).forEach(function(k) {
    var seen = {};
    byDel[k].forEach(function(it) {
      var pname = String(it.productName || it.name || it.productId || 'item').trim().toLowerCase();
      if (seen[pname]) return;
      if (Object.keys(seen).length >= MAX_PRODUCTS) return;
      seen[pname] = true;
      kept.push(it);
    });
  });
  d.deliveryItems = kept;
  d.deliveries.forEach(function(del) {
    var items = d.deliveryItems.filter(function(i) { return String(i.deliveryId) === String(del.id); });
    var names = [];
    var seen = {};
    items.forEach(function(i) {
      var n = String(i.productName || 'Item').trim();
      var kk = n.toLowerCase();
      if (seen[kk]) return;
      seen[kk] = true;
      names.push(n);
    });
    del.productCount = names.length;
    del.productsSummary = names.join(', ');
    del.totalQty = items.reduce(function(s, i) { return s + (Number(i.quantity) || 0); }, 0);
  });
  d._deliveryClean = { ok: true, before: before, after: d.deliveries.length, items: d.deliveryItems.length, maxProducts: MAX_PRODUCTS, at: new Date().toISOString() };
  console.log('[delivery-clean] before=' + before + ' after=' + d.deliveries.length + ' items=' + d.deliveryItems.length);
}
\`;
    var idx = src.indexOf('function data()');
    if (idx > 0 && src.indexOf('function cleanDeliveriesCapProducts') < 0) {
      src = src.slice(0, idx) + delHelper + src.slice(idx);
    }
    if (src.indexOf('cleanDeliveriesCapProducts(db)') < 0) {
      src = src.replace(
        "try { restoreReceptionCallsFromD1(db); } catch (e) { console.warn('[reception-restore] fail', e && e.message); }",
        "try { restoreReceptionCallsFromD1(db); } catch (e) { console.warn('[reception-restore] fail', e && e.message); }\\n  try { cleanDeliveriesCapProducts(db); } catch (e) { console.warn('[delivery-clean] fail', e && e.message); }"
      );
    }
    if (src.indexOf('// DELIVERY_ITEMS_CAP_V1') < 0) {
      src = src.replace(
        'const items = (d.deliveryItems || []).filter(item => item.deliveryId === delivery.id);',
        "const itemsRaw = (d.deliveryItems || []).filter(item => item.deliveryId === delivery.id);\\n      // DELIVERY_ITEMS_CAP_V1 — max 10 unique products\\n      const _seenP = new Set();\\n      const items = [];\\n      for (const it of itemsRaw) {\\n        const k = String(it.productName || it.name || it.productId || 'item').toLowerCase();\\n        if (_seenP.has(k)) continue;\\n        if (_seenP.size >= 10) continue;\\n        _seenP.add(k);\\n        items.push(it);\\n      }"
      );
    }
  }
  // --- DELIVERY_CLEAN_V1 end ---
`;

if (!rpc.includes('DELIVERY_CLEAN_V1 start')) {
  const marker = '\n  return src;\n}\n\nfunction loadFromSource';
  if (!rpc.includes(marker)) {
    console.error('[delivery-clean] cannot find return marker in api/rpc.js');
    process.exit(1);
  }
  rpc = rpc.replace(marker, injectBlock + marker);
  fs.writeFileSync(RPC, rpc);
  console.log('[delivery-clean] patched api/rpc.js bootstrap');
} else {
  console.log('[delivery-clean] inject already present');
}

const patcher = path.join(root, 'scripts', 'apply-d1-rpc-patch.js');
if (fs.existsSync(patcher)) {
  let p = fs.readFileSync(patcher, 'utf8');
  if (!p.includes('apply-delivery-clean-v1.js')) {
    p = p.replace(
      'const soft = [',
      "const soft = [\n  'scripts/apply-delivery-clean-v1.js',"
    );
    fs.writeFileSync(patcher, p);
    console.log('[delivery-clean] registered in apply-d1-rpc-patch.js');
  }
}

console.log('[delivery-clean] done');
