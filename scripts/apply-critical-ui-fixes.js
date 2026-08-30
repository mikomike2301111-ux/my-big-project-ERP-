/**
 * Critical fixes: profile Ksh0, hero mobile, multi-product order, delete gates
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const mainPath = path.join(root, 'src', 'main.jsx');
const rpcPath = path.join(root, 'api', 'rpc.js');

function ensureImport(m, file) {
  if (m.includes(file)) return m;
  if (m.includes("import './styles.css';")) {
    return m.replace("import './styles.css';", `import './styles.css';\nimport '${file}';`);
  }
  return m;
}

function patchMain() {
  if (!fs.existsSync(mainPath)) { console.warn('[critical] no main.jsx'); return; }
  let m = fs.readFileSync(mainPath, 'utf8');
  m = ensureImport(m, './hero-profile-fix.css');
  m = ensureImport(m, './mobile-polish.css');
  m = ensureImport(m, './leave-awsome.css');
  m = ensureImport(m, './charts-profile.css');

  if (m.includes("if (['total', 'balance', 'amount', 'paid', 'subtotal', 'tax', 'value', 'revenue'")) {
    m = m.replace(
      "if (['total', 'balance', 'amount', 'paid', 'subtotal', 'tax', 'value', 'revenue', 'profit', 'pipeline', 'spend', 'outstandingBalance', 'invoiceAmount', 'paidAmount', 'creditLimit', 'expectedCost', 'inventoryValue', 'unitCost', 'sellingPrice', 'stockValue', 'rent', 'utilities', 'labor', 'damageCosts', 'expiryLosses', 'totalCost', 'profitPotential', 'storageCost', 'openingBalance', 'deposit', 'withdrawal', 'debit', 'credit', 'totalDebit', 'totalCredit', 'basicSalary', 'allowances', 'deductions', 'netPay', 'liability', 'purchaseCost', 'accumulatedDepreciation', 'currentValue', 'budget', 'actual', 'variance', 'forecast', 'cost', 'profitability', 'current', 'forecast30'].includes(key)) return currency(value);",
      `if (key === 'value') {
    const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(n) && String(value).trim() !== '' && /^-?\\d/.test(String(value).trim())) return currency(n);
    return value == null || value === '' ? '—' : String(value);
  }
  if (['total', 'balance', 'amount', 'paid', 'subtotal', 'tax', 'revenue', 'profit', 'pipeline', 'spend', 'outstandingBalance', 'invoiceAmount', 'paidAmount', 'creditLimit', 'expectedCost', 'inventoryValue', 'unitCost', 'sellingPrice', 'stockValue', 'rent', 'utilities', 'labor', 'damageCosts', 'expiryLosses', 'totalCost', 'profitPotential', 'storageCost', 'openingBalance', 'deposit', 'withdrawal', 'debit', 'credit', 'totalDebit', 'totalCredit', 'basicSalary', 'allowances', 'deductions', 'netPay', 'liability', 'purchaseCost', 'accumulatedDepreciation', 'currentValue', 'budget', 'actual', 'variance', 'forecast', 'cost', 'profitability', 'current', 'forecast30'].includes(key)) return currency(value);`
    );
    console.log('[critical] formatCell patched');
  }

  m = m.replace(
    "SimpleTable rows={rows.map(([k, v]) => ({ field: k, value: String(v || '') }))} columns={['field', 'value']}",
    "SimpleTable rows={rows.map(([k, v]) => ({ field: k, detail: String(v || '—') }))} columns={['field', 'detail']}"
  );

  const newProductSelect = `<div style={{ marginBottom: 14 }}>
                <div className="req" style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>Products (pick one or more)</div>
                <div className="field-chip-grid">
                  {PRODUCTS.filter(p => p !== 'Other').map(p => (
                    <label key={p} className="chip">
                      <input
                        type="checkbox"
                        checked={(orderForm.products || []).includes(p) || orderForm.productName === p}
                        onChange={() => {
                          const cur = Array.isArray(orderForm.products) ? orderForm.products.slice() : (orderForm.productName ? [orderForm.productName] : []);
                          const next = cur.includes(p) ? cur.filter(x => x !== p) : cur.concat([p]);
                          setOrderForm({ ...orderForm, products: next, productName: next[0] || '' });
                        }}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>`;

  if (m.includes('orderForm.productName') && m.includes('Select product')) {
    m = m.replace(
      /<label className="req">Product\s*<select required value=\{orderForm\.productName\}[\s\S]*?<\/select>\s*<\/label>/,
      newProductSelect
    );
    console.log('[critical] multi-product order');
  }

  m = m.replace(
    "setOrderForm({ salesperson: defaultRep, shopOrCustomer: '', phone: '', productName: '', quantity: 1, unitPrice: '', paymentMethod: 'Credit', comment: '' });",
    "setOrderForm({ salesperson: defaultRep, shopOrCustomer: '', phone: '', productName: '', products: [], quantity: 1, unitPrice: '', paymentMethod: 'Credit', comment: '' });"
  );
  m = m.replace(
    /useState\(\{ salesperson: defaultRep, shopOrCustomer: '', phone: '', productName: '', quantity: 1/,
    "useState({ salesperson: defaultRep, shopOrCustomer: '', phone: '', productName: '', products: [], quantity: 1"
  );
  m = m.replace(
    "const res = await rpc('logFieldOrder', [user, orderForm]);",
    "const res = await rpc('logFieldOrder', [user, { ...orderForm, products: orderForm.products || (orderForm.productName ? [orderForm.productName] : []) }]);"
  );

  fs.writeFileSync(mainPath, m);
  console.log('[critical] main', m.length);
}

function patchRpc() {
  if (!fs.existsSync(rpcPath)) return;
  let rpc = fs.readFileSync(rpcPath, 'utf8');
  if (!rpc.includes('/* delete-gate-v2 */') && rpc.includes('deleteRecord(user, collection, id, opts = {})')) {
    rpc = rpc.replace(
      'deleteRecord(user, collection, id, opts = {}) {\n    // Site-wide guarded delete service. Permission gate first.\n    const { u, meta } = assertRestorableAccess(user, collection);\n    const forceHard = opts && opts.hard === true;',
      `deleteRecord(user, collection, id, opts = {}) {
    // Site-wide guarded delete service. Permission gate first.
    /* delete-gate-v2 */
    const { u, meta } = assertRestorableAccess(user, collection);
    const canHard = [ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE].includes(u.role);
    const canSoft = canHard || [ROLES.MANAGER, ROLES.HR, ROLES.ACCOUNTANT].includes(u.role);
    if (!canSoft) {
      throw new Error('Only managers, HR, accounts, or admins can delete records. Contact your supervisor.');
    }
    const forceHard = opts && opts.hard === true;
    if (forceHard && !canHard) {
      throw new Error('Permanent delete is restricted to Admin / Developer / Executive.');
    }`
    );
    console.log('[critical] delete gate');
  }
  if (rpc.includes('logFieldOrder(user, form = {})') && !rpc.includes('/* multi-product-order-v1 */')) {
    rpc = rpc.replace(
      'const productName = clean(form.productName || form.productDiscussed);',
      `/* multi-product-order-v1 */
    const productList = Array.isArray(form.products) ? form.products.map(clean).filter(Boolean) : [];
    const productName = clean(form.productName || form.productDiscussed || productList[0] || '');
    const productNames = productList.length ? productList : (productName ? [productName] : []);`
    );
    rpc = rpc.replace(
      "if (!salesperson || !shop || !phone || !productName) throw new Error('Salesperson, customer, phone and product are required');",
      "if (!salesperson || !shop || !phone || !productNames.length) throw new Error('Salesperson, customer, phone and at least one product are required');"
    );
    console.log('[critical] multi product order rpc');
  }
  fs.writeFileSync(rpcPath, rpc);
  console.log('[critical] rpc', rpc.length);
}

patchMain();
patchRpc();
console.log('[critical] done');
