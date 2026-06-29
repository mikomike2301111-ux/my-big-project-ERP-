const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const root = path.resolve(__dirname, '..');
const downloads = 'C:/Users/user/Downloads';
const outFile = path.join(root, 'data', 'quickbooks-seed.json');

const sourceFiles = {
  accounts: path.join(downloads, 'Farmtrack_Biosciences Ltd.csv'),
  transactions: path.join(downloads, 'Transaction export - 2026-06-29 9.24.58 AM.csv'),
  transactionsAlt: path.join(downloads, 'Transaction export - 2026-06-29 9.24.18 AM.csv'),
  salesXls: path.join(downloads, 'sales.xls'),
  expensesXls: path.join(downloads, 'Expenses.xls'),
  salesByRep: path.join(downloads, 'Farmtrack+Biosciences+Ltd_Sales+byRep.xlsx'),
  salesByCustomer: path.join(downloads, 'Farmtrack+Biosciences+Ltd_Sales+by++Customer+Detail.xlsx'),
  quantityOnHand: path.join(downloads, 'Farmtrack+Biosciences+Ltd_Quantity+on+hand+report.xlsx'),
  productServiceList: path.join(downloads, 'Farmtrack+Biosciences+Ltd_ProductService+List.xlsx'),
  inventoryOnHand: path.join(downloads, 'Farmtrack+Biosciences+Ltd_Inventory+on+hand+report.xlsx'),
  paymentMethods: path.join(downloads, 'Payment Method List.xlsx')
};

const now = new Date().toISOString();
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const key = value => clean(value).toLowerCase();
const amount = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = clean(value).replace(/Ksh/gi, '').replace(/[,\s]/g, '').replace(/[()]/g, match => match === '(' ? '-' : '');
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
};
const excelDate = value => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = clean(value);
  const m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return now.slice(0, 10);
};
const slug = value => key(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
const idFor = (prefix, value, index = 0) => `${prefix}-${slug(value)}-${index}`.slice(0, 80);

function sheetRows(file) {
  if (!fs.existsSync(file)) return [];
  const workbook = XLSX.readFile(file, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }).map(row => row.map(clean));
}

function tableFromRows(rows, headerMatch) {
  const headerIndex = rows.findIndex(row => headerMatch(row.map(key)));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map(clean);
  return rows.slice(headerIndex + 1)
    .filter(row => row.some(cell => clean(cell)))
    .map(row => Object.fromEntries(headers.map((header, index) => [header || `Column ${index + 1}`, row[index] ?? ''])));
}

function groupedReportRows(rows, headerMatch, groupColumnName) {
  const headerIndex = rows.findIndex(row => headerMatch(row.map(key)));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map(clean);
  const out = [];
  let group = '';
  for (const row of rows.slice(headerIndex + 1)) {
    const nonEmpty = row.map(clean).filter(Boolean);
    if (!nonEmpty.length) continue;
    const hasDate = /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(clean(row[1] || row[0]));
    if (!hasDate && nonEmpty.length === 1) {
      group = nonEmpty[0];
      continue;
    }
    const obj = Object.fromEntries(headers.map((header, index) => [header || `Column ${index + 1}`, row[index] ?? '']));
    obj[groupColumnName] = group;
    out.push(obj);
  }
  return out;
}

function uniqueBy(rows, getKey) {
  const seen = new Set();
  return rows.filter(row => {
    const k = getKey(row);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const accountRows = tableFromRows(sheetRows(sourceFiles.accounts), headers => headers.includes('account name') && headers.includes('account type'));
const txRows = tableFromRows(sheetRows(sourceFiles.transactions), headers => headers.includes('date') && headers.includes('ref no.') && headers.includes('contact'));
const salesXlsRows = tableFromRows(sheetRows(sourceFiles.salesXls), headers => headers.includes('date') && headers.includes('type') && headers.includes('customer'));
const expenseRows = tableFromRows(sheetRows(sourceFiles.expensesXls), headers => headers.includes('date') && headers.includes('payee') && headers.includes('category'));
const byRepRows = groupedReportRows(sheetRows(sourceFiles.salesByRep), headers => headers.includes('date') && headers.includes('product/service') && headers.includes('sales price'), 'salesRepName');
const byCustomerRows = groupedReportRows(sheetRows(sourceFiles.salesByCustomer), headers => headers.includes('date') && headers.includes('product/service') && headers.includes('amount'), 'customerName');
const inventoryRows = tableFromRows(sheetRows(sourceFiles.inventoryOnHand), headers => headers.includes('product/service') && headers.includes('qty on hand'));
const quantityRows = tableFromRows(sheetRows(sourceFiles.quantityOnHand), headers => headers.includes('product/service') && headers.includes('qty on hand'));
const productRows = tableFromRows(sheetRows(sourceFiles.productServiceList), headers => headers.includes('product/service'));
const paymentRows = tableFromRows(sheetRows(sourceFiles.paymentMethods), headers => headers.includes('payment method'));

const productNames = uniqueBy([
  ...productRows.map(row => clean(row['Product/Service'])),
  ...inventoryRows.map(row => clean(row['Product/Service'])),
  ...quantityRows.map(row => clean(row['Product/Service'])),
  ...byCustomerRows.map(row => clean(row['Product/Service'])),
  ...byRepRows.map(row => clean(row['Product/Service']))
].filter(Boolean).map((name, index) => ({ name, index })), row => key(row.name));

const inventoryByProduct = new Map([...inventoryRows, ...quantityRows].map(row => [key(row['Product/Service']), row]));
const priceByProduct = new Map();
for (const row of [...byCustomerRows, ...byRepRows]) {
  const name = clean(row['Product/Service']);
  const price = amount(row['Sales Price']);
  if (name && price > 0 && !priceByProduct.has(key(name))) priceByProduct.set(key(name), price);
}

const products = productNames.map(({ name }, index) => {
  const stock = inventoryByProduct.get(key(name)) || {};
  const sellingPrice = priceByProduct.get(key(name)) || 0;
  const reorder = amount(stock['Reorder Point']);
  return {
    id: idFor('QBPROD', name, index + 1),
    name,
    sku: `QB-${String(index + 1).padStart(4, '0')}`,
    category: /fee|courier|transport|delivery/i.test(name) ? 'Services' : /lure|trap|sticky|blocks|insert/i.test(name) ? 'Bio-Pesticides' : 'QuickBooks Items',
    type: /fee|courier|transport|delivery/i.test(name) ? 'Service' : 'Finished Product',
    unit: /fee|courier|transport|delivery/i.test(name) ? 'service' : 'pcs',
    costPrice: sellingPrice ? Math.round(sellingPrice * 0.62) : 0,
    sellingPrice,
    minStock: reorder || 0,
    status: 'Active',
    quickbooksSource: true,
    createdAt: now,
    updatedAt: now,
    isDeleted: 'No'
  };
});
const productByName = new Map(products.map(row => [key(row.name), row]));

const customerNames = uniqueBy([
  ...txRows.map(row => clean(row.Contact)),
  ...salesXlsRows.map(row => clean(row.Customer)),
  ...byCustomerRows.map(row => clean(row.customerName))
].filter(Boolean).filter(name => !/total|farmtrack/i.test(name)).map((name, index) => ({ name, index })), row => key(row.name));

const customerTotals = new Map();
for (const row of byCustomerRows) {
  const name = clean(row.customerName);
  if (!name) continue;
  customerTotals.set(key(name), (customerTotals.get(key(name)) || 0) + amount(row.Amount || row.Balance));
}
for (const row of txRows) {
  const name = clean(row.Contact);
  if (!name) continue;
  customerTotals.set(key(name), Math.max(customerTotals.get(key(name)) || 0, amount(row['Total amount'])));
}

const customers = customerNames.map(({ name }, index) => ({
  id: idFor('QBCUST', name, index + 1),
  name,
  email: '',
  phone: '',
  city: '',
  type: /ltd|limited|company|agro|foods|blooms|kephis/i.test(name) ? 'Company' : 'Customer',
  creditLimit: Math.max(50000, Math.round((customerTotals.get(key(name)) || 0) * 1.5)),
  balance: 0,
  status: 'Active',
  health: 'Imported',
  quickbooksSource: true,
  createdAt: now,
  updatedAt: now,
  isDeleted: 'No'
}));
const customerByName = new Map(customers.map(row => [key(row.name), row]));

const invoices = uniqueBy(txRows.filter(row => key(row.Type).includes('invoice')).map((row, index) => {
  const customer = customerByName.get(key(row.Contact));
  const total = amount(row['Total amount']);
  const balance = amount(row.Balance);
  return {
    id: idFor('QBINV', row['Ref no.'] || row.Contact, index + 1),
    invNo: String(row['Ref no.'] || `QB-${index + 1}`),
    customerId: customer?.id || '',
    customerName: clean(row.Contact),
    date: excelDate(row.Date),
    dueDate: excelDate(row['Due date'] || row.Date),
    subtotal: Math.round(total / 1.16),
    tax: Math.max(0, total - Math.round(total / 1.16)),
    total,
    paid: Math.max(0, total - balance),
    balance,
    status: clean(row.Status) || (balance > 0 ? 'Open' : 'Paid'),
    approvalStatus: 'Auto Approved',
    type: 'QuickBooks Invoice',
    quickbooksSource: true,
    createdAt: row['Last modified date'] || now,
    updatedAt: row['Last modified date'] || now,
    isDeleted: 'No'
  };
}), row => row.invNo);

const sales = invoices.map(inv => ({
  id: `QBSALE-${inv.id}`,
  saleNo: `QB-SALE-${inv.invNo}`,
  customerId: inv.customerId,
  customerName: inv.customerName,
  date: inv.date,
  subtotal: inv.subtotal,
  tax: inv.tax,
  total: inv.total,
  paid: inv.paid,
  balance: inv.balance,
  status: inv.status,
  approvalStatus: 'Auto Approved',
  paymentMethod: inv.paid > 0 ? 'QuickBooks' : 'Credit',
  quickbooksSource: true,
  createdAt: inv.createdAt,
  updatedAt: inv.updatedAt,
  isDeleted: 'No'
}));
const saleByNo = new Map(sales.map(row => [row.saleNo.replace('QB-SALE-', ''), row]));
const invoiceByNo = new Map(invoices.map(row => [row.invNo, row]));

const saleItems = byCustomerRows.map((row, index) => {
  const sale = saleByNo.get(clean(row.No)) || sales[index % Math.max(1, sales.length)];
  const product = productByName.get(key(row['Product/Service'])) || products[index % Math.max(1, products.length)];
  const qty = amount(row.Qty) || 1;
  const unitPrice = amount(row['Sales Price']) || product?.sellingPrice || amount(row.Amount);
  return {
    id: `QBITEM-${index + 1}`,
    saleId: sale?.id || '',
    productId: product?.id || '',
    productName: product?.name || clean(row['Product/Service']) || 'QuickBooks Item',
    quantity: qty,
    unitPrice,
    cost: Math.round(unitPrice * 0.62),
    total: amount(row.Amount) || qty * unitPrice,
    salesRepName: clean(row.salesRepName),
    createdAt: now,
    updatedAt: now,
    isDeleted: 'No'
  };
});
const invoiceItems = saleItems.map((item, index) => {
  const sale = sales.find(row => row.id === item.saleId);
  const inv = sale ? invoiceByNo.get(String(sale.saleNo).replace('QB-SALE-', '')) : null;
  return {
    id: `QBINVITEM-${index + 1}`,
    invoiceId: inv?.id || '',
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.total,
    createdAt: now,
    updatedAt: now,
    isDeleted: 'No'
  };
});

const inventory = products.filter(row => row.type !== 'Service').map((product, index) => {
  const stock = inventoryByProduct.get(key(product.name)) || {};
  const qty = amount(stock['Qty On Hand']);
  return {
    id: `QBINVSTOCK-${index + 1}`,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    warehouseName: 'QuickBooks Main Store',
    batchNo: `QB-${String(index + 1).padStart(4, '0')}`,
    quantity: qty,
    unitCost: product.costPrice,
    expiryDate: '',
    receivedDate: now.slice(0, 10),
    status: qty <= 0 ? 'Out of Stock' : 'In Stock',
    quickbooksSource: true,
    createdAt: now,
    updatedAt: now,
    isDeleted: 'No'
  };
});

const expenses = expenseRows.map((row, index) => ({
  id: `QBEXP-${index + 1}`,
  expNo: clean(row.No) || `QB-EXP-${index + 1}`,
  category: clean(row.Category) || 'QuickBooks Expense',
  date: excelDate(row.Date),
  description: `${clean(row.Type) || 'Expense'} - ${clean(row.Payee) || 'QuickBooks'}`,
  payee: clean(row.Payee),
  amount: amount(row.Total || row['Total before sales tax']),
  tax: amount(row['Sales tax']),
  paymentMethod: /mpesa/i.test(row.Category) ? 'Mpesa' : /bank/i.test(row.Payee) ? 'Bank' : 'QuickBooks',
  status: 'Paid',
  quickbooksSource: true,
  createdAt: now,
  updatedAt: now,
  isDeleted: 'No'
})).filter(row => row.amount > 0 || row.payee || row.category);

const accounts = accountRows.map((row, index) => ({
  id: `QBACC-${index + 1}`,
  code: `QB-${String(index + 1).padStart(4, '0')}`,
  name: clean(row['Account name']),
  type: clean(row['Account type']) || 'Other',
  detailType: clean(row['Detail type']),
  normalBalance: /income|revenue|liabilit|equity/i.test(row['Account type']) ? 'Credit' : 'Debit',
  balance: 0,
  status: 'Active',
  quickbooksSource: true
})).filter(row => row.name);

const paymentMethods = uniqueBy(paymentRows.map((row, index) => ({
  id: `QBPM-${index + 1}`,
  name: clean(row['Payment method'] || row['Payment Method']),
  status: 'Active',
  quickbooksSource: true
})).filter(row => row.name), row => key(row.name));

const reps = uniqueBy(byRepRows.map(row => clean(row.salesRepName)).filter(Boolean).map((name, index) => ({ name, index })), row => key(row.name));
const calls = customers.slice(0, 80).map((customer, index) => ({
  id: `QBCALL-${index + 1}`,
  customerId: customer.id,
  customerName: customer.name,
  phone: customer.phone,
  whatsapp: customer.phone,
  stage: ['To Be Called', 'Pending Calls', 'Already Called', 'To Be Meeting'][index % 4],
  notes: 'Imported from QuickBooks customer activity for human testing',
  assignedTo: reps[index % Math.max(1, reps.length)]?.name || 'Mary Sales',
  createdAt: now,
  updatedAt: now,
  isDeleted: 'No'
}));
const leads = customers.slice(0, 40).map((customer, index) => ({
  id: `QBLEAD-${index + 1}`,
  name: `${customer.name} follow-up`,
  email: '',
  phone: '',
  company: customer.name,
  source: 'QuickBooks Import',
  stage: ['New', 'Contacted', 'Proposal', 'Negotiation'][index % 4],
  value: Math.round((customerTotals.get(key(customer.name)) || 0) * 0.45),
  assignedTo: reps[index % Math.max(1, reps.length)]?.name || 'Mary Sales',
  notes: 'QuickBooks customer should be reviewed by CRM',
  status: 'Active',
  createdAt: now,
  updatedAt: now,
  isDeleted: 'No'
}));

const productionProducts = products.filter(row => row.type === 'Finished Product' && !/fee|courier/i.test(row.name)).slice(0, 12);
const productionOrders = productionProducts.map((product, index) => ({
  id: `QBPRODORDER-${index + 1}`,
  orderNo: `QB-MFG-${String(index + 1).padStart(3, '0')}`,
  productId: product.id,
  productName: product.name,
  plannedQty: Math.max(100, Math.round((inventory.find(row => row.productId === product.id)?.quantity || 100) * 0.15)),
  completedQty: index % 3 === 0 ? 0 : Math.max(50, Math.round((inventory.find(row => row.productId === product.id)?.quantity || 100) * 0.08)),
  wastageQty: index % 4,
  startDate: now.slice(0, 10),
  endDate: '',
  status: index % 3 === 0 ? 'Pending' : index % 3 === 1 ? 'In Progress' : 'Completed',
  assignedTo: ['Grace Production', 'Peter Warehouse', 'Miko Admin'][index % 3],
  materialCost: product.costPrice * 50,
  revenue: product.sellingPrice * 50,
  gainPercent: product.sellingPrice ? Math.round(((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100) : 0,
  quickbooksSource: true
}));
const rawMaterials = productionProducts.slice(0, 10).map((product, index) => ({
  id: `QBRM-${index + 1}`,
  materialCode: `QB-RM-${String(index + 1).padStart(3, '0')}`,
  materialName: `${product.name} input material`,
  category: product.category || 'QuickBooks Raw Material',
  productName: product.name,
  unitOfMeasure: String(product.unit || 'pcs').toUpperCase(),
  baseUnit: product.unit || 'pcs',
  currentQuantity: Math.max(100, Math.round((inventory.find(row => row.productId === product.id)?.quantity || 100) * 0.25)),
  availableQuantity: Math.max(100, Math.round((inventory.find(row => row.productId === product.id)?.quantity || 100) * 0.25)),
  reservedQuantity: 0,
  consumedQuantity: 0,
  costPerUnit: product.costPrice,
  batchNumber: `QB-RM-${String(index + 1).padStart(3, '0')}`,
  supplier: 'QuickBooks Inventory',
  warehouse: 'QuickBooks Main Store',
  storageLocation: `QB-${index + 1}`,
  receivedDate: now.slice(0, 10),
  manufactureDate: now.slice(0, 10),
  expiryDate: '',
  status: 'Available',
  quickbooksSource: true
}));
const unitOfMeasure = [
  ['PCS', 'Pieces', 'count'], ['BAG', 'Bags', 'count'], ['PACKET', 'Packets', 'count'], ['BOX', 'Boxes', 'count'],
  ['KG', 'Kilograms', 'mass'], ['G', 'Grams', 'mass'], ['L', 'Litres', 'volume'], ['ML', 'Millilitres', 'volume'],
  ['SERVICE', 'Service', 'count']
].map(([code, name, family]) => ({ id: `QB-UOM-${code}`, code, name, family, status: 'Active', quickbooksSource: true }));
const unitConversions = [
  { fromUnit: 'BOX', toUnit: 'PACKET', factor: 12 },
  { fromUnit: 'KG', toUnit: 'G', factor: 1000 },
  { fromUnit: 'L', toUnit: 'ML', factor: 1000 }
].map((row, index) => ({ id: `QB-UCON-${index + 1}`, ...row, status: 'Active', quickbooksSource: true }));
const rawMaterialBatches = rawMaterials.map((material, index) => ({
  id: `QB-RMB-${index + 1}`,
  batchNumber: material.batchNumber,
  materialId: material.id,
  materialName: material.materialName,
  supplier: material.supplier,
  quantity: material.currentQuantity,
  availableQuantity: material.availableQuantity,
  reservedQuantity: material.reservedQuantity,
  unit: material.unitOfMeasure,
  cost: material.currentQuantity * material.costPerUnit,
  costPerBaseUnit: material.costPerUnit,
  receivedDate: material.receivedDate,
  expiryDate: material.expiryDate,
  warehouse: material.warehouse,
  storageLocation: material.storageLocation,
  status: 'Available',
  quickbooksSource: true
}));
const productFormulas = productionProducts.map((product, index) => ({
  id: `QB-FORM-${index + 1}`,
  productName: product.name,
  formulaName: `${product.name} QuickBooks formula`,
  activeVersion: 'v1.0',
  outputQuantity: 1,
  outputUnit: String(product.unit || 'PCS').toUpperCase(),
  status: 'Active',
  quickbooksSource: true
}));
const formulaVersions = productFormulas.map((formula, index) => {
  const material = rawMaterials[index % Math.max(1, rawMaterials.length)] || rawMaterials[0];
  return {
    id: `QB-FV-${index + 1}`,
    formulaId: formula.id,
    version: 'v1.0',
    materialId: material?.id || '',
    materialName: material?.materialName || 'QuickBooks Material',
    quantity: 1,
    unit: material?.unitOfMeasure || 'PCS',
    effectiveFrom: now.slice(0, 10),
    status: 'Active',
    quickbooksSource: true
  };
});
const productionBatches = productionOrders.filter(order => order.status === 'Completed').map((order, index) => ({
  id: `QB-PB-${index + 1}`,
  batchNo: `QB-BATCH-${String(index + 1).padStart(3, '0')}`,
  productionOrderId: order.id,
  orderNo: order.orderNo,
  productName: order.productName,
  quantityProduced: order.completedQty,
  unit: 'PCS',
  wasteQuantity: order.wastageQty,
  productionDate: now.slice(0, 10),
  operator: order.assignedTo,
  qualityStatus: 'Passed',
  packagingStatus: 'Packed',
  inventoryTransfer: 'Finished Goods',
  productionCost: order.materialCost,
  salesRevenue: order.revenue,
  profit: order.revenue - order.materialCost,
  profitMargin: order.revenue ? Math.round(((order.revenue - order.materialCost) / order.revenue) * 100) : 0,
  status: 'Completed',
  quickbooksSource: true
}));
const rawMaterialConsumption = productionBatches.map((batch, index) => {
  const material = rawMaterials[index % Math.max(1, rawMaterials.length)] || rawMaterials[0];
  const qty = Math.max(1, Math.round(batch.quantityProduced * 0.15));
  return {
    id: `QB-RMC-${index + 1}`,
    productionOrder: batch.orderNo,
    productionOrderId: batch.productionOrderId,
    materialId: material?.id || '',
    materialName: material?.materialName || 'QuickBooks Material',
    batchNumber: material?.batchNumber || '',
    quantityConsumed: qty,
    quantityBase: qty,
    unit: material?.unitOfMeasure || 'PCS',
    costConsumed: qty * amount(material?.costPerUnit),
    operator: batch.operator,
    date: batch.productionDate,
    quickbooksSource: true
  };
});
const productionBatchCosts = productionBatches.map((batch, index) => ({
  id: `QB-PBC-${index + 1}`,
  batchNo: batch.batchNo,
  productName: batch.productName,
  materialCost: batch.productionCost,
  laborCost: Math.round(batch.productionCost * 0.08),
  overheadCost: Math.round(batch.productionCost * 0.05),
  totalCost: Math.round(batch.productionCost * 1.13),
  costPerUnit: batch.quantityProduced ? Math.round((batch.productionCost * 1.13) / batch.quantityProduced) : 0,
  quickbooksSource: true
}));
const productionStorageHistory = productionBatches.map((batch, index) => ({
  id: `QB-PSH-${index + 1}`,
  batchNo: batch.batchNo,
  productName: batch.productName,
  quantityProduced: batch.quantityProduced,
  dateProduced: batch.productionDate,
  costProduced: batch.productionCost,
  operator: batch.operator,
  qualityCheck: 'Passed',
  packagingEvent: 'Packed',
  inventoryTransfer: 'Finished Goods',
  saleStatus: 'Available',
  quickbooksSource: true
}));
const productionQualityChecks = productionBatches.map((batch, index) => ({
  id: `QB-QC-${index + 1}`,
  batchNo: batch.batchNo,
  productName: batch.productName,
  parameter: 'QuickBooks import review',
  result: 'Passed',
  inspector: 'Quality Team',
  date: batch.productionDate,
  status: 'Passed',
  quickbooksSource: true
}));
const productionDowntime = productionOrders.slice(0, 5).map((order, index) => ({
  id: `QB-DT-${index + 1}`,
  orderNo: order.orderNo,
  reason: index % 2 ? 'Packaging queue' : 'Material review',
  minutes: 15 + index * 7,
  operator: order.assignedTo,
  date: now.slice(0, 10),
  impact: index > 2 ? 'Medium' : 'Low',
  quickbooksSource: true
}));
const productionCapacity = [
  { id: 'QB-CAP-1', resource: 'QuickBooks Assembly Bench', type: 'Work Center', dailyCapacity: 1200, scheduled: 420, available: 780, unit: 'PCS', status: 'Available', quickbooksSource: true },
  { id: 'QB-CAP-2', resource: 'QuickBooks Packaging Line', type: 'Machine', dailyCapacity: 2400, scheduled: 900, available: 1500, unit: 'PCS', status: 'Available', quickbooksSource: true }
];
const productionCalendar = ['Daily', 'Weekly', 'Monthly', 'Yearly'].map((period, index) => ({
  id: `QB-PCAL-${index + 1}`,
  period,
  plannedOrders: Math.max(1, Math.round(productionOrders.length / (index + 1))),
  plannedOutput: productionOrders.reduce((sum, row) => sum + amount(row.plannedQty), 0),
  status: 'Planned',
  quickbooksSource: true
}));
const manufacturingDocuments = [{ id: 'QB-DOC-1', title: 'QuickBooks imported item production notes', type: 'Import', productName: productionProducts[0]?.name || 'QuickBooks Product', version: 'v1.0', status: 'Active', quickbooksSource: true }];
const batchRecalls = [];

const bankTransactions = [...txRows, ...salesXlsRows].slice(0, 300).map((row, index) => ({
  id: `QBBTX-${index + 1}`,
  date: excelDate(row.Date),
  accountName: /payment/i.test(row.Type) ? 'KCB Bank' : 'Accounts Receivable',
  transactionType: clean(row.Type) || 'QuickBooks Transaction',
  reference: clean(row['Ref no.'] || row.No),
  payee: clean(row.Contact || row.Customer),
  description: clean(row.Memo || row.Status || row.Type),
  amount: amount(row['Total amount'] || row.Amount),
  status: clean(row.Status) || 'Posted',
  quickbooksSource: true
})).filter(row => row.reference || row.payee || row.amount);

const seed = {
  version: 1,
  source: 'QuickBooks uploads 2026-06-29',
  importedAt: now,
  sourceFiles: Object.fromEntries(Object.entries(sourceFiles).map(([name, file]) => [name, path.basename(file)])),
  counts: {
    accounts: accounts.length,
    customers: customers.length,
    products: products.length,
    inventory: inventory.length,
    sales: sales.length,
    saleItems: saleItems.length,
    invoices: invoices.length,
    invoiceItems: invoiceItems.length,
    expenses: expenses.length,
    paymentMethods: paymentMethods.length,
    leads: leads.length,
    calls: calls.length,
    productionOrders: productionOrders.length,
    productionBatches: productionBatches.length,
    rawMaterials: rawMaterials.length,
    unitConversions: unitConversions.length,
    bankTransactions: bankTransactions.length
  },
  data: {
    financeAccounts: accounts,
    customers,
    products,
    inventory,
    sales,
    saleItems,
    invoices,
    invoiceItems,
    expenses,
    paymentMethods,
    leads,
    calls,
    productionOrders,
    rawMaterials,
    rawMaterialBatches,
    unitOfMeasure,
    unitConversions,
    productFormulas,
    formulaVersions,
    productionBatches,
    productionBatchCosts,
    rawMaterialConsumption,
    productionStorageHistory,
    productionQualityChecks,
    productionDowntime,
    productionCapacity,
    productionCalendar,
    manufacturingDocuments,
    batchRecalls,
    bankTransactions,
    inventoryWarehouses: [{ id: 'QB-WH-1', name: 'QuickBooks Main Store', location: 'Nairobi', capacity: 20000, used: inventory.reduce((sum, row) => sum + amount(row.quantity), 0), manager: 'Peter Warehouse', status: 'Active' }]
  }
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(seed, null, 2));
console.log(`Wrote ${outFile}`);
console.log(seed.counts);
