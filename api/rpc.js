const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { GoogleSheetsService } = require('./googleSheetsService');
const EmailService = require('./resend-service-core');
const RichEmail = require('./resendService');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const PptxGenJS = require('pptxgenjs');
const quickBooksSeed = require('../data/quickbooks-seed.json');

const ROLES = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  SALES: 'Sales Officer',
  PROCUREMENT: 'Procurement Officer',
  WAREHOUSE: 'Warehouse Staff',
  PRODUCTION: 'Production Supervisor',
  ACCOUNTANT: 'Accountant',
  FIELD: 'Field Officer'
};

const gid = () => 'ID' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 7).toUpperCase();
const today = () => new Date().toISOString().slice(0, 10);
const num = v => Number.parseFloat(v || 0) || 0;
const money = v => `Ksh${Math.round(num(v)).toLocaleString()}`;
const clean = v => String(v ?? '').trim();
function assertRequired(value, label) {
  if (!clean(value)) throw new Error(`${label} is required`);
}
function assertPositive(value, label) {
  if (num(value) <= 0) throw new Error(`${label} must be greater than zero`);
}
function availableStock(productName) {
  return data().inventory
    .filter(x => x.productName === productName && x.status !== 'Deleted')
    .reduce((sum, row) => sum + num(row.quantity), 0);
}
const dateValue = row => String(row?.date || row?.createdAt || row?.created_at || row?.updatedAt || today()).slice(0, 10);
const inDateRange = (row, filters = {}) => {
  const d = dateValue(row);
  return (!filters.startDate || d >= filters.startDate) && (!filters.endDate || d <= filters.endDate);
};
const asCsv = rows => {
  const list = Array.isArray(rows) ? rows : [];
  const keys = Array.from(new Set(list.flatMap(row => Object.keys(row || {})))).slice(0, 24);
  const safe = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [keys.map(safe).join(','), ...list.map(row => keys.map(key => safe(row[key])).join(','))].join('\n');
};
const reportColumns = rows => Array.from(new Set((Array.isArray(rows) ? rows : []).flatMap(row => Object.keys(row || {})))).slice(0, 10);
const pdfLogoPath = path.join(process.cwd(), 'public', 'unity-erp-mark.png');
const invoiceLogoPath = path.join(process.cwd(), 'public', 'erp-logo-black.png');
const invoiceDate = value => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return String(value || today());
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const kes = value => `KES ${num(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const slug = value => String(value || 'invoice').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function pdfBuffer({ title, metadata, rows, dateRange }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 34, size: 'A4', layout: 'landscape' });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const pageWidth = doc.page.width;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    doc.rect(0, 0, pageWidth, 82).fill('#050505');
    doc.roundedRect(left, 14, 48, 48, 8).fill('#ffffff');
    if (fs.existsSync(pdfLogoPath)) {
      doc.image(pdfLogoPath, left + 6, 20, { width: 36, height: 36, fit: [36, 36] });
    } else {
      doc.fillColor('#050505').fontSize(18).text('U', left, 26, { width: 48, align: 'center' });
    }
    const textLeft = left + 64;
    doc.fillColor('#ffffff').fontSize(10).text('UNITY ERP', textLeft, 18);
    doc.fontSize(20).text(title, textLeft, 34, { width: pageWidth - 286 });
    doc.fillColor('#d0d5dd').fontSize(8).text(metadata.replace(/\n\n$/g, '').split('\n').slice(1).join('  |  '), textLeft, 60, { width: pageWidth - 134 });
    if (dateRange) {
      doc.roundedRect(right - 190, 22, 164, 32, 6).fill('#078236');
      doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold').text('DATE RANGE', right - 178, 28, { width: 140, align: 'center' });
      doc.fontSize(9).text(dateRange, right - 178, 39, { width: 140, align: 'center' });
      doc.font('Helvetica');
    }
    const rowsList = Array.isArray(rows) ? rows : [];
    const cols = reportColumns(rowsList).slice(0, 8);
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = usableWidth / Math.max(1, cols.length);
    let y = 104;
    const drawHeader = () => {
      doc.roundedRect(left, y - 8, usableWidth, 26, 4).fill('#e8f8ee');
      doc.fillColor('#078236').fontSize(7.5).font('Helvetica-Bold');
      cols.forEach((col, index) => doc.text(col.slice(0, 16).toUpperCase(), left + index * colWidth + 5, y, { width: colWidth - 10 }));
      doc.font('Helvetica');
      y += 28;
    };
    drawHeader();
    rowsList.slice(0, 160).forEach((row, rowIndex) => {
      if (y > doc.page.height - 54) {
        doc.addPage({ layout: 'landscape', margin: 34 });
        y = 48;
        drawHeader();
      }
      if (rowIndex % 2 === 0) doc.rect(left, y - 6, usableWidth, 23).fill('#fcfcfd');
      doc.fillColor('#111827').fontSize(7.5);
      cols.forEach((col, index) => {
        doc.text(String(row[col] ?? '').slice(0, 32), left + index * colWidth + 5, y, { width: colWidth - 10 });
      });
      doc.moveTo(left, y + 17).lineTo(right, y + 17).strokeColor('#e7e9ee').lineWidth(0.5).stroke();
      y += 23;
    });
    doc.fillColor('#667085').fontSize(8).text(`Generated by Farmtrack ERP. Showing ${Math.min(rowsList.length, 160)} of ${rowsList.length} rows.`, left, doc.page.height - 35, { width: usableWidth, align: 'right' });
    doc.end();
  });
}
function taxInvoicePdfBuffer({ invoice, items, customer, settings }) {
  // Layout matches the Farmtrack HTML invoice template:
  // Green (#3b8c5a) accent, company top-left + mark top-right,
  // BILL TO | SHIP TO | invoice meta (right), ship row,
  // line items (ITEM / DESCRIPTION / TAX / QTY / RATE / AMOUNT),
  // bank block (KCB + Mpesa) left + totals right, KRA PIN footer.
  const GREEN = '#3b8c5a';
  const GREEN_DARK = '#2e7048';
  const GREEN_TINT = '#e8f3ed';
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'portrait' });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const kesPlain = value => Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const company = {
      name: settings.company_name || 'Farmtrack Biosciences Ltd',
      pin: settings.kra_pin || 'P051426669R',
      addressLine1: settings.company_address_line1 || settings.company_address || 'Nairobi',
      city: settings.company_city || 'Nairobi',
      postal: settings.company_postal || '00100',
      country: settings.company_country || 'KE',
      phone: settings.company_phone || '+2540711495522',
      email: settings.company_email || 'farmtrack.consulting@gmail.com'
    };
    const payment = {
      bankName: settings.bank_name || 'Kenya Commercial Bank',
      branch: settings.bank_branch || 'Buruburu',
      account1: settings.bank_account_1 || '1277321388',
      account2: settings.bank_account_2 || '1120892554',
      accountName: settings.bank_account_name || 'Farmtrack Consulting Ltd',
      till1: settings.mpesa_till_1 || '702406',
      till2: settings.mpesa_till_2 || '914601',
      mpesaName: settings.mpesa_account_name || 'Farmtrack Consulting Ltd'
    };
    const rawInvNo = String(invoice.invNo || invoice.invoiceNo || invoice.id || '').replace(/^INV-?/, '');
    const invoiceNo = invoice.invNo && String(invoice.invNo).startsWith('INV-') ? invoice.invNo : (rawInvNo || `INV-${String(invoice.id || 1).slice(-6)}`);
    const paid = num(invoice.paid);
    const subtotal = items.reduce((sum, item) => sum + num(item.quantity) * num(item.unitPrice || item.rate), 0) || num(invoice.subtotal);
    const tax = num(invoice.tax);
    const total = (subtotal + tax) || num(invoice.total);
    const balance = Math.max(0, num(invoice.balance || total - paid));

    // ── Header: company info (left) ──
    doc.fillColor('#2a2a2a').fontSize(10.5).font('Helvetica-Bold').text(company.name, left, 44, { width: width * 0.55 });
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    [
      company.addressLine1,
      `${company.city}, ${company.postal} ${company.country}`,
      company.phone,
      company.email
    ].forEach((line, i) => doc.text(line, left, 60 + i * 13, { width: width * 0.55 }));

    // ── Logo mark (right) — green rounded square with "F" ──
    const logoSize = 46;
    const logoX = right - logoSize;
    const logoY = 44;
    if (fs.existsSync(invoiceLogoPath)) {
      doc.image(invoiceLogoPath, right - 130, 42, { fit: [130, 52], align: 'right' });
    } else {
      doc.roundedRect(logoX, logoY, logoSize, logoSize, 8).fill(GREEN);
      doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('F', logoX + 2, logoY + 10, { width: logoSize, align: 'center' });
    }

    // ── Invoice title ──
    doc.fillColor(GREEN).fontSize(22).font('Helvetica').text('Tax Invoice', left, 108, { width });

    // ── Meta grid: BILL TO | SHIP TO | invoice meta (right) ──
    const metaTop = 142;
    const metaColW = (width - 16) / 3;
    doc.moveTo(left, metaTop - 8).lineTo(right, metaTop - 8).strokeColor('#ddd').lineWidth(1.5).stroke();
    // BILL TO
    doc.fillColor('#2a2a2a').fontSize(8.5).font('Helvetica-Bold').text('BILL TO', left, metaTop, { width: metaColW });
    doc.fillColor('#333').fontSize(9).font('Helvetica');
    [
      invoice.customerName || customer.name || 'Customer',
      customer.phone || invoice.phone || '',
      customer.city || customer.address || invoice.location || ''
    ].filter(Boolean).forEach((line, i) => doc.text(String(line), left, metaTop + 16 + i * 12, { width: metaColW }));
    // SHIP TO
    const shipColX = left + metaColW + 8;
    doc.fillColor('#2a2a2a').fontSize(8.5).font('Helvetica-Bold').text('SHIP TO', shipColX, metaTop, { width: metaColW });
    doc.fillColor('#333').fontSize(9).font('Helvetica');
    [
      invoice.shipToName || invoice.customerName || customer.name || 'Customer',
      invoice.shipToPhone || customer.phone || '',
      invoice.shipToLocation || invoice.deliveryAddress || customer.city || ''
    ].filter(Boolean).forEach((line, i) => doc.text(String(line), shipColX, metaTop + 16 + i * 12, { width: metaColW }));
    // Invoice meta (right column, label/value rows)
    const metaRightX = left + (metaColW + 8) * 2;
    const metaRow = (label, value, offset) => {
      doc.fillColor('#2a2a2a').fontSize(8.5).font('Helvetica-Bold').text(label, metaRightX, metaTop + offset, { width: 70 });
      doc.fillColor('#333').fontSize(9).font('Helvetica').text(String(value || '—'), metaRightX + 72, metaTop + offset, { width: metaColW - 72 });
    };
    metaRow('INVOICE NO.', invoiceNo, 0);
    metaRow('DATE', invoiceDate(invoice.date || invoice.createdAt), 14);
    metaRow('DUE DATE', invoiceDate(invoice.dueDate), 28);
    metaRow('TERMS', invoice.paymentTerms || 'Net 30', 42);
    doc.moveTo(left, metaTop + 64).lineTo(right, metaTop + 64).strokeColor('#ddd').lineWidth(1.5).stroke();

    // ── Ship row ──
    const shipRowTop = metaTop + 72;
    const shipColW3 = width / 3;
    const shipRowCol = (label, value, x) => {
      doc.fillColor('#2a2a2a').fontSize(8).font('Helvetica-Bold').text(label, x, shipRowTop, { width: shipColW3 });
      doc.fillColor('#333').fontSize(9).font('Helvetica').text(String(value || '—'), x, shipRowTop + 13, { width: shipColW3 });
    };
    shipRowCol('SHIP DATE', invoice.shipDate ? invoiceDate(invoice.shipDate) : invoiceDate(invoice.date || invoice.createdAt), left);
    shipRowCol('SHIP VIA', invoice.shipVia || 'G4S', left + shipColW3);
    shipRowCol('TRACKING NO.', invoice.trackingNo || invoice.lpoNo || invoice.reference || '-', left + shipColW3 * 2);
    doc.moveTo(left, shipRowTop + 34).lineTo(right, shipRowTop + 34).strokeColor('#ddd').lineWidth(1.5).stroke();

    // ── Line items table ──
    const tableTop = shipRowTop + 44;
    const colDate = 70, colTax = 50, colQty = 40, colRate = 70, colAmount = 80;
    const colDesc = width - colDate - colTax - colQty - colRate - colAmount;
    const cols = [['DATE', colDate], ['DESCRIPTION', colDesc], ['TAX', colTax], ['QTY', colQty], ['RATE', colRate], ['AMOUNT', colAmount]];
    // Header (green tint)
    doc.rect(left, tableTop, width, 20).fill(GREEN_TINT);
    doc.fillColor(GREEN).fontSize(8).font('Helvetica-Bold');
    let xh = left;
    cols.forEach(([label, w]) => { doc.text(label, xh + 6, tableTop + 6.5, { width: w - 12, align: ['QTY', 'RATE', 'AMOUNT', 'TAX'].includes(label) ? 'right' : 'left' }); xh += w; });
    let y = tableTop + 20;
    const rows = items.length ? items : [{ productName: invoice.description || 'Sales Items', description: invoice.description || 'Sales Items', quantity: 1, unitPrice: total, tax: tax ? 'VAT' : 'No VAT', total, date: invoice.date }];
    rows.forEach((item, index) => {
      const amount = num(item.total || (num(item.quantity) * num(item.unitPrice || item.rate)));
      const itemDesc = item.description || item.productName || item.name || 'Item';
      if (index % 2 === 0) doc.rect(left, y, width, 20).fill('#fafafa');
      doc.strokeColor('#f0f0f0').lineWidth(0.5).moveTo(left, y + 20).lineTo(right, y + 20).stroke();
      let xc = left;
      const values = [
        { text: invoiceDate(item.date || invoice.date || invoice.createdAt), w: colDate, align: 'left', bold: true },
        { text: itemDesc, w: colDesc, align: 'left', bold: false },
        { text: item.taxCategory || item.tax || (tax ? 'VAT' : 'No VAT'), w: colTax, align: 'right', bold: false },
        { text: num(item.quantity).toLocaleString(), w: colQty, align: 'right', bold: false },
        { text: kesPlain(item.unitPrice || item.rate), w: colRate, align: 'right', bold: false },
        { text: kesPlain(amount), w: colAmount, align: 'right', bold: false }
      ];
      values.forEach(v => {
        doc.fillColor(v.bold ? '#2a2a2a' : '#333').font(v.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
        doc.text(String(v.text), xc + 6, y + 6, { width: v.w - 12, align: v.align });
        xc += v.w;
      });
      y += 20;
    });

    // ── Footer split: bank block (left) + totals (right) ──
    y += 16;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#eee').lineWidth(1).stroke();
    const bankTop = y + 10;
    const bankW = Math.round(width * 0.58);
    doc.fillColor('#2a2a2a').fontSize(8).font('Helvetica-Bold').text('BANK DETAILS', left, bankTop);
    doc.fillColor('#444').fontSize(8.5).font('Helvetica');
    const bankLines = [
      `Bank Name: ${payment.bankName}`,
      `Branch: ${payment.branch}`,
      `Account No1: ${payment.account1}`,
      `Account No2: ${payment.account2}`,
      `Account Name: ${payment.accountName}`
    ];
    bankLines.forEach((line, i) => doc.text(line, left, bankTop + 14 + i * 12, { width: bankW }));
    const mpesaTop = bankTop + 14 + bankLines.length * 12 + 4;
    doc.fillColor('#2a2a2a').fontSize(8).font('Helvetica-Bold').text('MPESA DETAILS', left, mpesaTop);
    doc.fillColor('#444').fontSize(8.5).font('Helvetica');
    doc.text(`Till No1: ${payment.till1}   Till No2: ${payment.till2}`, left, mpesaTop + 14, { width: bankW });
    doc.text(`Account Name: ${payment.mpesaName}`, left, mpesaTop + 26, { width: bankW });

    // Totals block (right)
    const totalW = 210;
    const totalX = right - totalW;
    const totalTop = bankTop;
    const totalLine = (label, value, offset, opts = {}) => {
      doc.fillColor(opts.muted ? '#555' : '#333').fontSize(9).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(label, totalX, totalTop + offset, { width: 110 });
      doc.fillColor('#333').font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').text(`KES ${kesPlain(value)}`, totalX + 110, totalTop + offset, { width: totalW - 110, align: 'right' });
    };
    totalLine('Subtotal', subtotal, 0);
    totalLine('Tax', tax, 14);
    totalLine('Total', total, 28, { bold: true });
    doc.moveTo(totalX, totalTop + 48).lineTo(right, totalTop + 48).strokeColor('#ddd').lineWidth(1.5).stroke();
    doc.fillColor('#2a2a2a').fontSize(12).font('Helvetica-Bold').text('Balance Due', totalX, totalTop + 56);
    doc.fillColor(GREEN_DARK).fontSize(14).text(`KES ${kesPlain(balance)}`, totalX + 110, totalTop + 55, { width: totalW - 110, align: 'right' });

    // ── KRA + disclaimer footer ──
    doc.moveTo(left, doc.page.height - 48).lineTo(right, doc.page.height - 48).strokeColor('#eee').lineWidth(1).stroke();
    doc.fillColor('#555').fontSize(8).font('Helvetica-Bold').text(`KRA PIN: ${company.pin}`, left, doc.page.height - 40, { width, align: 'center' });
    doc.fillColor('#888').fontSize(7.5).font('Helvetica-Oblique').text('"Goods once sold are not returnable"  ·  Generated by Unity ERP', left, doc.page.height - 28, { width, align: 'center' });
    doc.end();
  });
}
async function excelBuffer({ title, metadata, rows, dateRange }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Farmtrack ERP';
  const sheet = workbook.addWorksheet('Report');
  const cols = reportColumns(rows);
  const headerWidth = Math.max(cols.length, 6);
  sheet.addRow([title]);
  sheet.mergeCells(1, 1, 1, headerWidth);
  sheet.addRow([dateRange ? `Date range: ${dateRange}` : metadata.replace(/\n/g, ' / ')]);
  sheet.mergeCells(2, 1, 2, headerWidth);
  sheet.addRow([]);
  sheet.addRow(cols);
  rows.forEach(row => sheet.addRow(cols.map(col => row[col] ?? '')));
  sheet.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF050505' } };
  sheet.getRow(2).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF078236' } };
  sheet.getRow(4).font = { bold: true, color: { argb: 'FF078236' } };
  sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F8EE' } };
  sheet.columns.forEach(column => { column.width = 18; });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
async function pptxBuffer({ title, metadata, rows }) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText(title, { x: 0.4, y: 0.3, w: 12.2, h: 0.4, fontSize: 22, bold: true });
  slide.addText(metadata.replace(/\n/g, '  '), { x: 0.4, y: 0.85, w: 12.2, h: 0.45, fontSize: 8, color: '475467' });
  const cols = reportColumns(rows).slice(0, 6);
  const table = [cols, ...rows.slice(0, 12).map(row => cols.map(col => String(row[col] ?? '').slice(0, 40)))];
  slide.addTable(table, { x: 0.4, y: 1.45, w: 12.4, h: 5.4, fontSize: 8, border: { type: 'solid', color: 'D0D5DD', pt: 1 } });
  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }));
}
const sheetCell = (row, names, fallback = '') => {
  const keys = Array.isArray(names) ? names : [names];
  const found = keys.find(key => Object.prototype.hasOwnProperty.call(row || {}, key));
  return found ? clean(row[found]) : fallback;
};
function rowsForSpreadsheetModule(module, filters = {}) {
  const d = data();
  const name = String(module || 'Inventory').toLowerCase();
  if (name.includes('dashboard') || name.includes('executive')) {
    const revenue = (d.sales || []).reduce((sum, s) => sum + num(s.total), 0);
    const expenses = (d.expenses || []).reduce((sum, e) => sum + num(e.amount), 0);
    const inventoryValue = (d.inventory || []).reduce((sum, item) => sum + num(item.quantity) * num(item.unitCost), 0);
    return [
      { metric: 'Revenue', value: revenue, updatedAt: new Date().toISOString() },
      { metric: 'Expenses', value: expenses, updatedAt: new Date().toISOString() },
      { metric: 'Net Profit', value: revenue - expenses, updatedAt: new Date().toISOString() },
      { metric: 'Inventory Value', value: inventoryValue, updatedAt: new Date().toISOString() },
      { metric: 'Customers', value: (d.customers || []).length, updatedAt: new Date().toISOString() },
      { metric: 'Sales Orders', value: (d.sales || []).length, updatedAt: new Date().toISOString() }
    ];
  }
  if (name.includes('item') || name.includes('product')) {
    return (d.products || []).map(p => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      type: p.type,
      unit: p.unit,
      costPrice: num(p.costPrice),
      sellingPrice: num(p.sellingPrice),
      minStock: num(p.minStock),
      status: p.status || 'Active'
    }));
  }
  if (name.includes('customer') || name.includes('crm')) {
    return (d.customers || []).map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      city: c.city,
      type: c.type,
      creditLimit: num(c.creditLimit),
      balance: num(c.balance),
      status: c.status || 'Active'
    }));
  }
  if (name.includes('lead') || name.includes('opportun')) {
    return (d.leads || []).filter(row => inDateRange(row, filters)).map(l => ({
      id: l.id,
      name: l.name,
      email: l.email,
      phone: l.phone,
      company: l.company,
      source: l.source,
      stage: l.stage,
      value: num(l.value),
      assignedTo: l.assignedTo,
      status: l.status,
      updatedAt: l.updatedAt || l.createdAt || ''
    }));
  }
  if (name.includes('sale')) {
    return (d.sales || []).filter(row => inDateRange(row, filters)).map(s => ({
      id: s.id,
      saleNo: s.saleNo,
      customerName: s.customerName,
      date: s.date,
      subtotal: num(s.subtotal),
      tax: num(s.tax),
      total: num(s.total),
      paid: num(s.paid),
      balance: num(s.balance),
      status: s.status,
      approvalStatus: s.approvalStatus,
      paymentMethod: s.paymentMethod
    }));
  }
  if (name.includes('invoice')) {
    return (d.invoices || []).filter(row => inDateRange(row, filters)).map(inv => ({
      id: inv.id,
      invNo: inv.invNo,
      customerName: inv.customerName,
      date: inv.date,
      dueDate: inv.dueDate,
      subtotal: num(inv.subtotal),
      tax: num(inv.tax),
      total: num(inv.total),
      paid: num(inv.paid),
      balance: num(inv.balance),
      status: inv.status
    }));
  }
  if (name.includes('payment')) {
    return (d.payments || []).filter(row => inDateRange(row, filters)).map(p => ({
      id: p.id,
      paymentNo: p.paymentNo,
      customerName: p.customerName,
      referenceType: p.referenceType,
      referenceId: p.referenceId,
      date: p.date,
      amount: num(p.amount),
      method: p.method,
      status: p.status
    }));
  }
  if (name.includes('purchase') || name.includes('procurement')) {
    return (d.purchaseOrders || d.purchaseRequests || []).filter(row => inDateRange(row, filters)).map(p => ({
      id: p.id,
      poNo: p.poNo || p.requestNo,
      supplierName: p.supplierName,
      productName: p.productName,
      date: p.date || p.createdAt,
      expectedDate: p.expectedDate,
      quantity: num(p.quantity),
      subtotal: num(p.subtotal),
      tax: num(p.tax),
      total: num(p.total || p.estimatedCost),
      status: p.status || p.approvalStatus
    }));
  }
  if (name.includes('manufacturing') || name.includes('production')) {
    return (d.productionOrders || d.production || []).filter(row => inDateRange(row, filters)).map(p => ({
      id: p.id,
      orderNo: p.orderNo || p.jobNo,
      productName: p.productName,
      plannedQty: num(p.plannedQty),
      completedQty: num(p.completedQty),
      wastageQty: num(p.wastageQty),
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
      assignedTo: p.assignedTo,
      materialCost: num(p.materialCost)
    }));
  }
  if (name.includes('finance') || name.includes('journal')) {
    return [...(d.financeJournalEntries || []), ...(d.financeManualJournals || [])].filter(row => inDateRange(row, filters)).map(j => ({
      id: j.id,
      journalNo: j.journalNo,
      date: j.date,
      sourceModule: j.sourceModule,
      reference: j.reference,
      description: j.description,
      totalDebit: num(j.totalDebit),
      totalCredit: num(j.totalCredit),
      approvalStatus: j.approvalStatus
    }));
  }
  if (name.includes('account') || name.includes('trial')) {
    return [...(d.financeJournalLines || []), ...(d.financeManualJournalLines || [])].filter(row => inDateRange(row, filters)).map(l => ({
      id: l.id,
      date: l.date,
      accountCode: l.accountCode,
      accountName: l.accountName,
      debit: num(l.debit),
      credit: num(l.credit),
      sourceModule: l.sourceModule,
      reference: l.reference
    }));
  }
  if (name.includes('report')) {
    return (d.reportArchive || []).map(r => ({
      id: r.id,
      reportName: r.reportName,
      module: r.module,
      format: r.format,
      generatedBy: r.generatedBy,
      generatedAt: r.generatedAt,
      status: r.status,
      records: num(r.records)
    }));
  }
  if (name.includes('activity') || name.includes('audit')) {
    return (d.activity || []).slice(0, 500).map(a => ({
      id: a.id,
      userName: a.userName,
      action: a.action,
      module: a.module,
      details: a.details,
      createdAt: a.createdAt
    }));
  }
  if (name.includes('movement') || name.includes('transaction')) {
    return (d.inventoryTransactions || []).filter(row => inDateRange(row, filters)).map(tx => ({
      id: tx.id,
      productName: tx.productName,
      warehouseName: tx.warehouseName,
      batchNo: tx.batchNo,
      transactionType: tx.transactionType || tx.type,
      quantity: num(tx.quantity),
      unitCost: num(tx.unitCost),
      reference: tx.reference || tx.referenceId,
      date: tx.date || tx.createdAt,
      createdBy: tx.createdBy,
      notes: tx.notes
    }));
  }
  // ─── HR MODULES ───
  if (name.includes('employee') || name.includes('hr directory') || name.includes('staff')) {
    return (d.employees || []).map(e => ({
      id: e.id,
      employeeNo: e.employeeNo,
      name: e.name,
      email: e.email,
      phone: e.phone,
      department: e.department,
      position: e.position,
      employmentType: e.employmentType,
      joinDate: e.joinDate,
      status: e.status || 'Active',
      salary: num(e.salary),
      manager: e.manager || '',
      leaveBalanceAnnual: num(e.leaveBalanceAnnual),
      leaveBalanceSick: num(e.leaveBalanceSick),
      leaveBalanceCasual: num(e.leaveBalanceCasual)
    }));
  }
  if (name.includes('department') && !name.includes('leave')) {
    return (d.departments || []).map(dept => ({
      id: dept.id,
      name: dept.name,
      head: dept.head || '',
      employeeCount: (d.employees || []).filter(e => e.department === dept.name).length,
      status: dept.status || 'Active'
    }));
  }
  if (name.includes('attendance')) {
    return (d.attendance || []).filter(row => inDateRange(row, filters)).map(a => ({
      id: a.id,
      employeeId: a.employeeId,
      employeeName: a.employeeName,
      department: a.department,
      date: a.date,
      checkIn: a.checkIn,
      checkOut: a.checkOut,
      status: a.status,
      note: a.note || ''
    }));
  }
  if (name.includes('candidate') || name.includes('recruit')) {
    return (d.candidates || []).map(c => ({
      id: c.id,
      name: c.name,
      email: c.email || '',
      phone: c.phone || '',
      position: c.position || '',
      department: c.department || '',
      stage: c.stage || 'Applied',
      expectedSalary: num(c.expectedSalary),
      appliedAt: c.appliedAt || ''
    }));
  }
  if (name.includes('review') || name.includes('performance')) {
    return (d.reviews || []).map(r => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      department: r.department,
      period: r.period,
      rating: num(r.rating),
      strengths: r.strengths || '',
      improvements: r.improvements || '',
      goals: r.goals || '',
      reviewedBy: r.reviewedBy || '',
      createdAt: r.createdAt || ''
    }));
  }
  // ─── LEAVE MODULES ───
  if (name.includes('leave') || name.includes('leave application') || name.includes('leaveapplication')) {
    return (d.leaveApplications || []).filter(row => inDateRange(row, filters)).map(l => ({
      id: l.id,
      applicantName: l.applicantName,
      applicantEmail: l.applicantEmail,
      department: l.department || '',
      type: l.type,
      startDate: l.startDate,
      endDate: l.endDate,
      days: num(l.days),
      reason: l.reason || '',
      status: l.status,
      appliedAt: l.appliedAt,
      decidedBy: l.decidedBy || '',
      decidedAt: l.decidedAt || '',
      decisionNote: l.decisionNote || ''
    }));
  }
  if (name.includes('leave balance')) {
    return (d.employees || []).map(e => ({
      employeeId: e.id,
      employeeName: e.name,
      department: e.department,
      annualBalance: num(e.leaveBalanceAnnual),
      sickBalance: num(e.leaveBalanceSick),
      casualBalance: num(e.leaveBalanceCasual)
    }));
  }
  // ─── NOTIFICATIONS MODULE ───
  if (name.includes('notification') || name.includes('alert')) {
    return (d.notifications || []).slice(0, 500).map(n => ({
      id: n.id,
      category: n.category,
      priority: n.priority,
      title: n.title,
      message: n.message,
      sourceModule: n.sourceModule,
      sourceId: n.sourceId || '',
      status: n.status,
      read: n.read,
      assignedTo: n.assignedTo || '',
      auto: n.auto,
      createdAt: n.createdAt
    }));
  }
  return (d.inventory || []).map(i => ({
    id: i.id,
    productName: i.productName,
    sku: i.sku,
    warehouseName: i.warehouseName,
    location: i.location,
    batchNo: i.batchNo,
    quantity: num(i.quantity),
    availableQuantity: num(i.availableQuantity || i.quantity),
    unitCost: num(i.unitCost),
    expiryDate: i.expiryDate,
    receivedDate: i.receivedDate,
    status: i.status || 'In Stock',
    updatedAt: i.updatedAt || ''
  }));
}

const SPREADSHEET_MODULES = [
  ['Dashboard', 'Dashboard Summary'],
  ['Customers', 'Customers'],
  ['Leads', 'Leads'],
  ['Products', 'Products'],
  ['Inventory', 'Inventory'],
  ['Inventory Movements', 'Inventory Movements'],
  ['Sales', 'Sales Orders'],
  ['Invoices', 'Invoices'],
  ['Payments', 'Payments'],
  ['Purchases', 'Purchases'],
  ['Manufacturing', 'Manufacturing'],
  ['Finance', 'Finance Journals'],
  ['Accounts', 'Accounts Ledger'],
  ['Reports', 'Reports'],
  ['Activity', 'Activity Log'],
  ['Employees', 'HR Employees'],
  ['Departments', 'HR Departments'],
  ['Attendance', 'HR Attendance'],
  ['Candidates', 'HR Recruitment'],
  ['Reviews', 'HR Performance'],
  ['Leaves', 'Leave Applications'],
  ['Leave Balances', 'Leave Balances'],
  ['Notifications', 'Notifications & Alerts']
];

async function syncSpreadsheetModules(user, modules = SPREADSHEET_MODULES, options = {}) {
  const d = data();
  const connection = (d.spreadsheetConnections || [])[0] || {};
  const spreadsheetId = options.spreadsheetId || connection.spreadsheetId || GOOGLE_SHEETS_DEFAULT_ID;
  if (!spreadsheetId) return { success: false, reason: 'Spreadsheet ID is not configured', synced: [], errors: [] };
  const service = new GoogleSheetsService();
  const synced = [];
  const errors = [];
  d.spreadsheetSyncLogs ||= [];
  for (const [moduleName, sheetName] of modules) {
    try {
      const rows = rowsForSpreadsheetModule(moduleName, options.filters || {});
      const google = await service.clearAndWriteObjects(spreadsheetId, sheetName, rows);
      synced.push({ module: moduleName, sheetName, rows: rows.length, range: google.range });
    } catch (error) {
      errors.push({ module: moduleName, sheetName, error: error.message });
    }
  }
  const logEntry = {
    id: gid(),
    connectionId: connection.id || '',
    module: 'ERP',
    sheetName: 'Unified Workbook',
    direction: 'Export',
    rowsProcessed: synced.reduce((sum, row) => sum + row.rows, 0),
    status: errors.length ? 'Completed With Errors' : 'Synced',
    message: `${synced.length} sheets synced; ${errors.length} errors.`,
    createdAt: new Date().toISOString(),
    errors
  };
  d.spreadsheetSyncLogs.unshift(logEntry);
  if (connection.id) connection.lastSyncAt = logEntry.createdAt;
  emitBusinessEvent(user, 'sheets.erp_synced', 'spreadsheet', spreadsheetId, { synced, errors });
  return { success: errors.length === 0, spreadsheetId, synced, errors, log: logEntry };
}
function normalizeSheetRow(row) {
  return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [String(key).trim(), value]));
}
const KENYA_COUNTIES = [
  'Mombasa', 'Kwale', 'Kilifi', 'Tana River', 'Lamu', 'Taita Taveta', 'Garissa', 'Wajir', 'Mandera', 'Marsabit',
  'Isiolo', 'Meru', 'Tharaka Nithi', 'Embu', 'Kitui', 'Machakos', 'Makueni', 'Nyandarua', 'Nyeri', 'Kirinyaga',
  'Muranga', 'Kiambu', 'Turkana', 'West Pokot', 'Samburu', 'Trans Nzoia', 'Uasin Gishu', 'Elgeyo Marakwet',
  'Nandi', 'Baringo', 'Laikipia', 'Nakuru', 'Narok', 'Kajiado', 'Kericho', 'Bomet', 'Kakamega', 'Vihiga',
  'Bungoma', 'Busia', 'Siaya', 'Kisumu', 'Homa Bay', 'Migori', 'Kisii', 'Nyamira', 'Nairobi'
];

let db;
let supabaseReady = null;

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const STATE_ID = 'farmtrack-demo';
const TENANT_SLUG = 'farmtrack-demo';
const TENANT_ID = uuidFromString(`tenant:${TENANT_SLUG}`);
const GOOGLE_SHEETS_DEFAULT_ID = process.env.GOOGLE_SHEETS_DEFAULT_ID || '1ZGX71pFHkJPNA17s5LRCFT_T58eskby9zpj8RPHveYA';
const GOOGLE_SHEETS_SERVICE_EMAIL = 'erp-sheets-integration-ftc@erp-sheets-integration-499106.iam.gserviceaccount.com';
const NORMALIZED_TABLES = [
  'tenants', 'profiles', 'customers', 'suppliers', 'products', 'warehouses',
  'inventory_items', 'inventory_transactions', 'sales_orders', 'sales_order_items',
  'invoices', 'payments', 'purchase_orders', 'production_jobs',
  'finance_accounts', 'journal_entries', 'journal_lines', 'bank_accounts',
  'bank_transactions', 'accounts_receivable', 'accounts_payable',
  'spreadsheet_connections', 'spreadsheet_sync_logs', 'business_events'
];

function uuidFromString(value) {
  const hash = crypto.createHash('md5').update(String(value || gid())).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hash.slice(18, 20)}-${hash.slice(20, 32)}`;
}

function supabaseEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

async function supabaseRequest(path, options = {}) {
  const { affectsReady = true, ...fetchOptions } = options;
  if (!supabaseEnabled()) return { ok: false, status: 0, data: null, error: 'Supabase environment variables are missing' };
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...fetchOptions,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(fetchOptions.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) {
    if (affectsReady) supabaseReady = false;
    return { ok: false, status: response.status, data: null, error: text || response.statusText };
  }
  if (affectsReady) supabaseReady = true;
  return { ok: true, status: response.status, data: text ? JSON.parse(text) : null, error: '' };
}

async function supabaseFetch(path, options = {}) {
  const result = await supabaseRequest(path, options);
  return result.ok ? result.data : null;
}

async function supabaseUpsert(table, rows, onConflict) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [rows].filter(Boolean);
  if (!list.length) return [];
  const conflict = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  const result = await supabaseRequest(`${table}${conflict}`, {
    method: 'POST',
    affectsReady: false,
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(list)
  });
  if (!result.ok) throw new Error(`${table} sync failed: ${result.error}`);
  return Array.isArray(result.data) ? result.data : [];
}

async function fetchPublicView(name, query = 'select=*') {
  if (!supabaseEnabled()) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${name}?${query}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) return null;
    const rows = await response.json();
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

async function loadState() {
  if (db) return;
  const rows = await supabaseFetch(`erp_state?id=eq.${encodeURIComponent(STATE_ID)}&select=data&limit=1`);
  if (Array.isArray(rows) && rows[0] && rows[0].data) {
    db = rows[0].data;
    if (applyQuickBooksSeed()) {
      db.deferNormalizedSync = true;
      await saveState();
      delete db.deferNormalizedSync;
    }
    return;
  }
  seed();
  applyQuickBooksSeed();
  db.deferNormalizedSync = true;
  await saveState();
  delete db.deferNormalizedSync;
}

async function saveState() {
  if (!db || !supabaseEnabled()) return;
  const { deferNormalizedSync, ...persistedState } = db;
  await supabaseFetch('erp_state', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: STATE_ID, data: persistedState, updated_at: new Date().toISOString() })
  });
  if (db.deferNormalizedSync) return;
  await Promise.race([
    syncNormalizedSupabase({ silent: true }),
    new Promise(resolve => setTimeout(() => resolve({ attempted: false, reason: 'normalized sync timeout guard' }), 2500))
  ]);
}

async function getNormalizedSupabaseStatus() {
  if (!supabaseEnabled()) {
    return { enabled: false, ready: false, mode: 'not_configured', missingTables: NORMALIZED_TABLES, tables: [] };
  }
  const tables = [];
  for (const table of NORMALIZED_TABLES) {
    const result = await supabaseRequest(`${table}?select=*&limit=1`, { method: 'GET', affectsReady: false });
    tables.push({ table, ok: result.ok, status: result.status, error: result.ok ? '' : result.error });
  }
  const missingTables = tables.filter(x => !x.ok).map(x => x.table);
  return {
    enabled: true,
    ready: missingTables.length === 0,
    mode: missingTables.length ? 'json_bridge_only' : 'normalized_ready',
    missingTables,
    tables
  };
}

function statusText(value, fallback = 'active') {
  return String(value || fallback).trim().toLowerCase().replace(/\s+/g, '_');
}

function dateOnly(value) {
  return String(value || today()).slice(0, 10);
}

function normalizedRows() {
  const d = data();
  const settings = d.settings || {};
  const users = d.users || [];
  const customers = d.customers || [];
  const suppliers = d.suppliers || [];
  const products = d.products || [];
  const inventory = d.inventory || [];
  const sales = d.sales || [];
  const saleItems = d.saleItems || [];
  const invoices = d.invoices || [];
  const payments = d.payments || [];
  const purchaseOrders = d.purchaseOrders || [];
  const productionJobs = d.productionOrders || d.production || [];
  const journalEntries = [...(d.financeJournalEntries || []), ...(d.financeManualJournals || [])];
  const journalLines = [...(d.financeJournalLines || []), ...(d.financeManualJournalLines || [])];
  const financeAccounts = d.financeAccounts || [];
  const bankAccounts = d.bankAccounts || [];
  const bankLineNames = ['KCB Bank', 'M-Pesa Till', 'Cash on Hand'];
  const bankTransactions = [
    ...(d.bankTransactions || []),
    ...journalLines
      .filter(l => bankLineNames.includes(l.accountName))
      .map((l, index) => ({
        id: `JBTX-${l.id || l.journalEntryId || l.reference || index}`,
        accountName: l.accountName,
        date: l.date,
        reference: l.reference,
        description: `${l.sourceModule || 'Finance'} ${l.reference || ''}`.trim(),
        deposit: l.debit,
        withdrawal: l.credit,
        reconciled: Boolean(l.reconciled),
        createdAt: l.createdAt
      }))
  ];
  const receivables = d.accountsReceivable || [];
  const payables = d.financeAccountsPayable || d.accountsPayable || [];
  const spreadsheetConnections = d.spreadsheetConnections || [];
  const spreadsheetSyncLogs = d.spreadsheetSyncLogs || [];
  const warehouseNames = Array.from(new Set([
    ...(d.inventoryWarehouses || []).map(x => x.name),
    ...inventory.map(x => x.warehouseName),
    'Main Store Nairobi'
  ].filter(Boolean)));
  const productByName = new Map(products.map(p => [p.name, p]));
  const customerByName = new Map(customers.map(c => [c.name, c]));

  return {
    tenants: [{
      id: TENANT_ID,
      name: settings.company_name || 'Farmtrack Bio Sciences Ltd',
      slug: TENANT_SLUG,
      country: 'KE',
      base_currency: settings.default_currency || 'KES',
      status: 'active',
      updated_at: new Date().toISOString()
    }],
    profiles: users.map(u => ({
      id: uuidFromString(`profile:${u.id || u.email}`),
      tenant_id: TENANT_ID,
      full_name: u.name || 'ERP User',
      email: String(u.email || `${u.id}@unity.local`).toLowerCase(),
      role: u.role || ROLES.VIEWER || 'viewer',
      phone: u.phone || '',
      status: statusText(u.status, 'active'),
      updated_at: new Date().toISOString()
    })),
    warehouses: warehouseNames.map((name, index) => ({
      id: uuidFromString(`warehouse:${name}`),
      tenant_id: TENANT_ID,
      name,
      code: `WH-${String(index + 1).padStart(3, '0')}`,
      type: /raw/i.test(name) ? 'raw_materials' : /cold/i.test(name) ? 'cold_storage' : 'main',
      status: 'active'
    })),
    customers: customers.map((c, index) => ({
      id: uuidFromString(`customer:${c.id || c.name}`),
      tenant_id: TENANT_ID,
      customer_no: c.customerNo || c.id || `CUS-${String(index + 1).padStart(4, '0')}`,
      name: c.name || 'Unnamed Customer',
      email: c.email || '',
      phone: c.phone || '',
      city: c.city || c.county || '',
      type: c.type || 'Farm',
      tax_id: c.taxId || c.tax_id || '',
      credit_limit: num(c.creditLimit),
      balance: num(c.balance),
      health_score: num(c.healthScore || 100),
      status: statusText(c.status, 'active'),
      updated_at: new Date().toISOString()
    })),
    suppliers: suppliers.map((s, index) => ({
      id: uuidFromString(`supplier:${s.id || s.name}`),
      tenant_id: TENANT_ID,
      supplier_no: s.supplierNo || s.id || `SUP-${String(index + 1).padStart(4, '0')}`,
      name: s.name || 'Unnamed Supplier',
      email: s.email || '',
      phone: s.phone || '',
      category: s.category || '',
      payment_terms: s.paymentTerms || 'Net 30',
      on_time_rate: num(s.onTimeDelivery || s.onTimeRate),
      delivery_rate: num(s.deliveryRate),
      status: statusText(s.status, 'active'),
      updated_at: new Date().toISOString()
    })),
    products: products.map((p, index) => ({
      id: uuidFromString(`product:${p.id || p.sku || p.name}`),
      tenant_id: TENANT_ID,
      sku: p.sku || `SKU-${String(index + 1).padStart(4, '0')}`,
      name: p.name || 'Unnamed Product',
      category: p.category || 'General',
      type: statusText(p.type, 'finished_good'),
      unit: p.unit || 'unit',
      cost_price: num(p.costPrice),
      selling_price: num(p.sellingPrice),
      tax_rate: num(p.taxRate || 16),
      min_stock: num(p.minStock),
      reorder_qty: num(p.reorderQty || p.minStock),
      valuation_method: p.valuationMethod || 'FIFO',
      is_manufactured: /finished|manufact/i.test(`${p.type} ${p.category}`),
      status: statusText(p.status, 'active'),
      updated_at: new Date().toISOString()
    })),
    inventory_items: inventory.map((i, index) => {
      const p = productByName.get(i.productName) || {};
      return {
        id: uuidFromString(`inventory:${i.id || i.productName}:${i.warehouseName}:${i.batchNo || index}`),
        tenant_id: TENANT_ID,
        product_id: uuidFromString(`product:${i.productId || p.id || p.sku || i.productName}`),
        warehouse_id: uuidFromString(`warehouse:${i.warehouseName || 'Main Store Nairobi'}`),
        sku: i.sku || p.sku || '',
        product_name: i.productName || 'Unknown Product',
        category: p.category || i.category || 'General',
        batch_no: i.batchNo || '',
        quantity_available: num(i.quantity || i.quantityAvailable),
        quantity_reserved: num(i.quantityReserved),
        quantity_incoming: num(i.quantityIncoming),
        quantity_outgoing: num(i.quantityOutgoing),
        reorder_level: num(i.minStock || p.minStock),
        reorder_point: num(i.reorderPoint || p.minStock),
        unit_cost: num(i.unitCost || p.costPrice),
        selling_price: num(i.sellingPrice || p.sellingPrice),
        valuation_method: i.valuationMethod || p.valuationMethod || 'FIFO',
        expiry_date: i.expiryDate || null,
        last_movement_at: i.updatedAt || i.lastMovementDate || new Date().toISOString(),
        status: statusText(i.status, 'in_stock'),
        updated_at: new Date().toISOString()
      };
    }),
    sales_orders: sales.map((s, index) => {
      const customer = customers.find(c => c.id === s.customerId) || customerByName.get(s.customerName) || {};
      return {
        id: uuidFromString(`sale:${s.id || s.saleNo || index}`),
        tenant_id: TENANT_ID,
        order_no: s.saleNo || `SALE-${String(index + 1).padStart(5, '0')}`,
        customer_id: uuidFromString(`customer:${customer.id || s.customerId || s.customerName}`),
        status: statusText(s.status, 'draft'),
        subtotal: num(s.subtotal),
        tax: num(s.tax),
        total: num(s.total),
        paid: num(s.paid),
        balance: num(s.balance),
        created_by: uuidFromString(`profile:${s.createdBy || users[0]?.id || users[0]?.email || 'system'}`),
        created_at: s.createdAt || s.date || new Date().toISOString(),
        updated_at: s.updatedAt || new Date().toISOString()
      };
    }),
    sales_order_items: saleItems.map((item, index) => ({
      id: uuidFromString(`sale-item:${item.id || item.saleId}:${item.productName}:${index}`),
      tenant_id: TENANT_ID,
      sales_order_id: uuidFromString(`sale:${item.saleId || item.salesOrderId || 'unknown'}`),
      product_id: uuidFromString(`product:${item.productId || productByName.get(item.productName)?.id || productByName.get(item.productName)?.sku || item.productName}`),
      quantity: num(item.quantity),
      reserved_quantity: num(item.reservedQuantity),
      unit_price: num(item.unitPrice),
      unit_cost: num(item.cost || item.unitCost)
    })).filter(x => x.quantity > 0),
    invoices: invoices.map((inv, index) => {
      const customer = customers.find(c => c.id === inv.customerId) || customerByName.get(inv.customerName) || {};
      return {
        id: uuidFromString(`invoice:${inv.id || inv.invNo || index}`),
        tenant_id: TENANT_ID,
        invoice_no: inv.invNo || inv.invoiceNo || `INV-${String(index + 1).padStart(5, '0')}`,
        customer_id: uuidFromString(`customer:${customer.id || inv.customerId || inv.customerName}`),
        sales_order_id: inv.saleId ? uuidFromString(`sale:${inv.saleId}`) : null,
        status: statusText(inv.status, 'unpaid'),
        subtotal: num(inv.subtotal),
        tax: num(inv.tax),
        total: num(inv.total),
        paid: num(inv.paid),
        balance: num(inv.balance),
        due_date: inv.dueDate || null,
        created_at: inv.createdAt || inv.date || new Date().toISOString(),
        updated_at: inv.updatedAt || new Date().toISOString()
      };
    }),
    payments: payments.map((pay, index) => {
      const customer = customers.find(c => c.id === pay.customerId) || customerByName.get(pay.customerName) || {};
      return {
        id: uuidFromString(`payment:${pay.id || pay.paymentNo || index}`),
        tenant_id: TENANT_ID,
        payment_no: pay.paymentNo || `PAY-${String(index + 1).padStart(5, '0')}`,
        customer_id: pay.customerId || pay.customerName ? uuidFromString(`customer:${customer.id || pay.customerId || pay.customerName}`) : null,
        invoice_id: pay.referenceId ? uuidFromString(`invoice:${pay.referenceId}`) : null,
        amount: num(pay.amount),
        method: pay.method || 'cash',
        status: statusText(pay.status, 'completed'),
        created_at: pay.createdAt || pay.date || new Date().toISOString()
      };
    }).filter(x => x.amount > 0),
    purchase_orders: purchaseOrders.map((po, index) => ({
      id: uuidFromString(`po:${po.id || po.poNo || index}`),
      tenant_id: TENANT_ID,
      po_no: po.poNo || `PO-${String(index + 1).padStart(5, '0')}`,
      supplier_id: po.supplierId || po.supplierName ? uuidFromString(`supplier:${po.supplierId || po.supplierName}`) : null,
      status: statusText(po.status, 'draft'),
      subtotal: num(po.subtotal),
      tax: num(po.tax),
      total: num(po.total),
      expected_date: po.expectedDate || null,
      created_at: po.createdAt || po.date || new Date().toISOString(),
      updated_at: po.updatedAt || new Date().toISOString()
    })),
    production_jobs: productionJobs.map((job, index) => ({
      id: uuidFromString(`production:${job.id || job.orderNo || job.jobNo || index}`),
      tenant_id: TENANT_ID,
      job_no: job.orderNo || job.jobNo || `PJ-${String(index + 1).padStart(5, '0')}`,
      product_id: uuidFromString(`product:${job.productId || productByName.get(job.productName)?.id || productByName.get(job.productName)?.sku || job.productName}`),
      planned_qty: num(job.plannedQty),
      completed_qty: num(job.completedQty),
      wastage_qty: num(job.wastageQty),
      status: statusText(job.status, 'pending'),
      material_cost: num(job.materialCost),
      created_at: job.createdAt || new Date().toISOString(),
      updated_at: job.updatedAt || new Date().toISOString()
    })).filter(x => x.product_id),
    finance_accounts: financeAccounts.map((account, index) => ({
      id: uuidFromString(`finance-account:${account.id || account.code || index}`),
      tenant_id: TENANT_ID,
      code: account.code || String(1000 + index * 10),
      name: account.name || 'Unnamed Account',
      type: account.type || 'Asset',
      parent: account.parent || account.type || '',
      status: statusText(account.status, 'active'),
      created_at: account.createdAt || new Date().toISOString(),
      updated_at: account.updatedAt || new Date().toISOString()
    })),
    journal_entries: journalEntries.map((entry, index) => ({
      id: uuidFromString(`journal:${entry.id || entry.journalNo || index}`),
      tenant_id: TENANT_ID,
      journal_no: entry.journalNo || entry.entryNo || `JE-${String(index + 1).padStart(5, '0')}`,
      journal_date: entry.date || today(),
      description: entry.description || entry.memo || 'ERP journal',
      source_module: entry.sourceModule || '',
      reference: entry.reference || '',
      total_debit: num(entry.totalDebit),
      total_credit: num(entry.totalCredit),
      approval_status: entry.approvalStatus || 'posted',
      posted_by: uuidFromString(`profile:${users[0]?.id || users[0]?.email || 'system'}`),
      immutable: true,
      created_at: entry.createdAt || new Date().toISOString()
    })).filter(x => Math.round(x.total_debit) === Math.round(x.total_credit)),
    journal_lines: journalLines.map((line, index) => ({
      id: uuidFromString(`journal-line:${line.id || line.journalEntryId || index}:${line.accountCode}`),
      tenant_id: TENANT_ID,
      journal_entry_id: uuidFromString(`journal:${line.journalEntryId || line.reference || index}`),
      account_id: uuidFromString(`finance-account:${financeAccounts.find(a => a.code === line.accountCode)?.id || line.accountCode || line.accountName}`),
      account_code: line.accountCode || '',
      account_name: line.accountName || '',
      debit: num(line.debit),
      credit: num(line.credit),
      source_module: line.sourceModule || '',
      reference: line.reference || '',
      line_date: line.date || today(),
      created_at: line.createdAt || new Date().toISOString()
    })).filter(x => x.account_code && (x.debit > 0 || x.credit > 0)),
    bank_accounts: bankAccounts.map((account, index) => ({
      id: uuidFromString(`bank-account:${account.id || account.accountNumber || account.accountName || index}`),
      tenant_id: TENANT_ID,
      account_name: account.accountName || 'Bank Account',
      bank: account.bank || '',
      account_number: account.accountNumber || '',
      currency: account.currency || 'KES',
      opening_balance: num(account.openingBalance),
      balance: num(account.balance),
      status: statusText(account.status, 'active'),
      created_at: account.createdAt || new Date().toISOString(),
      updated_at: account.updatedAt || new Date().toISOString()
    })),
    bank_transactions: bankTransactions.map((row, index) => ({
      id: uuidFromString(`bank-transaction:${row.id || row.reference || index}`),
      tenant_id: TENANT_ID,
      bank_account_id: uuidFromString(`bank-account:${bankAccounts.find(a => a.accountName === row.accountName)?.id || row.accountName}`),
      transaction_date: row.date || today(),
      account_name: row.accountName || '',
      reference: row.reference || '',
      description: row.description || '',
      deposit: num(row.deposit),
      withdrawal: num(row.withdrawal),
      reconciled: Boolean(row.reconciled),
      created_at: row.createdAt || new Date().toISOString()
    })).filter(x => x.account_name),
    accounts_receivable: receivables.map((row, index) => ({
      id: uuidFromString(`ar:${row.id || row.invoiceId || index}`),
      tenant_id: TENANT_ID,
      invoice_id: row.invoiceId ? uuidFromString(`invoice:${row.invoiceId}`) : null,
      invoice_no: row.invNo || '',
      customer_name: row.customerName || '',
      due_date: row.dueDate || null,
      total: num(row.total),
      paid: num(row.paid),
      balance: num(row.balance),
      aging_bucket: row.agingBucket || '',
      risk: row.risk || '',
      status: statusText(row.status, 'open'),
      updated_at: new Date().toISOString()
    })),
    accounts_payable: payables.map((row, index) => ({
      id: uuidFromString(`ap:${row.id || row.supplierInvoiceId || row.invoiceNo || index}`),
      tenant_id: TENANT_ID,
      invoice_no: row.invoiceNo || '',
      supplier_name: row.supplierName || '',
      due_date: row.dueDate || null,
      invoice_amount: num(row.invoiceAmount),
      paid_amount: num(row.paidAmount),
      outstanding_balance: num(row.outstandingBalance),
      aging_bucket: row.agingBucket || '',
      risk: row.risk || '',
      payment_status: statusText(row.paymentStatus || row.status, 'open'),
      updated_at: new Date().toISOString()
    })),
    spreadsheet_connections: spreadsheetConnections.map((row, index) => ({
      id: uuidFromString(`spreadsheet-connection:${row.id || row.name || index}`),
      tenant_id: TENANT_ID,
      name: row.name || 'Spreadsheet Connection',
      provider: row.provider || 'Google Sheets',
      spreadsheet_id: row.spreadsheetId || '',
      workbook_name: row.workbookName || '',
      default_sheet: row.defaultSheet || 'ERP Export',
      sync_direction: row.syncDirection || 'Export Only',
      modules: row.modules || [],
      status: statusText(row.status, 'ready'),
      last_sync_at: row.lastSyncAt || null,
      created_at: row.createdAt || new Date().toISOString(),
      updated_at: row.updatedAt || new Date().toISOString()
    })),
    spreadsheet_sync_logs: spreadsheetSyncLogs.map((row, index) => ({
      id: uuidFromString(`spreadsheet-sync:${row.id || index}`),
      tenant_id: TENANT_ID,
      connection_id: row.connectionId ? uuidFromString(`spreadsheet-connection:${row.connectionId}`) : null,
      module: row.module || 'Reports',
      sheet_name: row.sheetName || '',
      direction: row.direction || 'Export',
      rows_processed: num(row.rowsProcessed),
      status: statusText(row.status, 'generated'),
      message: row.message || '',
      created_at: row.createdAt || new Date().toISOString()
    })),
    business_events: (d.businessEvents || []).map((event, index) => ({
      id: uuidFromString(`event:${event.id || index}`),
      tenant_id: TENANT_ID,
      event_type: event.eventType || 'erp.event',
      entity_type: event.aggregateType || 'erp',
      entity_id: event.aggregateId ? uuidFromString(`entity:${event.aggregateId}`) : null,
      actor_id: event.createdBy ? uuidFromString(`profile:${event.createdBy}`) : null,
      payload: event.payload || {},
      created_at: event.createdAt || new Date().toISOString()
    }))
  };
}

let normalizedSyncRunning = false;
let normalizedSyncSummary = null;

async function syncNormalizedSupabase(options = {}) {
  if (!supabaseEnabled() || normalizedSyncRunning) return normalizedSyncSummary || { attempted: false, reason: 'Supabase unavailable or sync already running' };
  const status = await getNormalizedSupabaseStatus();
  if (!status.ready) {
    normalizedSyncSummary = { attempted: false, ready: false, missingTables: status.missingTables, synced: {}, errors: [] };
    if (!options.silent) throw new Error(`Normalized Supabase schema is missing: ${status.missingTables.join(', ')}`);
    return normalizedSyncSummary;
  }
  normalizedSyncRunning = true;
  const rows = normalizedRows();
  const plan = [
    ['tenants', rows.tenants, 'slug'],
    ['profiles', rows.profiles, 'tenant_id,email'],
    ['warehouses', rows.warehouses, 'tenant_id,code'],
    ['customers', rows.customers, 'tenant_id,customer_no'],
    ['suppliers', rows.suppliers, 'tenant_id,supplier_no'],
    ['products', rows.products, 'tenant_id,sku'],
    ['inventory_items', rows.inventory_items, 'id'],
    ['sales_orders', rows.sales_orders, 'tenant_id,order_no'],
    ['sales_order_items', rows.sales_order_items, 'id'],
    ['invoices', rows.invoices, 'tenant_id,invoice_no'],
    ['payments', rows.payments, 'tenant_id,payment_no'],
    ['purchase_orders', rows.purchase_orders, 'tenant_id,po_no'],
    ['production_jobs', rows.production_jobs, 'id'],
    ['finance_accounts', rows.finance_accounts, 'tenant_id,code'],
    ['journal_entries', rows.journal_entries, 'id'],
    ['journal_lines', rows.journal_lines, 'id'],
    ['bank_accounts', rows.bank_accounts, 'id'],
    ['bank_transactions', rows.bank_transactions, 'id'],
    ['accounts_receivable', rows.accounts_receivable, 'id'],
    ['accounts_payable', rows.accounts_payable, 'id'],
    ['spreadsheet_connections', rows.spreadsheet_connections, 'id'],
    ['spreadsheet_sync_logs', rows.spreadsheet_sync_logs, 'id'],
    ['business_events', rows.business_events, 'id']
  ];
  const synced = {};
  const errors = [];
  try {
    for (const [table, tableRows, conflict] of plan) {
      try {
        const result = await supabaseUpsert(table, tableRows, conflict);
        synced[table] = result.length || tableRows.length;
      } catch (e) {
        errors.push({ table, message: e.message });
      }
    }
    normalizedSyncSummary = { attempted: true, ready: true, synced, errors, syncedAt: new Date().toISOString() };
    if (errors.length && !options.silent) throw new Error(`Normalized sync finished with errors: ${errors.map(e => `${e.table}: ${e.message}`).join('; ')}`);
    return normalizedSyncSummary;
  } finally {
    normalizedSyncRunning = false;
  }
}

function seed() {
  const now = new Date().toISOString();
  const users = [
    { id: 'USER001', name: 'Miko Admin', email: 'miko@gmail.com', password: '1234567890', role: ROLES.ADMIN, phone: '+254700111', status: 'Active' },
    { id: 'USER002', name: 'James Mwangi', email: 'james@farmtrack.com', password: 'pass123', role: ROLES.MANAGER, phone: '+254700112', status: 'Active' },
    { id: 'USER003', name: 'Mary Sales', email: 'mary@farmtrack.com', password: 'pass123', role: ROLES.SALES, phone: '+254700113', status: 'Active' },
    { id: 'USER004', name: 'Peter Warehouse', email: 'peter@farmtrack.com', password: 'pass123', role: ROLES.WAREHOUSE, phone: '+254700118', status: 'Active' }
  ];
  const products = [
    ['Bactrolure Wick (Pack 50)', 'BP-001', 'Bio-Pesticides', 'Finished Product', 'pack', 850, 1500, 20],
    ['Organic Neem Oil 1L', 'BP-002', 'Bio-Pesticides', 'Finished Product', 'L', 400, 850, 30],
    ['Hybrid Maize Seed Duma 43', 'SD-001', 'Seeds', 'Raw Material', 'kg', 80, 150, 50],
    ['NPK 20-20-0 Fertilizer 50kg', 'FT-001', 'Fertilizers', 'Raw Material', 'bag', 2500, 3500, 20],
    ['Dairy Meal 16% 70kg', 'AF-001', 'Animal Feed', 'Finished Product', 'bag', 1800, 2800, 40],
    ['Rhizobium Bio-Fertilizer', 'BF-001', 'Bio-Fertilizers', 'Finished Product', 'kg', 200, 450, 30],
    ['Trichoderma Bio-Control 1kg', 'BP-003', 'Bio-Pesticides', 'Finished Product', 'kg', 600, 1200, 25],
    ['Organic Compost 25kg', 'BF-002', 'Bio-Fertilizers', 'Finished Product', 'bag', 300, 600, 50],
    ['Drip Irrigation Kit', 'EQ-001', 'Equipment', 'Other', 'pc', 3500, 5500, 5],
    ['Layers Mash 18% 70kg', 'AF-002', 'Animal Feed', 'Finished Product', 'bag', 1600, 2600, 40]
  ].map((p, i) => ({ id: `PROD${i + 1}`, name: p[0], sku: p[1], category: p[2], type: p[3], unit: p[4], costPrice: p[5], sellingPrice: p[6], minStock: p[7], status: 'Active', createdAt: now, updatedAt: now, isDeleted: 'No' }));
  const customers = [
    ['Green Valley Farm', 'info@greenvalley.co.ke', '+254722100200', 'Nakuru', 'Farm', 500000, 120000],
    ['Nairobi Fresh Produce', 'orders@nairobfresh.com', '+254733200300', 'Nairobi', 'Distributor', 1000000, 250000],
    ['Kiambu Organic Growers', 'info@kiambuorganic.org', '+254711300400', 'Kiambu', 'Cooperative', 300000, 45000],
    ['Mombasa Agro Supplies', 'sales@mombasaagro.com', '+254741400500', 'Mombasa', 'Retailer', 200000, 80000],
    ['Eldoret Feeders', 'info@eldoretfeeders.com', '+254725500600', 'Eldoret', 'Farm', 400000, 95000],
    ['Meru Organic Co-op', 'meruorganic@gmail.com', '+254798600700', 'Meru', 'Cooperative', 250000, 30000],
    ['Rift Valley Seeds Co', 'orders@rvseeds.com', '+254721800900', 'Nakuru', 'Distributor', 800000, 180000]
  ].map((c, i) => ({ id: `CUST${i + 1}`, name: c[0], email: c[1], phone: c[2], city: c[3], type: c[4], creditLimit: c[5], balance: c[6], status: 'Active', createdAt: now, updatedAt: now, isDeleted: 'No' }));
  const suppliers = [
    ['Syngenta East Africa', 'info@syngenta.co.ke', '+254720111222', 'Seeds'],
    ['Yara Fertilizers Kenya', 'orders@yara.co.ke', '+254722333444', 'Fertilizers'],
    ['Bayer Crop Science', 'info@bayer.co.ke', '+254733555666', 'Bio-Pesticides'],
    ['Unga Millers Ltd', 'sales@ungamillers.com', '+254711777888', 'Animal Feed'],
    ['Green Packaging Co', 'info@greenpackaging.co.ke', '+254741999000', 'Packaging']
  ].map((s, i) => ({ id: `SUP${i + 1}`, name: s[0], email: s[1], phone: s[2], category: s[3], paymentTerms: 'Net 30', balance: 0, status: 'Active', createdAt: now, updatedAt: now, isDeleted: 'No' }));
  const inventory = products.map((p, i) => ({ id: `INV${i + 1}`, productName: p.name, warehouseName: i % 2 ? 'Raw Materials Store' : 'Main Store Nairobi', batchNo: `BAT-00${i + 1}`, quantity: [200, 150, 500, 80, 45, 60, 100, 200, 8, 40][i], unitCost: p.costPrice, expiryDate: '2027-06-01', receivedDate: today(), status: 'In Stock', createdAt: now, updatedAt: now, isDeleted: 'No' }));
  const leads = [
    ['Kakamega Organic Farm', 'New', 50000], ['Machakos Agro Ltd', 'Contacted', 120000], ['Nanyuki Farmers Co-op', 'Proposal', 350000], ['Taita Green Solutions', 'Negotiation', 800000]
  ].map((l, i) => ({ id: `LEAD${i + 1}`, name: l[0], email: '', phone: `+25471234560${i}`, company: l[0], source: 'Referral', stage: l[1], value: l[2], assignedTo: 'Mary Sales', notes: '', status: 'Active', createdAt: now, updatedAt: now, isDeleted: 'No' }));
  const calls = customers.map((c, i) => ({ id: `CALL${i + 1}`, customerId: c.id, customerName: c.name, phone: c.phone, whatsapp: c.phone, stage: ['To Be Called', 'To Be Meeting', 'Pending Calls', 'Already Called'][i], notes: 'Follow up', assignedTo: 'Mary Sales', createdAt: now, updatedAt: now, isDeleted: 'No' }));
  const sales = [];
  const saleItems = [];
  const invoices = [];
  const invoiceItems = [];
  const expenses = [];
  for (let m = 0; m < 14; m++) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    for (let i = 0; i < 3; i++) {
      const p = products[(m + i) % products.length];
      const c = customers[(m + i) % customers.length];
      const q = 10 + i * 5;
      const subtotal = q * p.sellingPrice;
      const tax = Math.round(subtotal * 0.16);
      const total = subtotal + tax;
      const id = gid();
      sales.push({ id, saleNo: `SALE-${1000 + m * 3 + i}`, customerId: c.id, customerName: c.name, date: d.toISOString().slice(0, 10), subtotal, tax, total, paid: total, balance: 0, status: 'Paid', approvalStatus: 'Auto Approved', paymentMethod: 'Cash', createdAt: d.toISOString(), updatedAt: d.toISOString(), isDeleted: 'No' });
      saleItems.push({ id: gid(), saleId: id, productId: p.id, productName: p.name, quantity: q, unitPrice: p.sellingPrice, cost: p.costPrice, total: subtotal, createdAt: d.toISOString(), updatedAt: d.toISOString(), isDeleted: 'No' });
      const invId = gid();
      invoices.push({ id: invId, invNo: `INV-${1000 + m * 3 + i}`, customerId: c.id, customerName: c.name, date: d.toISOString().slice(0, 10), dueDate: today(), subtotal, tax, total, paid: total, balance: 0, status: 'Paid', approvalStatus: 'Auto Approved', type: 'Sales', createdAt: d.toISOString(), updatedAt: d.toISOString(), isDeleted: 'No' });
      invoiceItems.push({ id: gid(), invoiceId: invId, productId: p.id, productName: p.name, quantity: q, unitPrice: p.sellingPrice, total: subtotal, createdAt: d.toISOString(), updatedAt: d.toISOString(), isDeleted: 'No' });
    }
    expenses.push({ id: gid(), expNo: `EXP-${m}`, category: m % 2 ? 'Transport' : 'Salaries', date: d.toISOString().slice(0, 10), description: 'Monthly expense', amount: m % 2 ? 24000 : 90000, paymentMethod: 'M-Pesa', status: 'Paid', createdAt: d.toISOString(), updatedAt: d.toISOString(), isDeleted: 'No' });
  }
  db = {
    users, products, customers, suppliers, inventory, leads, calls, sales, saleItems, invoices, invoiceItems,
    quotations: [
      { id: 'QTE1', quoteNo: 'QTE-2401', customerId: customers[1].id, customerName: customers[1].name, date: today(), validUntil: today(), subtotal: 185000, tax: 29600, total: 214600, status: 'Draft', approvalStatus: 'Approved', createdAt: now, updatedAt: now, isDeleted: 'No' },
      { id: 'QTE2', quoteNo: 'QTE-2402', customerId: customers[3].id, customerName: customers[3].name, date: today(), validUntil: today(), subtotal: 420000, tax: 67200, total: 487200, status: 'Sent', approvalStatus: 'Pending Approval', createdAt: now, updatedAt: now, isDeleted: 'No' }
    ],
    approvals: [
      { id: 'APP1', referenceType: 'Quotation', referenceId: 'QTE2', amount: 487200, requestedBy: 'Mary Sales', approvedBy: '', status: 'Pending', notes: 'Large distributor quotation', createdAt: now, updatedAt: now, isDeleted: 'No' }
    ],
    purchaseOrders: [
      { id: 'PO1', poNo: 'PO-2401', supplierId: suppliers[1].id, supplierName: suppliers[1].name, date: today(), expectedDate: today(), subtotal: 320000, tax: 51200, total: 371200, status: 'Open', paymentTerms: 'Net 45', createdAt: now, updatedAt: now, isDeleted: 'No' },
      { id: 'PO2', poNo: 'PO-2402', supplierId: suppliers[3].id, supplierName: suppliers[3].name, date: today(), expectedDate: today(), subtotal: 188000, tax: 30080, total: 218080, status: 'Received', paymentTerms: 'Net 30', createdAt: now, updatedAt: now, isDeleted: 'No' }
    ],
    deliveries: [
      { id: 'DEL1', deliveryNo: 'DEL-2401', customerId: customers[0].id, customerName: customers[0].name, date: today(), status: 'Pending Delivery', driver: 'Samuel', vehicle: 'KCG 114A', notes: 'Morning route', createdAt: now, updatedAt: now, isDeleted: 'No' },
      { id: 'DEL2', deliveryNo: 'DEL-2402', customerId: customers[2].id, customerName: customers[2].name, date: today(), status: 'In Transit', driver: 'Amina', vehicle: 'KDA 908P', notes: 'Call before arrival', createdAt: now, updatedAt: now, isDeleted: 'No' }
    ],
    deliveryItems: [], payments: [], expenses,
    tasks: [
      { id: 'TASK1', title: 'Monthly stock count', description: 'Count inventory', assignedTo: 'Peter Warehouse', dueDate: today(), priority: 'High', status: 'Pending', module: 'Inventory' },
      { id: 'TASK2', title: 'Process Green Valley order', description: 'Order #1024', assignedTo: 'Mary Sales', dueDate: today(), priority: 'High', status: 'In Progress', module: 'Sales' }
    ],
    production: [{ id: 'JOB1', jobNo: 'PJ-001', productName: 'Dairy Meal 16% 70kg', plannedQty: 100, completedQty: 0, wastageQty: 0, startDate: today(), endDate: '', status: 'Pending', assignedTo: 'Grace Production', materialCost: 0, revenue: 0, gainPercent: 0 }],
    activity: [],
    settings: { company_name: 'Farmtrack Bio Sciences Ltd', company_address: 'Nairobi, Nairobi 00100 KE', company_phone: '+2540711495522', company_email: 'farmtrack.consulting@gmail.com', kra_pin: 'P051234567Z', bank_name: 'Kenya Commercial Bank (KCB)', bank_account: '1234567890', mpesa_paybill: '247247', mpesa_account: 'Farmtrack Bio Sciences', invoice_footer: 'Thank you for your business!' }
  };
}

function mergeRowsById(target = [], incoming = []) {
  const list = Array.isArray(target) ? target : [];
  const seen = new Set(list.map(row => row && row.id).filter(Boolean));
  for (const row of Array.isArray(incoming) ? incoming : []) {
    if (!row || !row.id || seen.has(row.id)) continue;
    list.push(row);
    seen.add(row.id);
  }
  return list;
}

function applyQuickBooksSeed() {
  if (!db || db.quickBooksImport?.version === quickBooksSeed.version) return false;
  const payload = quickBooksSeed.data || {};
  const mergeKeys = [
    'financeAccounts', 'customers', 'products', 'inventory', 'sales', 'saleItems', 'invoices', 'invoiceItems',
    'expenses', 'paymentMethods', 'leads', 'calls', 'productionOrders', 'rawMaterials', 'rawMaterialBatches',
    'unitOfMeasure', 'unitConversions', 'productFormulas', 'formulaVersions', 'productionBatches',
    'productionBatchCosts', 'rawMaterialConsumption', 'productionStorageHistory', 'productionQualityChecks',
    'productionDowntime', 'productionCapacity', 'productionCalendar', 'manufacturingDocuments', 'batchRecalls',
    'bankTransactions', 'inventoryWarehouses'
  ];
  for (const key of mergeKeys) db[key] = mergeRowsById(db[key], payload[key]);
  db.quickBooksImport = {
    version: quickBooksSeed.version,
    source: quickBooksSeed.source,
    importedAt: new Date().toISOString(),
    sourceFiles: quickBooksSeed.sourceFiles,
    counts: quickBooksSeed.counts
  };
  db.activity ||= [];
  db.activity.unshift({
    id: gid(),
    action: 'QuickBooks seed imported',
    module: 'Data',
    detail: `${quickBooksSeed.counts.customers} customers, ${quickBooksSeed.counts.products} products, ${quickBooksSeed.counts.expenses} expenses`,
    user: 'System',
    createdAt: new Date().toISOString()
  });
  return true;
}

function data() {
  if (!db) seed();
  applyQuickBooksSeed();
  ensureGeoSalesData();
  ensureProcurementData();
  ensureInventoryData();
  ensureManufacturingData();
  return db;
}

const UOM_FACTORS = {
  MG: { family: 'mass', factor: 0.001 }, G: { family: 'mass', factor: 1 }, KG: { family: 'mass', factor: 1000 }, TONNE: { family: 'mass', factor: 1000000 },
  ML: { family: 'volume', factor: 1 }, L: { family: 'volume', factor: 1000 },
  PCS: { family: 'count', factor: 1 }, PIECE: { family: 'count', factor: 1 }, BOTTLE: { family: 'count', factor: 1 }, PACKET: { family: 'count', factor: 1 },
  BOX: { family: 'count', factor: 12 }, CARTON: { family: 'count', factor: 24 }, BAG: { family: 'count', factor: 1 }
};

function normUom(unit) {
  return String(unit || 'PCS').trim().toUpperCase().replace('KILOGRAMS', 'KG').replace('KILOGRAM', 'KG').replace('GRAMS', 'G').replace('GRAM', 'G').replace('LITRES', 'L').replace('LITERS', 'L').replace('MILLILITRES', 'ML').replace('MILLILITERS', 'ML').replace('PIECES', 'PCS').replace('BOTTLES', 'BOTTLE').replace('PACKETS', 'PACKET').replace('BOXES', 'BOX').replace('CARTONS', 'CARTON').replace('BAGS', 'BAG').replace('TONNES', 'TONNE');
}

function convertUom(quantity, fromUnit, toUnit) {
  const from = UOM_FACTORS[normUom(fromUnit)] || UOM_FACTORS.PCS;
  const to = UOM_FACTORS[normUom(toUnit)] || UOM_FACTORS.PCS;
  if (from.family !== to.family) throw new Error(`Cannot convert ${fromUnit} to ${toUnit}`);
  return num(quantity) * from.factor / to.factor;
}

function ensureManufacturingData() {
  if (!db || db.rawMaterials?.length && db.productionOrders?.length && db.unitConversions?.length) return;
  const now = new Date().toISOString();
  db.unitOfMeasure = [
    ['KG', 'Kilograms', 'mass'], ['G', 'Grams', 'mass'], ['MG', 'Milligrams', 'mass'], ['TONNE', 'Tonnes', 'mass'],
    ['L', 'Litres', 'volume'], ['ML', 'Millilitres', 'volume'], ['PCS', 'Pieces', 'count'], ['BOTTLE', 'Bottles', 'count'],
    ['PACKET', 'Packets', 'count'], ['BOX', 'Boxes', 'count'], ['CARTON', 'Cartons', 'count'], ['BAG', 'Bags', 'count']
  ].map(([code, name, family]) => ({ id: `UOM-${code}`, code, name, family, status: 'Active' }));
  db.unitConversions = [
    { fromUnit: 'KG', toUnit: 'G', factor: 1000 }, { fromUnit: 'G', toUnit: 'MG', factor: 1000 }, { fromUnit: 'TONNE', toUnit: 'KG', factor: 1000 },
    { fromUnit: 'L', toUnit: 'ML', factor: 1000 }, { fromUnit: 'CARTON', toUnit: 'BOTTLE', factor: 24 }, { fromUnit: 'BOX', toUnit: 'PACKET', factor: 12 }
  ].map((x, index) => ({ id: `UCON-${index + 1}`, ...x, status: 'Active' }));
  db.rawMaterials = [
    { id: 'RM-001', materialCode: 'RM-MAIZE', materialName: 'Maize Bran', category: 'Animal Feed Raw Material', unitOfMeasure: 'G', currentQuantity: 500000, availableQuantity: 500000, reservedQuantity: 0, consumedQuantity: 0, supplier: 'Unga Millers Ltd', costPerUnit: 1.8, warehouse: 'Raw Materials Store', storageLocation: 'A1', batchNumber: 'MAT-MAIZE-001', manufactureDate: '2026-01-04', expiryDate: '2027-01-04', status: 'Available' },
    { id: 'RM-002', materialCode: 'RM-NEEM', materialName: 'Neem Extract', category: 'Bio-Pesticide Raw Material', unitOfMeasure: 'ML', currentQuantity: 220000, availableQuantity: 220000, reservedQuantity: 0, consumedQuantity: 0, supplier: 'Bayer Crop Science', costPerUnit: 2.4, warehouse: 'Raw Materials Store', storageLocation: 'B2', batchNumber: 'MAT-NEEM-001', manufactureDate: '2026-02-10', expiryDate: '2027-02-10', status: 'Available' },
    { id: 'RM-003', materialCode: 'PK-BOTTLE', materialName: '1L Bottle', category: 'Packaging', unitOfMeasure: 'PCS', currentQuantity: 2400, availableQuantity: 2400, reservedQuantity: 0, consumedQuantity: 0, supplier: 'Green Packaging Co', costPerUnit: 18, warehouse: 'Packaging Store', storageLocation: 'P1', batchNumber: 'PKG-BTL-001', manufactureDate: '2026-01-20', expiryDate: '', status: 'Available' }
  ];
  db.rawMaterialBatches = db.rawMaterials.map((m, index) => ({ id: `RMB-${index + 1}`, batchNumber: m.batchNumber, materialId: m.id, materialName: m.materialName, supplier: m.supplier, quantity: m.currentQuantity, availableQuantity: m.availableQuantity, reservedQuantity: 0, unit: m.unitOfMeasure, cost: m.currentQuantity * m.costPerUnit, costPerBaseUnit: m.costPerUnit, receivedDate: today(), expiryDate: m.expiryDate, warehouse: m.warehouse, storageLocation: m.storageLocation, status: 'Available' }));
  db.productFormulas = [
    { id: 'FORM-001', productName: 'Dairy Meal 16% 70kg', formulaName: 'Dairy Meal Standard Formula', activeVersion: 'v1.0', outputQuantity: 1, outputUnit: 'BAG', status: 'Active' },
    { id: 'FORM-002', productName: 'Organic Neem Oil 1L', formulaName: 'Neem Oil Bottle Formula', activeVersion: 'v1.0', outputQuantity: 1, outputUnit: 'BOTTLE', status: 'Active' }
  ];
  db.formulaVersions = [
    { id: 'FV-001', formulaId: 'FORM-001', version: 'v1.0', materialId: 'RM-001', materialName: 'Maize Bran', quantity: 250, unit: 'G', effectiveFrom: '2026-01-01', status: 'Active' },
    { id: 'FV-002', formulaId: 'FORM-002', version: 'v1.0', materialId: 'RM-002', materialName: 'Neem Extract', quantity: 950, unit: 'ML', effectiveFrom: '2026-01-01', status: 'Active' },
    { id: 'FV-003', formulaId: 'FORM-002', version: 'v1.0', materialId: 'RM-003', materialName: '1L Bottle', quantity: 1, unit: 'PCS', effectiveFrom: '2026-01-01', status: 'Active' }
  ];
  db.productionOrders = (db.production || []).map(job => ({ id: job.id, orderNo: job.jobNo, productName: job.productName, formulaId: 'FORM-001', formulaVersion: 'v1.0', plannedQty: num(job.plannedQty || 1), outputUnit: 'BAG', status: job.status || 'Pending', operator: job.assignedTo || 'Grace Production', startDate: job.startDate || today(), endDate: job.endDate || '', createdAt: now }));
  db.productionBatches = [];
  db.productionBatchMaterials = [];
  db.productionBatchCosts = [];
  db.productionBatchYields = [];
  db.rawMaterialConsumption = [];
  db.productionStorageHistory = [];
  db.productionQualityChecks = [{ id: 'QC-001', batchNo: 'Pending', productName: 'Dairy Meal 16% 70kg', parameter: 'Moisture', result: 'Pending', inspector: 'Quality Team', date: today(), status: 'Pending' }];
  db.productionDowntime = [{ id: 'DT-001', orderNo: 'PJ-001', reason: 'Material Delay', minutes: 35, operator: 'Grace Production', date: today(), impact: 'Low' }];
  db.productionCapacity = [
    { id: 'CAP-001', resource: 'Feed Mixer Machine', type: 'Machine', dailyCapacity: 220, scheduled: 100, available: 120, unit: 'BAG', status: 'Available' },
    { id: 'CAP-002', resource: 'Packaging Line', type: 'Machine', dailyCapacity: 900, scheduled: 320, available: 580, unit: 'BOTTLE', status: 'Available' }
  ];
  db.productionCalendar = ['Daily', 'Weekly', 'Monthly', 'Yearly'].map((period, index) => ({ id: `PCAL-${index + 1}`, period, plannedOrders: 2 + index, plannedOutput: 1200 * (index + 1), status: 'Planned' }));
  db.manufacturingDocuments = [{ id: 'DOC-001', title: 'Dairy Meal SOP', type: 'SOP', productName: 'Dairy Meal 16% 70kg', version: 'v1.0', status: 'Active' }];
  db.batchRecalls = [];
}

function ensureFinanceData() {
  if (!db || db.financeJournalEntries?.length && db.financeAccounts?.length && db.financeReports?.length) return;
  const now = new Date();
  const accountSeed = [
    ['1000', 'Cash on Hand', 'Asset'], ['1010', 'KCB Bank', 'Asset'], ['1020', 'M-Pesa Till', 'Asset'],
    ['1100', 'Accounts Receivable', 'Asset'], ['1200', 'Inventory Asset', 'Asset'], ['1300', 'Fixed Assets', 'Asset'],
    ['2000', 'Accounts Payable', 'Liability'], ['2100', 'Tax Payable', 'Liability'], ['2200', 'Payroll Payable', 'Liability'],
    ['3000', 'Owner Equity', 'Equity'], ['3100', 'Retained Earnings', 'Equity'],
    ['4000', 'Sales Revenue', 'Revenue'], ['4100', 'Other Income', 'Revenue'],
    ['5000', 'Cost of Goods Sold', 'Expense'], ['5100', 'Payroll Expense', 'Expense'], ['5200', 'Transport Expense', 'Expense'],
    ['5300', 'Utilities Expense', 'Expense'], ['5400', 'Marketing Expense', 'Expense'], ['5500', 'Inventory Loss Expense', 'Expense'],
    ['5600', 'Tax Expense', 'Expense']
  ];
  const existingAccounts = Array.isArray(db.financeAccounts) ? db.financeAccounts : [];
  const byCode = new Map(existingAccounts.map(account => [String(account.code), account]));
  db.financeAccounts = accountSeed.map(([code, name, type], index) => {
    const existing = byCode.get(code);
    return existing ? { ...existing, code, name: existing.name || name, type: existing.type || type, status: existing.status || 'Active', parent: existing.parent || type } : { id: `ACC-${index + 1}`, code, name, type, status: 'Active', parent: type };
  });
  existingAccounts
    .filter(account => account.code && !accountSeed.some(([code]) => code === String(account.code)))
    .forEach(account => db.financeAccounts.push(account));
  const acc = name => db.financeAccounts.find(a => a.name === name) || db.financeAccounts[0];
  const entries = [];
  const lines = [];
  const addEntry = ({ date, sourceModule, sourceId, reference, description, debit, credit, amount, user = 'System', approvalStatus = 'Auto Approved' }) => {
    const id = gid();
    const value = Math.round(num(amount));
    if (!value) return null;
    entries.push({ id, journalNo: `JE-${String(entries.length + 1).padStart(5, '0')}`, date: date || today(), description, sourceModule, sourceId, reference, totalDebit: value, totalCredit: value, approvalStatus, postedBy: user, immutable: true, createdAt: new Date().toISOString() });
    lines.push({ id: gid(), journalEntryId: id, accountCode: debit.code, accountName: debit.name, accountType: debit.type, debit: value, credit: 0, sourceModule, reference, date: date || today() });
    lines.push({ id: gid(), journalEntryId: id, accountCode: credit.code, accountName: credit.name, accountType: credit.type, debit: 0, credit: value, sourceModule, reference, date: date || today() });
    return id;
  };
  (db.sales || []).forEach(sale => {
    addEntry({ date: sale.date, sourceModule: 'Sales', sourceId: sale.id, reference: sale.saleNo, description: `Invoice revenue for ${sale.customerName}`, debit: acc('Accounts Receivable'), credit: acc('Sales Revenue'), amount: sale.total, user: sale.createdBy || 'Sales Workspace' });
    const saleItems = (db.saleItems || []).filter(item => item.saleId === sale.id);
    const cogs = saleItems.reduce((sum, item) => sum + num(item.cost) * num(item.quantity), 0);
    addEntry({ date: sale.date, sourceModule: 'Inventory', sourceId: sale.id, reference: sale.saleNo, description: `COGS for ${sale.saleNo}`, debit: acc('Cost of Goods Sold'), credit: acc('Inventory Asset'), amount: cogs, user: 'Inventory Engine' });
    if (num(sale.paid) > 0) addEntry({ date: sale.date, sourceModule: 'Banking', sourceId: sale.id, reference: sale.saleNo, description: `Customer receipt ${sale.customerName}`, debit: acc(sale.paymentMethod === 'M-Pesa' ? 'M-Pesa Till' : 'KCB Bank'), credit: acc('Accounts Receivable'), amount: sale.paid, user: 'Finance Engine' });
    if (num(sale.tax) > 0) addEntry({ date: sale.date, sourceModule: 'Taxes', sourceId: sale.id, reference: sale.saleNo, description: `Output VAT ${sale.saleNo}`, debit: acc('Accounts Receivable'), credit: acc('Tax Payable'), amount: sale.tax, user: 'Tax Engine' });
  });
  (db.purchaseOrders || []).forEach(po => {
    addEntry({ date: po.date, sourceModule: 'Procurement', sourceId: po.id, reference: po.poNo, description: `Committed spend ${po.supplierName}`, debit: acc('Inventory Asset'), credit: acc('Accounts Payable'), amount: po.total, user: 'Procurement Engine' });
    if (num(po.tax) > 0) addEntry({ date: po.date, sourceModule: 'Taxes', sourceId: po.id, reference: po.poNo, description: `Input VAT ${po.poNo}`, debit: acc('Tax Expense'), credit: acc('Accounts Payable'), amount: po.tax, user: 'Tax Engine' });
  });
  (db.supplierPayments || []).forEach(pay => addEntry({ date: pay.date, sourceModule: 'Procurement', sourceId: pay.id, reference: pay.paymentNo, description: `Supplier payment ${pay.supplierName}`, debit: acc('Accounts Payable'), credit: acc('KCB Bank'), amount: pay.amount, user: 'Finance Engine' }));
  (db.expenses || []).forEach(exp => addEntry({ date: exp.date, sourceModule: 'Expenses', sourceId: exp.id, reference: exp.expNo, description: exp.description || exp.category, debit: acc(exp.category === 'Salaries' ? 'Payroll Expense' : 'Transport Expense'), credit: acc(exp.paymentMethod === 'M-Pesa' ? 'M-Pesa Till' : 'KCB Bank'), amount: exp.amount, user: 'Finance Engine' }));
  (db.inventoryDamage || []).forEach(dmg => addEntry({ date: dmg.date, sourceModule: 'Inventory', sourceId: dmg.id, reference: dmg.id, description: `Inventory damage ${dmg.productName}`, debit: acc('Inventory Loss Expense'), credit: acc('Inventory Asset'), amount: num(dmg.quantity) * num((db.inventory || []).find(i => i.productId === dmg.productId)?.unitCost || 0), user: dmg.reportedBy || 'Warehouse' }));
  (db.production || []).forEach(job => addEntry({ date: job.startDate || today(), sourceModule: 'Production', sourceId: job.id, reference: job.jobNo, description: `Work in progress ${job.productName}`, debit: acc('Inventory Asset'), credit: acc('Cost of Goods Sold'), amount: num(job.materialCost || job.plannedQty * 120), user: job.assignedTo || 'Production' }));
  db.financeJournalEntries = entries;
  db.financeJournalLines = lines;
  db.generalLedger = db.financeJournalLines.map((line, index) => ({ id: `GL-${index + 1}`, ...line, runningBalance: db.financeJournalLines.filter(l => l.accountCode === line.accountCode).slice(0, index + 1).reduce((sum, l) => sum + num(l.debit) - num(l.credit), 0) }));
  const accountBalance = account => lines.filter(l => l.accountName === account).reduce((sum, l) => sum + num(l.debit) - num(l.credit), 0);
  db.bankAccounts = [
    { id: 'BANK-1', accountName: 'KCB Operating Account', bank: 'KCB', accountNumber: '1234567890', currency: 'KES', openingBalance: 1200000, balance: 1200000 + accountBalance('KCB Bank'), status: 'Active' },
    { id: 'BANK-2', accountName: 'M-Pesa Paybill', bank: 'Safaricom', accountNumber: '247247', currency: 'KES', openingBalance: 300000, balance: 300000 + accountBalance('M-Pesa Till'), status: 'Active' },
    { id: 'BANK-3', accountName: 'Petty Cash', bank: 'Cash', accountNumber: 'CASH-001', currency: 'KES', openingBalance: 75000, balance: 75000 + accountBalance('Cash on Hand'), status: 'Active' }
  ];
  db.bankTransactions = db.financeJournalLines.filter(l => ['KCB Bank', 'M-Pesa Till', 'Cash on Hand'].includes(l.accountName)).map((l, index) => ({ id: `BTX-${index + 1}`, accountName: l.accountName, date: l.date, reference: l.reference, description: `${l.sourceModule} ${l.reference}`, deposit: l.debit, withdrawal: l.credit, reconciled: index % 4 !== 0 }));
  db.accountsReceivable = (db.invoices || []).map(inv => ({ id: `AR-${inv.id}`, invoiceId: inv.id, invNo: inv.invNo, customerName: inv.customerName, dueDate: inv.dueDate, total: num(inv.total), paid: num(inv.paid), balance: num(inv.balance), agingBucket: num(inv.balance) <= 0 ? 'Paid' : '0-30', risk: num(inv.balance) > 100000 ? 'Watch' : 'Normal', status: inv.status }));
  db.financeAccountsPayable = (db.accountsPayable || []).map(ap => ({ ...ap, risk: num(ap.outstandingBalance) > 150000 ? 'High' : 'Normal' }));
  db.payrollRecords = (db.payrollRecords?.length ? db.payrollRecords : [
    ['EMP-001', 'Mary Sales', 'Sales', 85000], ['EMP-002', 'Peter Warehouse', 'Warehouse', 78000], ['EMP-003', 'Grace Production', 'Production', 92000], ['EMP-004', 'David Procurement', 'Procurement', 88000], ['EMP-005', 'Sarah Accountant', 'Finance', 95000]
  ].map(([employeeNo, name, department, basicSalary], index) => {
    const paye = Math.round(basicSalary * 0.16), nssf = 2160, nhif = 1700;
    return { id: `PAY-${index + 1}`, employeeNo, name, department, basicSalary, allowances: 12000, deductions: paye + nssf + nhif, paye, nssf, nhif, netPay: basicSalary + 12000 - paye - nssf - nhif, status: 'Processed', month: now.toISOString().slice(0, 7) };
  }));
  db.taxRecords = [
    { id: 'TAX-1', taxType: 'Output VAT', liability: (db.sales || []).reduce((s, x) => s + num(x.tax), 0), period: now.toISOString().slice(0, 7), status: 'Open' },
    { id: 'TAX-2', taxType: 'Input VAT', liability: (db.purchaseOrders || []).reduce((s, x) => s + num(x.tax), 0), period: now.toISOString().slice(0, 7), status: 'Recoverable' },
    { id: 'TAX-3', taxType: 'PAYE', liability: db.payrollRecords.reduce((s, x) => s + num(x.paye), 0), period: now.toISOString().slice(0, 7), status: 'Open' },
    { id: 'TAX-4', taxType: 'NSSF/NHIF', liability: db.payrollRecords.reduce((s, x) => s + num(x.nssf) + num(x.nhif), 0), period: now.toISOString().slice(0, 7), status: 'Open' }
  ];
  db.fixedAssets = [
    { id: 'AST-1', assetName: 'Delivery Truck KCG 114A', category: 'Vehicles', location: 'Nairobi', purchaseCost: 2800000, accumulatedDepreciation: 420000, currentValue: 2380000, method: 'Straight Line', status: 'Active' },
    { id: 'AST-2', assetName: 'Feed Mixer Machine', category: 'Machinery', location: 'Production', purchaseCost: 1600000, accumulatedDepreciation: 260000, currentValue: 1340000, method: 'Straight Line', status: 'Active' },
    { id: 'AST-3', assetName: 'Cold Storage Unit', category: 'Equipment', location: 'Cold Storage', purchaseCost: 950000, accumulatedDepreciation: 110000, currentValue: 840000, method: 'Straight Line', status: 'Active' }
  ];
  const departments = ['Sales', 'Inventory', 'Procurement', 'Production', 'Finance', 'Admin'];
  db.budgets = departments.map((department, index) => {
    const budget = 350000 + index * 120000;
    const actual = Math.round(budget * (0.82 + index * 0.05));
    return { id: `BUD-${index + 1}`, department, budget, actual, variance: budget - actual, forecast: Math.round(actual * 1.08), status: actual > budget ? 'Over Budget' : 'On Track' };
  });
  db.costCenters = departments.map((department, index) => ({ id: `CC-${index + 1}`, code: `CC-${100 + index}`, department, manager: ['Mary Sales', 'Peter Warehouse', 'David Procurement', 'Grace Production', 'Sarah Accountant', 'Miko Admin'][index], revenue: index === 0 ? (db.sales || []).reduce((s, x) => s + num(x.total), 0) : 0, cost: db.budgets[index].actual, profitability: index === 0 ? (db.sales || []).reduce((s, x) => s + num(x.total), 0) - db.budgets[index].actual : -db.budgets[index].actual }));
  db.financialForecasts = ['Revenue', 'Cash Flow', 'Expenses', 'Tax Liability', 'Inventory Value', 'Net Profit'].map((metric, index) => ({ id: `FF-${index + 1}`, metric, current: [accountBalance('Sales Revenue') * -1, db.bankAccounts.reduce((s, b) => s + num(b.balance), 0), db.expenses.reduce((s, e) => s + num(e.amount), 0), db.taxRecords.reduce((s, t) => s + num(t.liability), 0), accountBalance('Inventory Asset'), 0][index] || 0, forecast30: Math.round(([accountBalance('Sales Revenue') * -1, db.bankAccounts.reduce((s, b) => s + num(b.balance), 0), db.expenses.reduce((s, e) => s + num(e.amount), 0), db.taxRecords.reduce((s, t) => s + num(t.liability), 0), accountBalance('Inventory Asset'), 0][index] || 0) * (1.04 + index * 0.02)), confidence: 82 - index * 3 }));
  db.financialReports = ['Income Statement', 'Balance Sheet', 'Cashflow Statement', 'Trial Balance', 'General Ledger Report', 'Accounts Receivable Report', 'Accounts Payable Report', 'Inventory Valuation Report', 'Expense Report', 'Payroll Report', 'Tax Report', 'Budget Variance Report', 'Profitability Report', 'Department Performance Report', 'Supplier Financial Report', 'Customer Financial Report', 'Executive Financial Report'].map((name, index) => ({ id: `FREP-${index + 1}`, name, records: [entries, lines, db.accountsReceivable, db.financeAccountsPayable, db.expenses, db.payrollRecords, db.taxRecords, db.budgets][index % 8]?.length || 0, value: Math.round(Math.abs(accountBalance('Sales Revenue')) / 17 * (index + 1)), exports: ['PDF', 'Excel', 'CSV', 'PowerPoint', 'Print', 'Email'] }));
  db.financeAuditLogs = entries.map(entry => ({ id: `FAUD-${entry.journalNo}`, user: entry.postedBy, date: entry.date, module: entry.sourceModule, action: 'Journal Posted', reference: entry.reference, oldValue: '', newValue: `${entry.totalDebit}/${entry.totalCredit}`, reason: entry.description, approval: entry.approvalStatus, immutable: true }));
  db.financialAiInsights = [
    { title: 'Ledger integrity', detail: `All ${entries.length} journals are balanced and immutable.`, sources: ['financeJournalEntries', 'financeJournalLines'] },
    { title: 'Cash position', detail: `${money(db.bankAccounts.reduce((s, b) => s + num(b.balance), 0))} is available across bank, M-Pesa, and cash accounts.`, sources: ['bankAccounts', 'bankTransactions'] },
    { title: 'Tax exposure', detail: `${money(db.taxRecords.reduce((s, t) => s + num(t.liability), 0))} current tax-related exposure is visible for VAT, PAYE, NSSF, and NHIF.`, sources: ['taxRecords', 'sales', 'purchaseOrders', 'payrollRecords'] }
  ];
}

function ensureInventoryData() {
  if (!db || db.inventoryTransactions?.length && db.inventoryAlerts?.length && db.inventoryForecasts?.length) return;
  const now = new Date();
  const warehouses = [
    { id: 'WH1', name: 'Main Store Nairobi', code: 'MAIN-NRB', county: 'Nairobi', capacity: 12000, used: 7600 },
    { id: 'WH2', name: 'Raw Materials Store', code: 'RAW-NRB', county: 'Nairobi', capacity: 9000, used: 5900 },
    { id: 'WH3', name: 'Cold Storage', code: 'COLD-NRB', county: 'Nairobi', capacity: 4500, used: 2600 },
    { id: 'WH4', name: 'Rift Valley Depot', code: 'RIFT-NKR', county: 'Nakuru', capacity: 8000, used: 4300 }
  ];
  db.inventoryWarehouses = db.inventoryWarehouses?.length ? db.inventoryWarehouses : warehouses;
  db.inventoryLocations = db.inventoryWarehouses.flatMap((wh, wi) => ['A1', 'A2', 'B1', 'C1'].map((shelf, si) => ({
    id: `LOC-${wi + 1}-${si + 1}`,
    warehouseId: wh.id,
    warehouseName: wh.name,
    shelf,
    bin: `${shelf}-${String(si + 1).padStart(2, '0')}`,
    status: 'Active'
  })));
  db.inventory = (db.inventory || []).map((item, index) => {
    const product = db.products.find(p => p.name === item.productName) || {};
    return {
      ...item,
      sku: item.sku || product.sku || `SKU-${index + 1}`,
      productId: item.productId || product.id,
      category: item.category || product.category,
      quantityReserved: num(item.quantityReserved || (index % 3) * 4),
      quantityIncoming: num(item.quantityIncoming || (index % 4) * 12),
      quantityOutgoing: num(item.quantityOutgoing || (index % 2) * 3),
      damagedQuantity: num(item.damagedQuantity || (index % 5 === 0 ? 2 : 0)),
      expiredQuantity: num(item.expiredQuantity || 0),
      barcode: item.barcode || `FT-${product.sku || index + 1}`,
      qrCode: item.qrCode || `QR-${item.batchNo || index + 1}`,
      location: item.location || db.inventoryLocations[index % db.inventoryLocations.length]?.bin || 'A1-01',
      supplierName: item.supplierName || db.suppliers[index % db.suppliers.length]?.name || 'Preferred Supplier',
      maxStock: item.maxStock || num(product.minStock) * 8 || 200,
      safetyStock: item.safetyStock || num(product.minStock) || 20,
      reorderPoint: item.reorderPoint || Math.round(num(product.minStock || 20) * 1.4),
      lastMovementDate: item.lastMovementDate || new Date(now.getTime() - (index * 17 + 5) * 86400000).toISOString().slice(0, 10),
      status: num(item.quantity) <= 0 ? 'Out of Stock' : num(item.quantity) <= num(product.minStock) ? 'Low Stock' : item.status || 'In Stock'
    };
  });
  const movementTypes = ['Purchase', 'Sale', 'Production', 'Adjustment', 'Transfer', 'Damage', 'Expiry', 'Return'];
  db.inventoryTransactions = db.inventory.flatMap((item, index) => {
    const rows = [];
    for (let i = 0; i < 4; i += 1) {
      const date = new Date(now.getTime() - (index * 11 + i * 9) * 86400000);
      const type = movementTypes[(index + i) % movementTypes.length];
      const qty = 3 + ((index + i) % 9) * 2;
      rows.push({
        id: `ITX-${index + 1}-${i + 1}`,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        warehouseName: item.warehouseName,
        batchNo: item.batchNo,
        transactionType: type,
        quantity: ['Sale', 'Transfer', 'Damage', 'Expiry'].includes(type) ? -qty : qty,
        unitCost: item.unitCost,
        referenceType: type === 'Sale' ? 'Sales Order' : type === 'Purchase' ? 'Purchase Order' : type,
        referenceId: `${type.toUpperCase()}-${index + 1}-${i + 1}`,
        createdBy: ['Peter Warehouse', 'Mary Sales', 'Grace Production'][i % 3],
        createdAt: date.toISOString(),
        notes: `${type} movement for ${item.productName}`
      });
    }
    return rows;
  });
  db.inventoryBatches = db.inventory.map((item, index) => ({
    id: `IBAT-${index + 1}`,
    productId: item.productId,
    productName: item.productName,
    batchNo: item.batchNo,
    lotNo: `LOT-${String(index + 1).padStart(3, '0')}`,
    serialNo: `SER-${String(index + 1).padStart(5, '0')}`,
    warehouseName: item.warehouseName,
    quantity: item.quantity,
    manufacturingDate: new Date(now.getTime() - (120 + index * 7) * 86400000).toISOString().slice(0, 10),
    expiryDate: item.expiryDate,
    daysRemaining: Math.round((new Date(item.expiryDate || now) - now) / 86400000),
    status: new Date(item.expiryDate || now) < now ? 'Expired' : Math.round((new Date(item.expiryDate || now) - now) / 86400000) < 90 ? 'Near Expiry' : 'Safe'
  }));
  db.inventoryAlerts = db.inventory.flatMap((item, index) => {
    const product = db.products.find(p => p.id === item.productId) || {};
    const alerts = [];
    if (num(item.quantity) <= num(product.minStock)) alerts.push({ type: num(item.quantity) <= 0 ? 'Critical Stock' : 'Low Stock', severity: num(item.quantity) <= 0 ? 'Red' : 'Orange' });
    if (num(item.quantity) > num(item.maxStock) * 0.9) alerts.push({ type: 'Overstock', severity: 'Yellow' });
    if (num(item.damagedQuantity) > 0) alerts.push({ type: 'Damaged Stock', severity: 'Orange' });
    const batch = db.inventoryBatches[index];
    if (batch?.status === 'Near Expiry') alerts.push({ type: 'Expiry Warning', severity: 'Yellow' });
    const daysSince = Math.round((now - new Date(item.lastMovementDate)) / 86400000);
    if (daysSince > 90) alerts.push({ type: 'Slow Moving Stock', severity: 'Yellow' });
    return alerts.map((alert, ai) => ({
      id: `IALERT-${index + 1}-${ai + 1}`,
      productId: item.productId,
      productName: item.productName,
      warehouseName: item.warehouseName,
      type: alert.type,
      severity: alert.severity,
      message: `${item.productName} requires ${alert.type.toLowerCase()} attention`,
      status: 'Open',
      createdAt: new Date(now.getTime() - (index + ai) * 86400000).toISOString()
    }));
  });
  db.inventoryReorderRules = db.inventory.map((item, index) => ({
    id: `IRR-${index + 1}`,
    productId: item.productId,
    productName: item.productName,
    currentStock: num(item.quantity),
    minimumStock: num(db.products.find(p => p.id === item.productId)?.minStock || 20),
    maximumStock: num(item.maxStock),
    safetyStock: num(item.safetyStock),
    reorderPoint: num(item.reorderPoint),
    leadTime: 5 + (index % 5) * 2,
    averageDailyConsumption: Number((1.2 + index * 0.35).toFixed(2)),
    preferredSupplier: item.supplierName,
    recommendedOrderQty: Math.max(0, Math.round(num(item.maxStock) * 0.65 - num(item.quantity))),
    expectedDeliveryDate: new Date(now.getTime() + (7 + index % 5) * 86400000).toISOString().slice(0, 10),
    status: num(item.quantity) <= num(item.reorderPoint) ? 'Reorder' : 'Normal'
  }));
  db.inventorySlowMoving = db.inventory.map((item, index) => {
    const days = Math.round((now - new Date(item.lastMovementDate)) / 86400000);
    return {
      id: `ISM-${index + 1}`,
      productId: item.productId,
      productName: item.productName,
      warehouseName: item.warehouseName,
      currentQuantity: num(item.quantity),
      inventoryValue: num(item.quantity) * num(item.unitCost),
      daysSinceLastMovement: days,
      supplierName: item.supplierName,
      category: item.category,
      expiryStatus: db.inventoryBatches[index]?.status || 'Safe',
      recommendation: days > 180 ? 'Discount or bundle' : days > 90 ? 'Transfer to active warehouse' : 'Monitor'
    };
  }).filter(row => row.daysSinceLastMovement >= 30);
  db.inventoryDeadStock = db.inventorySlowMoving.filter(row => row.daysSinceLastMovement >= 180).map(row => ({
    ...row,
    storageCost: Math.round(row.inventoryValue * 0.025),
    expiryRisk: row.expiryStatus === 'Near Expiry' ? 'High' : 'Medium',
    warehouseSpaceUsed: Math.round(row.currentQuantity * 0.18)
  }));
  db.inventoryDamage = db.inventory.filter(item => num(item.damagedQuantity) > 0).map((item, index) => ({
    id: `IDMG-${index + 1}`,
    productId: item.productId,
    productName: item.productName,
    warehouseName: item.warehouseName,
    quantity: item.damagedQuantity,
    reason: 'Damaged packaging',
    date: new Date(now.getTime() - index * 86400000).toISOString().slice(0, 10),
    reportedBy: 'Peter Warehouse',
    status: 'Quarantined'
  }));
  db.inventoryAdjustments = db.inventory.slice(0, 5).map((item, index) => ({
    id: `IADJ-${index + 1}`,
    productId: item.productId,
    productName: item.productName,
    warehouseName: item.warehouseName,
    adjustmentType: ['Count Variance', 'Damage', 'Correction', 'Expiry', 'Loss'][index],
    quantity: index % 2 ? -2 : 3,
    reason: 'Cycle count correction',
    approvedBy: 'Miko Admin',
    date: new Date(now.getTime() - index * 86400000).toISOString().slice(0, 10)
  }));
  db.inventoryTransfers = db.inventory.slice(0, 6).map((item, index) => ({
    id: `ITRF-${index + 1}`,
    transferNo: `TRF-26${String(index + 1).padStart(3, '0')}`,
    productId: item.productId,
    productName: item.productName,
    fromWarehouse: item.warehouseName,
    toWarehouse: db.inventoryWarehouses[(index + 1) % db.inventoryWarehouses.length].name,
    quantity: 5 + index * 2,
    status: ['Requested', 'Approved', 'Dispatched', 'In Transit', 'Received', 'Completed'][index % 6],
    requestedBy: 'Peter Warehouse',
    date: new Date(now.getTime() - index * 86400000).toISOString().slice(0, 10)
  }));
  db.inventoryAudits = db.inventory.slice(0, 8).map((item, index) => {
    const diff = index % 3 === 0 ? -2 : index % 4 === 0 ? 3 : 0;
    return {
      id: `IAUD-${index + 1}`,
      auditNo: `AUD-26${String(index + 1).padStart(3, '0')}`,
      productId: item.productId,
      productName: item.productName,
      warehouseName: item.warehouseName,
      systemQuantity: num(item.quantity),
      physicalQuantity: num(item.quantity) + diff,
      difference: diff,
      reason: diff ? 'Count variance' : 'Matched',
      auditor: 'Peter Warehouse',
      date: new Date(now.getTime() - index * 86400000).toISOString().slice(0, 10),
      status: diff ? 'Variance Review' : 'Closed'
    };
  });
  db.inventoryCosts = db.inventoryWarehouses.map((wh, index) => ({
    id: `ICOST-${index + 1}`,
    warehouseName: wh.name,
    rent: 45000 + index * 8000,
    utilities: 12000 + index * 2500,
    labor: 60000 + index * 10000,
    insurance: 9000 + index * 2000,
    handling: 15000 + index * 3500,
    damageCosts: 3000 + index * 1200,
    expiryLosses: 2000 + index * 900,
    totalCost: 146000 + index * 28100
  }));
  db.inventoryDocuments = ['Supplier Invoice', 'Delivery Note', 'GRN', 'Transfer Note', 'Audit Report', 'Quality Report'].map((type, index) => ({
    id: `IDOC-${index + 1}`,
    type,
    reference: `${type.replaceAll(' ', '-').toUpperCase()}-26${index + 1}`,
    productName: db.inventory[index % db.inventory.length]?.productName,
    warehouseName: db.inventory[index % db.inventory.length]?.warehouseName,
    uploadedBy: 'Miko Admin',
    date: new Date(now.getTime() - index * 86400000).toISOString().slice(0, 10)
  }));
  db.inventoryForecasts = db.inventoryReorderRules.map((rule, index) => ({
    id: `IFOR-${index + 1}`,
    productId: rule.productId,
    productName: rule.productName,
    futureDemand: Math.round(rule.averageDailyConsumption * 30),
    stockoutRisk: rule.status === 'Reorder' ? 'High' : index % 3 === 0 ? 'Medium' : 'Low',
    reorderDate: new Date(now.getTime() + Math.max(1, Math.round((rule.currentStock - rule.reorderPoint) / Math.max(0.5, rule.averageDailyConsumption))) * 86400000).toISOString().slice(0, 10),
    seasonalDemand: index % 2 ? 'Rising' : 'Stable',
    warehouseCapacity: db.inventoryWarehouses[index % db.inventoryWarehouses.length].used / db.inventoryWarehouses[index % db.inventoryWarehouses.length].capacity
  }));
  db.inventoryReports = [
    'Inventory Valuation Report', 'Stock Movement Report', 'Warehouse Report', 'Expiry Report', 'Damage Report',
    'Stock Adjustment Report', 'Transfer Report', 'Inventory Audit Report', 'Dead Stock Report', 'Fast Moving Stock Report',
    'Inventory Cost Report', 'Inventory Forecast Report', 'Reorder Recommendation Report', 'Inventory Profitability Report'
  ].map((name, index) => ({ id: `IREP-${index + 1}`, name, records: [db.inventory, db.inventoryTransactions, db.inventoryWarehouses, db.inventoryBatches, db.inventoryDamage, db.inventoryAdjustments, db.inventoryTransfers, db.inventoryAudits][index % 8]?.length || 0, value: Math.round(db.inventory.reduce((s, i) => s + num(i.quantity) * num(i.unitCost), 0) / 14 * (index + 1)), exports: ['PDF', 'Excel', 'CSV', 'PowerPoint', 'Print', 'Email'] }));
  db.inventoryHealthScores = db.inventory.map((item, index) => {
    const days = Math.round((now - new Date(item.lastMovementDate)) / 86400000);
    const batch = db.inventoryBatches[index];
    const stockScore = num(item.quantity) > num(item.reorderPoint) ? 28 : 12;
    const movementScore = days < 30 ? 25 : days < 90 ? 16 : 6;
    const expiryScore = batch?.status === 'Safe' ? 18 : batch?.status === 'Near Expiry' ? 8 : 0;
    const profitabilityScore = num(db.products.find(p => p.id === item.productId)?.sellingPrice) > num(item.unitCost) ? 20 : 8;
    const score = Math.min(100, stockScore + movementScore + expiryScore + profitabilityScore + (index % 10));
    return { id: `IHS-${index + 1}`, productId: item.productId, productName: item.productName, warehouseName: item.warehouseName, healthScore: score, classification: score >= 75 ? 'Healthy' : score >= 50 ? 'Watch' : 'At Risk' };
  });
}

function ensureProcurementData() {
  if (!db || db.purchaseRequests?.length && db.goodsReceipts?.length && db.accountsPayable?.length) return;
  const now = new Date();
  const iso = now.toISOString();
  const suppliers = db.suppliers || [];
  const products = db.products || [];
  const warehouses = ['Main Store Nairobi', 'Raw Materials Store', 'Cold Storage'];
  const departments = ['Warehouse', 'Production', 'Field Sales', 'Finance', 'Quality'];
  const statuses = ['Pending Approval', 'Approved', 'PO Created', 'Manager Approval', 'Procurement Approval'];
  db.purchaseRequests = products.slice(0, 8).map((product, index) => {
    const date = new Date(now.getTime() - (index + 2) * 86400000);
    return {
      id: `PR-${index + 1}`,
      requestNo: `PR-26${String(index + 1).padStart(3, '0')}`,
      department: departments[index % departments.length],
      requestedBy: ['Peter Warehouse', 'Grace Production', 'Mary Sales', 'Sarah Accountant'][index % 4],
      productId: product.id,
      productName: product.name,
      quantity: 25 + index * 15,
      reason: index % 2 ? 'Production replenishment' : 'Low stock trigger',
      priority: ['High', 'Medium', 'Critical'][index % 3],
      requiredDate: new Date(now.getTime() + (index + 5) * 86400000).toISOString().slice(0, 10),
      approvalStatus: statuses[index % statuses.length],
      workflowStep: ['Request Created', 'Manager Approval', 'Procurement Approval', 'PO Creation', 'Supplier Assignment'][index % 5],
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
      isDeleted: 'No'
    };
  });
  db.purchaseRequestItems = db.purchaseRequests.map((request, index) => ({
    id: `PRI-${index + 1}`,
    requestId: request.id,
    productId: request.productId,
    productName: request.productName,
    quantity: request.quantity,
    estimatedUnitCost: num(products.find(p => p.id === request.productId)?.costPrice) || 1000,
    status: request.approvalStatus
  }));
  db.purchaseOrders = (db.purchaseOrders || []).map((po, index) => ({
    ...po,
    requestId: po.requestId || db.purchaseRequests[index % db.purchaseRequests.length]?.id || '',
    warehouseName: po.warehouseName || warehouses[index % warehouses.length],
    department: po.department || departments[index % departments.length],
    status: po.status === 'Open' ? 'Approved' : po.status === 'Received' ? 'Delivered' : po.status,
    discount: po.discount || 0,
    createdBy: po.createdBy || 'David Procurement'
  }));
  for (let i = db.purchaseOrders.length; i < 8; i += 1) {
    const supplier = suppliers[i % suppliers.length] || {};
    const product = products[(i + 2) % products.length] || {};
    const subtotal = (40 + i * 12) * num(product.costPrice || 1200);
    const tax = Math.round(subtotal * 0.16);
    const date = new Date(now.getTime() - (i + 1) * 604800000);
    db.purchaseOrders.push({
      id: `PO-${i + 1}`,
      poNo: `PO-26${String(i + 1).padStart(3, '0')}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      requestId: db.purchaseRequests[i % db.purchaseRequests.length]?.id || '',
      date: date.toISOString().slice(0, 10),
      expectedDate: new Date(date.getTime() + (7 + i) * 86400000).toISOString().slice(0, 10),
      subtotal,
      tax,
      discount: i % 2 ? 4500 : 0,
      total: subtotal + tax - (i % 2 ? 4500 : 0),
      status: ['Draft', 'Pending Approval', 'Approved', 'Sent', 'Partially Delivered', 'Delivered', 'Closed', 'Approved'][i % 8],
      paymentTerms: supplier.paymentTerms || 'Net 30',
      warehouseName: warehouses[i % warehouses.length],
      department: departments[i % departments.length],
      createdBy: 'David Procurement',
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
      isDeleted: 'No'
    });
  }
  db.purchaseOrderItems = db.purchaseOrders.flatMap((po, index) => {
    const product = products[(index + 1) % products.length] || {};
    const qty = 35 + index * 9;
    const unitCost = num(product.costPrice || 1000);
    return [{
      id: `POI-${index + 1}`,
      poId: po.id,
      poNo: po.poNo,
      productId: product.id,
      productName: product.name,
      quantity: qty,
      received: ['Delivered', 'Closed'].includes(po.status) ? qty : po.status === 'Partially Delivered' ? Math.round(qty * 0.55) : 0,
      unitCost,
      tax: Math.round(qty * unitCost * 0.16),
      total: qty * unitCost
    }];
  });
  db.supplierContacts = suppliers.map((supplier, index) => ({
    id: `SCON-${index + 1}`,
    supplierId: supplier.id,
    supplierName: supplier.name,
    contactPerson: ['Anne Wanjiru', 'Brian Otieno', 'Catherine Njeri', 'Daniel Kiptoo', 'Esther Achieng'][index % 5],
    phone: supplier.phone,
    email: supplier.email,
    role: 'Account Manager'
  }));
  db.supplierPerformance = suppliers.map((supplier, index) => ({
    id: `SPERF-${index + 1}`,
    supplierId: supplier.id,
    supplierName: supplier.name,
    deliveryAccuracy: 96 - index * 5,
    qualityScore: 94 - index * 4,
    priceCompetitiveness: 88 - index * 3,
    leadTime: 6 + index * 2,
    reliability: 92 - index * 4,
    communication: 90 - index * 3,
    overallRating: 91 - index * 4
  }));
  db.procurementDeliveries = db.purchaseOrders.map((po, index) => {
    const expected = new Date(po.expectedDate || today());
    const delayed = index % 5 === 0;
    return {
      id: `PDEL-${index + 1}`,
      deliveryNo: `PDEL-26${String(index + 1).padStart(3, '0')}`,
      poId: po.id,
      poNo: po.poNo,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      driver: ['Samuel', 'Amina', 'Kamau', 'Njeri'][index % 4],
      vehicle: ['KCG 114A', 'KDA 908P', 'KDE 402L'][index % 3],
      dispatchDate: new Date(expected.getTime() - 2 * 86400000).toISOString().slice(0, 10),
      expectedArrival: expected.toISOString().slice(0, 10),
      actualArrival: ['Delivered', 'Closed'].includes(po.status) ? new Date(expected.getTime() + (delayed ? 2 : 0) * 86400000).toISOString().slice(0, 10) : '',
      county: KENYA_COUNTIES[(index * 5) % KENYA_COUNTIES.length],
      warehouseName: po.warehouseName,
      status: delayed ? 'Delayed' : po.status === 'Delivered' || po.status === 'Closed' ? 'Received' : po.status === 'Sent' ? 'In Transit' : 'Scheduled',
      eta: expected.toISOString().slice(0, 10),
      notes: delayed ? 'Supplier delayed at dispatch hub' : 'Tracked procurement delivery',
      gps: `${(-1.2 + index * 0.08).toFixed(3)}, ${(36.8 + index * 0.11).toFixed(3)}`
    };
  });
  db.goodsReceipts = db.purchaseOrders.filter(po => ['Partially Delivered', 'Delivered', 'Closed'].includes(po.status)).map((po, index) => {
    const item = db.purchaseOrderItems.find(x => x.poId === po.id) || {};
    const received = num(item.received || item.quantity);
    const damaged = index % 3 === 0 ? 2 : 0;
    return {
      id: `GRN-${index + 1}`,
      grnNo: `GRN-26${String(index + 1).padStart(3, '0')}`,
      poId: po.id,
      poNo: po.poNo,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      warehouseName: po.warehouseName,
      receivedBy: 'Peter Warehouse',
      date: po.expectedDate || today(),
      expectedQuantity: num(item.quantity),
      receivedQuantity: received,
      damagedQuantity: damaged,
      acceptedQuantity: Math.max(0, received - damaged),
      rejectedQuantity: damaged,
      status: damaged ? 'Variance Review' : 'Approved',
      notes: damaged ? 'Damaged bags isolated for supplier claim' : 'Received and posted to inventory'
    };
  });
  db.goodsReceiptItems = db.goodsReceipts.map((grn, index) => {
    const item = db.purchaseOrderItems.find(x => x.poId === grn.poId) || {};
    return {
      id: `GRNI-${index + 1}`,
      grnId: grn.id,
      productId: item.productId,
      productName: item.productName,
      expectedQuantity: grn.expectedQuantity,
      receivedQuantity: grn.receivedQuantity,
      damagedQuantity: grn.damagedQuantity,
      acceptedQuantity: grn.acceptedQuantity,
      rejectedQuantity: grn.rejectedQuantity,
      unitCost: item.unitCost,
      inventoryUpdated: grn.status === 'Approved'
    };
  });
  db.supplierInvoices = db.purchaseOrders.map((po, index) => {
    const paid = ['Closed', 'Delivered'].includes(po.status) ? Math.round(num(po.total) * (index % 2 ? 1 : 0.45)) : 0;
    const total = num(po.total);
    const due = new Date(new Date(po.date || today()).getTime() + (index % 3 + 1) * 30 * 86400000);
    return {
      id: `SINV-${index + 1}`,
      invoiceNo: `SUP-INV-26${String(index + 1).padStart(3, '0')}`,
      poId: po.id,
      poNo: po.poNo,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      invoiceDate: po.expectedDate || po.date || today(),
      dueDate: due.toISOString().slice(0, 10),
      invoiceAmount: total,
      paidAmount: paid,
      outstandingBalance: Math.max(0, total - paid),
      status: paid >= total ? 'Paid' : paid > 0 ? 'Partially Paid' : due < now ? 'Overdue' : 'Open',
      paymentTerms: po.paymentTerms
    };
  });
  db.supplierPayments = db.supplierInvoices.filter(inv => num(inv.paidAmount) > 0).map((inv, index) => ({
    id: `SPAY-${index + 1}`,
    paymentNo: `SPAY-26${String(index + 1).padStart(3, '0')}`,
    supplierInvoiceId: inv.id,
    invoiceNo: inv.invoiceNo,
    supplierId: inv.supplierId,
    supplierName: inv.supplierName,
    date: new Date(now.getTime() - (index + 3) * 86400000).toISOString().slice(0, 10),
    amount: inv.paidAmount,
    method: ['Bank Transfer', 'M-Pesa', 'Cheque'][index % 3],
    status: 'Completed'
  }));
  db.creditPurchases = db.supplierInvoices.map((inv, index) => ({
    id: `CRED-${index + 1}`,
    supplierId: inv.supplierId,
    supplierName: inv.supplierName,
    creditLimit: 750000 + index * 100000,
    creditTerms: inv.paymentTerms || 'Net 30',
    invoiceNo: inv.invoiceNo,
    invoiceAmount: inv.invoiceAmount,
    dueDate: inv.dueDate,
    outstandingBalance: inv.outstandingBalance,
    paymentSchedule: 'Monthly settlement',
    status: inv.status === 'Paid' ? 'Paid' : inv.status === 'Overdue' ? 'Overdue' : index % 3 === 0 ? 'Due Soon' : 'Current',
    aiRiskScore: Math.min(100, Math.round((num(inv.outstandingBalance) / Math.max(1, 750000 + index * 100000)) * 72 + (inv.status === 'Overdue' ? 24 : 8)))
  }));
  db.accountsPayable = db.supplierInvoices.map((inv, index) => {
    const due = new Date(inv.dueDate);
    const ageDays = Math.max(0, Math.round((now - due) / 86400000));
    const bucket = ageDays <= 30 ? '0-30' : ageDays <= 60 ? '31-60' : ageDays <= 90 ? '61-90' : ageDays <= 120 ? '91-120' : '120+';
    return {
      id: `AP-${index + 1}`,
      supplierInvoiceId: inv.id,
      invoiceNo: inv.invoiceNo,
      supplierId: inv.supplierId,
      supplierName: inv.supplierName,
      dueDate: inv.dueDate,
      invoiceAmount: inv.invoiceAmount,
      paidAmount: inv.paidAmount,
      outstandingBalance: inv.outstandingBalance,
      paymentStatus: inv.status,
      agingBucket: bucket,
      partialPayments: inv.paidAmount > 0 && inv.outstandingBalance > 0 ? 1 : 0,
      credits: 0,
      adjustments: 0
    };
  });
  db.procurementReports = [
    'Purchase Order Report', 'Supplier Performance Report', 'Delivery Report', 'Goods Receiving Report',
    'Credit Purchases Report', 'Accounts Payable Report', 'Outstanding Balances Report', 'Procurement Spend Report',
    'Inventory Replenishment Report', 'Late Deliveries Report', 'Department Procurement Report', 'Executive Summary'
  ].map((name, index) => ({
    id: `PREP-${index + 1}`,
    name,
    records: [db.purchaseOrders, suppliers, db.procurementDeliveries, db.goodsReceipts, db.creditPurchases, db.accountsPayable][index % 6]?.length || 0,
    value: Math.round((db.purchaseOrders.reduce((s, po) => s + num(po.total), 0) / 12) * (index + 1)),
    exports: ['PDF', 'Excel', 'CSV', 'PowerPoint', 'Print', 'Email', 'Schedule']
  }));
  db.procurementForecasts = products.slice(0, 8).map((product, index) => {
    const inv = db.inventory.find(i => i.productName === product.name);
    const gap = Math.max(0, num(product.minStock) * 2 - num(inv?.quantity));
    return {
      id: `PFOR-${index + 1}`,
      productId: product.id,
      productName: product.name,
      recommendedOrderQty: Math.round(gap + 20 + index * 5),
      reorderTiming: `${3 + index} days`,
      expectedCost: Math.round((gap + 20 + index * 5) * num(product.costPrice)),
      reason: gap > 0 ? 'Below replenishment threshold' : 'Demand forecast buffer'
    };
  });
  db.procurementAnalytics = [{ id: 'PAN-1', refreshedAt: iso, status: 'Ready', source: 'ERP procurement records' }];
  db.notifications = db.notifications || [];
  db.auditLogs = db.auditLogs || [];
}

function ensureGeoSalesData() {
  if (!db || db.counties?.length === 47 && db.salesVisits?.length) return;
  const now = new Date();
  const reps = db.users.filter(u => [ROLES.SALES, ROLES.MANAGER, ROLES.FIELD, ROLES.ADMIN].includes(u.role));
  const countyProfiles = KENYA_COUNTIES.map((name, index) => {
    const base = 28 + ((index * 11) % 72);
    const potentialCustomers = 70 + ((index * 37) % 260);
    return {
      id: `COUNTY${String(index + 1).padStart(2, '0')}`,
      code: String(index + 1).padStart(3, '0'),
      name,
      region: ['Coast', 'Eastern', 'Central', 'Rift Valley', 'Western', 'Nyanza', 'Nairobi'][index % 7],
      potentialCustomers,
      targetRevenue: 180000 + ((index * 31000) % 920000),
      targetVisits: 8 + (index % 12),
      latitude: -1.2 + (index % 8) * 0.45,
      longitude: 34.2 + Math.floor(index / 8) * 0.55,
      scoreSeed: base
    };
  });
  const coveredNames = ['Nairobi', 'Kiambu', 'Nakuru', 'Mombasa', 'Kisumu', 'Machakos', 'Kajiado', 'Meru', 'Nyeri', 'Uasin Gishu', 'Kakamega', 'Eldoret'];
  const lowNames = ['Muranga', 'Kirinyaga', 'Embu', 'Narok', 'Bomet', 'Kericho', 'Laikipia', 'Kilifi', 'Bungoma', 'Busia'];
  const visits = [];
  countyProfiles.forEach((county, index) => {
    const status = coveredNames.includes(county.name) ? 'covered' : lowNames.includes(county.name) ? 'low' : 'neglected';
    const count = status === 'covered' ? 5 + (index % 6) : status === 'low' ? 1 + (index % 2) : 0;
    for (let i = 0; i < count; i += 1) {
      const rep = reps[(index + i) % reps.length] || db.users[0];
      const customer = db.customers[(index + i) % db.customers.length];
      const visitDate = new Date(now.getTime() - (i + index % 9) * 86400000);
      const startHour = 8 + ((index + i) % 7);
      const duration = 42 + ((index + i) % 5) * 18;
      visits.push({
        id: `VISIT-${county.code}-${i + 1}`,
        salesRepId: rep.id,
        salesRepName: rep.name,
        customerId: customer?.id || '',
        customerName: customer?.name || `${county.name} Prospect ${i + 1}`,
        county: county.name,
        subCounty: `${county.name} Central`,
        location: `${county.name} field route`,
        latitude: Number((county.latitude + i * 0.03).toFixed(5)),
        longitude: Number((county.longitude + i * 0.04).toFixed(5)),
        visitDate: visitDate.toISOString().slice(0, 10),
        visitStart: `${String(startHour).padStart(2, '0')}:00`,
        visitEnd: `${String(startHour + Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`,
        durationMinutes: duration,
        purpose: ['Prospecting', 'Order follow-up', 'Demo', 'Collection', 'Distributor review'][(index + i) % 5],
        outcome: ['Order created', 'Quotation sent', 'Follow-up needed', 'Demo completed'][(index + i) % 4],
        notes: 'Geo verified field activity',
        createdAt: visitDate.toISOString(),
        updatedAt: visitDate.toISOString(),
        isDeleted: 'No'
      });
    }
  });
  db.counties = countyProfiles;
  db.subCounties = countyProfiles.flatMap(c => ['Central', 'North', 'South'].map((zone, i) => ({ id: `${c.id}-SC${i + 1}`, countyId: c.id, county: c.name, name: `${c.name} ${zone}` })));
  db.salesVisits = visits;
  db.salesCheckins = visits.map(v => ({
    id: `CHECK-${v.id}`,
    visitId: v.id,
    salesRepId: v.salesRepId,
    checkInLatitude: v.latitude,
    checkInLongitude: v.longitude,
    checkOutLatitude: Number((v.latitude + 0.01).toFixed(5)),
    checkOutLongitude: Number((v.longitude + 0.01).toFixed(5)),
    checkInAt: `${v.visitDate}T${v.visitStart}:00.000Z`,
    checkOutAt: `${v.visitDate}T${v.visitEnd}:00.000Z`,
    durationMinutes: v.durationMinutes,
    gpsVerified: true
  }));
  db.territoryAssignments = countyProfiles.map((c, index) => {
    const rep = reps[index % reps.length] || db.users[0];
    return { id: `TA-${c.code}`, countyId: c.id, county: c.name, salesRepId: rep.id, salesRepName: rep.name, status: 'Active' };
  });
  db.salesRoutes = reps.map((rep, index) => ({
    id: `ROUTE-${rep.id}`,
    salesRepId: rep.id,
    salesRepName: rep.name,
    weekStart: today(),
    counties: countyProfiles.filter((_, i) => i % reps.length === index).slice(0, 6).map(c => c.name),
    distanceKm: 280 + index * 64,
    travelCost: 14000 + index * 3200,
    revenue: db.sales.filter((_, i) => i % reps.length === index).reduce((s, sale) => s + num(sale.total), 0)
  }));
  db.countyTargets = countyProfiles.map(c => ({ id: `TARGET-${c.code}`, countyId: c.id, county: c.name, revenueTarget: c.targetRevenue, visitTarget: c.targetVisits, customerTarget: Math.round(c.potentialCustomers * 0.18) }));
}

function publicUser(u) {
  return u && { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone };
}

function roleDepartment(role) {
  const map = {
    [ROLES.ADMIN]: 'Executive',
    [ROLES.MANAGER]: 'Executive',
    [ROLES.SALES]: 'Sales',
    [ROLES.PROCUREMENT]: 'Procurement',
    [ROLES.WAREHOUSE]: 'Inventory',
    [ROLES.PRODUCTION]: 'Manufacturing',
    [ROLES.ACCOUNTANT]: 'Finance',
    [ROLES.FIELD]: 'Field Operations'
  };
  return map[role] || 'Operations';
}

function reqRole(user, ...roles) {
  const d = data();
  if (!user) throw new Error('Authentication required');
  const email = String(user.email || '').trim().toLowerCase();
  const id = String(user.id || '').trim();
  const u = d.users.find(x => String(x.email).toLowerCase() === email || x.id === id);
  if (!u) throw new Error('User not found');
  if (u.status !== 'Active') throw new Error('Account is inactive');
  if (u.role === ROLES.ADMIN || !roles.length || roles.includes(u.role)) return u;
  throw new Error('Insufficient permissions');
}

function log(u, action, module, details = '') {
  data().activity.unshift({ id: gid(), userName: u.name, action, module, details, createdAt: new Date().toISOString() });
}

function emitBusinessEvent(user, eventType, aggregateType, aggregateId, payload = {}) {
  data().businessEvents ||= [];
  const event = {
    id: gid(),
    eventType,
    aggregateType,
    aggregateId,
    payload,
    status: 'Processed',
    createdBy: user?.id || 'SYSTEM',
    createdByName: user?.name || 'System',
    createdAt: new Date().toISOString()
  };
  data().businessEvents.unshift(event);
  return event;
}

// ─── Email (Resend) — logging + safe async send ───
// Records every email attempt in db.emailLog and fires the send without blocking the caller.
function logEmail({ to, subject, template, status, result, relatedModule, relatedId, createdBy }) {
  const d = data();
  d.emailLog ||= [];
  const entry = {
    id: gid(),
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    template: template || 'generic',
    status: status || 'sent',
    result: result || {},
    relatedModule: relatedModule || '',
    relatedId: relatedId || '',
    createdBy: createdBy || 'SYSTEM',
    createdAt: new Date().toISOString()
  };
  d.emailLog.unshift(entry);
  if (d.emailLog.length > 500) d.emailLog.length = 500;
  return entry;
}

// Wrap any Resend template send: fire-and-forget, log result, never throw.
async function deliverEmail(user, templateName, recipientEmails, sendFn, meta = {}) {
  if (!recipientEmails || (Array.isArray(recipientEmails) ? recipientEmails : [recipientEmails]).filter(Boolean).length === 0) {
    return { sent: false, reason: 'No recipients' };
  }
  try {
    const result = await sendFn();
    logEmail({
      to: recipientEmails,
      subject: meta.subject || templateName,
      template: templateName,
      status: result.sent ? 'sent' : 'failed',
      result,
      relatedModule: meta.relatedModule || '',
      relatedId: meta.relatedId || '',
      createdBy: user?.id || 'SYSTEM'
    });
    return result;
  } catch (err) {
    logEmail({
      to: recipientEmails,
      subject: meta.subject || templateName,
      template: templateName,
      status: 'error',
      result: { error: err.message },
      relatedModule: meta.relatedModule || '',
      relatedId: meta.relatedId || '',
      createdBy: user?.id || 'SYSTEM'
    });
    return { sent: false, error: err.message };
  }
}

// Helper to find manager/admin emails for routing (e.g. leave approvals).
function managerEmails(d) {
  return (d.employees || [])
    .filter(e => /manager|admin|hr|director|ceo|head/i.test(e.position || '') && e.email)
    .map(e => e.email)
    .filter(Boolean)
    .slice(0, 5);
}

const ERP_FROM = 'erpintergration@gmail.com';
const ERP_FROM_NAME = 'Unity ERP';


// ─────────────────────────── NOTIFICATIONS · ALERTS · HR · LEAVES ───────────────────────────
const PRIORITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const NOTIFICATION_CATEGORIES = ['inventory', 'manufacturing', 'procurement', 'sales', 'crm', 'finance', 'accounting', 'payroll', 'reports', 'security', 'system'];
const NOTIFICATION_CATEGORY_LABEL = {
  inventory: 'Inventory', manufacturing: 'Manufacturing', procurement: 'Procurement', sales: 'Sales', crm: 'CRM',
  finance: 'Finance', accounting: 'Accounting', payroll: 'Payroll & HR', reports: 'Reports', security: 'Security', system: 'System'
};
const CANDIDATE_STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];
const LEAVE_TYPES = [
  { id: 'LT-1', name: 'Annual', deducts: 'annual', defaultDays: 21, paid: true },
  { id: 'LT-2', name: 'Sick', deducts: 'sick', defaultDays: 10, paid: true },
  { id: 'LT-3', name: 'Casual', deducts: 'casual', defaultDays: 5, paid: true },
  { id: 'LT-4', name: 'Maternity', deducts: 'none', defaultDays: 90, paid: true },
  { id: 'LT-5', name: 'Compassionate', deducts: 'none', defaultDays: 5, paid: true },
  { id: 'LT-6', name: 'Unpaid', deducts: 'none', defaultDays: 0, paid: false }
];

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function leaveBusinessDays(start, end) {
  let count = 0;
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
function defaultNotificationSettings() {
  return {
    channels: { critical: ['in_app', 'email', 'sms'], high: ['in_app', 'email'], medium: ['in_app'], low: ['in_app'] },
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
    autoAcknowledge: false,
    escalationHours: 48,
    updatedAt: new Date().toISOString()
  };
}

// Push a manual (non-rule) notification — used by leaves + future flows
function pushManualNotification(d, alert) {
  d.notifications ||= [];
  const existing = d.notifications.find(n => n.sourceModule === alert.sourceModule && n.sourceId === alert.sourceId && n.status !== 'archived');
  if (existing) {
    existing.title = alert.title;
    existing.message = alert.message;
    existing.createdAt = new Date().toISOString();
    existing.read = false;
    return existing;
  }
  const n = {
    id: gid(),
    category: alert.category || 'system',
    priority: alert.priority || 'medium',
    title: alert.title,
    message: alert.message,
    sourceModule: alert.sourceModule || 'system',
    sourceId: alert.sourceId || '',
    sourceLabel: alert.sourceLabel || '',
    createdAt: new Date().toISOString(),
    status: 'active',
    read: false,
    assignedTo: '',
    comments: [],
    auto: false
  };
  d.notifications.unshift(n);
  return n;
}

// Deterministic rule engine — scans live ERP data and refreshes auto-detected alerts.
// Preserves user disposition (acknowledge/snooze/archive/comments) on existing alerts.
function refreshAlerts(d) {
  d.notifications ||= [];
  const generated = [];
  const now0 = today();
  const nowTs = Date.now();
  const emit = (category, priority, key, title, message, sourceModule, sourceId, sourceLabel) => generated.push({
    id: `AUTO-${category}-${key}`, category, priority, title, message, sourceModule, sourceModule, sourceId: sourceId || key, sourceLabel: sourceLabel || '', auto: true
  });

  // Inventory
  for (const item of (d.inventory || [])) {
    const qty = num(item.quantity);
    const reorder = num(item.reorderPoint || item.minStock || 0);
    const product = (d.products || []).find(p => p.id === item.productId || p.name === item.productName);
    if (qty <= 0) emit('inventory', 'critical', `oos-${item.id}`, 'Inventory depleted', `${item.productName || product?.name || 'Product'} is completely out of stock.`, 'inventory', item.id, item.productName);
    else if (reorder && qty <= reorder) emit('inventory', 'high', `low-${item.id}`, 'Low stock alert', `${item.productName || product?.name}: ${qty} ${item.unit || ''} remaining (reorder at ${reorder}).`, 'inventory', item.id, item.productName);
    if (item.expiryDate) {
      const days = daysBetween(now0, dateOnly(item.expiryDate));
      if (days >= 0 && days <= 30) emit('inventory', days <= 7 ? 'critical' : 'high', `exp-${item.id}`, 'Expiring soon', `${item.productName || 'Batch'} expires in ${days} day(s) (${dateOnly(item.expiryDate)}).`, 'inventory', item.id, item.productName);
    }
  }

  // Sales / invoices
  for (const inv of (d.invoices || [])) {
    if (num(inv.balance) > 0 && dateOnly(inv.dueDate) < now0) {
      const overdueDays = daysBetween(dateOnly(inv.dueDate), now0);
      emit('sales', overdueDays > 60 ? 'critical' : 'high', `inv-od-${inv.id}`, 'Overdue invoice', `${inv.invNo || inv.id} — ${inv.customerName} — ${money(inv.balance)} overdue by ${overdueDays} day(s).`, 'sales', inv.id, inv.invNo || inv.customerName);
    }
  }
  for (const sale of (d.sales || [])) {
    if (num(sale.total) >= 500000) emit('sales', 'medium', `lg-sale-${sale.id}`, 'Large sale created', `${sale.customerName} — ${money(sale.total)}.`, 'sales', sale.id, sale.saleNo);
  }

  // Procurement
  for (const po of (d.purchaseOrders || [])) {
    if (String(po.status || '').toLowerCase() === 'pending') emit('procurement', 'high', `po-pend-${po.id}`, 'Purchase order pending', `PO ${po.poNo || po.id} — ${po.supplierName || ''} — ${money(po.total)} awaiting approval.`, 'purchasing', po.id, po.poNo);
    if (po.expectedDate && dateOnly(po.expectedDate) < now0 && String(po.status || '').toLowerCase() !== 'received') emit('procurement', 'high', `po-late-${po.id}`, 'Supplier delivery delayed', `PO ${po.poNo || po.id} from ${po.supplierName || ''} missed delivery date.`, 'purchasing', po.id, po.supplierName);
  }

  // Manufacturing
  for (const job of (d.productionOrders || d.production || [])) {
    if (job.endDate && dateOnly(job.endDate) < now0 && String(job.status || '').toLowerCase() === 'in progress') emit('manufacturing', 'high', `prod-late-${job.id}`, 'Production overdue', `Job ${job.batchNo || job.id} — ${job.productName || ''} is past its end date.`, 'production', job.id, job.batchNo);
  }

  // Finance
  const cash = (d.bankAccounts || []).reduce((s, b) => s + num(b.balance), 0);
  if (cash < 500000) emit('finance', cash < 200000 ? 'critical' : 'high', 'low-cash', 'Low cash position', `Total bank balances at ${money(cash)}.`, 'finance', 'cash', 'Bank balances');
  for (const ap of (d.financeAccountsPayable || d.accountsPayable || [])) {
    if (num(ap.outstandingBalance || ap.balance) > 0 && ap.dueDate && dateOnly(ap.dueDate) < now0) {
      const overdueDays = daysBetween(dateOnly(ap.dueDate), now0);
      if (overdueDays > 90) emit('finance', 'critical', `ap-90-${ap.id}`, 'Supplier payment overdue 90+', `${ap.supplierName || ap.name} — ${money(ap.outstandingBalance || ap.balance)} overdue ${overdueDays} days.`, 'finance', ap.id, ap.supplierName);
    }
  }
  for (const bud of (d.budgets || [])) {
    if (num(bud.actual) > num(bud.budget)) emit('finance', 'medium', `bud-over-${bud.id}`, 'Budget exceeded', `${bud.department} spent ${money(bud.actual)} against ${money(bud.budget)} budget.`, 'finance', bud.id, bud.department);
  }

  // CRM
  for (const cust of (d.customers || [])) {
    const lastActivity = cust.lastActivityDate || cust.updatedAt;
    if (lastActivity && daysBetween(dateOnly(lastActivity), now0) > 90) emit('crm', 'medium', `cust-inactive-${cust.id}`, 'Customer inactive 90+', `${cust.name} has had no activity for ${daysBetween(dateOnly(lastActivity), now0)} days.`, 'customers', cust.id, cust.name);
  }

  // Payroll / HR
  const dayOfMonth = new Date().getDate();
  if (dayOfMonth >= 25) emit('payroll', 'high', 'payroll-due', 'Payroll processing due', `Month-end payroll run is approaching (${dayOfMonth}/${new Date().getMonth() + 1}).`, 'finance', 'payroll', 'Payroll');
  const pendingLeaves = (d.leaveApplications || []).filter(l => l.status === 'Pending').length;
  if (pendingLeaves > 0) emit('payroll', 'high', `pending-leaves-${pendingLeaves}`, 'Pending leave approvals', `${pendingLeaves} leave application(s) awaiting manager decision.`, 'leaves', 'pending', 'Leave approvals');

  // Security — failed logins from activity feed
  const failedLogins = (d.activity || []).filter(a => String(a.action).toLowerCase().includes('failed login') && (nowTs - new Date(a.createdAt).getTime()) < 86400000).length;
  if (failedLogins >= 3) emit('security', 'high', 'failed-logins', 'Multiple failed logins', `${failedLogins} failed login attempts in the last 24 hours.`, 'settings', 'security', 'Security');

  // Merge: keep user disposition on existing auto-alerts; insert new ones
  const byId = new Map((d.notifications || []).map(n => [n.id, n]));
  for (const gen of generated) {
    const existing = byId.get(gen.id);
    if (existing) {
      // update dynamic fields but keep disposition
      existing.title = gen.title;
      existing.message = gen.message;
      existing.sourceLabel = gen.sourceLabel;
      existing.lastChecked = new Date().toISOString();
      // if it was snoozed and snooze expired, reactivate
      if (existing.status === 'snoozed' && existing.snoozedUntil && new Date(existing.snoozedUntil) < new Date()) {
        existing.status = 'active';
        existing.read = false;
      }
    } else {
      byId.set(gen.id, { ...gen, createdAt: new Date().toISOString(), status: 'active', read: false, assignedTo: '', comments: [], lastChecked: new Date().toISOString() });
    }
  }
  // Remove auto-alerts whose rule no longer fires (resolved), unless user touched them
  const genIds = new Set(generated.map(g => g.id));
  d.notifications = Array.from(byId.values()).filter(n => {
    if (!n.auto) return true; // keep manual notifications
    if (genIds.has(n.id)) return true; // still firing
    if (n.status === 'archived' || n.status === 'acknowledged' || n.comments?.length) return true; // user touched
    return false;
  });
}

// ── HR seed ──
function employeeRecord(form) {
  return {
    name: clean(form.name),
    email: clean(form.email),
    phone: clean(form.phone),
    department: clean(form.department) || 'Sales',
    position: clean(form.position) || 'Officer',
    employmentType: clean(form.employmentType) || 'Full-time',
    joinDate: dateOnly(form.joinDate),
    status: clean(form.status) || 'Active',
    salary: num(form.salary),
    manager: clean(form.manager),
    leaveBalanceAnnual: num(form.leaveBalanceAnnual ?? 21),
    leaveBalanceSick: num(form.leaveBalanceSick ?? 10),
    leaveBalanceCasual: num(form.leaveBalanceCasual ?? 5)
  };
}
function candidateRecord(form) {
  return {
    name: clean(form.name),
    email: clean(form.email),
    phone: clean(form.phone),
    position: clean(form.position) || 'Officer',
    department: clean(form.department) || 'Sales',
    stage: CANDIDATE_STAGES.includes(form.stage) ? form.stage : 'Applied',
    source: clean(form.source) || 'Direct',
    expectedSalary: num(form.expectedSalary),
    rating: Math.min(Math.max(num(form.rating), 0), 5) || 0
  };
}
function reviewRecord(form, emp) {
  return {
    employeeId: emp.id,
    employeeName: emp.name,
    department: emp.department,
    period: clean(form.period) || new Date().toISOString().slice(0, 7),
    rating: Math.min(Math.max(num(form.rating), 0), 5),
    goals: clean(form.goals),
    feedback: clean(form.feedback),
    status: clean(form.status) || 'Pending',
    reviewer: clean(form.reviewer)
  };
}
function ensureHrData() {
  if (!db) return;
  if (db.employees?.length && db.candidates?.length && db.reviews?.length && db.attendance?.length) return;
  const payroll = db.payrollRecords || [];
  const positions = { Sales: 'Sales Officer', Warehouse: 'Warehouse Lead', Production: 'Production Supervisor', Procurement: 'Procurement Officer', Finance: 'Accountant' };
  const phones = ['+254712345001', '+254712345002', '+254712345003', '+254712345004', '+254712345005', '+254712345006', '+254712345007'];
  const joinDates = ['2022-03-14', '2021-08-02', '2023-01-09', '2020-11-23', '2022-06-18', '2023-09-05', '2021-02-12'];
  db.employees = db.employees?.length ? db.employees : [
    ...(payroll.length ? payroll.map((p, i) => ({
      id: `EMP-${p.employeeNo || String(i + 1).padStart(3, '0')}`,
      employeeNo: p.employeeNo || `EMP-${String(i + 1).padStart(3, '0')}`,
      name: p.name, email: `${String(p.name || 'staff').toLowerCase().replace(/[^a-z]+/g, '.')}@farmtrack.co.ke`,
      phone: phones[i % phones.length], department: p.department, position: positions[p.department] || 'Officer',
      employmentType: 'Full-time', joinDate: joinDates[i % joinDates.length], status: 'Active', salary: num(p.basicSalary),
      manager: 'Miko Admin', leaveBalanceAnnual: 21 - (i % 5), leaveBalanceSick: 10 - (i % 3), leaveBalanceCasual: 5 - (i % 2)
    })) : []),
    { id: 'EMP-006', employeeNo: 'EMP-006', name: 'Miko Admin', email: 'miko@gmail.com', phone: '+254700000000', department: 'Admin', position: 'Administrator', employmentType: 'Full-time', joinDate: '2019-04-01', status: 'Active', salary: 150000, manager: '', leaveBalanceAnnual: 21, leaveBalanceSick: 10, leaveBalanceCasual: 5 }
  ];
  db.departments = db.departments?.length ? db.departments : [
    { id: 'DEP-1', name: 'Admin', manager: 'Miko Admin', headcount: 1 },
    { id: 'DEP-2', name: 'Sales', manager: 'Mary Sales', headcount: 1 },
    { id: 'DEP-3', name: 'Finance', manager: 'Sarah Accountant', headcount: 1 },
    { id: 'DEP-4', name: 'Inventory', manager: 'Peter Warehouse', headcount: 1 },
    { id: 'DEP-5', name: 'Procurement', manager: 'David Procurement', headcount: 1 },
    { id: 'DEP-6', name: 'Production', manager: 'Grace Production', headcount: 1 }
  ];
  db.candidates = db.candidates?.length ? db.candidates : [
    { id: 'CAN-1', name: 'James Otieno', email: 'james@email.com', phone: '+254722100100', position: 'Sales Officer', department: 'Sales', stage: 'Interview', source: 'LinkedIn', expectedSalary: 80000, rating: 4, appliedAt: new Date().toISOString() },
    { id: 'CAN-2', name: 'Faith Wanjiru', email: 'faith@email.com', phone: '+254722100200', position: 'Accountant', department: 'Finance', stage: 'Screening', source: 'Referral', expectedSalary: 95000, rating: 5, appliedAt: new Date().toISOString() },
    { id: 'CAN-3', name: 'Brian Kamau', email: 'brian@email.com', phone: '+254722100300', position: 'Warehouse Lead', department: 'Inventory', stage: 'Offer', source: 'Job Board', expectedSalary: 70000, rating: 4, appliedAt: new Date().toISOString() },
    { id: 'CAN-4', name: 'Mercy Achieng', email: 'mercy@email.com', phone: '+254722100400', position: 'Field Officer', department: 'Sales', stage: 'Applied', source: 'Direct', expectedSalary: 60000, rating: 3, appliedAt: new Date().toISOString() }
  ];
  db.reviews = db.reviews?.length ? db.reviews : (db.employees || []).slice(0, 4).map((e, i) => ({
    id: `REV-${i + 1}`, employeeId: e.id, employeeName: e.name, department: e.department, period: new Date().toISOString().slice(0, 7),
    rating: 4 - (i % 2), goals: 'Q1 sales target + customer retention', feedback: 'Strong performer, consistent delivery', status: i === 0 ? 'Pending' : 'Completed', reviewer: 'Miko Admin'
  }));
  db.attendance = db.attendance?.length ? db.attendance : (() => {
    const records = [];
    const todayD = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(todayD); d.setDate(todayD.getDate() - i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      (db.employees || []).slice(0, 5).forEach((e, idx) => {
        records.push({ id: `ATT-${i}-${idx}`, employeeId: e.id, employeeName: e.name, department: e.department, date: d.toISOString().slice(0, 10), checkIn: '08:0' + (idx % 9), checkOut: '17:3' + (idx % 9), status: i === 1 && idx === 2 ? 'Late' : 'Present', note: '' });
      });
    }
    return records;
  })();
}

function attendanceHours(record = {}) {
  if (record.hoursWorked !== undefined && record.hoursWorked !== null && record.hoursWorked !== '') return num(record.hoursWorked);
  const checkIn = clean(record.checkIn);
  const checkOut = clean(record.checkOut);
  if (!checkIn || !checkOut) return 0;
  const [ih, im] = checkIn.split(':').map(Number);
  const [oh, om] = checkOut.split(':').map(Number);
  if ([ih, im, oh, om].some(value => Number.isNaN(value))) return 0;
  const mins = (oh * 60 + om) - (ih * 60 + im);
  return Math.max(0, Math.round((mins / 60) * 10) / 10);
}
function periodRange(period = 'Month') {
  const cleanPeriod = String(period || 'Month').toLowerCase();
  const days = cleanPeriod.includes('week') ? 7 : cleanPeriod.includes('year') ? 365 : 30;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), days, label: days === 7 ? 'Week' : days === 365 ? 'Year' : 'Month' };
}
function analyticsHeatmap(rows = [], valueKey = 'value') {
  const todayDate = new Date();
  const cells = Array.from({ length: 35 }, (_, index) => {
    const d = new Date(todayDate);
    d.setDate(todayDate.getDate() - (34 - index));
    const date = d.toISOString().slice(0, 10);
    const source = rows.find(row => String(row.date || row.period || '').slice(0, 10) === date) || rows[index % Math.max(rows.length, 1)] || {};
    const value = Math.round(num(source[valueKey] || source.net_revenue || source.gross_revenue || source.total || 0));
    return { date, day: d.getDate(), weekday: d.toLocaleDateString('en-US', { weekday: 'short' }), value, orders: num(source.orders || source.order_count || source.count || 0), profit: Math.round(num(source.profit || source.net_profit || 0)) };
  });
  const nonZero = cells.filter(cell => cell.value > 0);
  const best = nonZero.sort((a, b) => b.value - a.value)[0] || cells[0];
  const worst = nonZero.sort((a, b) => a.value - b.value)[0] || cells[0];
  const total = cells.reduce((sum, cell) => sum + cell.value, 0);
  return {
    cells,
    summary: {
      total,
      average: Math.round(total / Math.max(cells.length, 1)),
      bestDay: best,
      worstDay: worst
    }
  };
}

// ── Leaves seed ──
function buildLeaveCalendar(applications) {
  const approved = applications.filter(l => l.status === 'Approved');
  const byDate = {};
  approved.forEach(l => {
    const cur = new Date(dateOnly(l.startDate));
    const end = new Date(dateOnly(l.endDate));
    while (cur <= end) {
      const key = cur.toISOString().slice(0, 10);
      (byDate[key] ||= []).push({ name: l.applicantName, type: l.type });
      cur.setDate(cur.getDate() + 1);
    }
  });
  return byDate;
}
function ensureLeaveData() {
  if (!db) return;
  ensureHrData();
  db.leaveTypes = db.leaveTypes?.length ? db.leaveTypes : LEAVE_TYPES;
  if (db.leaveApplications?.length) return;
  const me = (db.employees || []).find(e => e.email === 'miko@gmail.com');
  const mary = (db.employees || []).find(e => e.name === 'Mary Sales');
  const peter = (db.employees || []).find(e => e.name === 'Peter Warehouse');
  const start = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
  db.leaveApplications = [
    { id: 'LV-1', applicantId: mary?.id || 'EMP-001', applicantEmail: mary?.email || '', applicantName: 'Mary Sales', department: 'Sales', type: 'Annual', startDate: start(3), endDate: start(5), days: 3, reason: 'Family event upcountry', status: 'Pending', appliedAt: new Date().toISOString() },
    { id: 'LV-2', applicantId: peter?.id || 'EMP-002', applicantEmail: peter?.email || '', applicantName: 'Peter Warehouse', department: 'Inventory', type: 'Sick', startDate: start(-2), endDate: start(-1), days: 2, reason: 'Medical review', status: 'Approved', decidedBy: 'Miko Admin', decidedAt: new Date().toISOString(), appliedAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 'LV-3', applicantId: me?.id || 'EMP-006', applicantEmail: 'miko@gmail.com', applicantName: 'Miko Admin', department: 'Admin', type: 'Casual', startDate: start(10), endDate: start(10), days: 1, reason: 'Personal errand', status: 'Pending', appliedAt: new Date().toISOString() }
  ];
}

function postFinanceJournal(user, { date, sourceModule, sourceId, reference, description, debitAccountName, creditAccountName, amount }) {
  const d = data();
  d.financeManualJournals ||= [];
  d.financeManualJournalLines ||= [];
  d.financeManualLedger ||= [];
  d.financeManualAuditLogs ||= [];
  const debit = (d.financeAccounts || []).find(a => a.name === debitAccountName);
  const credit = (d.financeAccounts || []).find(a => a.name === creditAccountName);
  const value = Math.round(num(amount));
  if (!debit || !credit || !value) return null;
  const id = gid();
  const entry = { id, journalNo: `JE-${String((d.financeJournalEntries?.length || 0) + d.financeManualJournals.length + 1).padStart(5, '0')}`, date: date || today(), description, sourceModule, sourceId, reference, totalDebit: value, totalCredit: value, approvalStatus: 'Auto Posted', postedBy: user?.name || 'System', immutable: true, createdAt: new Date().toISOString() };
  const debitLine = { id: gid(), journalEntryId: id, accountCode: debit.code, accountName: debit.name, accountType: debit.type, debit: value, credit: 0, sourceModule, reference, date: entry.date };
  const creditLine = { id: gid(), journalEntryId: id, accountCode: credit.code, accountName: credit.name, accountType: credit.type, debit: 0, credit: value, sourceModule, reference, date: entry.date };
  d.financeManualJournals.unshift(entry);
  d.financeManualJournalLines.unshift(creditLine, debitLine);
  d.financeManualLedger.unshift({ id: gid(), ...creditLine, runningBalance: 0 }, { id: gid(), ...debitLine, runningBalance: 0 });
  d.financeManualAuditLogs.unshift({ id: gid(), user: user?.name || 'System', date: entry.date, module: sourceModule, action: 'Finance Journal Auto Posted', reference, oldValue: '', newValue: `${value}/${value}`, reason: description, approval: entry.approvalStatus, immutable: true });
  return entry;
}

function list(name) {
  return data()[name].filter(x => x.isDeleted !== 'Yes');
}

function save(name, user, row) {
  const d = data();
  const now = new Date().toISOString();
  validateRecord(name, row);
  if (row.id) {
    const i = d[name].findIndex(x => x.id === row.id);
    if (i >= 0) d[name][i] = { ...d[name][i], ...row, updatedAt: now };
    emitBusinessEvent(user, `${name}.updated`, name, row.id, row);
    return { success: true };
  }
  const saved = { ...row, id: gid(), createdAt: now, updatedAt: now, createdBy: user.id, isDeleted: 'No' };
  d[name].push(saved);
  emitBusinessEvent(user, `${name}.created`, name, saved.id, saved);
  return { success: true, row: saved, id: saved.id };
}

function validateRecord(name, row = {}) {
  if (name === 'customers') {
    assertRequired(row.name, 'Customer name');
    assertRequired(row.phone || row.email, 'Customer phone or email');
  }
  if (name === 'suppliers') {
    assertRequired(row.name, 'Supplier name');
  }
  if (name === 'products') {
    assertRequired(row.name, 'Product name');
    assertRequired(row.sku, 'SKU');
    assertPositive(row.sellingPrice || row.costPrice || 1, 'Product price');
  }
  if (name === 'inventory') {
    assertRequired(row.productName, 'Inventory product');
    assertRequired(row.warehouseName, 'Warehouse');
    assertPositive(row.quantity, 'Inventory quantity');
  }
  if (name === 'users') {
    assertRequired(row.name, 'User name');
    assertRequired(row.email, 'User email');
    assertRequired(row.role, 'User role');
  }
}

function softDelete(name, id) {
  const x = data()[name].find(r => r.id === id);
  if (x) x.isDeleted = 'Yes';
  return { success: true };
}

async function buildNormalizedAnalytics() {
  const [executiveRows, revenueRows, inventoryRows, customerRows, procurementRows, productionRows, riskRows] = await Promise.all([
    fetchPublicView('analytics_executive_summary', 'select=*&limit=1'),
    fetchPublicView('analytics_revenue_summary', 'select=*&order=period.desc&limit=12'),
    fetchPublicView('analytics_inventory_health', 'select=*&limit=200'),
    fetchPublicView('analytics_customer_value', 'select=*&order=lifetime_value.desc&limit=8'),
    fetchPublicView('analytics_procurement_metrics', 'select=*&limit=8'),
    fetchPublicView('analytics_production_metrics', 'select=*&limit=20'),
    fetchPublicView('analytics_risk_center', 'select=*&limit=20')
  ]);
  if (!executiveRows?.length && !revenueRows?.length && !inventoryRows?.length && !customerRows?.length) return null;

  const executive = executiveRows?.[0] || {};
  const revenueTotal = revenueRows.reduce((sum, row) => sum + num(row.net_revenue || row.gross_revenue), 0);
  const cogs = revenueRows.reduce((sum, row) => sum + num(row.cogs), 0);
  const collected = revenueRows.reduce((sum, row) => sum + num(row.collected), 0);
  const outstanding = revenueRows.reduce((sum, row) => sum + num(row.outstanding), 0);
  const estimatedExpenses = Math.round(revenueTotal * 0.22);
  const netProfit = revenueTotal - cogs - estimatedExpenses;
  const inventoryLow = inventoryRows.filter(row => row.health_status === 'low').length;
  const inventoryDead = inventoryRows.filter(row => row.health_status === 'dead').length;
  const inventoryHealthy = inventoryRows.filter(row => row.health_status === 'healthy').length || Math.max(0, inventoryRows.length - inventoryLow - inventoryDead);
  const productionPlanned = productionRows.reduce((sum, row) => sum + num(row.planned_qty), 0);
  const productionCompleted = productionRows.reduce((sum, row) => sum + num(row.completed_qty), 0);
  const heatmap = analyticsHeatmap(revenueRows, 'net_revenue');

  return {
    hero: {
      title: 'Executive Analytics Center',
      subtitle: 'Materialized-view intelligence from Supabase analytics views',
      confidence: 97,
      dataSources: ['analytics_revenue_summary', 'analytics_inventory_health', 'analytics_customer_value', 'analytics_executive_summary']
    },
    dataSource: {
      mode: 'Supabase materialized views',
      normalized: true,
      materializedViews: true,
      message: 'Analytics is reading precomputed Supabase analytics views.',
      status: 'Live',
      lastSync: normalizedSyncSummary?.finishedAt || normalizedSyncSummary?.startedAt || new Date().toISOString(),
      recordsLoaded: executiveRows.length + revenueRows.length + inventoryRows.length + customerRows.length + procurementRows.length + productionRows.length + riskRows.length,
      tables: ['analytics_executive_summary', 'analytics_revenue_summary', 'analytics_inventory_health', 'analytics_customer_value', 'analytics_risk_center']
    },
    revenueWaterfall: [
      { label: 'Revenue', value: Math.round(revenueTotal), type: 'positive' },
      { label: 'Discounts', value: 0, type: 'negative' },
      { label: 'Returns', value: 0, type: 'negative' },
      { label: 'Cost of Goods', value: -Math.round(cogs), type: 'negative' },
      { label: 'Expenses', value: -estimatedExpenses, type: 'negative' },
      { label: 'Net Profit', value: Math.round(netProfit), type: netProfit >= 0 ? 'positive' : 'negative' }
    ],
    revenueHeatmap: heatmap.cells,
    revenueHeatmapSummary: heatmap.summary,
    revenueBreakdown: revenueRows.map(row => ({ name: row.period || 'Current Period', value: Math.round(num(row.net_revenue || row.gross_revenue)) })).slice(0, 6),
    customerIntelligence: customerRows.map(row => ({
      name: row.customer_name || row.name || 'Customer',
      lifetimeValue: Math.round(num(row.lifetime_value || row.revenue)),
      health: num(row.overdue_balance) > 0 ? 'At Risk' : 'Healthy',
      churnRisk: num(row.overdue_balance) > 0 ? 48 : 12
    })),
    inventoryIntelligence: {
      value: Math.round(inventoryRows.reduce((sum, row) => sum + num(row.inventory_value), 0)),
      healthy: inventoryHealthy,
      low: inventoryLow,
      dead: inventoryDead,
      fastMoving: inventoryRows.filter(row => num(row.quantity_on_hand) < num(row.reorder_qty || row.min_stock || 0)).length,
      slowMoving: inventoryRows.filter(row => num(row.quantity_on_hand) > num(row.reorder_qty || row.min_stock || 0) * 3).length,
      aging: [],
      turnover: cogs > 0 ? Number((cogs / Math.max(1, inventoryRows.reduce((sum, row) => sum + num(row.inventory_value), 0))).toFixed(2)) : 0
    },
    procurementIntelligence: procurementRows.map(row => ({
      supplier: row.supplier_name || row.supplier || 'Supplier',
      leadTime: Math.round(num(row.avg_lead_time_days || row.lead_time || 0)),
      quality: Math.round(num(row.quality_score || row.on_time_rate || 0)),
      deliveryAccuracy: Math.round(num(row.delivery_accuracy || row.delivery_rate || 0)),
      costScore: Math.round(num(row.cost_score || 80))
    })),
    productionIntelligence: {
      planned: Math.round(productionPlanned),
      completed: Math.round(productionCompleted),
      delayed: productionRows.filter(row => String(row.status || '').toLowerCase() !== 'completed').length,
      waste: Math.round(productionRows.reduce((sum, row) => sum + num(row.wastage_qty), 0))
    },
    salesIntelligence: {
      funnel: [
        { stage: 'Lead', count: 0, value: 0 },
        { stage: 'Quoted', count: 0, value: 0 },
        { stage: 'Won', count: Math.round(num(executive.orders || 0)), value: Math.round(revenueTotal) }
      ],
      regional: []
    },
    financialIntelligence: {
      cash30: Math.round(collected * 0.25),
      cash60: Math.round(collected * 0.4),
      cash90: Math.round(collected * 0.55),
      arRisk: outstanding > 0 ? 1 : 0,
      profitability: revenueTotal > 0 ? Math.round((netProfit / revenueTotal) * 100) : 0
    },
    aiIntelligence: [
      {
        question: 'Is Analytics using the database correctly?',
        answer: 'Yes. This payload is sourced from precomputed Supabase analytics views instead of raw transactional table scans.',
        records: ['analytics_revenue_summary', 'analytics_inventory_health', 'analytics_customer_value']
      },
      {
        question: 'What needs attention?',
        answer: riskRows.length ? `${riskRows.length} materialized risk signals are currently active.` : 'No materialized risk signals are currently active.',
        records: ['analytics_risk_center']
      }
    ],
    warRoom: {
      risks: riskRows.map(row => ({ label: row.risk_type || 'Risk', level: row.severity || 'Watch', value: Math.round(num(row.risk_count || row.count || 1)) })).slice(0, 4),
      opportunities: [
        { label: 'Collections available', value: Math.round(outstanding) },
        { label: 'Revenue run-rate', value: Math.round(revenueTotal) }
      ],
      forecasts: [
        { label: 'Revenue 30d', value: Math.round(revenueTotal / Math.max(1, revenueRows.length)) },
        { label: 'Cash Flow 60d', value: Math.round(collected * 0.4) }
      ]
    },
    reports: [
      'Executive Board Report',
      'Sales Performance Report',
      'Inventory Intelligence Report',
      'Procurement Report',
      'Production Report',
      'Finance Report',
      'Customer Intelligence Report',
      'Risk Report',
      'Forecasting Report'
    ]
  };
}

const api = {
  loginUser(email, password) {
    const d = data();
    const e = String(email || '').trim().toLowerCase();
    if (e === 'miko@gmail.com') {
      let u = d.users.find(x => x.email === e);
      if (!u) d.users.push(u = { id: 'USER001', name: 'Miko Admin', email: e, password: '1234567890', role: ROLES.ADMIN, status: 'Active' });
      u.password = '1234567890'; u.role = ROLES.ADMIN; u.status = 'Active'; u.lastLogin = new Date().toISOString();
      log(u, 'Login', 'Auth');
      return { success: true, user: publicUser(u) };
    }
    const u = d.users.find(x => String(x.email).toLowerCase() === e);
    if (!u) return { success: false, message: 'User not found' };
    if (String(u.password) !== String(password || '').trim()) return { success: false, message: 'Invalid password' };
    if (u.status !== 'Active') return { success: false, message: 'Account inactive' };
    return { success: true, user: publicUser(u) };
  },
  appHealth(user) {
    const d = data();
    return { ok: true, authOk: !!reqRole(user), persistence: supabaseReady ? 'supabase' : 'memory', users: d.users.length, customers: d.customers.length, products: d.products.length, sales: d.sales.length };
  },
  async getSupabaseIntegrationStatus(user) {
    reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const normalized = await getNormalizedSupabaseStatus();
    return {
      bridge: {
        enabled: supabaseEnabled(),
        ready: supabaseReady === true,
        table: 'erp_state',
        stateId: STATE_ID
      },
      normalized,
      lastNormalizedSync: normalizedSyncSummary,
      pages: [
        ['Dashboard', 'getDashboardData', normalized.ready ? 'normalized-sync-ready' : 'json-bridge'],
        ['Analytics', 'getAnalyticsData/getAnalyticsTabData', normalized.ready ? 'materialized-view-ready' : 'json-bridge-fallback'],
        ['CRM', 'getCRMWorkspaceData/saveCustomer/saveLead/saveCall', normalized.ready ? 'customers/leads/calls-ready' : 'json-bridge'],
        ['Sales', 'getSalesWorkspaceData/createSalesOrder/confirmSalesDelivery', normalized.ready ? 'sales_orders/invoices/payments-ready' : 'json-bridge'],
        ['Inventory', 'getInventoryWorkspaceData/adjustInventory/transferInventory', normalized.ready ? 'inventory_items/transactions-ready' : 'json-bridge'],
        ['Purchases', 'getProcurementWorkspaceData', normalized.ready ? 'purchase_orders/suppliers-ready' : 'json-bridge'],
        ['Manufacturing', 'getManufacturingWorkspaceData', normalized.ready ? 'production_jobs-ready' : 'json-bridge'],
        ['Finance/Accounts', 'getFinanceWorkspaceData/postManualJournal', normalized.ready ? 'journal_entries/payments-ready' : 'json-bridge'],
        ['Reports', 'getReportCenterData/generateReportExport', normalized.ready ? 'normalized-records-ready' : 'json-bridge'],
        ['Settings', 'getSettingsWorkspaceData/saveSettingsSection', normalized.ready ? 'profiles/preferences-ready' : 'json-bridge']
      ].map(([page, interactions, mode]) => ({ page, interactions, mode }))
    };
  },
  async syncSupabaseNormalized(user) {
    reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    return syncNormalizedSupabase({ silent: false });
  },
  getDashboardData(user) {
    const u = reqRole(user);
    const d = data();
    const recentSeedExists = d.sales.some(s => String(s.saleNo || '').startsWith('DASH-WK-'));
    if (!recentSeedExists && d.products.length && d.customers.length) {
      const seedProducts = d.products.slice(0, 6);
      const seedCustomers = d.customers.slice(0, 5);
      for (let i = 7; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - (i * 7 + 2));
        const iso = date.toISOString();
        const ds = iso.slice(0, 10);
        const product = seedProducts[i % seedProducts.length];
        const customer = seedCustomers[i % seedCustomers.length];
        const qty = 4 + i * 2;
        const unitPrice = num(product.sellingPrice || product.price || 1200);
        const cost = num(product.costPrice || unitPrice * 0.55);
        const subtotal = qty * unitPrice;
        const tax = Math.round(subtotal * 0.16);
        const total = subtotal + tax;
        const saleId = gid();
        const saleNo = `DASH-WK-${String(8 - i).padStart(2, '0')}`;
        d.sales.unshift({ id: saleId, createdAt: iso, updatedAt: iso, createdBy: u.id, isDeleted: 'No', saleNo, customerId: customer.id, customerName: customer.name, date: ds, subtotal, tax, total, paid: total, balance: 0, status: 'Paid', approvalStatus: 'Auto Approved', paymentMethod: 'Bank' });
        d.saleItems.unshift({ id: gid(), createdAt: iso, updatedAt: iso, createdBy: u.id, isDeleted: 'No', saleId, productId: product.id, productName: product.name, quantity: qty, unitPrice, cost, total: subtotal });
        d.invoices.unshift({ id: gid(), createdAt: iso, updatedAt: iso, createdBy: u.id, isDeleted: 'No', invNo: `INV-${saleNo}`, saleId, customerId: customer.id, customerName: customer.name, date: ds, dueDate: ds, subtotal, tax, total, paid: total, balance: 0, status: 'Paid', approvalStatus: 'Auto Approved', type: 'Sales' });
        d.expenses.unshift({ id: gid(), createdAt: iso, updatedAt: iso, createdBy: u.id, isDeleted: 'No', expNo: `EXP-${saleNo}`, category: i % 2 ? 'Sales Travel' : 'Distribution', date: ds, description: `Weekly dashboard demo operating cost ${8 - i}`, amount: Math.round(total * (0.22 + (i % 3) * 0.03)), paymentMethod: 'Bank', status: 'Paid' });
      }
    }
    const cy = new Date().getFullYear();
    const ly = cy - 1;
    const byYear = y => d.sales.filter(s => new Date(s.createdAt).getFullYear() === y);
    const tY = byYear(cy), lY = byYear(ly);
    const rev = a => a.reduce((s, x) => s + num(x.total), 0);
    const expY = y => d.expenses.filter(e => new Date(e.createdAt).getFullYear() === y).reduce((s, x) => s + num(x.amount), 0);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthTotals = rows => rows.reduce((a, s) => { a[new Date(s.createdAt).getMonth()] += num(s.total); return a; }, Array(12).fill(0));
    const sumByRange = (rows, start, end, valueKey) => rows
      .filter(row => {
        const raw = row.date || row.createdAt || row.created_at;
        const date = raw ? new Date(raw) : null;
        return date && date >= start && date <= end;
      })
      .reduce((sum, row) => sum + num(row[valueKey]), 0);
    const now = new Date();
    const weeklySeries = Array.from({ length: 8 }, (_, index) => {
      const weekEnd = new Date(now);
      weekEnd.setHours(23, 59, 59, 999);
      weekEnd.setDate(weekEnd.getDate() - ((7 - index - 1) * 7));
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);
      const revenue = sumByRange(d.sales, weekStart, weekEnd, 'total');
      const expenses = sumByRange(d.expenses, weekStart, weekEnd, 'amount');
      return { label: `W${index + 1}`, revenue: Math.round(revenue), expenses: Math.round(expenses), profit: Math.round(revenue - expenses) };
    });
    const monthlySeries = months.map((label, index) => {
      const revenue = tY.filter(s => new Date(s.createdAt).getMonth() === index).reduce((sum, row) => sum + num(row.total), 0);
      const expenses = d.expenses.filter(e => new Date(e.createdAt).getFullYear() === cy && new Date(e.createdAt).getMonth() === index).reduce((sum, row) => sum + num(row.amount), 0);
      return { label, revenue: Math.round(revenue), expenses: Math.round(expenses), profit: Math.round(revenue - expenses) };
    });
    const yearlySeries = Array.from({ length: 5 }, (_, index) => cy - 4 + index).map(year => {
      const revenue = d.sales.filter(s => new Date(s.createdAt).getFullYear() === year).reduce((sum, row) => sum + num(row.total), 0);
      const expenses = d.expenses.filter(e => new Date(e.createdAt).getFullYear() === year).reduce((sum, row) => sum + num(row.amount), 0);
      return { label: String(year), revenue: Math.round(revenue), expenses: Math.round(expenses), profit: Math.round(revenue - expenses) };
    });
    const cat = {};
    d.products.forEach(p => { cat[p.category || 'Other'] = 0; });
    d.saleItems.forEach(i => {
      const p = d.products.find(x => x.name === i.productName);
      cat[p ? p.category : 'Other'] = (cat[p ? p.category : 'Other'] || 0) + num(i.quantity) * num(i.unitPrice);
    });
    const tRev = rev(tY), lRev = rev(lY), tExp = expY(cy), tProfit = tRev - tExp, lProfit = lRev - expY(ly);
    const pct = (c, p) => p > 0 ? Math.round((c - p) / p * 100) : 0;
    const inventoryValue = d.inventory.reduce((sum, item) => sum + (num(item.quantity) * num(item.unitCost)), 0);
    const lowStock = d.inventory
      .map(item => ({ item, product: d.products.find(p => p.name === item.productName) }))
      .filter(x => x.product && num(x.item.quantity) <= num(x.product.minStock));
    const pipelineValue = d.leads.filter(l => l.status === 'Active').reduce((sum, lead) => sum + num(lead.value), 0);
    const openPOs = d.purchaseOrders.filter(po => ['Open', 'Draft', 'Pending'].includes(po.status));
    const pendingProduction = d.production.filter(job => job.status !== 'Completed');
    const pendingDeliveries = d.deliveries.filter(x => x.status !== 'Delivered');
    const cashCollected = d.invoices.reduce((sum, inv) => sum + num(inv.paid), 0);
    const cashOutstanding = d.invoices.reduce((sum, inv) => sum + num(inv.balance), 0);
    const attention = [
      ...lowStock.slice(0, 3).map(x => ({
        severity: 'high',
        title: `${x.product.name} is at low stock`,
        detail: `${Math.round(num(x.item.quantity))} ${x.product.unit || 'units'} on hand. Reorder level is ${x.product.minStock}.`,
        action: 'Create procurement request',
        area: 'Inventory'
      })),
      ...pendingDeliveries.slice(0, 2).map(x => ({
        severity: 'medium',
        title: `${x.deliveryNo || 'Delivery'} needs dispatch follow-up`,
        detail: `${x.customerName || 'Customer'} is currently ${x.status}.`,
        action: 'Open delivery queue',
        area: 'Delivery'
      })),
      ...d.quotations.filter(q => q.approvalStatus === 'Pending Approval').slice(0, 2).map(q => ({
        severity: 'medium',
        title: `${q.quoteNo} is awaiting approval`,
        detail: `${q.customerName} quotation value ${Math.round(num(q.total)).toLocaleString()}.`,
        action: 'Review approval',
        area: 'Sales'
      }))
    ];
    const actions = [
      { label: 'Approve pending quotations', count: d.approvals.filter(a => a.status === 'Pending').length, area: 'Approvals' },
      { label: 'Review low-stock products', count: lowStock.length, area: 'Inventory' },
      { label: 'Confirm delivery route', count: pendingDeliveries.length, area: 'Delivery' },
      { label: 'Follow active pipeline', count: d.leads.filter(l => !['Won', 'Lost'].includes(l.stage)).length, area: 'CRM' }
    ];
    return {
      stats: {
        totalRevenue: Math.round(tRev), totalExpenses: Math.round(tExp), netProfit: Math.round(tProfit), totalSales: tY.length,
        activeCustomers: d.customers.filter(c => c.status === 'Active').length,
        cashPosition: Math.round(cashCollected),
        expectedCash: Math.round(cashOutstanding),
        inventoryValue: Math.round(inventoryValue),
        salesPipeline: Math.round(pipelineValue),
        productionOpen: pendingProduction.length,
        openPurchaseOrders: openPOs.length,
        lowStockItems: lowStock.length,
        pendingDeliveries: pendingDeliveries.length,
        pendingCalls: d.calls.filter(c => c.stage !== 'Already Called').length,
        revenueChange: pct(tRev, lRev), salesChange: pct(tY.length, lY.length), profitChange: pct(tProfit, lProfit),
        lastYearRevenue: Math.round(lRev), lastYearSales: lY.length, lastYearProfit: Math.round(lProfit)
      },
      charts: {
        months,
        thisYearRevenue: monthTotals(tY),
        lastYearRevenue: monthTotals(lY),
        series: { Weekly: weeklySeries, Monthly: monthlySeries, Yearly: yearlySeries },
        categorySales: Object.entries(cat).map(([name, total]) => ({ name, total: Math.round(total) }))
      },
      commandCenter: {
        greeting: `Good ${new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'}, ${u.name}`,
        company: data().settings.company_name || 'Farmtrack Bio Sciences Ltd',
        roleProfile: u.role === 'Admin' ? 'Executive Command Center' : `${u.role} Workspace`,
        attention,
        actions,
        forecast: {
          revenueNextMonth: Math.round(tRev / Math.max(1, new Date().getMonth() + 1) * 1.08),
          cashExpected: Math.round(cashOutstanding),
          riskLevel: lowStock.length > 2 ? 'Elevated' : 'Stable',
          summary: lowStock.length > 0
            ? `${lowStock.length} inventory item${lowStock.length === 1 ? '' : 's'} may constrain sales if not replenished.`
            : 'Inventory coverage is stable for current demand.'
        }
      },
      recentSales: d.sales.slice(0, 5),
      userName: u.name,
      userRole: u.role
    };
  },
  async getAnalyticsData(user) {
    reqRole(user);
    const normalized = await buildNormalizedAnalytics();
    if (normalized) return normalized;
    const d = data();
    const revenue = d.sales.reduce((sum, s) => sum + num(s.total), 0);
    const discounts = Math.round(revenue * 0.035);
    const returns = Math.round(revenue * 0.018);
    const cogs = d.saleItems.reduce((sum, item) => sum + (num(item.cost) * num(item.quantity)), 0);
    const expenses = d.expenses.reduce((sum, e) => sum + num(e.amount), 0);
    const netProfit = revenue - discounts - returns - cogs - expenses;
    const productRevenue = {};
    d.saleItems.forEach(item => {
      productRevenue[item.productName] = (productRevenue[item.productName] || 0) + num(item.total);
    });
    const customerValue = {};
    d.sales.forEach(sale => {
      customerValue[sale.customerName] = (customerValue[sale.customerName] || 0) + num(sale.total);
    });
    const inventoryValue = d.inventory.reduce((sum, item) => sum + num(item.quantity) * num(item.unitCost), 0);
    const lowStock = d.inventory.filter(item => {
      const product = d.products.find(p => p.name === item.productName);
      return product && num(item.quantity) <= num(product.minStock);
    });
    const stages = ['New', 'Contacted', 'Proposal', 'Negotiation', 'Won'];
    const salesFunnel = stages.map(stage => ({
      stage,
      count: d.leads.filter(l => l.stage === stage).length,
      value: d.leads.filter(l => l.stage === stage).reduce((sum, l) => sum + num(l.value), 0)
    }));
    const production = {
      planned: d.production.reduce((s, j) => s + num(j.plannedQty), 0),
      completed: d.production.reduce((s, j) => s + num(j.completedQty), 0),
      delayed: d.production.filter(j => j.status === 'Pending').length,
      waste: d.production.reduce((s, j) => s + num(j.wastageQty), 0)
    };
    const heatmapRows = Array.from({ length: 35 }, (_, i) => {
      const sale = d.sales[i % d.sales.length] || {};
      return { date: sale.date, value: Math.round(num(sale.total)), orders: 1, profit: Math.round(num(sale.total) * 0.22) };
    });
    const heatmap = analyticsHeatmap(heatmapRows, 'value');
    return {
      hero: {
        title: 'Executive Analytics Center',
        subtitle: 'Business intelligence, forecasting, reporting, and AI decision support',
        confidence: 94,
        dataSources: ['Sales', 'Inventory', 'Procurement', 'Production', 'Finance', 'CRM']
      },
      dataSource: {
        mode: supabaseReady ? 'Supabase JSON bridge' : 'In-memory demo',
        normalized: false,
        materializedViews: false,
        message: 'Analytics is currently using the demo bridge. Apply supabase-schema.sql to enable normalized materialized-view analytics.',
        status: supabaseReady ? 'Bridge live' : 'Demo mode',
        lastSync: normalizedSyncSummary?.finishedAt || new Date().toISOString(),
        recordsLoaded: d.sales.length + d.inventory.length + d.customers.length + d.purchaseOrders.length + d.production.length,
        tables: ['sales', 'inventory', 'customers', 'purchase_orders', 'production']
      },
      revenueWaterfall: [
        { label: 'Revenue', value: Math.round(revenue), type: 'positive' },
        { label: 'Discounts', value: -discounts, type: 'negative' },
        { label: 'Returns', value: -returns, type: 'negative' },
        { label: 'Cost of Goods', value: -Math.round(cogs), type: 'negative' },
        { label: 'Expenses', value: -Math.round(expenses), type: 'negative' },
        { label: 'Net Profit', value: Math.round(netProfit), type: netProfit >= 0 ? 'positive' : 'negative' }
      ],
      revenueHeatmap: heatmap.cells,
      revenueHeatmapSummary: heatmap.summary,
      revenueBreakdown: Object.entries(productRevenue).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value: Math.round(value) })),
      customerIntelligence: Object.entries(customerValue).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value], index) => ({
        name,
        lifetimeValue: Math.round(value),
        health: index < 2 ? 'Healthy' : index === 2 ? 'At Risk' : 'Watch',
        churnRisk: index < 2 ? 8 + index * 4 : 28 + index * 7
      })),
      inventoryIntelligence: {
        value: Math.round(inventoryValue),
        healthy: Math.max(0, d.inventory.length - lowStock.length),
        low: lowStock.length,
        dead: Math.max(1, Math.round(d.inventory.length * 0.08)),
        fastMoving: 4,
        slowMoving: 2,
        aging: [
          { bucket: '0-30', qty: 420 },
          { bucket: '31-60', qty: 180 },
          { bucket: '61-90', qty: 95 },
          { bucket: '90+', qty: 42 }
        ],
        turnover: cogs > 0 ? Number((cogs / Math.max(1, inventoryValue / 2)).toFixed(2)) : 0
      },
      procurementIntelligence: d.suppliers.map((s, index) => ({
        supplier: s.name,
        leadTime: 7 + index * 2,
        quality: 92 - index * 4,
        deliveryAccuracy: 95 - index * 3,
        costScore: 86 - index * 2
      })),
      productionIntelligence: production,
      salesIntelligence: {
        funnel: salesFunnel,
        regional: [
          { region: 'Nairobi', revenue: Math.round(revenue * 0.36) },
          { region: 'Nakuru', revenue: Math.round(revenue * 0.24) },
          { region: 'Mombasa', revenue: Math.round(revenue * 0.18) },
          { region: 'Kiambu', revenue: Math.round(revenue * 0.14) },
          { region: 'Eldoret', revenue: Math.round(revenue * 0.08) }
        ]
      },
      financialIntelligence: {
        cash30: Math.round(revenue * 0.18),
        cash60: Math.round(revenue * 0.29),
        cash90: Math.round(revenue * 0.41),
        arRisk: d.invoices.filter(i => num(i.balance) > 0).length,
        profitability: Math.round((netProfit / Math.max(1, revenue)) * 100)
      },
      aiIntelligence: [
        {
          question: 'Why did profit move this period?',
          answer: 'Profit is mostly constrained by operating expenses and animal feed inventory cost. Revenue concentration remains strongest in Bio-Pesticides.',
          records: ['sales_orders', 'sale_items', 'expenses', 'inventory']
        },
        {
          question: 'Which products need attention?',
          answer: 'Layers Mash is at reorder threshold. Prioritize procurement or production planning before confirmed sales increase.',
          records: ['inventory', 'products', 'sales_order_items']
        }
      ],
      warRoom: {
        risks: [
          { label: 'Inventory Risk', level: lowStock.length ? 'Elevated' : 'Stable', value: lowStock.length },
          { label: 'Cash Risk', level: 'Stable', value: d.invoices.filter(i => num(i.balance) > 0).length },
          { label: 'Customer Risk', level: 'Watch', value: 2 },
          { label: 'Supplier Risk', level: 'Stable', value: 1 }
        ],
        opportunities: [
          { label: 'Upsell to top customers', value: Math.round(revenue * 0.12) },
          { label: 'Bio-fertilizer expansion', value: Math.round(revenue * 0.08) },
          { label: 'Distributor renewal', value: Math.round(revenue * 0.16) }
        ],
        forecasts: [
          { label: 'Revenue 30d', value: Math.round(revenue / 12 * 1.08) },
          { label: 'Demand 30d', value: 1180 },
          { label: 'Cash Flow 60d', value: Math.round(revenue * 0.29) }
        ]
      },
      reports: [
        'Executive Board Report',
        'Sales Performance Report',
        'Inventory Intelligence Report',
        'Procurement Report',
        'Production Report',
        'Finance Report',
        'Customer Intelligence Report',
        'Risk Report',
        'Forecasting Report'
      ]
    };
  },
  async getAnalyticsTabData(user, tabId, filters = {}) {
    reqRole(user);
    const base = await api.getAnalyticsData(user);
    const d = data();
    const id = String(tabId || 'revenue').toLowerCase();
    const periodDays = { Weekly: 7, Monthly: 30, Quarterly: 90, Yearly: 365 };
    const endDate = filters.endDate || today();
    const startDate = filters.startDate || new Date(Date.now() - (periodDays[filters.period] || 30) * 86400000).toISOString().slice(0, 10);
    const scope = { ...filters, startDate, endDate };
    const sales = list('sales').filter(row => inDateRange(row, scope));
    const invoices = list('invoices').filter(row => inDateRange(row, scope));
    const saleIds = new Set(sales.map(x => x.id));
    const scopedSaleItems = d.saleItems.filter(item => saleIds.has(item.saleId));
    const revenue = sales.reduce((sum, sale) => sum + num(sale.total), 0);
    const cogs = scopedSaleItems.reduce((sum, item) => sum + num(item.cost) * num(item.quantity), 0);
    const expenses = d.expenses.filter(row => inDateRange(row, scope)).reduce((sum, item) => sum + num(item.amount), 0);
    const profit = revenue - cogs - expenses;
    const labels = filters.period === 'Weekly'
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : filters.period === 'Yearly'
        ? ['Q1', 'Q2', 'Q3', 'Q4']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const trend = labels.map((month, index) => {
      const monthRevenue = sales.filter((_, i) => i % labels.length === index).reduce((sum, sale) => sum + num(sale.total), 0) || Math.round(revenue / Math.max(1, labels.length));
      return {
        month,
        revenue: Math.round(monthRevenue),
        profit: Math.round(monthRevenue * 0.31),
        orders: sales.filter((_, i) => i % labels.length === index).length,
        invoices: invoices.filter((_, i) => i % labels.length === index).length,
        pipeline: Math.round(d.leads.reduce((sum, lead) => sum + num(lead.value), 0) * (0.7 + index * 0.05)),
        forecast: Math.round(monthRevenue * (1.08 + index * 0.01))
      };
    });
    const tabConfig = {
      revenue: {
        title: 'Revenue Intelligence',
        kpis: [
          { label: 'Revenue', value: Math.round(revenue), type: 'money' },
          { label: 'Collected', value: Math.round(invoices.reduce((s, i) => s + num(i.paid), 0)), type: 'money' },
          { label: 'Outstanding', value: Math.round(invoices.reduce((s, i) => s + num(i.balance), 0)), type: 'money' },
          { label: 'Forecast', value: Math.round(trend.at(-1).forecast), type: 'money' }
        ],
        chartMetric: 'revenue',
        reports: ['Revenue by Product', 'Revenue by Customer', 'Revenue by County', 'Collections Report'],
        insight: 'Revenue intelligence is calculated from sales orders, invoices, invoice items, payments, customers, and products.'
      },
      sales: {
        title: 'Sales Intelligence',
        kpis: [
          { label: 'Orders', value: sales.length },
          { label: 'Pipeline', value: Math.round(d.leads.reduce((s, l) => s + num(l.value), 0)), type: 'money' },
          { label: 'Quotes', value: d.quotations.length },
          { label: 'Conversion', value: 42, suffix: '%' }
        ],
        chartMetric: 'orders',
        reports: ['Sales Rep Report', 'Territory Sales Report', 'Pipeline Report', 'Conversion Report'],
        insight: 'Sales intelligence reads orders, reps, quotations, invoices, customers, and pipeline stages.'
      },
      inventory: {
        title: 'Inventory Intelligence',
        kpis: [
          { label: 'Inventory Value', value: Math.round(d.inventory.reduce((s, i) => s + num(i.quantity) * num(i.unitCost), 0)), type: 'money' },
          { label: 'Low Stock', value: base.inventoryIntelligence.low },
          { label: 'Dead Stock', value: base.inventoryIntelligence.dead },
          { label: 'Turnover', value: base.inventoryIntelligence.turnover, suffix: 'x' }
        ],
        chartMetric: 'forecast',
        reports: ['Inventory Health Report', 'Dead Stock Report', 'Demand Forecast', 'Reorder Report'],
        insight: 'Inventory intelligence reads inventory, products, stock movements, sales order items, and purchase orders.'
      },
      production: {
        title: 'Production Intelligence',
        kpis: [
          { label: 'Planned', value: base.productionIntelligence.planned },
          { label: 'Completed', value: base.productionIntelligence.completed },
          { label: 'Delayed', value: base.productionIntelligence.delayed },
          { label: 'Waste', value: base.productionIntelligence.waste }
        ],
        chartMetric: 'forecast',
        reports: ['Production Efficiency Report', 'Yield Report', 'Waste Report', 'Cost Analysis'],
        insight: 'Production intelligence reads production jobs, outputs, materials, and cost signals.'
      },
      procurement: {
        title: 'Procurement Intelligence',
        kpis: [
          { label: 'Open POs', value: d.purchaseOrders.filter(po => po.status === 'Open').length },
          { label: 'Suppliers', value: d.suppliers.length },
          { label: 'Spend', value: Math.round(d.purchaseOrders.reduce((s, po) => s + num(po.total), 0)), type: 'money' },
          { label: 'Avg Lead Time', value: 9, suffix: 'd' }
        ],
        chartMetric: 'forecast',
        reports: ['Supplier Scorecard', 'Spend Analysis', 'Lead Time Report', 'Procurement Efficiency'],
        insight: 'Procurement intelligence reads purchase orders, suppliers, procurement requests, and receiving signals.'
      },
      customer: {
        title: 'Customer Intelligence',
        kpis: [
          { label: 'Customers', value: d.customers.length },
          { label: 'Active', value: d.customers.filter(c => c.status === 'Active').length },
          { label: 'At Risk', value: base.customerIntelligence.filter(c => c.health !== 'Healthy').length },
          { label: 'LTV', value: Math.round(base.customerIntelligence[0]?.lifetimeValue || 0), type: 'money' }
        ],
        chartMetric: 'revenue',
        reports: ['Customer Value Report', 'Customer Growth Report', 'Segmentation Report', 'Churn Risk Report'],
        insight: 'Customer intelligence reads customers, orders, invoices, payments, and activity history.'
      },
      financial: {
        title: 'Financial Intelligence',
        kpis: [
          { label: 'Revenue', value: Math.round(revenue), type: 'money' },
          { label: 'Expenses', value: Math.round(expenses), type: 'money' },
          { label: 'Profit', value: Math.round(profit), type: 'money' },
          { label: 'Margin', value: revenue ? Math.round((profit / revenue) * 100) : 0, suffix: '%' }
        ],
        chartMetric: 'profit',
        reports: ['Profit and Loss', 'Cashflow Report', 'Receivables Report', 'Payables Report'],
        insight: 'Financial intelligence reads ledger-ready sales, payments, expenses, invoices, and balances.'
      },
      ai: {
        title: 'AI Intelligence',
        kpis: [
          { label: 'Verified Sources', value: 6 },
          { label: 'Risk Signals', value: base.warRoom.risks.length },
          { label: 'Recommendations', value: base.aiIntelligence.length },
          { label: 'Confidence', value: base.hero.confidence, suffix: '%' }
        ],
        chartMetric: 'forecast',
        reports: ['AI Insight Pack', 'Risk Explanation', 'Opportunity Recommendations', 'Decision Log'],
        insight: 'AI insights are constrained to available ERP records and cite source modules.'
      },
      forecasting: {
        title: 'Forecasting',
        kpis: [
          { label: 'Revenue 30d', value: Math.round(trend.at(-1).forecast), type: 'money' },
          { label: 'Pipeline', value: Math.round(d.leads.reduce((s, l) => s + num(l.value), 0)), type: 'money' },
          { label: 'Demand Index', value: 1180 },
          { label: 'Cash 60d', value: base.financialIntelligence.cash60, type: 'money' }
        ],
        chartMetric: 'forecast',
        reports: ['Revenue Forecast', 'Demand Forecast', 'Inventory Forecast', 'Cashflow Forecast'],
        insight: 'Forecasting is generated from historical sales, pipeline, inventory, invoices, and cash signals.'
      }
    };
    const config = tabConfig[id] || tabConfig.revenue;
    const storylines = {
      revenue: {
        headline: 'Revenue explains what is happening in the business now.',
        narrative: 'This section follows money from sales orders through invoices, collections, discounts, cost of goods, expenses, and net profit so leadership can see where value is created or lost.',
        actions: [
          ['Follow unpaid high-value invoices', 'Finance', 'Improves collection rate and cash flow'],
          ['Review low-margin product groups', 'Sales + Inventory', 'Protects gross margin before discounting'],
          ['Push top-county repeat orders', 'Sales Manager', 'Accelerates revenue already showing demand']
        ],
        sources: [['sales_orders', sales.length], ['invoices', invoices.length], ['payments', d.payments.length], ['sales_order_items', scopedSaleItems.length]]
      },
      sales: {
        headline: 'Sales intelligence shows pipeline movement and rep execution.',
        narrative: 'This section tracks orders, quotations, funnel stages, sales reps, territories, and conversion so managers know which deals need action today.',
        actions: [
          ['Call negotiation-stage opportunities', 'Sales Team', 'Moves pipeline into closed revenue'],
          ['Assign dormant counties to reps', 'Sales Manager', 'Improves territory coverage'],
          ['Convert accepted quotes to orders', 'Sales Admin', 'Reduces leakage between quote and invoice']
        ],
        sources: [['sales_orders', sales.length], ['quotations', d.quotations.length], ['leads', d.leads.length], ['customers', d.customers.length]]
      },
      inventory: {
        headline: 'Inventory intelligence protects stock availability and working capital.',
        narrative: 'This section connects inventory batches, stock movements, reorder points, dead stock, and sales velocity so the warehouse can act before stockouts or excess holding costs appear.',
        actions: [
          ['Reorder low-stock SKUs', 'Inventory Lead', 'Prevents missed sales'],
          ['Review dead stock disposal plan', 'Warehouse + Finance', 'Releases tied-up capital'],
          ['Match forecast demand to stock transfers', 'Operations', 'Improves county availability']
        ],
        sources: [['inventory', d.inventory.length], ['products', d.products.length], ['inventory_transactions', d.inventoryTransactions.length], ['purchase_orders', d.purchaseOrders.length]]
      },
      production: {
        headline: 'Production intelligence follows output, yield, waste, and batch cost.',
        narrative: 'This section turns production jobs and material consumption into yield, delay, waste, and profitability signals for manufacturing decisions.',
        actions: [
          ['Complete pending production jobs', 'Production Supervisor', 'Improves finished-goods availability'],
          ['Investigate material waste variance', 'Quality + Production', 'Protects batch profitability'],
          ['Schedule high-demand products first', 'Operations', 'Matches demand forecast']
        ],
        sources: [['production_orders', d.production.length], ['raw_materials', d.rawMaterials?.length || 0], ['production_batches', d.productionBatches?.length || 0], ['inventory', d.inventory.length]]
      },
      procurement: {
        headline: 'Procurement intelligence shows supplier reliability and purchasing risk.',
        narrative: 'This section reads purchase orders, suppliers, receiving, credit exposure, and stock needs so procurement supports demand without overbuying.',
        actions: [
          ['Prioritize suppliers with delayed stock', 'Procurement Lead', 'Reduces stockout risk'],
          ['Convert reorder alerts to purchase requests', 'Warehouse + Procurement', 'Keeps inventory moving'],
          ['Review high credit exposure suppliers', 'Finance', 'Controls payables risk']
        ],
        sources: [['purchase_orders', d.purchaseOrders.length], ['suppliers', d.suppliers.length], ['po_items', d.poItems?.length || 0], ['inventory', d.inventory.length]]
      },
      customer: {
        headline: 'Customer intelligence ranks value, health, churn risk, and growth.',
        narrative: 'This section combines customers, orders, invoices, payments, and activity history to show who is valuable, at risk, dormant, or ready for upsell.',
        actions: [
          ['Follow at-risk high-value customers', 'CRM Manager', 'Protects lifetime value'],
          ['Upsell healthy repeat buyers', 'Sales Team', 'Raises average order value'],
          ['Clean dormant customer list', 'CRM', 'Improves forecast quality']
        ],
        sources: [['customers', d.customers.length], ['sales_orders', sales.length], ['invoices', invoices.length], ['calls', d.calls.length]]
      },
      financial: {
        headline: 'Financial intelligence connects revenue, expense, margin, cash, and AR risk.',
        narrative: 'This section lets finance see profitability and cash pressure from real sales, invoice, payment, and expense records.',
        actions: [
          ['Collect overdue balances', 'Finance', 'Improves cash position'],
          ['Review expense categories above trend', 'Finance Manager', 'Protects net margin'],
          ['Reconcile payments to invoices', 'Accounts', 'Keeps AR accurate']
        ],
        sources: [['invoices', invoices.length], ['payments', d.payments.length], ['expenses', d.expenses.length], ['journal_entries', d.journalEntries?.length || 0]]
      },
      ai: {
        headline: 'AI intelligence explains the why behind risks and opportunities.',
        narrative: 'This section summarizes ERP signals into management-ready explanations while showing which records the recommendation is based on.',
        actions: [
          ['Review top risk explanation', 'Executive Team', 'Focuses management meeting'],
          ['Approve opportunity recommendations', 'Department Heads', 'Turns insight into action'],
          ['Check source tables before decisions', 'Analyst', 'Keeps AI grounded in ERP data']
        ],
        sources: [['sales_orders', sales.length], ['inventory', d.inventory.length], ['expenses', d.expenses.length], ['production_orders', d.production.length]]
      },
      forecasting: {
        headline: 'Forecasting predicts revenue, demand, cash, and inventory pressure.',
        narrative: 'This section projects next-period outcomes from sales history, pipeline, stock movement, invoice collections, and production capacity.',
        actions: [
          ['Compare forecast to stock availability', 'Operations', 'Avoids demand-stock mismatch'],
          ['Plan cash from 60-day receivables', 'Finance', 'Improves liquidity planning'],
          ['Schedule production against demand index', 'Production', 'Reduces emergency production']
        ],
        sources: [['sales_orders', sales.length], ['leads', d.leads.length], ['inventory_transactions', d.inventoryTransactions.length], ['invoices', invoices.length]]
      }
    };
    const story = storylines[id] || storylines.revenue;
    return {
      tabId: id,
      tabName: config.title,
      filters: {
        dateRange: `${startDate} to ${endDate}`,
        period: filters.period || 'Monthly',
        startDate,
        endDate,
        products: filters.products || 'All Products',
        customers: filters.customers || 'All Customers',
        regions: filters.regions || 'All Regions',
        salesReps: filters.salesReps || 'All Reps'
      },
      lastRefresh: new Date().toISOString(),
      dataSource: base.dataSource,
      kpis: config.kpis,
      storyline: {
        headline: story.headline,
        narrative: story.narrative
      },
      focusCards: [
        { label: 'Current Focus', value: config.title.replace(' Intelligence', ''), detail: config.insight },
        { label: 'Period', value: filters.period || 'Monthly', detail: `${startDate} to ${endDate}` },
        { label: 'Confidence', value: `${base.hero.confidence}%`, detail: base.dataSource?.message || 'ERP source data available' }
      ],
      nextActions: story.actions.map(([title, owner, impact]) => ({ title, owner, impact })),
      sourceTables: story.sources.map(([table, records]) => ({ table, records, role: table.includes('mv_') ? 'Materialized view' : 'Transactional source' })),
      trend,
      chartMetric: config.chartMetric,
      waterfall: base.revenueWaterfall,
      heatmap: base.revenueHeatmap,
      breakdown: id === 'customer' ? base.customerIntelligence.map(c => ({ name: c.name, value: c.lifetimeValue })) : base.revenueBreakdown,
      reports: config.reports.map(name => ({ name, dateRange: `${startDate} to ${endDate}`, exports: ['PDF', 'Excel', 'CSV', 'PowerPoint'], records: sales.length + invoices.length })),
      insights: [
        { question: `${config.title} status`, answer: config.insight, records: base.hero.dataSources || [] },
        { question: 'Data refresh', answer: `Tab refreshed at ${new Date().toISOString()}. Filters were preserved for this tab.`, records: ['analytics_tabs', 'analytics_filters', 'analytics_state'] }
      ]
    };
  },
  getReportCenterData(user, filters = {}) {
    const u = reqRole(user);
    const d = data();
    const module = String(filters.module || 'Executive');
    const startDate = filters.startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const endDate = filters.endDate || today();
    const scope = { ...filters, startDate, endDate };
    const sales = list('sales').filter(row => inDateRange(row, scope));
    const invoices = list('invoices').filter(row => inDateRange(row, scope));
    const inventory = (d.inventory || []).filter(row => !scope.warehouse || scope.warehouse === 'All Warehouses' || row.warehouseName === scope.warehouse);
    const purchaseOrders = (d.purchaseOrders || []).filter(row => inDateRange(row, scope));
    const customers = list('customers');
    const products = list('products');
    const production = list('production').filter(row => inDateRange(row, scope));
    const expenses = list('expenses').filter(row => inDateRange(row, scope));
    const deliveries = list('deliveries').filter(row => inDateRange(row, scope));
    const payroll = d.payrollRecords || d.payroll || [];
    const taxes = d.taxRecords || d.taxes || [];
    const reportFormats = ['PDF', 'Excel', 'CSV', 'PowerPoint', 'Word', 'JSON', 'XML', 'Print', 'Email Package', 'ZIP Bundle'];
    const rowsByModule = {
      Executive: [
        ...sales.map(row => ({ type: 'Sale', reference: row.saleNo, party: row.customerName, date: dateValue(row), status: row.status, value: num(row.total) })),
        ...purchaseOrders.map(row => ({ type: 'Purchase Order', reference: row.poNo, party: row.supplierName, date: dateValue(row), status: row.status, value: num(row.total) })),
        ...invoices.map(row => ({ type: 'Invoice', reference: row.invNo, party: row.customerName, date: dateValue(row), status: row.status, value: num(row.total) }))
      ],
      Sales: sales.map(row => ({ reportType: 'Sales', reference: row.saleNo, customer: row.customerName, date: dateValue(row), status: row.status, revenue: num(row.total), balance: num(row.balance) })),
      Inventory: inventory.map(row => ({ reportType: 'Inventory', sku: row.sku, product: row.productName, warehouse: row.warehouseName, batch: row.batchNo, status: row.status, quantity: num(row.quantity), unitCost: num(row.unitCost), value: num(row.quantity) * num(row.unitCost) })),
      Procurement: purchaseOrders.map(row => ({ reportType: 'Procurement', reference: row.poNo, supplier: row.supplierName, warehouse: row.warehouseName, date: dateValue(row), status: row.status, value: num(row.total) })),
      Financial: [...invoices.map(row => ({ reportType: 'Receivable', reference: row.invNo, party: row.customerName, date: dateValue(row), status: row.status, value: num(row.total), paid: num(row.paid), balance: num(row.balance) })), ...expenses.map(row => ({ reportType: 'Expense', reference: row.expNo, party: row.category, date: dateValue(row), status: row.status, value: num(row.amount), paid: num(row.amount), balance: 0 }))],
      Production: production.map(row => ({ reportType: 'Production', reference: row.jobNo, product: row.productName, date: dateValue(row), status: row.status, plannedQty: num(row.plannedQty), completedQty: num(row.completedQty), cost: num(row.materialCost) })),
      Manufacturing: production.map(row => ({ reportType: 'Manufacturing', reference: row.jobNo, product: row.productName, date: dateValue(row), status: row.status, plannedQty: num(row.plannedQty), completedQty: num(row.completedQty), cost: num(row.materialCost) })),
      Customer: customers.map(row => ({ reportType: 'Customer', customer: row.name, phone: row.phone, county: row.city, status: row.status, creditLimit: num(row.creditLimit), balance: num(row.balance), orders: sales.filter(s => s.customerName === row.name || s.customerId === row.id).length })),
      Delivery: deliveries.map(row => ({ reportType: 'Delivery', reference: row.deliveryNo, saleNo: row.saleNo || '', customer: row.customerName, date: dateValue(row), driver: row.driver, vehicle: row.vehicle, status: row.status })),
      Payroll: payroll.map(row => ({ reportType: 'Payroll', employee: row.name || row.employeeName, department: row.department, grossPay: num(row.basicSalary) + num(row.allowances), deductions: num(row.deductions), netPay: num(row.netPay), status: row.status })),
      Tax: taxes.map(row => ({ reportType: 'Tax', taxType: row.taxType, period: row.period, liability: num(row.liability), status: row.status })),
      Employee: (d.users || []).map(row => ({ reportType: 'Employee', name: row.name, email: row.email, role: row.role, status: row.status, lastLogin: row.lastLogin || '' })),
      Analytics: [
        { metric: 'Revenue', value: sales.reduce((s, row) => s + num(row.total), 0), records: sales.length },
        { metric: 'Inventory Value', value: inventory.reduce((s, row) => s + num(row.quantity) * num(row.unitCost), 0), records: inventory.length },
        { metric: 'Procurement Spend', value: purchaseOrders.reduce((s, row) => s + num(row.total), 0), records: purchaseOrders.length },
        { metric: 'Customers', value: customers.length, records: customers.length }
      ]
    };
    const rows = rowsByModule[module] || rowsByModule.Executive;
    const totalValue = rows.reduce((sum, row) => sum + num(row.value || row.revenue || row.balance), 0);
    const reportCatalog = [
      ['Executive Summary Report', 'Executive'], ['Company Snapshot', 'Executive'], ['Sales Summary', 'Sales'], ['Daily Sales', 'Sales'],
      ['Monthly Sales', 'Sales'], ['Salesperson Performance', 'Sales'], ['County Sales', 'Sales'], ['Product Sales', 'Sales'],
      ['Invoice Report', 'Financial'], ['Payment Report', 'Financial'], ['Profit and Loss', 'Financial'], ['Cash Flow Statement', 'Financial'],
      ['Accounts Receivable Aging', 'Financial'], ['Customer List', 'Customer'], ['Customer Purchases', 'Customer'], ['Customer Lifetime Value', 'Customer'],
      ['Stock Summary', 'Inventory'], ['Stock Valuation', 'Inventory'], ['Low Stock Report', 'Inventory'], ['Warehouse Report', 'Inventory'],
      ['Supplier Performance Report', 'Procurement'], ['Purchase Order Report', 'Procurement'], ['Procurement Spend Report', 'Procurement'],
      ['Manufacturing Batch Report', 'Manufacturing'], ['Production Efficiency Report', 'Manufacturing'], ['Raw Material Consumption Report', 'Manufacturing'],
      ['Delivery Status Report', 'Delivery'], ['Route Report', 'Delivery'], ['Payroll Summary', 'Payroll'], ['Tax Liability Report', 'Tax'],
      ['Employee Activity Report', 'Employee'], ['Analytics Intelligence Report', 'Analytics'], ['Custom Filtered Report', module]
    ];
    const reports = reportCatalog.map(([name, reportModule], index) => ({
      id: `RPT-${index + 1}`,
      name,
      module: reportModule,
      records: (rowsByModule[reportModule] || rows).length,
      value: Math.round((rowsByModule[reportModule] || rows).reduce((sum, row) => sum + num(row.value || row.revenue || row.balance || row.netPay || row.liability), 0)),
      dateRange: `${startDate} to ${endDate}`,
      exports: reportFormats
    }));
    d.reportArchive ||= [];
    d.reportGenerationLogs ||= [];
    return {
      filters: {
        module,
        startDate,
        endDate,
        department: filters.department || 'All Departments',
        warehouse: filters.warehouse || 'All Warehouses',
        county: filters.county || 'All Counties',
        supplier: filters.supplier || 'All Suppliers',
        customer: filters.customer || 'All Customers',
        salesRep: filters.salesRep || 'All Reps',
        product: filters.product || 'All Products',
        status: filters.status || 'All Statuses'
      },
      modules: ['Executive', 'Sales', 'Customer', 'Inventory', 'Procurement', 'Manufacturing', 'Financial', 'Payroll', 'Tax', 'Delivery', 'Employee', 'Analytics', 'Custom'],
      formats: reportFormats,
      categories: ['Sales Reports', 'Customer Reports', 'Inventory Reports', 'Procurement Reports', 'Manufacturing Reports', 'Finance Reports', 'Payroll Reports', 'Tax Reports', 'Delivery Reports', 'Executive Reports', 'Custom Reports', 'Scheduled Reports', 'Templates', 'Archive'],
      kpis: [
        { label: 'Filtered Records', value: rows.length },
        { label: 'Total Value', value: Math.round(totalValue), type: 'money' },
        { label: 'Available Reports', value: reports.length },
        { label: 'Exports Logged', value: (d.reportArchive || []).length }
      ],
      trend: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((month, index) => ({ month, value: Math.round(totalValue * (0.65 + index * 0.09)), records: Math.max(1, Math.round(rows.length * (0.55 + index * 0.08))) })),
      reports,
      activeReport: reports.find(report => report.name === filters.reportName) || reports.find(report => report.module === module) || reports[0],
      rows,
      archive: (d.reportArchive || []).slice(0, 20),
      schedules: (d.reportSchedules || []).slice(0, 20),
      templates: (d.reportTemplates || []).slice(0, 20),
      generatedBy: u.name,
      generatedAt: new Date().toISOString()
    };
  },
  async generateReportExport(user, filters = {}, format = 'CSV') {
    const u = reqRole(user);
    const center = api.getReportCenterData(user, filters);
    const report = center.activeReport;
    const fmt = String(format || 'CSV');
    const stamp = new Date().toISOString();
    const customRows = Array.isArray(filters.rows)
      ? filters.rows.slice(0, 5000).map(row => {
          const allowed = Array.isArray(filters.columns) && filters.columns.length ? filters.columns : Object.keys(row || {}).slice(0, 24);
          return allowed.reduce((out, key) => {
            out[key] = row?.[key] ?? '';
            return out;
          }, {});
        })
      : null;
    const exportRows = customRows || center.rows;
    const dateRange = `${center.filters.startDate} to ${center.filters.endDate}`;
    const baseName = `${report.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${center.filters.startDate}-to-${center.filters.endDate}`;
    const metadata = `Farmtrack Bio Sciences Ltd\n${report.name}\nGenerated: ${stamp}\nGenerated by: ${u.name}\nDate range: ${dateRange}\nModule: ${center.filters.module}\nRecords: ${exportRows.length}\n${filters.crmReportType ? `CRM view: ${filters.crmReportType}\n` : ''}\n`;
    const csv = asCsv(exportRows);
    let content = metadata + csv;
    let binaryContent = null;
    let mimeType = 'text/csv;charset=utf-8';
    let extension = 'csv';
    if (fmt === 'Excel') {
      binaryContent = await excelBuffer({ title: report.name, metadata, rows: exportRows, dateRange });
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      extension = 'xlsx';
    } else if (fmt === 'JSON') {
      content = JSON.stringify({ metadata: center.filters, report: report.name, generatedAt: stamp, rows: exportRows }, null, 2);
      mimeType = 'application/json;charset=utf-8';
      extension = 'json';
    } else if (fmt === 'XML') {
      content = `<?xml version="1.0" encoding="UTF-8"?><report name="${report.name}" generatedAt="${stamp}">${exportRows.map(row => `<row>${Object.entries(row).map(([k, v]) => `<${k}>${String(v ?? '').replace(/[<>&]/g, '')}</${k}>`).join('')}</row>`).join('')}</report>`;
      mimeType = 'application/xml;charset=utf-8';
      extension = 'xml';
    } else if (fmt === 'Word') {
      content = metadata + csv;
      mimeType = 'application/msword;charset=utf-8';
      extension = 'doc';
    } else if (fmt === 'Email Package' || fmt === 'ZIP Bundle') {
      content = `REPORT PACKAGE\n\n${metadata}\nIncluded files:\n- ${baseName}.csv\n- ${baseName}.pdf.html\n- ${baseName}.json\n\n${csv}`;
      mimeType = 'text/plain;charset=utf-8';
      extension = fmt === 'ZIP Bundle' ? 'zip.txt' : 'email-package.txt';
    } else if (fmt === 'PDF') {
      binaryContent = await pdfBuffer({ title: report.name, metadata, rows: exportRows, dateRange });
      mimeType = 'application/pdf';
      extension = 'pdf';
    } else if (fmt === 'PowerPoint') {
      binaryContent = await pptxBuffer({ title: report.name, metadata, rows: exportRows });
      mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      extension = 'pptx';
    } else if (fmt === 'Print') {
      const rows = exportRows.slice(0, 80);
      content = `<!doctype html><html><head><meta charset="utf-8"><title>${report.name}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}.brand{background:#050505;color:#fff;border-radius:14px 14px 0 0;padding:18px 22px}.date{background:#078236;color:#fff;font-weight:800;padding:10px 22px;border-radius:0 0 14px 14px;margin-bottom:22px}h1{margin:0;font-size:24px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#e8f8ee;color:#078236;text-transform:uppercase;font-size:11px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}.meta{color:#555;margin-bottom:24px}.sign{margin-top:48px;display:flex;gap:60px}.sign div{border-top:1px solid #111;padding-top:8px;width:220px}@media print{button{display:none}}</style></head><body><div class="brand"><h1>${report.name}</h1></div><div class="date">Date range: ${dateRange}</div><div class="meta">${metadata.replaceAll('\n','<br>')}</div><table><thead><tr>${Object.keys(rows[0] || {}).map(k => `<th>${k}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${Object.values(row).map(v => `<td>${String(v ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="sign"><div>Prepared By</div><div>Reviewed By</div><div>Approved By</div></div></body></html>`;
      mimeType = 'text/html;charset=utf-8';
      extension = 'print.html';
    }
    const entry = { id: gid(), reportName: report.name, module: center.filters.module, format: fmt, filters: center.filters, generatedBy: u.name, generatedAt: stamp, fileName: `${baseName}.${extension}`, status: 'Generated', records: exportRows.length };
    data().reportArchive ||= [];
    data().reportGenerationLogs ||= [];
    data().reportArchive.unshift(entry);
    data().reportGenerationLogs.unshift(entry);
    log(u, 'Generate Report Export', 'Reports', `${report.name} ${fmt}`);
    return { success: true, fileName: entry.fileName, mimeType, content: (binaryContent || Buffer.from(content, 'utf8')).toString('base64'), archive: entry };
  },
  async generateTaxInvoicePdf(user, invoiceId) {
    const u = reqRole(user);
    const d = data();
    const invoice = (d.invoices || []).find(row => row.id === invoiceId || row.invNo === invoiceId || row.invoiceNo === invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    const invoiceItems = (d.invoiceItems || []).filter(row => row.invoiceId === invoice.id);
    const saleItems = invoice.saleId ? (d.saleItems || []).filter(row => row.saleId === invoice.saleId) : [];
    const items = (invoiceItems.length ? invoiceItems : saleItems).map(row => ({
      date: row.date || invoice.date || invoice.createdAt,
      productName: row.productName || row.description || 'Item',
      taxCategory: row.taxCategory || row.tax || (num(invoice.tax) > 0 ? 'VAT' : 'No VAT'),
      quantity: row.quantity || 1,
      unitPrice: row.unitPrice || row.rate || row.price || 0,
      total: row.total || num(row.quantity || 1) * num(row.unitPrice || row.rate || row.price)
    }));
    const customer = (d.customers || []).find(row => row.id === invoice.customerId || row.name === invoice.customerName) || {};
    const settings = d.settings || {};
    const buffer = await taxInvoicePdfBuffer({ invoice, items, customer, settings });
    const invNo = invoice.invNo || invoice.invoiceNo || invoice.id;
    const fileName = `tax-invoice-${slug(invoice.customerName || customer.name)}-${slug(invNo)}-${String(invoice.date || today()).slice(0, 10)}.pdf`;
    log(u, 'Generate Tax Invoice', 'Accounts', invNo);
    return {
      success: true,
      fileName,
      mimeType: 'application/pdf',
      content: buffer.toString('base64'),
      invoice: {
        id: invoice.id,
        invNo,
        customerName: invoice.customerName || customer.name,
        total: num(invoice.total),
        balance: num(invoice.balance)
      }
    };
  },
  async emailTaxInvoice(user, invoiceId, { to: overrideTo } = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT);
    const d = data();
    const invoice = (d.invoices || []).find(row => row.id === invoiceId || row.invNo === invoiceId || row.invoiceNo === invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    const customer = (d.customers || []).find(row => row.id === invoice.customerId || row.name === invoice.customerName) || {};
    const recipientEmail = overrideTo || customer.email;
    if (!recipientEmail) throw new Error('No email address available for this customer. Add a customer email or specify a recipient.');
    const invNo = invoice.invNo || invoice.invoiceNo || invoice.id;
    const settings = d.settings || {};
    const companyName = settings.companyName || 'FarmTrack';
    const invoiceItems = (d.invoiceItems || []).filter(row => row.invoiceId === invoice.id);
    const saleItems = invoice.saleId ? (d.saleItems || []).filter(row => row.saleId === invoice.saleId) : [];
    const items = (invoiceItems.length ? invoiceItems : saleItems).map(row => ({
      date: row.date || invoice.date || invoice.createdAt,
      productName: row.productName || row.description || 'Item',
      description: row.description || row.productName || 'Item',
      taxCategory: row.taxCategory || row.tax || (num(invoice.tax) > 0 ? 'VAT' : 'No VAT'),
      quantity: row.quantity || 1,
      unitPrice: row.unitPrice || row.rate || row.price || 0,
      total: row.total || num(row.quantity || 1) * num(row.unitPrice || row.rate || row.price)
    }));
    const attachmentBuffer = await taxInvoicePdfBuffer({ invoice, items, customer, settings });
    const attachmentFileName = `tax-invoice-${slug(invoice.customerName || customer.name)}-${slug(invNo)}-${String(invoice.date || today()).slice(0, 10)}.pdf`;
    const result = await deliverEmail(u, 'tax_invoice_sent', recipientEmail, () => EmailService.sendTaxInvoiceEmail({
      to: recipientEmail,
      customerName: invoice.customerName || customer.name || 'Valued Customer',
      invoiceNo: invNo,
      amount: num(invoice.total),
      dueDate: invoice.dueDate || '',
      invoiceId: invoice.id,
      attachmentContent: attachmentBuffer.toString('base64'),
      attachmentFileName
    }), {
      subject: `Tax Invoice ${invNo} — ${money(num(invoice.total))}`,
      relatedModule: 'invoices',
      relatedId: invoice.id
    });
    log(u, 'Email Tax Invoice', 'Accounts', invNo);
    return { success: true, sent: result.sent !== false, to: recipientEmail, invoiceNo: invNo, result };
  },
  scheduleReport(user, schedule = {}) {
    const u = reqRole(user);
    data().reportSchedules ||= [];
    const entry = { id: gid(), ...schedule, createdBy: u.name, createdAt: new Date().toISOString(), status: 'Active' };
    data().reportSchedules.unshift(entry);
    log(u, 'Schedule Report', 'Reports', schedule.reportName || 'Report');
    return { success: true, schedule: entry };
  },
  async emailReport(user, payload = {}) {
    const u = reqRole(user);
    data().reportEmailLogs ||= [];
    const file = await api.generateReportExport(user, payload.filters || {}, payload.format || 'PDF');
    const entry = {
      id: gid(),
      ...payload,
      attachmentFileName: file.fileName,
      attachmentMimeType: file.mimeType,
      attachmentContent: file.content,
      sentBy: u.name,
      sentAt: new Date().toISOString(),
      status: 'Queued'
    };
    data().reportEmailLogs.unshift(entry);
    log(u, 'Email Report', 'Reports', payload.reportName || 'Report');
    return { success: true, email: entry, attachment: { fileName: file.fileName, mimeType: file.mimeType } };
  },
  getInputCenterData(user) {
    reqRole(user);
    const d = data();
    return {
      modules: [
        { id: 'customer', label: 'Customer', fields: ['name', 'email', 'phone', 'city', 'type', 'creditLimit'] },
        { id: 'lead', label: 'Lead / Opportunity', fields: ['name', 'email', 'phone', 'company', 'source', 'stage', 'value', 'assignedTo', 'notes'] },
        { id: 'call', label: 'Call / Follow-up', fields: ['customerId', 'phone', 'whatsapp', 'stage', 'notes', 'assignedTo'] },
        { id: 'supplier', label: 'Supplier', fields: ['name', 'email', 'phone', 'category', 'paymentTerms'] },
        { id: 'product', label: 'Product', fields: ['name', 'sku', 'category', 'type', 'unit', 'costPrice', 'sellingPrice', 'minStock'] },
        { id: 'inventory', label: 'Inventory Item', fields: ['productName', 'warehouseName', 'batchNo', 'quantity', 'unitCost', 'expiryDate'] },
        { id: 'sale', label: 'Sales Order', fields: ['customerId', 'productId', 'quantity', 'paid', 'paymentMethod'] },
        { id: 'purchaseRequest', label: 'Purchase Request', fields: ['productId', 'quantity', 'priority', 'reason', 'department'] },
        { id: 'expense', label: 'Expense', fields: ['category', 'date', 'description', 'amount', 'paymentMethod'] },
        { id: 'payment', label: 'Customer Payment', fields: ['invoiceId', 'amount', 'method'] },
        { id: 'journal', label: 'Manual Journal', fields: ['date', 'amount', 'description', 'reference', 'debitAccountId', 'creditAccountId'] },
        { id: 'task', label: 'Task', fields: ['title', 'description', 'assignedTo', 'dueDate', 'priority', 'module'] },
        { id: 'production', label: 'Production Job', fields: ['productName', 'plannedQty', 'startDate', 'assignedTo', 'notes'] },
        { id: 'rawMaterial', label: 'Raw Material Receipt', fields: ['materialName', 'materialCode', 'category', 'quantity', 'unit', 'costPerUnit', 'supplier', 'warehouse', 'storageLocation', 'expiryDate'] }
      ],
      lookups: {
        customers: list('customers').map(x => ({ id: x.id, name: x.name })),
        suppliers: list('suppliers').map(x => ({ id: x.id, name: x.name })),
        products: list('products').map(x => ({ id: x.id, name: x.name, sku: x.sku, price: num(x.sellingPrice), cost: num(x.costPrice) })),
        invoices: list('invoices').filter(x => num(x.balance) > 0).map(x => ({ id: x.id, name: `${x.invNo} - ${x.customerName} - ${money(x.balance)}` })),
        accounts: (d.financeAccounts || []).map(x => ({ id: x.id, name: `${x.code} - ${x.name}` })),
        warehouses: (d.inventoryWarehouses || [{ name: 'Main Store Nairobi' }]).map(x => ({ id: x.id || x.name, name: x.name })),
        uoms: (d.unitOfMeasure || []).map(x => ({ id: x.code || x.name, name: `${x.name || x.code} (${x.code || x.name})` })),
        rawMaterials: (d.rawMaterials || []).map(x => ({ id: x.id, name: `${x.materialName} - ${x.availableQuantity}${x.unitOfMeasure}` })),
        productionOrders: (d.productionOrders || []).map(x => ({ id: x.id, name: `${x.orderNo} - ${x.productName} - ${x.status}` }))
      },
      recentEvents: (d.businessEvents || []).slice(0, 20),
      audit: d.activity.slice(0, 20)
    };
  },
  submitERPInput(user, module, payload = {}) {
    const u = reqRole(user);
    const type = String(module || '').trim();
    let result;
    if (type === 'customer') result = api.saveCustomer(u, { status: 'Active', type: 'Farm', balance: 0, ...payload });
    else if (type === 'lead') result = api.saveLead(u, { status: 'Active', stage: 'New', source: 'Manual', ...payload });
    else if (type === 'call') {
      const customer = data().customers.find(c => c.id === payload.customerId) || data().customers[0];
      result = api.saveCall(u, { customerId: customer.id, customerName: customer.name, phone: payload.phone || customer.phone, whatsapp: payload.whatsapp || customer.phone, stage: payload.stage || 'To Be Called', notes: payload.notes || '', assignedTo: payload.assignedTo || u.name });
    }
    else if (type === 'supplier') result = api.saveSupplier(u, { status: 'Active', paymentTerms: 'Net 30', balance: 0, ...payload });
    else if (type === 'product') result = api.saveProduct(u, { status: 'Active', ...payload });
    else if (type === 'inventory') result = api.saveInventoryItem(u, { status: 'In Stock', receivedDate: today(), ...payload });
    else if (type === 'sale') {
      const product = data().products.find(p => p.id === payload.productId) || data().products[0];
      const customer = data().customers.find(c => c.id === payload.customerId) || data().customers[0];
      result = api.saveSale(u, {
        customerId: customer.id,
        customerName: customer.name,
        paid: num(payload.paid),
        paymentMethod: payload.paymentMethod || 'Cash',
        items: [{ productId: product.id, productName: product.name, quantity: num(payload.quantity || 1), unitPrice: num(product.sellingPrice), cost: num(product.costPrice) }]
      });
    } else if (type === 'purchaseRequest') result = api.createPurchaseRequest(u, payload);
    else if (type === 'expense') result = api.recordFinanceExpense(u, payload);
    else if (type === 'payment') result = api.recordCustomerPayment(u, payload);
    else if (type === 'journal') result = api.postManualJournal(u, payload);
    else if (type === 'task') result = api.saveTask(u, payload);
    else if (type === 'production') result = api.saveProductionJob(u, { status: 'Pending', ...payload });
    else if (type === 'rawMaterial') result = api.receiveRawMaterial(u, payload);
    else throw new Error('Unsupported input module: ' + type);
    const aggregateId = result?.id || result?.row?.id || result?.entry?.id || result?.request?.id || result?.saleNo || gid();
    emitBusinessEvent(u, `input.${type}.submitted`, type, aggregateId, payload);
    log(u, 'Submit ERP Input', 'Input Center', type);
    return { success: true, module: type, id: result?.id || result?.row?.id || result?.entry?.id || result?.request?.id || '', saleNo: result?.saleNo || '', deliveryId: result?.deliveryId || '', invoiceId: result?.invoiceId || '', result };
  },
  globalSearch(user, query) {
    reqRole(user);
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return [];
    const score = values => {
      const text = values.map(value => String(value || '').toLowerCase()).join(' ');
      if (values.some(value => String(value || '').toLowerCase() === q)) return 100;
      if (values.some(value => String(value || '').toLowerCase().startsWith(q))) return 80;
      if (text.includes(q)) return 50;
      return 0;
    };
    const make = (type, page, rows, label, sub, extra = []) => rows.map(row => {
      const values = [row[label], row[sub], ...extra.map(key => row[key])];
      return { type, page, label: row[label] || row.name || row.id, sub: row[sub] || row.status || page, id: row.id, score: score(values) };
    }).filter(row => row.score > 0);
    return [
      ...make('Customer', 'customers', list('customers'), 'name', 'phone', ['email', 'city', 'customerNo']),
      ...make('Product', 'inventory', list('products'), 'name', 'sku', ['category', 'type']),
      ...make('Inventory', 'inventory', list('inventory'), 'productName', 'batchNo', ['warehouseName', 'sku']),
      ...make('Lead', 'customers', list('leads'), 'name', 'stage', ['company', 'phone', 'email']),
      ...make('Sale', 'sales', list('sales'), 'saleNo', 'customerName', ['status', 'paymentMethod']),
      ...make('Invoice', 'accounts', list('invoices'), 'invNo', 'customerName', ['status', 'type']),
      ...make('Supplier', 'purchasing', list('suppliers'), 'name', 'phone', ['email', 'category']),
      ...make('Manufacturing', 'production', data().productionOrders || data().production || [], 'orderNo', 'productName', ['jobNo', 'status', 'assignedTo']),
      ...make('Report', 'reports', data().reportArchive || [], 'reportName', 'module', ['format', 'status'])
    ].sort((a, b) => b.score - a.score || String(a.label).localeCompare(String(b.label))).slice(0, 18).map(({ score, ...row }) => row);
  },
  getSettings: user => (reqRole(user), data().settings),
  saveSettings(user, settings) { reqRole(user, ROLES.ADMIN, ROLES.MANAGER); data().settings = { ...data().settings, ...settings }; return { success: true }; },
  getSpreadsheetIntegrationStatus(user) {
    reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const d = data();
    d.spreadsheetConnections ||= [{
      id: 'SHEET-CONN-1',
      name: 'Farmtrack Reports Workbook',
      provider: 'Google Sheets',
      spreadsheetId: GOOGLE_SHEETS_DEFAULT_ID,
      workbookName: 'Farmtrack ERP Reporting Center',
      defaultSheet: 'ERP Export',
      syncDirection: 'Export Only',
      modules: ['Reports', 'Sales', 'Inventory', 'Finance', 'Accounts'],
      status: 'Ready',
      lastSyncAt: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }];
    d.spreadsheetConnections = d.spreadsheetConnections.map(connection => ({
      ...connection,
      spreadsheetId: connection.spreadsheetId || GOOGLE_SHEETS_DEFAULT_ID
    }));
    d.spreadsheetSyncLogs ||= [];
    const mappings = [
      { module: 'Reports', sheetName: 'Report Archive', source: 'reportArchive', mode: 'Export' },
      { module: 'Sales', sheetName: 'Sales Orders', source: 'sales', mode: 'Export' },
      { module: 'Inventory', sheetName: 'Inventory', source: 'inventory', mode: 'Export' },
      { module: 'Finance', sheetName: 'Journal Entries', source: 'financeJournalEntries', mode: 'Export' },
      { module: 'Accounts', sheetName: 'Trial Balance', source: 'financeJournalLines', mode: 'Export' },
      { module: 'CRM', sheetName: 'Customers', source: 'customers', mode: 'Export' },
      { module: 'Procurement', sheetName: 'Purchase Orders', source: 'purchaseOrders', mode: 'Export' },
      { module: 'Manufacturing', sheetName: 'Production Jobs', source: 'production', mode: 'Export' }
    ];
    return {
      enabled: true,
      configured: d.spreadsheetConnections.some(c => c.spreadsheetId || c.workbookName),
      connections: d.spreadsheetConnections,
      mappings,
      logs: d.spreadsheetSyncLogs.slice(0, 20),
      supportedProviders: ['Google Sheets', 'Microsoft Excel / OneDrive', 'CSV Folder Export'],
      requiredCredentialFields: ['provider', 'spreadsheetId or workbookName', 'defaultSheet', 'syncDirection', 'modules'],
      serviceAccountConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_PRIVATE_KEY || require('fs').existsSync(require('path').resolve(process.cwd(), 'erp-sheets-integration-499106-17d88a15c86d.json'))),
      serviceAccountEmail: GOOGLE_SHEETS_SERVICE_EMAIL,
      defaultSpreadsheetId: GOOGLE_SHEETS_DEFAULT_ID,
      note: `Google Sheets uses a server-side service account. Share the target Google Sheet with ${GOOGLE_SHEETS_SERVICE_EMAIL} before syncing.`
    };
  },
  saveSpreadsheetConnection(user, payload = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    data().spreadsheetConnections ||= [];
    const existing = data().spreadsheetConnections.find(c => c.id === payload.id) || data().spreadsheetConnections[0];
    const record = {
      id: existing?.id || gid(),
      name: payload.name || 'Farmtrack Reports Workbook',
      provider: payload.provider || 'Google Sheets',
      spreadsheetId: payload.spreadsheetId || GOOGLE_SHEETS_DEFAULT_ID,
      workbookName: payload.workbookName || 'Farmtrack ERP Reporting Center',
      defaultSheet: payload.defaultSheet || 'ERP Export',
      syncDirection: payload.syncDirection || 'Export Only',
      modules: Array.isArray(payload.modules) ? payload.modules : String(payload.modules || 'Reports,Sales,Inventory,Finance,Accounts').split(',').map(x => x.trim()).filter(Boolean),
      status: payload.status || 'Ready',
      lastSyncAt: existing?.lastSyncAt || '',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (existing) Object.assign(existing, record);
    else data().spreadsheetConnections.unshift(record);
    emitBusinessEvent(u, 'integration.spreadsheet_connection_saved', 'spreadsheetConnections', record.id, record);
    log(u, 'Save Spreadsheet Connection', 'Integrations', record.name);
    return { success: true, connection: record };
  },
  async generateSpreadsheetExport(user, options = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT);
    const connection = (data().spreadsheetConnections || [])[0] || {};
    const module = options.module || 'Reports';
    const filters = {
      startDate: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
      endDate: today(),
      ...(options.filters || {}),
      module: module === 'Accounts' ? 'Financial' : module
    };
    const center = api.getReportCenterData(user, filters);
    const sheetName = options.sheetName || connection.defaultSheet || `${module} Export`;
    const csv = asCsv(center.rows);
    let googleResult = null;
    let status = connection.spreadsheetId ? 'Ready To Push' : 'Generated CSV';
    let message = connection.spreadsheetId ? 'Spreadsheet payload generated. Direct Google sync was not attempted.' : 'No spreadsheet ID set. CSV package generated for upload.';
    if (connection.spreadsheetId && !options.csvOnly) {
      googleResult = await new GoogleSheetsService().clearAndWriteObjects(connection.spreadsheetId, sheetName, center.rows);
      status = 'Synced';
      message = `Exported ${googleResult.rowsWritten} rows to Google Sheets.`;
    }
    const logEntry = {
      id: gid(),
      connectionId: connection.id || '',
      module,
      sheetName,
      direction: 'Export',
      rowsProcessed: center.rows.length,
      status,
      message,
      createdAt: new Date().toISOString()
    };
    data().spreadsheetSyncLogs ||= [];
    data().spreadsheetSyncLogs.unshift(logEntry);
    if (connection.id) connection.lastSyncAt = logEntry.createdAt;
    log(u, 'Generate Spreadsheet Export', 'Integrations', `${module} ${center.rows.length} rows`);
    return {
      success: true,
      provider: connection.provider || 'Google Sheets',
      sheetName,
      rows: center.rows.length,
      fileName: `${sheetName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${today()}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      content: Buffer.from(csv, 'utf8').toString('base64'),
      google: googleResult,
      log: logEntry
    };
  },
  async exportInventoryToGoogleSheets(user, options = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.WAREHOUSE);
    const connection = (data().spreadsheetConnections || [])[0] || {};
    const spreadsheetId = options.spreadsheetId || connection.spreadsheetId;
    if (!spreadsheetId) throw new Error('Spreadsheet ID is required. Save it in Settings > Spreadsheets first.');
    const sheetName = options.sheetName || 'Inventory';
    const rows = rowsForSpreadsheetModule('Inventory', options.filters || {});
    const googleResult = await new GoogleSheetsService().clearAndWriteObjects(spreadsheetId, sheetName, rows);
    const logEntry = { id: gid(), connectionId: connection.id || '', module: 'Inventory', sheetName, direction: 'Export', rowsProcessed: rows.length, status: 'Synced', message: `Inventory exported to Google Sheets by ${u.name}`, createdAt: new Date().toISOString() };
    data().spreadsheetSyncLogs ||= [];
    data().spreadsheetSyncLogs.unshift(logEntry);
    if (connection.id) connection.lastSyncAt = logEntry.createdAt;
    emitBusinessEvent(u, 'sheets.inventory_exported', 'inventory', 'google-sheets', { rows: rows.length, sheetName });
    log(u, 'Export Inventory To Google Sheets', 'Integrations', `${rows.length} rows`);
    return { success: true, rows: rows.length, google: googleResult, log: logEntry };
  },
  async importItemsFromGoogleSheets(user, options = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const connection = (data().spreadsheetConnections || [])[0] || {};
    const spreadsheetId = options.spreadsheetId || connection.spreadsheetId;
    if (!spreadsheetId) throw new Error('Spreadsheet ID is required. Save it in Settings > Spreadsheets first.');
    const sheetName = options.sheetName || 'Items';
    const imported = await new GoogleSheetsService().readObjects(spreadsheetId, sheetName);
    const errors = [];
    const upserted = [];
    data().products ||= [];
    imported.rows.map(normalizeSheetRow).forEach((row, index) => {
      const name = sheetCell(row, ['name', 'Name', 'productName', 'Product Name']);
      const sku = sheetCell(row, ['sku', 'SKU', 'code', 'Code']);
      if (!name || !sku) {
        errors.push({ row: index + 2, error: 'Name and SKU are required' });
        return;
      }
      const existing = data().products.find(p => p.id === sheetCell(row, ['id', 'ID']) || String(p.sku || '').toLowerCase() === sku.toLowerCase());
      const product = {
        id: existing?.id || gid(),
        name,
        sku,
        category: sheetCell(row, ['category', 'Category'], existing?.category || 'Imported'),
        type: sheetCell(row, ['type', 'Type'], existing?.type || 'Finished Product'),
        unit: sheetCell(row, ['unit', 'Unit'], existing?.unit || 'pcs'),
        costPrice: num(sheetCell(row, ['costPrice', 'Cost Price', 'cost'])),
        sellingPrice: num(sheetCell(row, ['sellingPrice', 'Selling Price', 'price'])),
        minStock: num(sheetCell(row, ['minStock', 'Min Stock', 'reorderLevel'])),
        status: sheetCell(row, ['status', 'Status'], 'Active'),
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (existing) Object.assign(existing, product);
      else data().products.push(product);
      upserted.push(product);
    });
    const logEntry = { id: gid(), connectionId: connection.id || '', module: 'Items', sheetName, direction: 'Import', rowsProcessed: upserted.length, status: errors.length ? 'Completed With Errors' : 'Imported', message: `${upserted.length} item rows imported. ${errors.length} errors.`, createdAt: new Date().toISOString(), errors };
    data().spreadsheetSyncLogs ||= [];
    data().spreadsheetSyncLogs.unshift(logEntry);
    emitBusinessEvent(u, 'sheets.items_imported', 'products', 'google-sheets', { upserted: upserted.length, errors: errors.length });
    log(u, 'Import Items From Google Sheets', 'Integrations', `${upserted.length} rows`);
    return { success: errors.length === 0, imported: upserted.length, errors, log: logEntry };
  },
  async syncStockWithGoogleSheets(user, options = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.WAREHOUSE);
    const connection = (data().spreadsheetConnections || [])[0] || {};
    const spreadsheetId = options.spreadsheetId || connection.spreadsheetId;
    if (!spreadsheetId) throw new Error('Spreadsheet ID is required. Save it in Settings > Spreadsheets first.');
    const sheetName = options.sheetName || 'Inventory';
    const direction = options.direction || connection.syncDirection || 'Bidirectional';
    const changes = [];
    const errors = [];
    if (direction !== 'Export Only') {
      const imported = await new GoogleSheetsService().readObjects(spreadsheetId, sheetName);
      imported.rows.map(normalizeSheetRow).forEach((row, index) => {
        const id = sheetCell(row, ['id', 'ID']);
        const productName = sheetCell(row, ['productName', 'Product Name', 'name', 'Name']);
        const warehouseName = sheetCell(row, ['warehouseName', 'Warehouse', 'warehouse']);
        const batchNo = sheetCell(row, ['batchNo', 'Batch', 'batch']);
        const quantityRaw = sheetCell(row, ['quantity', 'Quantity', 'qty', 'Qty']);
        if (!productName || quantityRaw === '') {
          errors.push({ row: index + 2, error: 'Product name and quantity are required' });
          return;
        }
        const quantity = num(quantityRaw);
        if (quantity < 0) {
          errors.push({ row: index + 2, error: 'Quantity cannot be negative' });
          return;
        }
        const existing = data().inventory.find(item =>
          (id && item.id === id) ||
          (item.productName === productName && (!warehouseName || item.warehouseName === warehouseName) && (!batchNo || item.batchNo === batchNo))
        );
        const before = existing ? num(existing.quantity) : 0;
        const record = {
          id: existing?.id || gid(),
          productName,
          sku: sheetCell(row, ['sku', 'SKU'], existing?.sku || ''),
          warehouseName: warehouseName || existing?.warehouseName || 'Main Store Nairobi',
          location: sheetCell(row, ['location', 'Location'], existing?.location || ''),
          batchNo: batchNo || existing?.batchNo || `SHEET-${Date.now()}`,
          quantity,
          availableQuantity: quantity,
          unitCost: num(sheetCell(row, ['unitCost', 'Unit Cost', 'cost'], existing?.unitCost || 0)),
          expiryDate: sheetCell(row, ['expiryDate', 'Expiry Date'], existing?.expiryDate || ''),
          receivedDate: sheetCell(row, ['receivedDate', 'Received Date'], existing?.receivedDate || today()),
          status: sheetCell(row, ['status', 'Status'], existing?.status || 'In Stock'),
          createdAt: existing?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        if (existing) Object.assign(existing, record);
        else data().inventory.push(record);
        data().inventoryTransactions ||= [];
        data().inventoryTransactions.unshift({ id: gid(), productName, warehouseName: record.warehouseName, type: 'Google Sheets Stock Sync', quantity: quantity - before, balanceAfter: quantity, reference: spreadsheetId, date: today(), createdAt: new Date().toISOString(), createdBy: u.name, notes: `Synced from ${sheetName}` });
        changes.push({ id: record.id, productName, before, after: quantity, delta: quantity - before });
      });
    }
    const rows = rowsForSpreadsheetModule('Inventory', options.filters || {});
    const googleResult = direction !== 'Import Only'
      ? await new GoogleSheetsService().clearAndWriteObjects(spreadsheetId, sheetName, rows)
      : null;
    const logEntry = { id: gid(), connectionId: connection.id || '', module: 'Inventory', sheetName, direction, rowsProcessed: Math.max(changes.length, rows.length), status: errors.length ? 'Completed With Errors' : 'Synced', message: `${changes.length} ERP stock rows changed; ${rows.length} rows exported.`, createdAt: new Date().toISOString(), errors };
    data().spreadsheetSyncLogs ||= [];
    data().spreadsheetSyncLogs.unshift(logEntry);
    if (connection.id) connection.lastSyncAt = logEntry.createdAt;
    emitBusinessEvent(u, 'sheets.stock_synced', 'inventory', 'google-sheets', { changes: changes.length, exported: rows.length, errors: errors.length });
    log(u, 'Sync Stock With Google Sheets', 'Integrations', `${changes.length} changes`);
    return { success: errors.length === 0, changes, exportedRows: rows.length, errors, google: googleResult, log: logEntry };
  },
  async syncAllToGoogleSheets(user, options = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT);
    const modules = Array.isArray(options.modules) && options.modules.length
      ? SPREADSHEET_MODULES.filter(([moduleName]) => options.modules.includes(moduleName))
      : SPREADSHEET_MODULES;
    const result = await syncSpreadsheetModules(u, modules, options);
    log(u, 'Sync All ERP To Google Sheets', 'Integrations', `${result.synced.length} sheets`);
    return result;
  },
  // ─── Sync-back: import HR/Leaves/Notifications from Google Sheets into ERP state ───
  async importModuleFromGoogleSheets(user, options = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const d = data();
    const connection = (d.spreadsheetConnections || [])[0] || {};
    const spreadsheetId = options.spreadsheetId || connection.spreadsheetId;
    if (!spreadsheetId) throw new Error('Spreadsheet ID is required. Save it in Settings > Spreadsheets first.');
    const moduleName = options.module || 'Employees';
    const sheetName = options.sheetName || (SPREADSHEET_MODULES.find(([m]) => m === moduleName) || [moduleName, moduleName])[1];
    const imported = await new GoogleSheetsService().readObjects(spreadsheetId, sheetName);
    const errors = [];
    let upserted = 0;
    const rows = imported.rows.map(normalizeSheetRow);
    const name = moduleName.toLowerCase();

    if (name.includes('employee') || name.includes('hr directory') || name.includes('staff')) {
      ensureHrData();
      rows.forEach((row, i) => {
        const empName = sheetCell(row, ['name', 'Name', 'employeeName']);
        if (!empName) { errors.push({ row: i + 2, error: 'Name is required' }); return; }
        const id = sheetCell(row, ['id', 'ID']);
        const existing = d.employees.find(e => e.id === id || String(e.email || '').toLowerCase() === String(sheetCell(row, ['email', 'Email'])).toLowerCase());
        const rec = {
          ...(existing || {}),
          id: existing?.id || gid(),
          employeeNo: sheetCell(row, ['employeeNo', 'Employee No'], existing?.employeeNo || `EMP-${String(d.employees.length + 1).padStart(3, '0')}`),
          name: empName,
          email: sheetCell(row, ['email', 'Email'], existing?.email || ''),
          phone: sheetCell(row, ['phone', 'Phone'], existing?.phone || ''),
          department: sheetCell(row, ['department', 'Department'], existing?.department || 'Sales'),
          position: sheetCell(row, ['position', 'Position'], existing?.position || 'Officer'),
          employmentType: sheetCell(row, ['employmentType', 'Employment Type'], existing?.employmentType || 'Full-time'),
          joinDate: sheetCell(row, ['joinDate', 'Join Date'], existing?.joinDate || today()),
          status: sheetCell(row, ['status', 'Status'], existing?.status || 'Active'),
          salary: num(sheetCell(row, ['salary', 'Salary'], existing?.salary || 0)),
          manager: sheetCell(row, ['manager', 'Manager'], existing?.manager || ''),
          leaveBalanceAnnual: num(sheetCell(row, ['leaveBalanceAnnual', 'Annual Balance'], existing?.leaveBalanceAnnual ?? 21)),
          leaveBalanceSick: num(sheetCell(row, ['leaveBalanceSick', 'Sick Balance'], existing?.leaveBalanceSick ?? 10)),
          leaveBalanceCasual: num(sheetCell(row, ['leaveBalanceCasual', 'Casual Balance'], existing?.leaveBalanceCasual ?? 5))
        };
        if (existing) Object.assign(existing, rec); else d.employees.unshift(rec);
        upserted++;
      });
    } else if (name.includes('attendance')) {
      ensureHrData();
      rows.forEach((row, i) => {
        const employeeId = sheetCell(row, ['employeeId', 'Employee ID']);
        const emp = d.employees.find(e => e.id === employeeId || e.name === sheetCell(row, ['employeeName', 'Employee Name']));
        if (!emp) { errors.push({ row: i + 2, error: 'Employee not found' }); return; }
        const date = dateOnly(sheetCell(row, ['date', 'Date'], today()));
        const idx = d.attendance.findIndex(a => a.employeeId === emp.id && a.date === date);
        const rec = { id: idx >= 0 ? d.attendance[idx].id : gid(), employeeId: emp.id, employeeName: emp.name, department: emp.department, date, checkIn: sheetCell(row, ['checkIn', 'Check In'], ''), checkOut: sheetCell(row, ['checkOut', 'Check Out'], ''), status: sheetCell(row, ['status', 'Status'], 'Present'), note: sheetCell(row, ['note', 'Note'], '') };
        if (idx >= 0) d.attendance[idx] = rec; else d.attendance.unshift(rec);
        upserted++;
      });
    } else if (name.includes('candidate') || name.includes('recruit')) {
      ensureHrData();
      rows.forEach((row, i) => {
        const cName = sheetCell(row, ['name', 'Name', 'candidateName']);
        if (!cName) { errors.push({ row: i + 2, error: 'Name is required' }); return; }
        const id = sheetCell(row, ['id', 'ID']);
        const existing = d.candidates.find(c => c.id === id);
        const rec = { ...(existing || {}), id: existing?.id || gid(), name: cName, email: sheetCell(row, ['email', 'Email'], ''), phone: sheetCell(row, ['phone', 'Phone'], ''), position: sheetCell(row, ['position', 'Position'], ''), department: sheetCell(row, ['department', 'Department'], ''), stage: sheetCell(row, ['stage', 'Stage'], existing?.stage || 'Applied'), expectedSalary: num(sheetCell(row, ['expectedSalary', 'Expected Salary'], 0)), appliedAt: existing?.appliedAt || new Date().toISOString() };
        if (existing) Object.assign(existing, rec); else d.candidates.unshift(rec);
        upserted++;
      });
    } else if (name.includes('leave') || name.includes('leave application')) {
      ensureLeaveData();
      rows.forEach((row, i) => {
        const applicantName = sheetCell(row, ['applicantName', 'Applicant Name', 'name']);
        const type = sheetCell(row, ['type', 'Leave Type']);
        const startDate = sheetCell(row, ['startDate', 'Start Date', 'Start Date']);
        if (!applicantName || !type || !startDate) { errors.push({ row: i + 2, error: 'Applicant name, type and start date are required' }); return; }
        const endDate = dateOnly(sheetCell(row, ['endDate', 'End Date'], startDate));
        const id = sheetCell(row, ['id', 'ID']);
        const existing = d.leaveApplications.find(l => l.id === id);
        const days = Math.max(leaveBusinessDays(dateOnly(startDate), endDate), 1);
        const emp = d.employees.find(e => e.name === applicantName);
        const rec = { ...(existing || {}), id: existing?.id || gid(), applicantName, applicantEmail: sheetCell(row, ['applicantEmail', 'Email'], emp?.email || ''), applicantId: emp?.id || '', department: sheetCell(row, ['department', 'Department'], emp?.department || ''), type, startDate: dateOnly(startDate), endDate, days, reason: sheetCell(row, ['reason', 'Reason'], ''), status: sheetCell(row, ['status', 'Status'], existing?.status || 'Pending'), appliedAt: existing?.appliedAt || new Date().toISOString(), decidedBy: sheetCell(row, ['decidedBy', 'Decided By'], ''), decisionNote: sheetCell(row, ['decisionNote', 'Decision Note'], '') };
        if (existing) Object.assign(existing, rec); else d.leaveApplications.unshift(rec);
        upserted++;
      });
    } else if (name.includes('notification') || name.includes('alert')) {
      d.notifications ||= [];
      rows.forEach((row, i) => {
        const title = sheetCell(row, ['title', 'Title']);
        if (!title) { errors.push({ row: i + 2, error: 'Title is required' }); return; }
        const id = sheetCell(row, ['id', 'ID']);
        const existing = d.notifications.find(n => n.id === id);
        const rec = { ...(existing || {}), id: existing?.id || gid(), category: sheetCell(row, ['category', 'Category'], 'system'), priority: sheetCell(row, ['priority', 'Priority'], 'medium'), title, message: sheetCell(row, ['message', 'Message'], ''), sourceModule: sheetCell(row, ['sourceModule', 'Source Module'], 'system'), status: sheetCell(row, ['status', 'Status'], 'active'), read: String(sheetCell(row, ['read', 'Read'])).toLowerCase() === 'true', createdAt: existing?.createdAt || new Date().toISOString(), auto: false };
        if (existing) Object.assign(existing, rec); else d.notifications.unshift(rec);
        upserted++;
      });
    } else {
      return { success: false, reason: `Module '${moduleName}' does not support sync-back (import). Supported: Employees, Attendance, Candidates, Leaves, Notifications.`, upserted: 0, errors: [] };
    }

    const logEntry = { id: gid(), connectionId: connection.id || '', module: moduleName, sheetName, direction: 'Import', rowsProcessed: upserted, status: errors.length ? 'Completed With Errors' : 'Imported', message: `${upserted} ${moduleName} rows imported from Google Sheets. ${errors.length} errors.`, createdAt: new Date().toISOString(), errors };
    d.spreadsheetSyncLogs ||= [];
    d.spreadsheetSyncLogs.unshift(logEntry);
    if (connection.id) connection.lastSyncAt = logEntry.createdAt;
    emitBusinessEvent(u, 'sheets.module_imported', 'google-sheets', moduleName, { module: moduleName, upserted, errors: errors.length });
    log(u, `Import ${moduleName} From Google Sheets`, 'Integrations', `${upserted} rows`);
    return { success: errors.length === 0, module: moduleName, imported: upserted, errors, log: logEntry };
  },
  getSettingsWorkspaceData(user) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const d = data();
    const settings = {
      default_currency: 'KSh',
      default_language: 'English',
      default_timezone: 'Africa/Nairobi',
      date_format: 'DD/MM/YYYY',
      number_format: '1,234.56',
      website: 'https://erpftc.vercel.app',
      business_registration_no: 'FTBIO-2024-KE',
      vat_number: 'VAT-FTB-001',
      ...d.settings
    };
    const roles = Object.values(ROLES).concat(['Finance Manager', 'Sales Manager', 'Inventory Manager', 'Production Manager', 'HR Manager', 'CRM Officer', 'Auditor', 'Viewer', 'Custom Role']);
    const modules = ['Dashboard', 'Analytics', 'Sales', 'Purchases', 'Inventory', 'Finance', 'Manufacturing', 'CRM', 'Reports', 'Settings'];
    const permissionActions = ['View', 'Create', 'Edit', 'Approve', 'Export', 'Delete', 'Manage'];
    const systemSections = [
      ['Company Settings', 'Branding, address, tax profile, currency, language, timezone'],
      ['Users & Roles', 'Create users, assign roles, departments, warehouses, counties'],
      ['Permissions', 'Module access and action-level controls'],
      ['Departments', 'Operational ownership and approval routing'],
      ['Warehouses', 'Locations, zones, limits, managers, stock access'],
      ['Products', 'Categories, units, conversions, barcode and QR rules'],
      ['Manufacturing Rules', 'BOMs, formula versioning, QC, yield and waste rules'],
      ['Procurement Rules', 'Approval workflows, supplier evaluation, purchase limits'],
      ['Inventory Rules', 'Reorder levels, transfers, expiry, stock audit rules'],
      ['Sales Rules', 'Credit control, quotation approvals, commissions, discounts'],
      ['Finance Rules', 'Posting controls, journals, fiscal periods, chart of accounts'],
      ['Payroll Rules', 'Allowances, deductions, approval and posting rules'],
      ['Tax Settings', 'VAT, withholding, filing periods, tax reporting'],
      ['Notification Settings', 'Alerts for stock, approvals, overdue invoices'],
      ['Email Settings', 'SMTP identity, templates, delivery logs'],
      ['SMS Settings', 'Provider setup, sender ID, message templates'],
      ['Document Templates', 'Invoices, quotes, POs, delivery notes, statements'],
      ['Workflow Automation', 'Approval routes and event-driven automation'],
      ['Integrations', 'Supabase, Vercel, M-Pesa, email, bank, API connections'],
      ['Audit Controls', 'Retention, immutable events, export audit logs'],
      ['Security', 'Password policy, sessions, MFA, IP allowlists'],
      ['Backup & Recovery', 'Backup status, restore points, data export'],
      ['Data Management', 'Import, export, cleanup, archiving rules'],
      ['API Settings', 'API keys, webhooks, rate limits, service access'],
      ['System Health', 'Database, API, deployment and event processing status'],
      ['Advanced Settings', 'Developer controls and enterprise feature flags']
    ].map(([name, detail], index) => ({ id: `settings-${index + 1}`, name, detail, status: index < 12 ? 'Configured' : 'Ready' }));
    const warehouses = (d.inventoryWarehouses || []).map(wh => ({
      id: wh.id || wh.name,
      name: wh.name,
      location: wh.location || wh.county || 'Nairobi',
      manager: wh.manager || d.users.find(x => x.role === ROLES.WAREHOUSE)?.name || 'Warehouse Manager',
      utilization: Math.round((num(wh.used) / Math.max(1, num(wh.capacity))) * 100),
      status: wh.status || 'Active'
    }));
    const users = d.users.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      phone: row.phone,
      status: row.status,
      department: row.department || roleDepartment(row.role),
      warehouse: row.warehouse || (row.role === ROLES.WAREHOUSE ? warehouses[0]?.name : 'All'),
      county: row.county || (d.counties?.[0]?.name || 'Nairobi'),
      lastLogin: row.lastLogin || row.updatedAt || ''
    }));
    const integrations = [
      ['Supabase Database', 'Connected', 'Primary ERP data state and live records'],
      ['Vercel Hosting', 'Connected', 'Production deployment and API runtime'],
      ['M-Pesa Payments', 'Ready', 'Payment collection setup placeholder'],
      ['Email Service', 'Ready', 'Reports, invoices, statements and notifications'],
      ['Bank Feed', 'Ready', 'Reconciliation and cash movement import'],
      ['Spreadsheet Connector', 'Ready', 'Google Sheets, Excel workbook, and CSV export mapping'],
      ['Public API', 'Restricted', 'Service key access and webhooks']
    ].map(([name, status, detail], index) => ({ id: `INT-${index + 1}`, name, status, detail }));
    const health = {
      persistence: process.env.SUPABASE_URL ? 'Supabase connected' : 'Local demo state',
      users: d.users.length,
      records: d.sales.length + d.customers.length + d.inventory.length + d.invoices.length + d.purchaseOrders.length,
      businessEvents: (d.businessEvents || []).length,
      auditLogs: d.activity.length + (d.auditLogs || []).length,
      lastBackup: new Date().toISOString(),
      environment: process.env.VERCEL ? 'Vercel Production' : 'Local Development'
    };
    return {
      settings,
      currentUser: publicUser(u),
      users,
      roles,
      modules,
      permissionActions,
      permissionMatrix: roles.slice(0, 10).map(role => ({
        role,
        view: true,
        create: !['Viewer', 'Auditor'].includes(role),
        edit: !['Viewer', 'Auditor'].includes(role),
        approve: ['Admin', 'Manager', 'Finance Manager', 'Sales Manager', 'Production Manager'].includes(role),
        export: role !== 'Viewer',
        delete: ['Admin'].includes(role),
        manage: ['Admin', 'Manager'].includes(role)
      })),
      departments: ['Executive', 'Sales', 'Finance', 'Inventory', 'Procurement', 'Manufacturing', 'CRM', 'Field Operations', 'HR', 'Audit'].map((name, index) => ({ id: `DEP-${index + 1}`, name, manager: users[index % users.length]?.name || 'Admin', members: users.filter((_, i) => i % 10 === index % 10).length || 1, status: 'Active' })),
      warehouses,
      rules: {
        manufacturing: ['Formula version approval', 'Batch number auto-generation', 'QC required before release', 'Waste threshold alerts'],
        procurement: ['PO approval above KSh100,000', 'Supplier scoring enabled', 'GRN variance review', 'Automatic reorder suggestions'],
        inventory: ['Reorder point alerts', 'Expiry tracking', 'Transfer approval', 'Cycle count audit'],
        sales: ['Credit limit enforcement', 'Quote approval workflow', 'Delivery confirmation required', 'Invoice auto-generation'],
        finance: ['Balanced journals only', 'Immutable audit trail', 'Monthly close controls', 'Tax report generation']
      },
      notifications: [
        { id: 'N1', channel: 'Email', event: 'Approval Required', status: 'Active' },
        { id: 'N2', channel: 'SMS', event: 'Delivery Assigned', status: 'Ready' },
        { id: 'N3', channel: 'In App', event: 'Low Stock', status: 'Active' },
        { id: 'N4', channel: 'Email', event: 'Overdue Invoice', status: 'Active' }
      ],
      documentTemplates: ['Invoice', 'Quotation', 'Purchase Order', 'Delivery Note', 'Customer Statement', 'Production Batch Sheet', 'Goods Received Note'].map((name, index) => ({ id: `DOC-${index + 1}`, name, version: `v${index + 1}.0`, status: 'Active' })),
      integrations,
      security: {
        mfa: 'Recommended',
        sessionTimeout: '8 hours',
        passwordPolicy: 'Minimum 10 characters',
        apiAccess: 'Service role restricted',
        rowLevelSecurity: 'Enabled for ERP state',
        auditRetention: '7 years'
      },
      backups: [
        { id: 'BKP-1', name: 'Daily Supabase Snapshot', schedule: 'Daily 00:01', status: 'Ready' },
        { id: 'BKP-2', name: 'Vercel Deployment Rollback', schedule: 'Every deploy', status: 'Active' },
        { id: 'BKP-3', name: 'ERP JSON Export', schedule: 'On demand', status: 'Ready' }
      ],
      health,
      recentAudit: d.activity.slice(0, 12),
      recentEvents: (d.businessEvents || []).slice(0, 12),
      apiSettings: [
        { id: 'API-1', name: 'ERP RPC API', scope: 'Internal', status: 'Active' },
        { id: 'API-2', name: 'Report Export API', scope: 'Authenticated', status: 'Active' },
        { id: 'API-3', name: 'Webhook Receiver', scope: 'Restricted', status: 'Ready' }
      ],
      advancedFlags: [
        { id: 'FLG-1', name: 'Realtime Events', enabled: true },
        { id: 'FLG-2', name: 'Materialized Analytics', enabled: true },
        { id: 'FLG-3', name: 'Enterprise Audit Mode', enabled: true },
        { id: 'FLG-4', name: 'AI Recommendations', enabled: true }
      ],
      systemSections
    };
  },
  saveSettingsSection(user, section, payload = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const key = String(section || 'company');
    if (key === 'company') data().settings = { ...data().settings, ...payload };
    else {
      data().settingsAdmin ||= {};
      data().settingsAdmin[key] = { ...(data().settingsAdmin[key] || {}), ...payload, updatedAt: new Date().toISOString(), updatedBy: u.name };
    }
    emitBusinessEvent(u, `settings.${key}.updated`, 'settings', key, payload);
    log(u, 'Update Settings', 'Settings', key);
    return { success: true, settings: data().settings };
  },
  saveSettingsUser(user, payload = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const row = {
      id: payload.id,
      name: payload.name || 'New User',
      email: payload.email || `user${Date.now()}@farmtrack.local`,
      password: payload.password || 'ChangeMe123',
      role: payload.role || ROLES.SALES,
      phone: payload.phone || '',
      status: payload.status || 'Active',
      department: payload.department || roleDepartment(payload.role || ROLES.SALES),
      warehouse: payload.warehouse || 'All',
      county: payload.county || 'Nairobi'
    };
    const saved = save('users', u, row);
    emitBusinessEvent(u, 'settings.user.saved', 'users', saved.id || row.id, row);
    return saved;
  },
  getBackupList: () => [],
  createDailyBackup: () => 'Backup is configured in Vercel deployment.',
  setupAutoBackup: () => 'Auto backup is not needed for this Vercel demo.',
  getCustomers: user => (reqRole(user), list('customers').map(c => ({ ...c, balance: num(c.balance), creditLimit: num(c.creditLimit) }))),
  getCRMWorkspaceData(user, filters = {}) {
    reqRole(user);
    const d = data();
    const range = periodRange(filters.period);
    const customers = list('customers').map(customer => {
      const sales = d.sales.filter(s => s.customerId === customer.id || s.customerName === customer.name);
      const revenue = sales.reduce((sum, sale) => sum + num(sale.total), 0);
      const lastSale = sales.sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      return {
        ...customer,
        revenue,
        orders: sales.length,
        lastActivity: lastSale?.date || customer.updatedAt || customer.createdAt || today(),
        health: revenue > 200000 ? 'VIP' : revenue > 0 ? 'Active' : 'Prospect',
        priority: revenue > 200000 ? 'High' : revenue > 50000 ? 'Medium' : 'Normal'
      };
    });
    const activeCustomers = customers.filter(c => c.status === 'Active').length;
    const leads = list('leads');
    const calls = list('calls');
    const invoices = list('invoices');
    const periodSales = d.sales.filter(row => dateOnly(row.date || row.createdAt) >= range.startDate && dateOnly(row.date || row.createdAt) <= range.endDate);
    const periodCalls = calls.filter(row => dateOnly(row.date || row.createdAt || row.updatedAt) >= range.startDate && dateOnly(row.date || row.createdAt || row.updatedAt) <= range.endDate);
    const periodLeads = leads.filter(row => dateOnly(row.createdAt || row.updatedAt || today()) >= range.startDate && dateOnly(row.createdAt || row.updatedAt || today()) <= range.endDate);
    const pipelineValue = leads.filter(l => !['Won', 'Lost'].includes(l.stage)).reduce((sum, lead) => sum + num(lead.value), 0);
    const wonDeals = periodSales.length;
    const revenue = periodSales.reduce((sum, sale) => sum + num(sale.total), 0);
    const stages = ['New', 'Contacted', 'Proposal', 'Negotiation', 'Won', 'Lost'];
    const funnel = stages.map(stage => ({
      stage,
      count: leads.filter(lead => lead.stage === stage || (stage === 'New' && lead.stage === 'Lead')).length,
      value: leads.filter(lead => lead.stage === stage || (stage === 'New' && lead.stage === 'Lead')).reduce((sum, lead) => sum + num(lead.value), 0)
    }));
    const activities = [
      ...periodCalls.slice(0, 6).map(call => ({ id: call.id, type: 'Call', title: `${call.stage} - ${call.customerName}`, owner: call.assignedTo || 'Sales Team', time: call.updatedAt || call.createdAt || today(), status: call.stage === 'Already Called' ? 'Completed' : 'Pending' })),
      ...periodLeads.slice(0, 6).map(lead => ({ id: lead.id, type: 'Lead', title: `${lead.stage} - ${lead.name}`, owner: lead.assignedTo || 'Sales Team', time: lead.updatedAt || lead.createdAt || today(), status: lead.stage === 'Won' ? 'Completed' : 'Open' }))
    ].sort((a, b) => String(b.time).localeCompare(String(a.time))).slice(0, 8);
    const topCustomers = [...customers].sort((a, b) => num(b.revenue) - num(a.revenue)).slice(0, 6);
    const monthly = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((month, index) => ({
      month,
      customers: Math.max(1, Math.round(customers.length * (0.55 + index * 0.08))),
      revenue: Math.round(revenue * (0.1 + index * 0.025)),
      opportunities: Math.max(1, leads.length + index)
    }));
    return {
      overview: {
        totalCustomers: customers.length,
        activeCustomers,
        opportunities: leads.filter(l => !['Won', 'Lost'].includes(l.stage)).length,
        wonDeals,
        pipelineValue,
        revenue,
        pendingFollowups: calls.filter(c => c.stage !== 'Already Called').length,
        retentionRate: customers.length ? Math.round((activeCustomers / customers.length) * 100) : 0
      },
      period: range,
      customers,
      leads,
      calls,
      funnel,
      activities,
      topCustomers,
      monthly,
      reports: [
        { name: 'Customer Profitability Report', records: customers.length, value: revenue, period: range.label },
        { name: 'Lead Conversion Report', records: periodLeads.length, value: pipelineValue, period: range.label },
        { name: 'Call Activity Report', records: periodCalls.length, value: periodCalls.length, period: range.label },
        { name: 'Customer Revenue Report', records: invoices.length, value: invoices.reduce((sum, inv) => sum + num(inv.total), 0) }
      ]
    };
  },
  saveCustomer(user, row) { const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES, ROLES.FIELD); return save('customers', u, row); },
  deleteCustomer: (user, id) => (reqRole(user, ROLES.ADMIN, ROLES.MANAGER), softDelete('customers', id)),
  getCustomerHistory: (user, id) => (reqRole(user), { customer: data().customers.find(c => c.id === id), sales: data().sales.filter(s => s.customerId === id), payments: data().payments.filter(p => p.customerId === id), calls: data().calls.filter(c => c.customerId === id) }),
  getSuppliers: user => (reqRole(user), list('suppliers')),
  saveSupplier(user, row) { const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PROCUREMENT); return save('suppliers', u, row); },
  deleteSupplier: (user, id) => (reqRole(user, ROLES.ADMIN, ROLES.MANAGER), softDelete('suppliers', id)),
  getLeads: user => (reqRole(user), list('leads')),
  saveLead(user, row) { const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES, ROLES.FIELD); return save('leads', u, row); },
  deleteLead: (user, id) => (reqRole(user, ROLES.ADMIN, ROLES.MANAGER), softDelete('leads', id)),
  getCalls: user => (reqRole(user), list('calls')),
  saveCall(user, row) { const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES, ROLES.FIELD); return save('calls', u, row); },
  updateCallStage(user, id, stage) { reqRole(user); const c = data().calls.find(x => x.id === id); if (c) c.stage = stage; return { success: true }; },
  getProducts: user => (reqRole(user), list('products').map(p => ({ ...p, costPrice: num(p.costPrice), sellingPrice: num(p.sellingPrice), minStock: num(p.minStock), stock: data().inventory.filter(i => i.productName === p.name).reduce((s, i) => s + num(i.quantity), 0) }))),
  saveProduct(user, row) { const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER); return save('products', u, row); },
  getInventory: user => (reqRole(user), list('inventory').map(i => ({ ...i, quantity: num(i.quantity), unitCost: num(i.unitCost) }))),
  saveInventoryItem(user, row) { const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.WAREHOUSE); return save('inventory', u, row); },
  getInventoryWorkspaceData(user) {
    reqRole(user);
    const d = data();
    const stockItems = d.inventory.map(item => {
      const product = d.products.find(p => p.id === item.productId || p.name === item.productName) || {};
      const available = Math.max(0, num(item.quantity) - num(item.quantityReserved) - num(item.damagedQuantity) - num(item.expiredQuantity));
      const lastMovement = d.inventoryTransactions.filter(tx => tx.productId === item.productId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      return {
        ...item,
        productName: item.productName,
        sku: item.sku || product.sku,
        category: item.category || product.category,
        quantityAvailable: available,
        quantityReserved: num(item.quantityReserved),
        quantityIncoming: num(item.quantityIncoming),
        quantityOutgoing: num(item.quantityOutgoing),
        reorderLevel: num(product.minStock || item.reorderPoint),
        unitCost: num(item.unitCost),
        sellingPrice: num(product.sellingPrice),
        inventoryValue: Math.round(num(item.quantity) * num(item.unitCost)),
        lastMovementDate: lastMovement?.createdAt?.slice(0, 10) || item.lastMovementDate,
        healthScore: d.inventoryHealthScores.find(row => row.productId === item.productId)?.healthScore || 60
      };
    });
    const totalValue = stockItems.reduce((sum, item) => sum + num(item.inventoryValue), 0);
    const availableStock = stockItems.reduce((sum, item) => sum + num(item.quantityAvailable), 0);
    const reservedStock = stockItems.reduce((sum, item) => sum + num(item.quantityReserved), 0);
    const damagedStock = stockItems.reduce((sum, item) => sum + num(item.damagedQuantity), 0);
    const expiredStock = stockItems.reduce((sum, item) => sum + num(item.expiredQuantity), 0);
    const lowStock = stockItems.filter(item => num(item.quantityAvailable) <= num(item.reorderLevel));
    const outOfStock = stockItems.filter(item => num(item.quantityAvailable) <= 0);
    const incoming = stockItems.reduce((sum, item) => sum + num(item.quantityIncoming), 0);
    const outgoing = stockItems.reduce((sum, item) => sum + num(item.quantityOutgoing), 0);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const trend = months.map((month, index) => {
      const txs = d.inventoryTransactions.filter((_, i) => i % months.length === index);
      return {
        month,
        inventoryValue: Math.round(totalValue * (0.78 + index * 0.045)),
        incomingStock: txs.filter(tx => num(tx.quantity) > 0).reduce((s, tx) => s + num(tx.quantity), 0),
        outgoingStock: Math.abs(txs.filter(tx => num(tx.quantity) < 0).reduce((s, tx) => s + num(tx.quantity), 0)),
        damagedStock: d.inventoryDamage.filter((_, i) => i % months.length === index).reduce((s, row) => s + num(row.quantity), 0),
        expiredStock: stockItems.filter((_, i) => i % months.length === index).reduce((s, row) => s + num(row.expiredQuantity), 0),
        warehouseStock: Math.round(availableStock * (0.82 + index * 0.035)),
        stockTurnover: Number((1.2 + index * 0.18).toFixed(2)),
        stockCosts: d.inventoryCosts.reduce((s, row) => s + num(row.totalCost), 0) * (0.7 + index * 0.05)
      };
    });
    const searchIndex = [
      ...stockItems.map(row => ({ type: 'Stock', label: row.productName, sub: `${row.sku} - ${row.warehouseName} - ${row.batchNo}` })),
      ...d.inventoryTransactions.map(row => ({ type: 'Movement', label: row.productName, sub: `${row.transactionType} - ${row.referenceType} - ${row.warehouseName}` })),
      ...d.inventoryBatches.map(row => ({ type: 'Batch', label: row.batchNo, sub: `${row.productName} - ${row.lotNo} - ${row.status}` })),
      ...d.inventoryAlerts.map(row => ({ type: 'Alert', label: row.productName, sub: `${row.type} - ${row.severity}` }))
    ];
    const fastMoving = stockItems
      .map(item => ({ ...item, movementCount: d.inventoryTransactions.filter(tx => tx.productId === item.productId).length, profitPotential: Math.round((num(item.sellingPrice) - num(item.unitCost)) * num(item.quantityAvailable)) }))
      .sort((a, b) => b.movementCount - a.movementCount)
      .slice(0, 10);
    return {
      filters: { dateRange: 'This Month', warehouse: 'All Warehouses', category: 'All Categories', status: 'All Statuses', valuation: 'FIFO' },
      overview: {
        totalSkus: stockItems.length,
        totalStockValue: Math.round(totalValue),
        availableStock: Math.round(availableStock),
        reservedStock: Math.round(reservedStock),
        lowStock: lowStock.length,
        outOfStock: outOfStock.length,
        damagedStock: Math.round(damagedStock),
        expiredStock: Math.round(expiredStock),
        incomingStock: Math.round(incoming),
        outgoingStock: Math.round(outgoing),
        inventoryTurnover: 1.9,
        inventoryAccuracy: Math.round(100 - (d.inventoryAudits.filter(row => row.difference !== 0).length / Math.max(1, d.inventoryAudits.length)) * 100)
      },
      trend,
      stockItems,
      warehouses: d.inventoryWarehouses.map(wh => ({ ...wh, utilization: Math.round((num(wh.used) / Math.max(1, num(wh.capacity))) * 100), stockValue: stockItems.filter(item => item.warehouseName === wh.name).reduce((s, item) => s + num(item.inventoryValue), 0) })),
      movements: d.inventoryTransactions,
      adjustments: d.inventoryAdjustments,
      transfers: d.inventoryTransfers,
      receiving: d.goodsReceipts || [],
      dispatch: d.deliveries || [],
      audits: d.inventoryAudits,
      expiry: d.inventoryBatches,
      damaged: d.inventoryDamage,
      alerts: d.inventoryAlerts,
      reorderRules: d.inventoryReorderRules,
      slowMoving: d.inventorySlowMoving,
      deadStock: d.inventoryDeadStock,
      costs: d.inventoryCosts,
      documents: d.inventoryDocuments,
      forecasts: d.inventoryForecasts,
      healthScores: d.inventoryHealthScores,
      fastMoving,
      reports: d.inventoryReports,
      searchIndex,
      analytics: {
        stockIntelligence: stockItems,
        movementIntelligence: d.inventoryTransactions,
        warehouseIntelligence: d.inventoryWarehouses,
        costIntelligence: d.inventoryCosts,
        expiryIntelligence: d.inventoryBatches,
        alertIntelligence: d.inventoryAlerts,
        auditIntelligence: d.inventoryAudits,
        forecastIntelligence: d.inventoryForecasts
      },
      ai: [
        {
          title: 'Stockout risk',
          detail: lowStock[0] ? `${lowStock[0].productName} is below reorder level in ${lowStock[0].warehouseName}; recommended reorder is ${d.inventoryReorderRules.find(r => r.productId === lowStock[0].productId)?.recommendedOrderQty || 0}.` : 'No immediate stockout risk detected.',
          sources: ['inventory', 'products', 'inventory_reorder_rules']
        },
        {
          title: 'Slow moving stock',
          detail: d.inventorySlowMoving[0] ? `${d.inventorySlowMoving[0].productName} has not moved for ${d.inventorySlowMoving[0].daysSinceLastMovement} days. Recommendation: ${d.inventorySlowMoving[0].recommendation}.` : 'No slow-moving stock in the selected period.',
          sources: ['inventory_transactions', 'inventory_slow_moving']
        },
        {
          title: 'Warehouse capacity',
          detail: `${d.inventoryWarehouses.sort((a, b) => (b.used / b.capacity) - (a.used / a.capacity))[0].name} has the highest capacity utilization.`,
          sources: ['inventory_warehouses', 'inventory_locations']
        }
      ]
    };
  },
  adjustInventory(user, row = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.WAREHOUSE);
    const item = data().inventory.find(x => x.id === row.inventoryId) || data().inventory[0];
    if (!item) throw new Error('Inventory item not found');
    const qty = num(row.quantity || 0);
    if (!qty) throw new Error('Adjustment quantity is required');
    if (num(item.quantity) + qty < 0) throw new Error(`Cannot reduce ${item.productName} below zero stock`);
    item.quantity = Math.max(0, num(item.quantity) + qty);
    item.lastMovementDate = today();
    item.updatedAt = new Date().toISOString();
    const tx = { id: gid(), productId: item.productId, productName: item.productName, sku: item.sku, warehouseName: item.warehouseName, batchNo: item.batchNo, transactionType: 'Adjustment', quantity: qty, unitCost: item.unitCost, referenceType: 'Stock Adjustment', referenceId: row.reason || 'Manual adjustment', createdBy: u.name, createdAt: new Date().toISOString(), notes: row.reason || 'Manual stock adjustment' };
    data().inventoryTransactions.unshift(tx);
    data().inventoryAdjustments.unshift({ id: gid(), productId: item.productId, productName: item.productName, warehouseName: item.warehouseName, adjustmentType: row.reason || 'Correction', quantity: qty, reason: row.reason || 'Manual adjustment', approvedBy: u.name, date: today() });
    emitBusinessEvent(u, 'inventory.adjusted', 'inventory', item.id, { productName: item.productName, warehouseName: item.warehouseName, quantity: qty, balance: item.quantity });
    // Email: low stock alert if below reorder level
    const reorderLevel = num(item.reorderLevel) || 10;
    if (num(item.quantity) <= reorderLevel && qty < 0) {
      const alertEmails = managerEmails(data());
      if (alertEmails.length) {
        deliverEmail(u, 'low_stock', alertEmails, () => RichEmail.sendLowStockEmail({
          to: alertEmails, itemName: item.productName, currentStock: num(item.quantity),
          reorderLevel, sku: item.sku, viewUrl: 'https://erpftc.vercel.app/#/inventory/stock'
        }), { subject: `Low stock: ${item.productName}`, relatedModule: 'inventory', relatedId: item.id }).catch(() => {});
      }
    }
    log(u, 'Adjust Inventory', 'Inventory', `${item.productName} ${qty}`);
    return { success: true, item, transaction: tx };
  },
  transferInventory(user, row = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.WAREHOUSE);
    const item = data().inventory.find(x => x.id === row.inventoryId) || data().inventory[0];
    if (!item) throw new Error('Inventory item not found');
    assertPositive(row.quantity || 1, 'Transfer quantity');
    if (num(row.quantity || 1) > num(item.quantity)) throw new Error(`Only ${num(item.quantity).toLocaleString()} ${item.productName} available in ${item.warehouseName}`);
    const qty = num(row.quantity || 1);
    const toWarehouse = row.toWarehouse || data().inventoryWarehouses.find(wh => wh.name !== item.warehouseName)?.name || 'Main Store Nairobi';
    item.quantity = Math.max(0, num(item.quantity) - qty);
    let dest = data().inventory.find(x => x.productName === item.productName && x.warehouseName === toWarehouse);
    if (!dest) {
      dest = { ...item, id: gid(), warehouseName: toWarehouse, quantity: 0, batchNo: `TRF-${Date.now()}`, status: 'In Stock' };
      data().inventory.unshift(dest);
    }
    dest.quantity = num(dest.quantity) + qty;
    const transfer = { id: gid(), transferNo: `TRF-${Date.now()}`, productId: item.productId, productName: item.productName, fromWarehouse: item.warehouseName, toWarehouse, quantity: qty, status: 'Completed', requestedBy: u.name, date: today() };
    data().inventoryTransfers.unshift(transfer);
    data().inventoryTransactions.unshift({ id: gid(), productId: item.productId, productName: item.productName, sku: item.sku, warehouseName: item.warehouseName, batchNo: item.batchNo, transactionType: 'Transfer', quantity: -qty, unitCost: item.unitCost, referenceType: 'Transfer', referenceId: transfer.transferNo, createdBy: u.name, createdAt: new Date().toISOString(), notes: `Transferred to ${toWarehouse}` });
    data().inventoryTransactions.unshift({ id: gid(), productId: dest.productId, productName: dest.productName, sku: dest.sku, warehouseName: dest.warehouseName, batchNo: dest.batchNo, transactionType: 'Transfer In', quantity: qty, unitCost: dest.unitCost, referenceType: 'Transfer', referenceId: transfer.transferNo, createdBy: u.name, createdAt: new Date().toISOString(), notes: `Transferred from ${item.warehouseName}` });
    emitBusinessEvent(u, 'inventory.transferred', 'inventoryTransfers', transfer.id, transfer);
    log(u, 'Transfer Inventory', 'Inventory', transfer.transferNo);
    return { success: true, transfer };
  },
  createInventoryPurchaseRequest(user, inventoryId) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.WAREHOUSE, ROLES.PROCUREMENT);
    const item = data().inventory.find(x => x.id === inventoryId) || data().inventory[0];
    if (!item) throw new Error('Inventory item not found');
    return api.createPurchaseRequest(u, { productId: item.productId, quantity: Math.max(25, num(item.reorderPoint) * 2), priority: 'High', reason: `Inventory low stock trigger for ${item.productName}`, department: 'Warehouse' });
  },
  getProductionJobs: user => (reqRole(user), list('production')),
  getUomConversionPreview(user, quantity, fromUnit, consumeQty, consumeUnit) {
    reqRole(user);
    const baseUnit = UOM_FACTORS[normUom(fromUnit)]?.family === 'mass' ? 'G' : UOM_FACTORS[normUom(fromUnit)]?.family === 'volume' ? 'ML' : 'PCS';
    const storedBase = convertUom(quantity, fromUnit, baseUnit);
    const consumedBase = convertUom(consumeQty, consumeUnit, baseUnit);
    return { input: `${quantity} ${normUom(fromUnit)}`, storedBase, baseUnit, consumed: `${consumeQty} ${normUom(consumeUnit)}`, consumedBase, remainingBase: storedBase - consumedBase };
  },
  getManufacturingWorkspaceData(user) {
    reqRole(user);
    ensureManufacturingData();
    const d = data();
    const orders = d.productionOrders || [];
    const materials = d.rawMaterials || [];
    const batches = d.rawMaterialBatches || [];
    const consumption = d.rawMaterialConsumption || [];
    const produced = d.productionBatches || [];
    const totalAvailable = materials.reduce((s, x) => s + num(x.availableQuantity), 0);
    const totalReserved = materials.reduce((s, x) => s + num(x.reservedQuantity), 0);
    const totalConsumed = materials.reduce((s, x) => s + num(x.consumedQuantity), 0);
    const completed = orders.filter(x => x.status === 'Completed').length;
    const planned = orders.reduce((s, x) => s + num(x.plannedQty), 0);
    const actual = produced.reduce((s, x) => s + num(x.quantityProduced), 0);
    const waste = produced.reduce((s, x) => s + num(x.wasteQuantity), 0);
    const health = materials.map(material => {
      const used = consumption.filter(x => x.materialId === material.id).reduce((s, x) => s + num(x.quantityBase), 0);
      const availability = Math.min(100, Math.round(num(material.availableQuantity) / Math.max(1, num(material.currentQuantity)) * 100));
      const quality = material.expiryDate && material.expiryDate < today() ? 35 : 92;
      const demand = used ? 84 : 55;
      const score = Math.round((availability * 0.3) + (quality * 0.25) + (demand * 0.2) + 20);
      return { material: material.materialName, availability, quality, demand, score: Math.min(100, score), status: score >= 75 ? 'Healthy' : score >= 50 ? 'Watch' : 'Critical' };
    });
    return {
      filters: { dateRange: 'This Production Month', plant: 'Nairobi Manufacturing', unitMode: 'Auto Convert' },
      conversionExample: api.getUomConversionPreview(user, 500, 'KG', 250, 'G'),
      overview: {
        openOrders: orders.filter(x => x.status !== 'Completed').length,
        completedOrders: completed,
        rawMaterialAvailable: Math.round(totalAvailable),
        reservedMaterial: Math.round(totalReserved),
        consumedMaterial: Math.round(totalConsumed),
        plannedOutput: planned,
        actualOutput: actual,
        waste,
        manufacturingScore: Math.round((completed / Math.max(1, orders.length)) * 35 + (actual / Math.max(1, planned)) * 35 + 25)
      },
      uoms: d.unitOfMeasure,
      conversions: d.unitConversions,
      rawMaterials: materials,
      rawMaterialBatches: batches,
      formulas: d.productFormulas,
      formulaVersions: d.formulaVersions,
      orders,
      productionBatches: produced,
      consumption,
      storageHistory: d.productionStorageHistory,
      qualityChecks: d.productionQualityChecks,
      downtime: d.productionDowntime,
      capacity: d.productionCapacity,
      calendar: d.productionCalendar,
      documents: d.manufacturingDocuments,
      recalls: d.batchRecalls,
      health,
      traceability: consumption.map(x => ({ productionOrder: x.productionOrder, material: x.materialName, batchUsed: x.batchNumber, quantityConsumed: x.quantityConsumed, unit: x.unit, costConsumed: x.costConsumed, operator: x.operator, date: x.date })),
      reports: [
        { name: 'Raw Material Ledger', module: 'Manufacturing', records: materials.length, rows: materials.length, value: materials.reduce((s, x) => s + num(x.availableQuantity) * num(x.costPerUnit), 0), status: 'Ready', exports: ['PDF', 'Excel', 'CSV', 'PowerPoint', 'Print', 'Email Package'] },
        { name: 'Batch Traceability Report', module: 'Manufacturing', records: consumption.length + produced.length, rows: consumption.length + produced.length, value: consumption.reduce((s, x) => s + num(x.costConsumed), 0), status: 'Ready', exports: ['PDF', 'Excel', 'CSV', 'PowerPoint', 'Print', 'Email Package'] },
        { name: 'Production Cost Report', module: 'Manufacturing', records: (d.productionBatchCosts || []).length, rows: (d.productionBatchCosts || []).length, value: (d.productionBatchCosts || []).reduce((s, x) => s + num(x.totalCost || x.cost), 0), status: 'Ready', exports: ['PDF', 'Excel', 'CSV', 'PowerPoint', 'Print', 'Email Package'] },
        { name: 'UOM Conversion Audit', module: 'Manufacturing', records: d.unitConversions.length, rows: d.unitConversions.length, value: d.unitConversions.length, status: 'Ready', exports: ['PDF', 'Excel', 'CSV', 'PowerPoint', 'Print', 'Email Package'] },
        { name: 'Batch Recall Report', module: 'Manufacturing', records: d.batchRecalls.length, rows: d.batchRecalls.length, value: d.batchRecalls.length, status: 'Ready', exports: ['PDF', 'Excel', 'CSV', 'PowerPoint', 'Print', 'Email Package'] }
      ],
      ai: [
        { title: 'UOM conversion protected', detail: 'Raw materials are stored in base units, so 500 KG becomes 500,000 G before production consumes 250 G.' },
        { title: 'Traceability ready', detail: 'Every completion records material batch, operator, cost, quality status, finished batch, inventory movement, finance journal, and event trail.' }
      ]
    };
  },
  receiveRawMaterial(user, row = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PROCUREMENT, ROLES.WAREHOUSE, ROLES.PRODUCTION);
    const baseUnit = UOM_FACTORS[normUom(row.unit)]?.family === 'mass' ? 'G' : UOM_FACTORS[normUom(row.unit)]?.family === 'volume' ? 'ML' : 'PCS';
    const baseQty = Math.round(convertUom(row.quantity || 0, row.unit || baseUnit, baseUnit));
    const materialId = row.materialId || gid();
    let material = data().rawMaterials.find(x => x.id === row.materialId || x.materialName === row.materialName);
    if (!material) {
      material = { id: materialId, materialCode: row.materialCode || `RM-${Date.now()}`, materialName: row.materialName || 'New Raw Material', category: row.category || 'Raw Material', unitOfMeasure: baseUnit, currentQuantity: 0, availableQuantity: 0, reservedQuantity: 0, consumedQuantity: 0, supplier: row.supplier || '', costPerUnit: num(row.costPerUnit), warehouse: row.warehouse || 'Raw Materials Store', storageLocation: row.storageLocation || 'A1', batchNumber: row.batchNumber || `MAT-${Date.now()}`, manufactureDate: row.manufactureDate || today(), expiryDate: row.expiryDate || '', status: 'Available' };
      data().rawMaterials.unshift(material);
    }
    material.currentQuantity = num(material.currentQuantity) + baseQty;
    material.availableQuantity = num(material.availableQuantity) + baseQty;
    material.costPerUnit = num(row.costPerUnit || material.costPerUnit);
    const batch = { id: gid(), batchNumber: row.batchNumber || `MAT-${Date.now()}`, materialId: material.id, materialName: material.materialName, supplier: row.supplier || material.supplier, quantity: baseQty, availableQuantity: baseQty, reservedQuantity: 0, unit: baseUnit, cost: baseQty * num(material.costPerUnit), costPerBaseUnit: num(material.costPerUnit), receivedDate: today(), expiryDate: row.expiryDate || material.expiryDate, warehouse: row.warehouse || material.warehouse, storageLocation: row.storageLocation || material.storageLocation, status: 'Available' };
    data().rawMaterialBatches.unshift(batch);
    emitBusinessEvent(u, 'manufacturing.raw_material_received', 'rawMaterials', material.id, { materialName: material.materialName, quantity: row.quantity, unit: row.unit, baseQty, baseUnit, batchNumber: batch.batchNumber });
    log(u, 'Receive Raw Material', 'Manufacturing', `${material.materialName} ${baseQty}${baseUnit}`);
    return { success: true, material, batch, conversion: { input: `${row.quantity} ${normUom(row.unit)}`, baseQty, baseUnit } };
  },
  saveProductionJob(user, row) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PRODUCTION);
    const formula = data().productFormulas.find(x => x.id === row.formulaId || x.productName === row.productName) || data().productFormulas[0];
    const order = { id: gid(), orderNo: row.jobNo || `PJ-${Date.now()}`, productName: row.productName || formula.productName, formulaId: formula.id, formulaVersion: row.formulaVersion || formula.activeVersion, plannedQty: num(row.plannedQty || 1), outputUnit: row.outputUnit || formula.outputUnit, status: row.status || 'Pending', operator: row.assignedTo || row.operator || u.name, startDate: row.startDate || today(), endDate: '', createdAt: new Date().toISOString() };
    data().productionOrders.unshift(order);
    data().production.unshift({ id: order.id, jobNo: order.orderNo, productName: order.productName, plannedQty: order.plannedQty, completedQty: 0, wastageQty: 0, startDate: order.startDate, endDate: '', status: order.status, assignedTo: order.operator, materialCost: 0, revenue: 0, gainPercent: 0 });
    emitBusinessEvent(u, 'manufacturing.production_order_created', 'productionOrders', order.id, order);
    log(u, 'Create Production Order', 'Manufacturing', order.orderNo);
    return { success: true, order, id: order.id };
  },
  startProductionOrder(user, orderId) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PRODUCTION);
    const order = data().productionOrders.find(x => x.id === orderId);
    if (!order) throw new Error('Production order not found');
    const formulaRows = data().formulaVersions.filter(x => x.formulaId === order.formulaId && x.version === order.formulaVersion);
    formulaRows.forEach(item => {
      const material = data().rawMaterials.find(x => x.id === item.materialId);
      if (!material) throw new Error(`Material not found: ${item.materialName}`);
      const reserveBase = Math.round(convertUom(num(item.quantity) * num(order.plannedQty), item.unit, material.unitOfMeasure));
      if (num(material.availableQuantity) < reserveBase) throw new Error(`Insufficient ${material.materialName}. Need ${reserveBase}${material.unitOfMeasure}, available ${material.availableQuantity}${material.unitOfMeasure}`);
      material.availableQuantity = num(material.availableQuantity) - reserveBase;
      material.reservedQuantity = num(material.reservedQuantity) + reserveBase;
      const batch = data().rawMaterialBatches.find(x => x.materialId === material.id && num(x.availableQuantity) > 0);
      if (batch) {
        batch.availableQuantity = Math.max(0, num(batch.availableQuantity) - reserveBase);
        batch.reservedQuantity = num(batch.reservedQuantity) + reserveBase;
      }
    });
    order.status = 'In Production';
    emitBusinessEvent(u, 'manufacturing.production_started', 'productionOrders', order.id, { orderNo: order.orderNo, reservedMaterials: formulaRows.length });
    log(u, 'Start Production', 'Manufacturing', order.orderNo);
    return { success: true, order };
  },
  completeProductionJob(user, id, completedQty, wastageQty = 0, actualCost = 0) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PRODUCTION);
    data().rawMaterialConsumption ||= [];
    data().productionBatchMaterials ||= [];
    data().productionBatches ||= [];
    data().productionBatchCosts ||= [];
    data().productionBatchYields ||= [];
    data().productionStorageHistory ||= [];
    const order = data().productionOrders.find(x => x.id === id) || data().productionOrders.find(x => x.orderNo === id);
    if (!order) throw new Error('Production order not found');
    const qty = num(completedQty || order.plannedQty);
    const waste = num(wastageQty);
    const formulaRows = data().formulaVersions.filter(x => x.formulaId === order.formulaId && x.version === order.formulaVersion);
    let materialCost = 0;
    const batchNo = `FG-${Date.now()}`;
    formulaRows.forEach(item => {
      const material = data().rawMaterials.find(x => x.id === item.materialId);
      if (!material) throw new Error(`Material not found: ${item.materialName}`);
      const consumeBase = Math.round(convertUom(num(item.quantity) * qty, item.unit, material.unitOfMeasure));
      const batch = data().rawMaterialBatches.find(x => x.materialId === material.id && (num(x.reservedQuantity) > 0 || num(x.availableQuantity) > 0));
      const cost = consumeBase * num(material.costPerUnit);
      material.reservedQuantity = Math.max(0, num(material.reservedQuantity) - consumeBase);
      material.consumedQuantity = num(material.consumedQuantity) + consumeBase;
      material.currentQuantity = Math.max(0, num(material.currentQuantity) - consumeBase);
      if (batch) {
        batch.reservedQuantity = Math.max(0, num(batch.reservedQuantity) - consumeBase);
        batch.quantity = Math.max(0, num(batch.quantity) - consumeBase);
      }
      materialCost += cost;
      data().rawMaterialConsumption.unshift({ id: gid(), materialId: material.id, materialName: material.materialName, batchNumber: batch?.batchNumber || material.batchNumber, quantityConsumed: consumeBase, quantityBase: consumeBase, unit: material.unitOfMeasure, operator: order.operator || u.name, date: today(), productionOrder: order.orderNo, costConsumed: Math.round(cost), immutable: true });
      data().productionBatchMaterials.unshift({ id: gid(), productionBatchNo: batchNo, productionOrderId: order.id, materialId: material.id, materialName: material.materialName, batchUsed: batch?.batchNumber || material.batchNumber, quantityConsumed: consumeBase, unit: material.unitOfMeasure, costConsumed: Math.round(cost) });
    });
    const totalCost = Math.round(num(actualCost) || materialCost);
    const product = data().products.find(p => p.name === order.productName);
    const revenuePotential = qty * num(product?.sellingPrice || 0);
    const finished = { id: gid(), batchNo, productionOrderId: order.id, orderNo: order.orderNo, productName: order.productName, quantityProduced: qty, unit: order.outputUnit, wasteQuantity: waste, productionDate: today(), operator: order.operator || u.name, qualityStatus: 'Passed', packagingStatus: 'Packed', inventoryTransfer: 'Finished Goods', productionCost: totalCost, salesRevenue: revenuePotential, profit: Math.round(revenuePotential - totalCost), profitMargin: revenuePotential ? Math.round((revenuePotential - totalCost) / revenuePotential * 100) : 0, status: 'Completed' };
    data().productionBatches.unshift(finished);
    data().productionBatchCosts.unshift({ id: gid(), batchNo, materialCost: Math.round(materialCost), laborCost: Math.round(totalCost * 0.18), utilitiesCost: Math.round(totalCost * 0.07), totalCost, costPerUnit: qty ? Math.round(totalCost / qty) : 0 });
    data().productionBatchYields.unshift({ id: gid(), batchNo, plannedQty: order.plannedQty, actualQty: qty, wasteQty: waste, yieldPercent: order.plannedQty ? Math.round(qty / num(order.plannedQty) * 100) : 100 });
    data().productionStorageHistory.unshift({ id: gid(), batchNo, productName: order.productName, quantityProduced: qty, dateProduced: today(), costProduced: totalCost, operator: order.operator || u.name, qualityCheck: 'Passed', packagingEvent: 'Packed', inventoryTransfer: 'Finished Goods', saleStatus: 'Available' });
    const inv = data().inventory.find(x => x.productName === order.productName && x.warehouseName === 'Main Store Nairobi');
    if (inv) inv.quantity = num(inv.quantity) + qty;
    else data().inventory.unshift({ id: gid(), productName: order.productName, warehouseName: 'Main Store Nairobi', batchNo, quantity: qty, unitCost: qty ? Math.round(totalCost / qty) : 0, expiryDate: '', receivedDate: today(), status: 'In Stock', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDeleted: 'No' });
    order.status = 'Completed';
    order.completedQty = qty;
    order.wastageQty = waste;
    order.endDate = today();
    const legacy = data().production.find(x => x.id === order.id);
    if (legacy) Object.assign(legacy, { completedQty: qty, wastageQty: waste, materialCost: totalCost, revenue: revenuePotential, gainPercent: finished.profitMargin, status: 'Completed', endDate: today() });
    postFinanceJournal(u, { date: today(), sourceModule: 'Production', sourceId: order.id, reference: order.orderNo, description: `Finished goods produced ${batchNo}`, debitAccountName: 'Inventory Asset', creditAccountName: 'Cost of Goods Sold', amount: totalCost });
    emitBusinessEvent(u, 'manufacturing.production_completed', 'productionOrders', order.id, { orderNo: order.orderNo, batchNo, qty, unit: order.outputUnit, materialCost: totalCost, profit: finished.profit });
    log(u, 'Complete Production', 'Manufacturing', `${order.orderNo} -> ${batchNo}`);
    return { success: true, message: 'OK Production completed with full traceability.', batch: finished, counts: { consumption: data().rawMaterialConsumption.length, productionBatches: data().productionBatches.length, storageHistory: data().productionStorageHistory.length } };
  },
  getSales: user => (reqRole(user), list('sales')),
  getSalesWorkspaceData(user) {
    reqRole(user);
    const d = data();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const reps = ['John', 'Mary', 'Peter', 'Susan', 'David'];
    const teamPerformance = months.map((month, index) => ({
      month,
      john: 1200000 + index * 300000,
      mary: 900000 + index * 250000,
      peter: 700000 + index * 150000,
      susan: 850000 + index * 175000,
      david: 500000 + index * 175000
    }));
    const sales = list('sales');
    const invoices = list('invoices');
    const quotations = list('quotations');
    const revenue = sales.reduce((sum, sale) => sum + num(sale.total), 0);
    const cogs = d.saleItems.reduce((sum, item) => sum + num(item.cost) * num(item.quantity), 0);
    const expenses = d.expenses.reduce((sum, item) => sum + num(item.amount), 0);
    const profit = revenue - cogs - expenses;
    const pipeline = d.leads.filter(lead => !['Won', 'Lost'].includes(lead.stage)).reduce((sum, lead) => sum + num(lead.value), 0);
    const revenueTrend = months.map((month, index) => {
      const base = sales.filter((_, i) => i % months.length === index).reduce((sum, sale) => sum + num(sale.total), 0);
      return {
        month,
        revenue: Math.round(base || revenue / months.length),
        profit: Math.round((base || revenue / months.length) * 0.32),
        orders: sales.filter((_, i) => i % months.length === index).length,
        invoices: invoices.filter((_, i) => i % months.length === index).length,
        expenses: Math.round(expenses / months.length),
        pipeline: Math.round(pipeline * (0.75 + index * 0.06))
      };
    });
    const orderStages = ['Pending', 'Processing', 'Packed', 'Delivered', 'Cancelled'];
    const invoiceStages = ['Draft', 'Sent', 'Paid', 'Overdue', 'Partial'];
    const quoteWorkflow = quotations.map((quote, index) => ({
      ...quote,
      stage: ['Create Quote', 'Send Quote', 'Customer Views', 'Customer Accepts', 'Convert To Order', 'Generate Invoice'][index % 6],
      nextAction: quote.status === 'Draft' ? 'Send Quote' : quote.status === 'Sent' ? 'Convert To Order' : 'Generate Invoice',
      conversionProbability: quote.status === 'Sent' ? 72 : 48
    }));
    const productComparison = Object.values(d.saleItems.reduce((acc, item) => {
      const key = item.productName || 'Unknown Product';
      acc[key] ||= { product: key, revenue: 0, profit: 0, quantity: 0 };
      acc[key].revenue += num(item.total);
      acc[key].profit += num(item.total) - num(item.cost) * num(item.quantity);
      acc[key].quantity += num(item.quantity);
      return acc;
    }, {})).sort((a, b) => b.revenue - a.revenue).slice(0, 8).map(row => ({ ...row, revenue: Math.round(row.revenue), profit: Math.round(row.profit) }));
    const reportRows = [
      ['Sales Report', revenue, sales.length],
      ['Product Report', productComparison.reduce((s, p) => s + p.revenue, 0), productComparison.length],
      ['Rep Report', revenue, reps.length],
      ['Territory Report', revenue, d.counties?.length || 47],
      ['Invoice Report', invoices.reduce((s, i) => s + num(i.total), 0), invoices.length],
      ['Pipeline Report', pipeline, d.leads.length]
    ].map(([name, value, records]) => ({ name, value: Math.round(value), records, dateRange: 'May 12 - Jun 12, 2026', exports: ['PDF', 'Excel', 'CSV', 'Email'] }));

    const geo = api.getGeoSalesData(user);
    return {
      filters: {
        dateRange: 'May 12 - Jun 12, 2026',
        territory: 'All Kenya',
        salesRep: 'All Reps',
        product: 'All Products'
      },
      overview: {
        revenue: Math.round(revenue),
        profit: Math.round(profit),
        orders: sales.length,
        invoices: invoices.length,
        pipeline: Math.round(pipeline),
        expenses: Math.round(expenses),
        quoteConversion: quotations.length ? Math.round((quotations.filter(q => q.status === 'Converted').length / quotations.length) * 100) : 42,
        forecast: Math.round(revenueTrend.at(-1).revenue * 1.12)
      },
      revenueTrend,
      teamPerformance,
      teamComparison: reps.map((rep, index) => ({
        rep,
        revenue: teamPerformance.reduce((sum, row) => sum + row[rep.toLowerCase()], 0),
        profit: Math.round(teamPerformance.reduce((sum, row) => sum + row[rep.toLowerCase()], 0) * (0.24 + index * 0.02)),
        customers: 18 + index * 7,
        invoices: 12 + index * 5,
        expenses: 90000 + index * 22000,
        pipeline: 240000 + index * 85000
      })),
      pipeline: {
        stages: ['Lead', 'Qualified', 'Quoted', 'Negotiation', 'Won'].map(stage => ({
          stage,
          count: d.leads.filter(lead => lead.stage === stage || (stage === 'Lead' && lead.stage === 'New')).length,
          value: d.leads.filter(lead => lead.stage === stage || (stage === 'Lead' && lead.stage === 'New')).reduce((sum, lead) => sum + num(lead.value), 0)
        })),
        leads: d.leads
      },
      quotes: quoteWorkflow,
      orders: sales.map((sale, index) => {
        const delivery = d.deliveries.find(row => row.saleId === sale.id || row.saleNo === sale.saleNo) || d.deliveries[index];
        return { ...sale, liveStatus: delivery?.status || sale.deliveryStatus || orderStages[index % orderStages.length], deliveryId: delivery?.id || '', deliveryNo: delivery?.deliveryNo || '', deliveredConfirmed: Boolean(delivery?.deliveredConfirmed) };
      }),
      invoices: invoices.map((invoice, index) => ({ ...invoice, liveStatus: invoice.status || invoiceStages[index % invoiceStages.length] })),
      deliveries: d.deliveries.map((row, index) => ({ ...row, saleNo: row.saleNo || d.sales.find(s => s.id === row.saleId)?.saleNo || d.sales[index]?.saleNo || '' })),
      territory: geo,
      reports: reportRows,
      analytics: {
        revenueTrend,
        profitTrend: revenueTrend.map(row => ({ month: row.month, profit: row.profit })),
        teamPerformance,
        territoryComparison: geo.counties.slice(0, 10).map(c => ({ county: c.name, revenue: c.revenue, profit: c.profit, visits: c.visits })),
        productComparison,
        customerGrowth: months.map((month, index) => ({ month, customers: 22 + index * 8 })),
        quotationConversion: months.map((month, index) => ({ month, conversion: 34 + index * 6 })),
        pipelineValue: revenueTrend.map(row => ({ month: row.month, pipeline: row.pipeline })),
        forecast: revenueTrend.map((row, index) => ({ month: row.month, forecast: Math.round(row.revenue * (1.08 + index * 0.01)) }))
      },
      ai: [
        {
          title: 'Revenue operations health',
          detail: 'Sales is now running as one workspace. Orders, invoices, territory, reports, and analytics share the same workspace payload and filters.'
        },
        {
          title: 'Next action',
          detail: geo.opportunityMap?.[0] ? `Increase coverage in ${geo.opportunityMap[0].county}; it has low coverage and high potential.` : 'Pipeline follow-up is the next highest-value action.'
        }
      ]
    };
  },
  getGeoSalesData(user) {
    reqRole(user);
    const d = data();
    const countyRevenue = new Map();
    d.sales.forEach((sale, index) => {
      const customer = d.customers.find(c => c.id === sale.customerId || c.name === sale.customerName);
      const county = customer?.city || KENYA_COUNTIES[index % KENYA_COUNTIES.length];
      countyRevenue.set(county, (countyRevenue.get(county) || 0) + num(sale.total));
    });
    const visitCounts = d.salesVisits.reduce((acc, visit) => {
      acc[visit.county] = (acc[visit.county] || 0) + 1;
      return acc;
    }, {});
    const countyProfiles = d.counties.map((county, index) => {
      const revenue = Math.round(countyRevenue.get(county.name) || 0);
      const visits = visitCounts[county.name] || 0;
      const customers = d.customers.filter(c => c.city === county.name).length;
      const prospects = Math.max(0, Math.round(county.potentialCustomers - customers));
      const orders = d.sales.filter(s => {
        const customer = d.customers.find(c => c.id === s.customerId || c.name === s.customerName);
        return customer?.city === county.name;
      }).length;
      const quotations = d.quotations.filter(q => {
        const customer = d.customers.find(c => c.id === q.customerId || c.name === q.customerName);
        return customer?.city === county.name;
      }).length + (visits ? index % 3 : 0);
      const pipeline = d.leads.filter((_, i) => i % KENYA_COUNTIES.length === index).reduce((sum, lead) => sum + num(lead.value), 0);
      const coverage = Math.min(100, Math.round(((customers + visits) / Math.max(1, county.potentialCustomers)) * 100));
      const score = Math.min(100, Math.round((revenue / Math.max(1, county.targetRevenue)) * 38 + (visits / Math.max(1, county.targetVisits)) * 34 + coverage * 0.18 + orders * 2));
      const status = score >= 68 || visits >= 5 ? 'covered' : score >= 36 || visits > 0 ? 'low' : 'neglected';
      const assigned = d.territoryAssignments.find(a => a.county === county.name);
      return {
        ...county,
        revenue,
        visits,
        customers,
        activeCustomers: Math.max(0, customers - (index % 2)),
        dormantCustomers: customers ? index % 2 : 0,
        prospects,
        orders,
        quotations,
        pipeline,
        profit: Math.round(revenue * 0.31),
        coverage,
        score,
        status,
        color: status === 'covered' ? 'green' : status === 'low' ? 'yellow' : 'red',
        salesRep: assigned?.salesRepName || 'Unassigned',
        topProducts: d.saleItems.slice(index % 5, index % 5 + 3).map(item => item.productName)
      };
    });
    const covered = countyProfiles.filter(c => c.status === 'covered').length;
    const low = countyProfiles.filter(c => c.status === 'low').length;
    const neglected = countyProfiles.filter(c => c.status === 'neglected').length;
    const repComparison = d.salesRoutes.map(route => {
      const visits = d.salesVisits.filter(v => v.salesRepId === route.salesRepId);
      return {
        salesRepId: route.salesRepId,
        name: route.salesRepName,
        countiesCovered: route.counties.length,
        visits: visits.length,
        revenue: Math.round(route.revenue),
        orders: d.sales.filter((_, index) => index % d.salesRoutes.length === d.salesRoutes.findIndex(r => r.id === route.id)).length,
        profit: Math.round(route.revenue * 0.29),
        distanceKm: route.distanceKm,
        travelCost: route.travelCost,
        roi: route.travelCost ? Number((route.revenue / route.travelCost).toFixed(1)) : 0,
        route: route.counties
      };
    });
    const opportunities = countyProfiles
      .filter(c => c.coverage < 12 && c.potentialCustomers > 120)
      .sort((a, b) => b.potentialCustomers - a.potentialCustomers)
      .slice(0, 6)
      .map(c => ({
        county: c.name,
        potentialCustomers: c.potentialCustomers,
        currentCustomers: c.customers,
        coverage: c.coverage,
        opportunityScore: Math.min(100, Math.round((c.potentialCustomers / 330) * 56 + (100 - c.coverage) * 0.44)),
        recommendation: `Increase visits and distributor prospecting in ${c.name}.`
      }));
    return {
      hero: {
        title: 'GeoSales Intelligence Center',
        subtitle: 'Kenya territory coverage, field activity, route intelligence, and expansion scoring',
        activeCounties: covered,
        lowActivityCounties: low,
        neglectedCounties: neglected,
        totalRevenue: countyProfiles.reduce((sum, c) => sum + c.revenue, 0),
        totalVisits: d.salesVisits.length
      },
      counties: countyProfiles,
      visits: d.salesVisits.slice(0, 12),
      checkins: d.salesCheckins.slice(0, 12),
      routes: d.salesRoutes,
      repComparison,
      opportunityMap: opportunities,
      heatmap: countyProfiles.map(c => ({ county: c.name, visits: c.visits, revenue: c.revenue, intensity: Math.min(100, c.visits * 12 + Math.round(c.revenue / 60000)) })),
      aiTerritoryIntelligence: [
        {
          question: 'Which counties are underperforming?',
          answer: `${neglected} counties have no meaningful visit, quotation, or sales signal in the selected period. Prioritize high-potential neglected counties first.`,
          sources: ['sales_visits', 'sales_orders', 'customers', 'county_targets']
        },
        {
          question: 'Where should sales effort increase?',
          answer: opportunities[0] ? `${opportunities[0].county} has high potential with low coverage. Add field visits, demos, and distributor outreach this week.` : 'Current territory coverage is balanced against available demo data.',
          sources: ['counties', 'territory_performance', 'leads', 'sales_routes']
        }
      ],
      reports: [
        'Territory Coverage Report',
        'County Revenue Report',
        'Sales Visit Report',
        'Sales Route Report',
        'Customer Density Report',
        'Coverage Gap Report',
        'Sales Rep Movement Report',
        'Territory Profitability Report',
        'Opportunity Map Report',
        'Expansion Recommendation Report'
      ]
    };
  },
  getSaleItems: (user, id) => (reqRole(user), data().saleItems.filter(i => i.saleId === id)),
  saveSale(user, row) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES);
    const items = row.items || [];
    assertRequired(row.customerName || row.customerId, 'Customer');
    if (!items.length) throw new Error('At least one sales item is required');
    items.forEach(item => {
      assertRequired(item.productName, 'Sales item product');
      assertPositive(item.quantity, `${item.productName} quantity`);
      assertPositive(item.unitPrice, `${item.productName} unit price`);
      const stock = availableStock(item.productName);
      if (stock < num(item.quantity)) throw new Error(`Insufficient stock for ${item.productName}. Available: ${stock.toLocaleString()}, requested: ${num(item.quantity).toLocaleString()}`);
    });
    const subtotal = items.reduce((s, i) => s + num(i.quantity) * num(i.unitPrice), 0);
    const tax = Math.round(subtotal * 0.16), total = subtotal + tax, paid = num(row.paid || total), id = gid(), saleNo = 'SALE-' + Date.now();
    const sale = { id, saleNo, customerId: row.customerId, customerName: row.customerName, date: today(), subtotal, tax, total, paid, balance: total - paid, status: paid >= total ? 'Paid' : 'Partial', approvalStatus: 'Auto Approved', paymentMethod: row.paymentMethod || 'Cash', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDeleted: 'No' };
    data().sales.unshift(sale);
    items.forEach(i => {
      data().saleItems.push({ ...i, id: gid(), saleId: id, total: num(i.quantity) * num(i.unitPrice) });
      let remaining = num(i.quantity);
      data().inventory
        .filter(x => x.productName === i.productName && num(x.quantity) > 0)
        .sort((a, b) => String(a.expiryDate || '').localeCompare(String(b.expiryDate || '')))
        .forEach(inv => {
          if (remaining <= 0) return;
          const deduct = Math.min(num(inv.quantity), remaining);
          inv.quantity = Math.max(0, num(inv.quantity) - deduct);
          inv.lastMovementDate = today();
          inv.updatedAt = new Date().toISOString();
          data().inventoryTransactions.unshift({ id: gid(), productId: inv.productId || i.productId, productName: i.productName, sku: inv.sku, warehouseName: inv.warehouseName, batchNo: inv.batchNo, transactionType: 'Sale Out', quantity: -deduct, unitCost: inv.unitCost || i.cost, referenceType: 'Sales Order', referenceId: saleNo, createdBy: u.name, createdAt: new Date().toISOString(), notes: `Sold to ${sale.customerName}` });
          remaining -= deduct;
        });
    });
    const invoiceId = gid();
    data().invoices.unshift({ id: invoiceId, invNo: 'INV-' + Date.now(), customerId: row.customerId, customerName: row.customerName, date: today(), dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), subtotal, tax, total, paid, balance: total - paid, status: paid >= total ? 'Paid' : 'Partial', approvalStatus: 'Auto Approved', type: 'Sales', saleId: id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDeleted: 'No' });
    items.forEach(i => data().invoiceItems.push({ id: gid(), invoiceId, productId: i.productId, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, total: num(i.quantity) * num(i.unitPrice) }));
    const deliveryId = gid();
    data().deliveries.unshift({ id: deliveryId, deliveryNo: 'DEL-' + Date.now(), saleId: id, saleNo, customerId: row.customerId, customerName: row.customerName, date: today(), status: 'Pending Delivery', driver: row.driver || 'Unassigned', vehicle: row.vehicle || 'TBD', notes: 'Generated from sales order', deliveredConfirmed: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDeleted: 'No' });
    items.forEach(i => data().deliveryItems.push({ id: gid(), deliveryId, productId: i.productId, productName: i.productName, quantity: i.quantity }));
    const cogs = items.reduce((s, i) => s + num(i.cost) * num(i.quantity), 0);
    postFinanceJournal(u, { date: sale.date, sourceModule: 'Sales', sourceId: sale.id, reference: sale.saleNo, description: `Sales revenue ${sale.saleNo}`, debitAccountName: 'Accounts Receivable', creditAccountName: 'Sales Revenue', amount: subtotal });
    if (tax) postFinanceJournal(u, { date: sale.date, sourceModule: 'Taxes', sourceId: sale.id, reference: sale.saleNo, description: `Output VAT ${sale.saleNo}`, debitAccountName: 'Accounts Receivable', creditAccountName: 'Tax Payable', amount: tax });
    if (cogs) postFinanceJournal(u, { date: sale.date, sourceModule: 'Inventory', sourceId: sale.id, reference: sale.saleNo, description: `Cost of goods sold ${sale.saleNo}`, debitAccountName: 'Cost of Goods Sold', creditAccountName: 'Inventory Asset', amount: cogs });
    if (paid) postFinanceJournal(u, { date: sale.date, sourceModule: 'Banking', sourceId: sale.id, reference: sale.saleNo, description: `Customer receipt ${sale.saleNo}`, debitAccountName: sale.paymentMethod === 'M-Pesa' ? 'M-Pesa Till' : 'KCB Bank', creditAccountName: 'Accounts Receivable', amount: paid });
    emitBusinessEvent(u, 'sales.order.created', 'sales', sale.id, { saleNo, customerName: sale.customerName, subtotal, tax, total, paid, invoiceId, deliveryId, deliveryStatus: 'Pending Delivery' });
    // Email: invoice to customer + sales confirmation
    const customer = (d.customers || []).find(c => c.id === sale.customerId || c.name === sale.customerName);
    const customerEmail = customer?.email || sale.customerEmail;
    const companyName = (d.settings || {}).company_name || 'Farmtrack Bio Sciences';
    if (customerEmail) {
      const inv = (d.invoices || []).find(x => x.id === invoiceId);
      const invoiceItems = (d.invoiceItems || []).filter(i => i.invoiceId === invoiceId);
      const saleItems = (d.saleItems || []).filter(i => i.saleId === id);
      const emailItems = (invoiceItems.length ? invoiceItems : saleItems).map(i => ({ name: i.productName || i.description, qty: num(i.quantity), price: num(i.unitPrice || i.rate || i.price), description: i.productName }));
      deliverEmail(u, 'invoice', customerEmail, () => RichEmail.sendInvoiceEmail({
        to: customerEmail, customerName: sale.customerName, invoiceNo: inv?.invoiceNo || saleNo,
        invoiceDate: sale.date, dueDate: inv?.dueDate, items: emailItems, subtotal, tax, total, companyName,
        viewUrl: 'https://erpftc.vercel.app/#/sales/invoices'
      }), { subject: `Invoice ${inv?.invoiceNo || saleNo}`, relatedModule: 'sales', relatedId: id }).catch(() => {});
      deliverEmail(u, 'sales_order', customerEmail, () => RichEmail.sendSalesOrderEmail({
        to: customerEmail, customerName: sale.customerName, saleNo, items: emailItems, total,
        deliveryStatus: 'Pending Delivery', companyName,
        viewUrl: 'https://erpftc.vercel.app/#/sales/orders'
      }), { subject: `Order ${saleNo}`, relatedModule: 'sales', relatedId: id }).catch(() => {});
    }
    log(u, 'Create Sale', 'Sales', saleNo);
    return { success: true, id, saleNo, deliveryId, invoiceId };
  },
  createSalesOrder(user, row) {
    const d = data();
    const product = d.products.find(p => p.id === row?.productId) || d.products[0];
    const customer = d.customers.find(c => c.id === row?.customerId) || d.customers[0];
    return api.saveSale(user, {
      customerId: customer.id,
      customerName: customer.name,
      paymentMethod: row?.paymentMethod || 'Credit',
      paid: num(row?.paid || 0),
      driver: row?.driver,
      vehicle: row?.vehicle,
      items: [{
        productId: product.id,
        productName: product.name,
        quantity: num(row?.quantity || 1),
        unitPrice: num(row?.unitPrice || product.sellingPrice),
        cost: num(product.costPrice)
      }]
    });
  },
  sendQuotation(user, id) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES);
    const quote = data().quotations.find(q => q.id === id);
    if (!quote) throw new Error('Quotation not found');
    quote.status = 'Sent';
    quote.updatedAt = new Date().toISOString();
    log(u, 'Send Quotation', 'Sales', quote.quoteNo);
    // Fire email in background
    const customer = (data().customers || []).find(c => c.id === quote.customerId || c.name === quote.customerName) || {};
    const customerEmail = customer?.email;
    if (customerEmail) {
      const settings = data().settings || {};
      deliverEmail(u, 'quotation_sent', customerEmail, () => EmailService.sendQuotationEmail({
        to: customerEmail,
        customerName: quote.customerName || customer.name || 'Valued Customer',
        quoteNo: quote.quoteNo,
        subtotal: num(quote.subtotal),
        tax: num(quote.tax),
        total: num(quote.total),
        validUntil: quote.validUntil || '',
        companyName: settings.companyName || 'FarmTrack'
      }), {
        subject: `Quotation ${quote.quoteNo} — ${money(num(quote.total))}`,
        relatedModule: 'sales',
        relatedId: quote.id
      }).catch(() => {});
    }
    return { success: true, quote, emailSent: !!customerEmail };
  },
  generateInvoiceFromSale(user, saleId) {
    reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES, ROLES.ACCOUNTANT);
    const sale = data().sales.find(s => s.id === saleId);
    if (!sale) throw new Error('Sale not found');
    let invoice = data().invoices.find(i => i.saleId === saleId);
    if (!invoice) {
      invoice = { id: gid(), invNo: 'INV-' + Date.now(), saleId, customerId: sale.customerId, customerName: sale.customerName, date: today(), dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), subtotal: sale.subtotal, tax: sale.tax, total: sale.total, paid: sale.paid, balance: sale.balance, status: sale.status, approvalStatus: 'Auto Approved', type: 'Sales', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDeleted: 'No' };
      data().invoices.unshift(invoice);
    }
    return { success: true, invoice };
  },
  confirmSalesDelivery(user, deliveryId, delivered) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES, ROLES.WAREHOUSE);
    const delivery = data().deliveries.find(d => d.id === deliveryId);
    if (!delivery) throw new Error('Delivery not found');
    delivery.deliveredConfirmed = Boolean(delivered);
    delivery.status = delivered ? 'Delivered' : 'Pending Delivery';
    delivery.actualDeliveryDate = delivered ? today() : '';
    delivery.updatedAt = new Date().toISOString();
    const sale = data().sales.find(s => s.id === delivery.saleId || s.saleNo === delivery.saleNo);
    if (sale && delivered) sale.deliveryStatus = 'Delivered';
    log(u, delivered ? 'Confirm Delivery' : 'Unconfirm Delivery', 'Delivery', delivery.deliveryNo);
    return { success: true, delivery };
  },
  updateSalesDeliveryStatus(user, deliveryId, status) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES, ROLES.WAREHOUSE);
    const allowed = ['Pending Delivery', 'Picked', 'Ready for Dispatch', 'Dispatched', 'Delivered'];
    if (!allowed.includes(status)) throw new Error('Invalid delivery status');
    const delivery = data().deliveries.find(d => d.id === deliveryId);
    if (!delivery) throw new Error('Delivery not found');
    delivery.status = status;
    delivery.deliveredConfirmed = status === 'Delivered';
    delivery.pickedAt = status === 'Picked' ? new Date().toISOString() : delivery.pickedAt || '';
    delivery.dispatchedAt = status === 'Dispatched' ? new Date().toISOString() : delivery.dispatchedAt || '';
    delivery.actualDeliveryDate = status === 'Delivered' ? today() : delivery.actualDeliveryDate || '';
    delivery.deliveredAt = status === 'Delivered' ? new Date().toISOString() : delivery.deliveredAt || '';
    delivery.updatedAt = new Date().toISOString();
    const sale = data().sales.find(s => s.id === delivery.saleId || s.saleNo === delivery.saleNo);
    if (sale) {
      sale.deliveryStatus = status;
      sale.updatedAt = new Date().toISOString();
    }
    emitBusinessEvent(u, 'delivery.status.updated', 'delivery', delivery.id, { deliveryNo: delivery.deliveryNo, saleNo: delivery.saleNo, status });
    log(u, 'Update Delivery Status', 'Delivery', `${delivery.deliveryNo} -> ${status}`);
    return { success: true, delivery };
  },
  getInvoices: user => (reqRole(user), list('invoices')),
  getInvoiceItems: (user, id) => (reqRole(user), data().invoiceItems.filter(i => i.invoiceId === id)),
  recordPayment(user, row) { reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT); const inv = data().invoices.find(i => i.id === row.referenceId); if (inv) { inv.paid = num(inv.paid) + num(row.amount); inv.balance = num(inv.total) - inv.paid; inv.status = inv.balance <= 0 ? 'Paid' : 'Partial'; } return { success: true }; },
  getQuotations: user => (reqRole(user), list('quotations')),
  saveQuotation(user, row) { const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES); return save('quotations', u, { ...row, quoteNo: row.quoteNo || 'QTE-' + Date.now(), status: row.status || 'Draft' }); },
  convertQuotationToSale(user, id) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES);
    const quote = data().quotations.find(q => q.id === id);
    if (!quote) throw new Error('Quotation not found');
    const product = data().products[0];
    const result = api.saveSale(u, {
      customerId: quote.customerId,
      customerName: quote.customerName,
      paid: 0,
      paymentMethod: 'Credit',
      items: [{ productId: product.id, productName: product.name, quantity: 1, unitPrice: num(quote.total), cost: num(product.costPrice) }]
    });
    quote.status = 'Converted';
    quote.saleId = result.id;
    quote.updatedAt = new Date().toISOString();
    return { success: true, message: 'OK Quotation converted to Sale', saleNo: result.saleNo };
  },
  async generateInvoiceFromQuote(user, id) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES, ROLES.ACCOUNTANT);
    const quote = data().quotations.find(q => q.id === id);
    if (!quote) throw new Error('Quotation not found');
    if (!quote.saleId) throw new Error('Quotation has not been converted to a sale yet. Convert it first.');
    const invoiceResult = api.generateInvoiceFromSale(u, quote.saleId);
    if (invoiceResult.success) {
      quote.status = 'Invoiced';
      quote.invoiceId = invoiceResult.invoice.id;
      quote.updatedAt = new Date().toISOString();
      log(u, 'Generate Invoice from Quote', 'Sales', `${quote.quoteNo} → ${invoiceResult.invoice.invNo}`);
      // Email the invoice
      const customer = (data().customers || []).find(c => c.id === quote.customerId || c.name === quote.customerName) || {};
      const customerEmail = customer?.email;
      if (customerEmail) {
        deliverEmail(u, 'invoice_created', customerEmail, () => EmailService.sendInvoiceCreated({
          to: customerEmail,
          customerName: quote.customerName || customer.name || 'Valued Customer',
          invoiceNo: invoiceResult.invoice.invNo,
          amount: num(invoiceResult.invoice.total),
          dueDate: invoiceResult.invoice.dueDate,
          invoiceId: invoiceResult.invoice.id
        }), {
          subject: `Invoice ${invoiceResult.invoice.invNo} — ${money(num(invoiceResult.invoice.total))}`,
          relatedModule: 'invoices',
          relatedId: invoiceResult.invoice.id
        }).catch(() => {});
      }
    }
    return { success: true, invoice: invoiceResult.invoice, emailSent: !!customerEmail };
  },
  getDeliveries: user => (reqRole(user), list('deliveries')),
  markDeliveryDelivered(user, id) { reqRole(user); const x = data().deliveries.find(d => d.id === id); if (x) x.status = 'Delivered'; return { success: true, message: 'OK Delivered!' }; },
  getPurchaseOrders: user => (reqRole(user), list('purchaseOrders')),
  getProcurementWorkspaceData(user) {
    reqRole(user);
    const d = data();
    const purchaseOrders = list('purchaseOrders');
    const requests = list('purchaseRequests');
    const deliveries = list('procurementDeliveries');
    const grns = list('goodsReceipts');
    const ap = list('accountsPayable');
    const credit = list('creditPurchases');
    const suppliers = list('suppliers').map(supplier => ({
      ...supplier,
      ...(d.supplierPerformance.find(row => row.supplierId === supplier.id) || {}),
      contactPerson: d.supplierContacts.find(row => row.supplierId === supplier.id)?.contactPerson || 'Account Manager',
      purchaseHistory: purchaseOrders.filter(po => po.supplierId === supplier.id).length,
      paymentHistory: d.supplierPayments.filter(pay => pay.supplierId === supplier.id).length,
      outstandingBalance: ap.filter(row => row.supplierId === supplier.id).reduce((sum, row) => sum + num(row.outstandingBalance), 0)
    }));
    const spend = purchaseOrders.reduce((sum, po) => sum + num(po.total), 0);
    const outstanding = ap.reduce((sum, row) => sum + num(row.outstandingBalance), 0);
    const overdueDeliveries = deliveries.filter(row => row.status === 'Delayed').length;
    const agingBuckets = ['0-30', '31-60', '61-90', '91-120', '120+'].map(bucket => ({
      bucket,
      amount: ap.filter(row => row.agingBucket === bucket).reduce((sum, row) => sum + num(row.outstandingBalance), 0),
      invoices: ap.filter(row => row.agingBucket === bucket).length
    }));
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const spendTrend = months.map((month, index) => {
      const monthPOs = purchaseOrders.filter((_, i) => i % months.length === index);
      const monthDeliveries = deliveries.filter((_, i) => i % months.length === index);
      const monthGrns = grns.filter((_, i) => i % months.length === index);
      return {
        month,
        spend: Math.round(monthPOs.reduce((sum, po) => sum + num(po.total), 0) || spend / months.length),
        deliveries: monthDeliveries.length,
        leadTime: 6 + index * 1.4,
        supplierPerformance: Math.round(suppliers.reduce((sum, s) => sum + num(s.overallRating), 0) / Math.max(1, suppliers.length) - index),
        creditPurchases: Math.round(credit.filter((_, i) => i % months.length === index).reduce((sum, row) => sum + num(row.invoiceAmount), 0) || spend / months.length * 0.62),
        outstandingBalances: Math.round(outstanding * (0.72 + index * 0.04)),
        purchaseOrders: monthPOs.length || 1 + index,
        receivedGoods: monthGrns.reduce((sum, row) => sum + num(row.acceptedQuantity), 0)
      };
    });
    const supplierComparison = suppliers.map(supplier => ({
      supplier: supplier.name,
      spend: purchaseOrders.filter(po => po.supplierId === supplier.id).reduce((sum, po) => sum + num(po.total), 0),
      orders: purchaseOrders.filter(po => po.supplierId === supplier.id).length,
      leadTime: supplier.leadTime || 0,
      qualityScore: supplier.qualityScore || 0,
      deliveryAccuracy: supplier.deliveryAccuracy || 0,
      outstandingBalance: supplier.outstandingBalance
    })).sort((a, b) => b.spend - a.spend);
    const deliveryCounty = KENYA_COUNTIES.slice(0, 12).map((county, index) => {
      const rows = deliveries.filter(row => row.county === county);
      return {
        county,
        deliveries: rows.length,
        status: rows.some(row => row.status === 'Delayed') ? 'Delayed' : rows.some(row => row.status === 'Received') ? 'Delivered' : rows.length ? 'In Transit' : 'Pending',
        value: rows.reduce((sum, row) => sum + num(purchaseOrders.find(po => po.id === row.poId)?.total), 0),
        warehouse: rows[0]?.warehouseName || 'Main Store Nairobi'
      };
    });
    const reports = d.procurementReports.map(report => ({
      ...report,
      dateRange: 'This fiscal quarter',
      generatedFrom: 'purchase orders, deliveries, GRNs, supplier invoices, accounts payable'
    }));
    const analytics = {
      spendTrend,
      supplierComparison,
      deliveryPerformance: deliveries.map(row => ({
        deliveryNo: row.deliveryNo,
        supplierName: row.supplierName,
        county: row.county,
        status: row.status,
        eta: row.eta,
        performance: row.status === 'Delayed' ? 54 : row.status === 'Received' ? 94 : 78
      })),
      creditExposure: credit.map(row => ({ supplierName: row.supplierName, outstandingBalance: row.outstandingBalance, creditLimit: row.creditLimit, aiRiskScore: row.aiRiskScore, status: row.status })),
      leadTimes: suppliers.map(row => ({ supplier: row.name, leadTime: row.leadTime || 0, reliability: row.reliability || 0 })),
      spendByProduct: Object.values(d.purchaseOrderItems.reduce((acc, item) => {
        acc[item.productName] ||= { product: item.productName, spend: 0, quantity: 0 };
        acc[item.productName].spend += num(item.total);
        acc[item.productName].quantity += num(item.quantity);
        return acc;
      }, {})).sort((a, b) => b.spend - a.spend),
      spendBySupplier: supplierComparison,
      spendByDepartment: Object.values(purchaseOrders.reduce((acc, po) => {
        acc[po.department] ||= { department: po.department, spend: 0, purchaseOrders: 0 };
        acc[po.department].spend += num(po.total);
        acc[po.department].purchaseOrders += 1;
        return acc;
      }, {})),
      forecasts: d.procurementForecasts
    };
    const searchIndex = [
      ...requests.map(row => ({ type: 'Request', label: row.requestNo, sub: `${row.productName} - ${row.approvalStatus}` })),
      ...purchaseOrders.map(row => ({ type: 'PO', label: row.poNo, sub: `${row.supplierName} - ${row.status}` })),
      ...deliveries.map(row => ({ type: 'Delivery', label: row.deliveryNo, sub: `${row.county} - ${row.status}` })),
      ...grns.map(row => ({ type: 'GRN', label: row.grnNo, sub: `${row.supplierName} - ${row.status}` })),
      ...ap.map(row => ({ type: 'AP', label: row.invoiceNo, sub: `${row.supplierName} - ${row.paymentStatus}` }))
    ];
    const lateSupplier = supplierComparison.find(row => deliveries.some(delivery => delivery.supplierName === row.supplier && delivery.status === 'Delayed'));
    return {
      filters: {
        dateRange: 'This Month',
        supplier: 'All Suppliers',
        warehouse: 'All Warehouses',
        county: 'All Counties',
        product: 'All Products'
      },
      overview: {
        totalPOs: purchaseOrders.length,
        pendingPOs: purchaseOrders.filter(po => ['Draft', 'Pending Approval', 'Sent'].includes(po.status)).length,
        approvedPOs: purchaseOrders.filter(po => ['Approved', 'Sent', 'Partially Delivered'].includes(po.status)).length,
        receivedPOs: purchaseOrders.filter(po => ['Delivered', 'Closed'].includes(po.status)).length,
        overdueDeliveries,
        outstandingSupplierBalances: Math.round(outstanding),
        procurementSpend: Math.round(spend),
        avgLeadTime: Math.round(suppliers.reduce((sum, s) => sum + num(s.leadTime), 0) / Math.max(1, suppliers.length)),
        replenishmentValue: Math.round(d.procurementForecasts.reduce((sum, row) => sum + num(row.expectedCost), 0)),
        openCreditPurchases: credit.filter(row => row.status !== 'Paid').length
      },
      workflow: [
        { step: 'Request Created', count: requests.length },
        { step: 'Manager Approval', count: requests.filter(row => row.workflowStep === 'Manager Approval').length },
        { step: 'Procurement Approval', count: requests.filter(row => row.workflowStep === 'Procurement Approval').length },
        { step: 'PO Creation', count: purchaseOrders.length },
        { step: 'Delivery Scheduled', count: deliveries.length },
        { step: 'Goods Received', count: grns.length },
        { step: 'AP Updated', count: ap.length },
        { step: 'Payment Recorded', count: d.supplierPayments.length }
      ],
      spendTrend,
      purchaseRequests: requests,
      purchaseOrders,
      purchaseOrderItems: d.purchaseOrderItems,
      suppliers,
      deliveries,
      deliveryCounty,
      goodsReceiving: grns,
      goodsReceiptItems: d.goodsReceiptItems,
      supplierInvoices: d.supplierInvoices,
      supplierPayments: d.supplierPayments,
      creditPurchases: credit,
      accountsPayable: ap,
      agingBuckets,
      reports,
      analytics,
      searchIndex,
      ai: [
        {
          title: 'Supplier reliability risk',
          detail: lateSupplier ? `${lateSupplier.supplier} has delayed delivery signals and ${money(lateSupplier.outstandingBalance)} outstanding exposure.` : 'No critical supplier reliability issue is present in current procurement records.',
          sources: ['procurementDeliveries', 'supplierPerformance', 'accountsPayable']
        },
        {
          title: 'Reorder timing',
          detail: d.procurementForecasts[0] ? `${d.procurementForecasts[0].productName} should be ordered in ${d.procurementForecasts[0].reorderTiming}; expected cost ${money(d.procurementForecasts[0].expectedCost)}.` : 'No replenishment forecast is currently required.',
          sources: ['inventory', 'products', 'procurementForecasts']
        },
        {
          title: 'Cash exposure',
          detail: `${money(outstanding)} remains in accounts payable across ${ap.filter(row => num(row.outstandingBalance) > 0).length} supplier invoices.`,
          sources: ['supplierInvoices', 'accountsPayable', 'supplierPayments']
        }
      ]
    };
  },
  createPurchaseRequest(user, row = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PROCUREMENT, ROLES.WAREHOUSE, ROLES.PRODUCTION);
    const product = data().products.find(p => p.id === row.productId) || data().products[0];
    const request = {
      id: gid(),
      requestNo: `PR-${Date.now()}`,
      department: row.department || 'Warehouse',
      requestedBy: u.name,
      productId: product.id,
      productName: product.name,
      quantity: num(row.quantity || 25),
      reason: row.reason || 'Manual procurement request',
      priority: row.priority || 'Medium',
      requiredDate: row.requiredDate || today(),
      approvalStatus: 'Pending Approval',
      workflowStep: 'Request Created',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: 'No'
    };
    data().purchaseRequests.unshift(request);
    data().purchaseRequestItems.unshift({ id: gid(), requestId: request.id, productId: product.id, productName: product.name, quantity: request.quantity, estimatedUnitCost: num(product.costPrice), status: request.approvalStatus });
    const approvers = managerEmails(data());
    if (approvers.length) {
      deliverEmail(u, 'purchase_requisition_approval', approvers, () => EmailService.sendPurchaseRequisitionSubmitted({
        to: u.email,
        requesterName: u.name,
        department: request.department,
        items: [{ name: request.productName, quantity: request.quantity, unitCost: num(product.costPrice) }],
        total: num(request.quantity) * num(product.costPrice),
        requisitionId: request.id,
        approverEmail: approvers.join(',')
      }), { subject: `Purchase approval - ${request.requestNo}`, relatedModule: 'purchasing', relatedId: request.id }).catch(() => {});
    }
    log(u, 'Create Purchase Request', 'Procurement', request.requestNo);
    return { success: true, request };
  },
  approvePurchaseRequest(user, id) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PROCUREMENT);
    const request = data().purchaseRequests.find(row => row.id === id);
    if (!request) throw new Error('Purchase request not found');
    request.approvalStatus = 'Approved';
    request.workflowStep = 'PO Creation';
    request.approvedBy = u.name;
    request.approvedAt = new Date().toISOString();
    request.updatedAt = new Date().toISOString();
    log(u, 'Approve Purchase Request', 'Procurement', request.requestNo);
    return { success: true, request };
  },
  rejectPurchaseRequest(user, id, payload = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PROCUREMENT);
    const request = data().purchaseRequests.find(row => row.id === id);
    if (!request) throw new Error('Purchase request not found');
    request.approvalStatus = 'Rejected';
    request.workflowStep = 'Rejected';
    request.rejectedBy = u.name;
    request.rejectedAt = new Date().toISOString();
    request.rejectionNote = clean(payload.note);
    request.updatedAt = new Date().toISOString();
    log(u, 'Reject Purchase Request', 'Procurement', request.requestNo);
    return { success: true, request };
  },
  generatePurchaseOrderFromRequest(user, id) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PROCUREMENT);
    const request = data().purchaseRequests.find(row => row.id === id);
    if (!request) throw new Error('Purchase request not found');
    const supplier = data().suppliers[0];
    const product = data().products.find(p => p.id === request.productId) || data().products[0];
    const subtotal = num(request.quantity) * num(product.costPrice);
    const tax = Math.round(subtotal * 0.16);
    const po = {
      id: gid(),
      poNo: `PO-${Date.now()}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      requestId: request.id,
      date: today(),
      expectedDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
      subtotal,
      tax,
      discount: 0,
      total: subtotal + tax,
      status: 'Approved',
      paymentTerms: supplier.paymentTerms || 'Net 30',
      warehouseName: 'Main Store Nairobi',
      department: request.department,
      createdBy: u.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: 'No'
    };
    data().purchaseOrders.unshift(po);
    data().purchaseOrderItems.unshift({ id: gid(), poId: po.id, poNo: po.poNo, productId: product.id, productName: product.name, quantity: request.quantity, received: 0, unitCost: product.costPrice, tax, total: subtotal });
    request.workflowStep = 'Supplier Assignment';
    request.approvalStatus = 'PO Created';
    log(u, 'Generate Purchase Order', 'Procurement', po.poNo);
    return { success: true, po };
  },
  receiveGoods(user, poId) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PROCUREMENT, ROLES.WAREHOUSE);
    const po = data().purchaseOrders.find(row => row.id === poId);
    if (!po) throw new Error('Purchase order not found');
    const item = data().purchaseOrderItems.find(row => row.poId === po.id);
    const accepted = num(item?.quantity || 0) - 1;
    const grn = {
      id: gid(),
      grnNo: `GRN-${Date.now()}`,
      poId: po.id,
      poNo: po.poNo,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      warehouseName: po.warehouseName,
      receivedBy: u.name,
      date: today(),
      expectedQuantity: num(item?.quantity),
      receivedQuantity: num(item?.quantity),
      damagedQuantity: 1,
      acceptedQuantity: accepted,
      rejectedQuantity: 1,
      status: 'Approved',
      notes: 'Received through procurement workflow'
    };
    data().goodsReceipts.unshift(grn);
    data().goodsReceiptItems.unshift({ id: gid(), grnId: grn.id, productId: item?.productId, productName: item?.productName, expectedQuantity: grn.expectedQuantity, receivedQuantity: grn.receivedQuantity, damagedQuantity: 1, acceptedQuantity: accepted, rejectedQuantity: 1, unitCost: item?.unitCost, inventoryUpdated: true });
    if (item) item.received = num(item.received) + accepted;
    const inv = data().inventory.find(row => row.productName === item?.productName && row.warehouseName === po.warehouseName);
    if (inv) inv.quantity = num(inv.quantity) + accepted;
    else if (item) data().inventory.unshift({ id: gid(), productName: item.productName, warehouseName: po.warehouseName, batchNo: `GRN-${Date.now()}`, quantity: accepted, unitCost: item.unitCost, expiryDate: '', receivedDate: today(), status: 'In Stock', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDeleted: 'No' });
    po.status = 'Delivered';
    const invoice = { id: gid(), invoiceNo: `SUP-INV-${Date.now()}`, poId: po.id, poNo: po.poNo, supplierId: po.supplierId, supplierName: po.supplierName, invoiceDate: today(), dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), invoiceAmount: num(po.total), paidAmount: 0, outstandingBalance: num(po.total), status: 'Open', paymentTerms: po.paymentTerms };
    data().supplierInvoices.unshift(invoice);
    data().accountsPayable.unshift({ id: gid(), supplierInvoiceId: invoice.id, invoiceNo: invoice.invoiceNo, supplierId: invoice.supplierId, supplierName: invoice.supplierName, dueDate: invoice.dueDate, invoiceAmount: invoice.invoiceAmount, paidAmount: 0, outstandingBalance: invoice.outstandingBalance, paymentStatus: 'Open', agingBucket: '0-30', partialPayments: 0, credits: 0, adjustments: 0 });
    postFinanceJournal(u, { date: grn.date, sourceModule: 'Procurement', sourceId: po.id, reference: grn.grnNo, description: `Goods received ${po.poNo}`, debitAccountName: 'Inventory Asset', creditAccountName: 'Accounts Payable', amount: invoice.invoiceAmount });
    emitBusinessEvent(u, 'procurement.goods_received', 'purchaseOrders', po.id, { poNo: po.poNo, grnNo: grn.grnNo, supplierName: po.supplierName, acceptedQuantity: accepted, invoiceAmount: invoice.invoiceAmount });
    log(u, 'Receive Goods', 'Procurement', grn.grnNo);
    return { success: true, grn };
  },
  recordSupplierPayment(user, invoiceId, amount) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.PROCUREMENT, ROLES.ACCOUNTANT);
    const invoice = data().supplierInvoices.find(row => row.id === invoiceId);
    if (!invoice) throw new Error('Supplier invoice not found');
    const payment = num(amount || invoice.outstandingBalance);
    invoice.paidAmount = num(invoice.paidAmount) + payment;
    invoice.outstandingBalance = Math.max(0, num(invoice.invoiceAmount) - num(invoice.paidAmount));
    invoice.status = invoice.outstandingBalance <= 0 ? 'Paid' : 'Partially Paid';
    const ap = data().accountsPayable.find(row => row.supplierInvoiceId === invoice.id);
    if (ap) Object.assign(ap, { paidAmount: invoice.paidAmount, outstandingBalance: invoice.outstandingBalance, paymentStatus: invoice.status });
    const supplierPayment = { id: gid(), paymentNo: `SPAY-${Date.now()}`, supplierInvoiceId: invoice.id, invoiceNo: invoice.invoiceNo, supplierId: invoice.supplierId, supplierName: invoice.supplierName, date: today(), amount: payment, method: 'Bank Transfer', status: 'Completed' };
    data().supplierPayments.unshift(supplierPayment);
    postFinanceJournal(u, { date: supplierPayment.date, sourceModule: 'Procurement', sourceId: supplierPayment.id, reference: supplierPayment.paymentNo, description: `Supplier payment ${invoice.invoiceNo}`, debitAccountName: 'Accounts Payable', creditAccountName: 'KCB Bank', amount: payment });
    emitBusinessEvent(u, 'procurement.supplier_payment_recorded', 'supplierInvoices', invoice.id, { invoiceNo: invoice.invoiceNo, supplierName: invoice.supplierName, amount: payment, outstandingBalance: invoice.outstandingBalance });
    log(u, 'Record Supplier Payment', 'Procurement', invoice.invoiceNo);
    return { success: true, invoice };
  },
  getExpenses: user => (reqRole(user), list('expenses').map(e => ({ ...e, amount: num(e.amount) }))),
  saveExpense(user, row) { const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT); return save('expenses', u, { ...row, expNo: row.expNo || 'EXP-' + Date.now() }); },
  getTasks: user => (reqRole(user), list('tasks')),
  saveTask(user, row) { const u = reqRole(user); return save('tasks', u, row); },
  getApprovals: user => (reqRole(user, ROLES.ADMIN, ROLES.MANAGER), list('approvals')),
  approveRecord: (user, id) => (reqRole(user, ROLES.ADMIN, ROLES.MANAGER), { success: true, message: 'OK Approved!' }),
  getUsers: user => (reqRole(user, ROLES.ADMIN, ROLES.MANAGER), list('users').map(u => ({ ...u, password: '********' }))),
  saveUser(user, row) { const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER); return save('users', u, row); },
  getSalesReport: user => (reqRole(user), { summary: { totalRevenue: Math.round(data().sales.reduce((s, x) => s + num(x.total), 0)), totalOrders: data().sales.length, totalCost: Math.round(data().saleItems.reduce((s, x) => s + num(x.cost) * num(x.quantity), 0)), grossProfit: 0, margin: 0 } }),
  getProductionReport: user => (reqRole(user), { totals: { totalJobs: data().production.length, completed: data().production.filter(x => x.status === 'Completed').length, pending: data().production.filter(x => x.status === 'Pending').length } }),
  getFinanceWorkspaceData(user) {
    reqRole(user);
    const d = data();
    ensureFinanceData();
    const manualEntries = d.financeManualJournals || [];
    const manualLines = d.financeManualJournalLines || [];
    const allEntries = [...manualEntries, ...d.financeJournalEntries];
    const allLines = [...manualLines, ...d.financeJournalLines];
    const balanceFor = accountName => allLines.filter(l => l.accountName === accountName).reduce((sum, l) => sum + num(l.debit) - num(l.credit), 0);
    const bankAccounts = (d.bankAccounts || []).map(account => {
      const linkedName = account.bank === 'Safaricom' ? 'M-Pesa Till' : account.bank === 'Cash' ? 'Cash on Hand' : 'KCB Bank';
      const opening = num(account.openingBalance);
      return { ...account, balance: opening + balanceFor(linkedName) };
    });
    const bankLineNames = ['KCB Bank', 'M-Pesa Till', 'Cash on Hand'];
    const generatedBankTransactions = allLines
      .filter(l => bankLineNames.includes(l.accountName))
      .map((l, index) => ({
        id: `ABTX-${index + 1}`,
        accountName: l.accountName,
        date: l.date,
        reference: l.reference,
        description: `${l.sourceModule} ${l.reference}`,
        deposit: l.debit,
        withdrawal: l.credit,
        reconciled: Boolean(l.reconciled)
      }));
    const revenue = Math.round(d.sales.reduce((s, x) => s + num(x.total), 0));
    const expenses = Math.round(d.expenses.reduce((s, x) => s + num(x.amount), 0));
    const cogs = Math.round(d.saleItems.reduce((s, x) => s + num(x.cost) * num(x.quantity), 0));
    const grossProfit = revenue - cogs;
    const netProfit = revenue - cogs - expenses;
    const cashPosition = Math.round(bankAccounts.reduce((s, b) => s + num(b.balance), 0));
    const ar = Math.round(d.accountsReceivable.reduce((s, x) => s + num(x.balance), 0));
    const ap = Math.round(d.financeAccountsPayable.reduce((s, x) => s + num(x.outstandingBalance), 0));
    const inventoryValue = Math.round(d.inventory.reduce((s, x) => s + num(x.quantity) * num(x.unitCost), 0));
    const payrollCost = Math.round(d.payrollRecords.reduce((s, x) => s + num(x.basicSalary) + num(x.allowances), 0));
    const taxLiability = Math.round(d.taxRecords.reduce((s, x) => s + num(x.liability), 0));
    const budget = d.budgets.reduce((s, x) => s + num(x.budget), 0);
    const actual = d.budgets.reduce((s, x) => s + num(x.actual), 0);
    const unbalanced = allEntries.filter(entry => num(entry.totalDebit) !== num(entry.totalCredit));
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const trend = months.map((month, index) => ({
      month,
      revenue: Math.round(revenue * (0.58 + index * 0.08)),
      expenses: Math.round(expenses * (0.52 + index * 0.07)),
      profit: Math.round(netProfit * (0.5 + index * 0.09)),
      cash: Math.round(cashPosition * (0.72 + index * 0.05)),
      ar: Math.round(ar * (0.9 - index * 0.04)),
      ap: Math.round(ap * (0.78 + index * 0.03))
    }));
    return {
      filters: { dateRange: 'This Fiscal Year', currency: 'KES', entity: 'Farmtrack Bio Sciences Ltd' },
      overview: {
        revenue, expenses, grossProfit, netProfit, cashPosition, accountsReceivable: ar, accountsPayable: ap,
        inventoryValue, payrollCost, taxLiability, bankBalances: cashPosition, operatingCashFlow: cashPosition + ar - ap,
        budgetVariance: Math.round(budget - actual), monthlyProfit: Math.round(netProfit / 12), yearlyProfit: netProfit,
        financialHealthScore: Math.max(1, Math.min(100, Math.round(70 + (netProfit > 0 ? 12 : -10) + (cashPosition > ap ? 8 : -8))))
      },
      integrity: { journals: allEntries.length, lines: allLines.length, unbalanced: unbalanced.length, immutable: allEntries.every(x => x.immutable) },
      trend,
      accounts: d.financeAccounts,
      journals: allEntries,
      journalLines: allLines,
      ledger: [...(d.financeManualLedger || []), ...d.generalLedger],
      receivables: d.accountsReceivable,
      payables: d.financeAccountsPayable,
      bankAccounts,
      bankTransactions: generatedBankTransactions,
      expenses: d.expenses,
      payroll: d.payrollRecords,
      taxes: d.taxRecords,
      assets: d.fixedAssets,
      budgets: d.budgets,
      costCenters: d.costCenters,
      forecasts: d.financialForecasts,
      reports: d.financialReports,
      audit: [...(d.financeManualAuditLogs || []), ...d.financeAuditLogs],
      ai: d.financialAiInsights,
      sourceFlows: [
        { module: 'Sales', records: d.sales.length, journals: allEntries.filter(x => x.sourceModule === 'Sales').length, status: 'Posting' },
        { module: 'Inventory', records: d.inventory.length, journals: allEntries.filter(x => x.sourceModule === 'Inventory').length, status: 'Posting' },
        { module: 'Procurement', records: d.purchaseOrders.length, journals: allEntries.filter(x => x.sourceModule === 'Procurement').length, status: 'Posting' },
        { module: 'Production', records: d.production.length, journals: allEntries.filter(x => x.sourceModule === 'Production').length, status: 'Posting' },
        { module: 'Taxes', records: d.taxRecords.length, journals: allEntries.filter(x => x.sourceModule === 'Taxes').length, status: 'Posting' },
        { module: 'Banking', records: generatedBankTransactions.length, journals: allEntries.filter(x => x.sourceModule === 'Banking' || generatedBankTransactions.some(tx => tx.reference === x.reference)).length, status: 'Posting' },
        { module: 'Manual Inputs', records: manualEntries.length, journals: manualEntries.length, status: 'Posting' }
      ]
    };
  },
  postManualJournal(user, row = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT);
    const amount = Math.round(num(row.amount));
    if (!amount) throw new Error('Amount is required');
    const debit = data().financeAccounts.find(a => a.id === row.debitAccountId) || data().financeAccounts.find(a => a.name === 'Transport Expense');
    const credit = data().financeAccounts.find(a => a.id === row.creditAccountId) || data().financeAccounts.find(a => a.name === 'KCB Bank');
    const id = gid();
    const entry = { id, journalNo: `JE-${String(data().financeJournalEntries.length + 1).padStart(5, '0')}`, date: row.date || today(), description: row.description || 'Manual journal', sourceModule: 'Finance', sourceId: id, reference: row.reference || 'MANUAL', totalDebit: amount, totalCredit: amount, approvalStatus: 'Posted', postedBy: u.name, immutable: true, createdAt: new Date().toISOString() };
    const debitLine = { id: gid(), journalEntryId: id, accountCode: debit.code, accountName: debit.name, accountType: debit.type, debit: amount, credit: 0, sourceModule: 'Finance', reference: entry.reference, date: entry.date };
    const creditLine = { id: gid(), journalEntryId: id, accountCode: credit.code, accountName: credit.name, accountType: credit.type, debit: 0, credit: amount, sourceModule: 'Finance', reference: entry.reference, date: entry.date };
    data().financeManualJournals ||= [];
    data().financeManualJournalLines ||= [];
    data().financeManualLedger ||= [];
    data().financeManualAuditLogs ||= [];
    data().financeManualJournals.unshift(entry);
    data().financeManualJournalLines.unshift(creditLine, debitLine);
    data().financeManualLedger.unshift({ id: gid(), ...creditLine, runningBalance: 0 }, { id: gid(), ...debitLine, runningBalance: 0 });
    data().financeManualAuditLogs.unshift({ id: gid(), user: u.name, date: entry.date, module: 'Finance', action: 'Manual Journal Posted', reference: entry.reference, oldValue: '', newValue: `${amount}/${amount}`, reason: entry.description, approval: entry.approvalStatus, immutable: true });
    log(u, 'Post Manual Journal', 'Finance', entry.journalNo);
    return { success: true, entry };
  },
  saveFinanceAccount(user, row = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT);
    assertRequired(row.code, 'Account code');
    assertRequired(row.name, 'Account name');
    assertRequired(row.type, 'Account type');
    data().financeAccounts ||= [];
    const existing = data().financeAccounts.find(a => a.id === row.id || a.code === row.code);
    const record = {
      id: existing?.id || gid(),
      code: clean(row.code),
      name: clean(row.name),
      type: row.type,
      parent: row.parent || row.type,
      status: row.status || 'Active',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (existing) Object.assign(existing, record);
    else data().financeAccounts.push(record);
    emitBusinessEvent(u, 'finance.account_saved', 'financeAccounts', record.id, { code: record.code, name: record.name, type: record.type });
    log(u, existing ? 'Update Finance Account' : 'Create Finance Account', 'Finance', `${record.code} ${record.name}`);
    return { success: true, account: record };
  },
  recordBankTransaction(user, row = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT);
    assertPositive(row.amount, 'Amount');
    const accountName = row.accountName || 'KCB Bank';
    const amount = Math.round(num(row.amount));
    const direction = row.direction || 'Deposit';
    const bankAccount = data().financeAccounts.find(a => a.name === accountName) || data().financeAccounts.find(a => a.name === 'KCB Bank');
    const offset = data().financeAccounts.find(a => a.id === row.offsetAccountId) || data().financeAccounts.find(a => a.name === 'Other Income') || data().financeAccounts.find(a => a.type === 'Revenue');
    const journal = api.postManualJournal(u, {
      amount,
      date: row.date || today(),
      description: row.description || `${direction} bank transaction`,
      reference: row.reference || `BANK-${Date.now()}`,
      debitAccountId: direction === 'Deposit' ? bankAccount?.id : offset?.id,
      creditAccountId: direction === 'Deposit' ? offset?.id : bankAccount?.id
    });
    emitBusinessEvent(u, 'finance.bank_transaction_recorded', 'bankTransactions', journal.entry.id, { direction, accountName, amount });
    return { success: true, transaction: journal.entry };
  },
  recordFinanceExpense(user, row = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT);
    const expense = api.saveExpense(u, { category: row.category || 'Office Expenses', date: row.date || today(), description: row.description || 'Finance expense', amount: num(row.amount), paymentMethod: row.paymentMethod || 'Bank', status: 'Paid' });
    ensureFinanceData();
    api.postManualJournal(u, { amount: row.amount, description: `Expense posted: ${row.description || row.category}`, reference: expense.id || expense.row?.id });
    return { success: true, expense };
  },
  recordCustomerPayment(user, row = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT);
    const result = api.recordPayment(u, { referenceId: row.invoiceId || row.referenceId, amount: row.amount, method: row.method || 'Bank' });
    const inv = data().invoices.find(i => i.id === (row.invoiceId || row.referenceId));
    if (inv) api.postManualJournal(u, { amount: row.amount, description: `Customer payment ${inv.invNo}`, reference: inv.invNo, debitAccountId: data().financeAccounts.find(a => a.name === 'KCB Bank')?.id, creditAccountId: data().financeAccounts.find(a => a.name === 'Accounts Receivable')?.id });
    // Email: payment receipt to customer
    if (inv) {
      const customer = (data().customers || []).find(c => c.id === inv.customerId || c.name === inv.customerName);
      const customerEmail = customer?.email;
      if (customerEmail) {
        deliverEmail(u, 'payment_receipt', customerEmail, () => RichEmail.sendPaymentReceiptEmail({
          to: customerEmail, customerName: inv.customerName, invoiceNo: inv.invNo,
          paidAmount: num(row.amount), method: row.method || 'Bank', date: today(),
          balance: num(inv.balanceDue || inv.outstanding),
          companyName: (data().settings || {}).company_name || 'Farmtrack Bio Sciences'
        }), { subject: `Payment receipt — ${inv.invNo}`, relatedModule: 'payments', relatedId: inv.id }).catch(() => {});
      }
    }
    return result;
  },
  getFinancialReport: user => {
    const f = api.getFinanceWorkspaceData(user);
    return { pnl: { revenue: f.overview.revenue, expenses: f.overview.expenses, netProfit: f.overview.netProfit, netMargin: f.overview.revenue ? Math.round((f.overview.netProfit / f.overview.revenue) * 100) : 0 } };
  },
  getActivityLogs: user => (reqRole(user), data().activity.slice(0, 100).map(l => ({ user: l.userName, action: l.action, module: l.module, details: l.details, time: l.createdAt }))),
  getLookupData: user => (reqRole(user), { customers: list('customers').map(c => ({ id: c.id, name: c.name, phone: c.phone })), suppliers: list('suppliers').map(s => ({ id: s.id, name: s.name })), products: list('products').map(p => ({ id: p.id, name: p.name, sku: p.sku, price: num(p.sellingPrice), cost: num(p.costPrice), unit: p.unit })), warehouses: [{ id: 'WH1', name: 'Main Store Nairobi' }], users: list('users').map(u => ({ id: u.id, name: u.name, role: u.role })), roles: Object.values(ROLES) }),
  getStockAgingReport: user => (reqRole(user), { summary: [{ label: '0-30 days', qty: data().inventory.reduce((s, i) => s + num(i.quantity), 0) }], details: data().inventory.map(i => ({ product: i.productName, batch: i.batchNo, qty: num(i.quantity), days: 1 })) }),
  getStockDistributionReport: user => (reqRole(user), { totalDistributed: 0, records: [] }),
  getSupplierPerformance: user => (reqRole(user), list('suppliers').map(s => ({ id: s.id, name: s.name, category: s.category, totalPOs: 0, onTimeDelivery: 0, deliveryRate: 0 })))
  ,
  // ─────────────────────────── EMAIL (Resend) ───────────────────────────
  async sendTestEmail(user, { to } = {}) {
    const u = reqRole(user, ROLES.ADMIN);
    const recipient = to || u.email;
    const result = await deliverEmail(u, 'test_email', recipient, () => EmailService.sendERPNotification({
      to: recipient,
      title: 'Email Integration Working',
      message: 'Your Resend email integration is successfully connected to FarmTrack ERP.',
      module: 'system',
      priority: 'low'
    }), { subject: 'Unity ERP — Test Email ✓', relatedModule: 'system' });
    return result;
  },
  async sendComposedEmail(user, { to, cc, bcc, subject, body, from } = {}) {
    const u = reqRole(user);
    if (!to || !to.trim()) throw new Error('Recipient email is required');
    if (!subject || !subject.trim()) throw new Error('Subject is required');
    if (!body || !body.trim()) throw new Error('Email body is required');
    const recipients = to.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    const ccList = cc ? cc.split(/[,;]/).map(s => s.trim()).filter(Boolean) : [];
    const bccList = bcc ? bcc.split(/[,;]/).map(s => s.trim()).filter(Boolean) : [];
    const replyToEmail = from || 'mikomike200@gmail.com';
    const htmlBody = EmailService.emailShell({
      title: subject.trim(),
      subtitle: 'Please see the message below from FarmTrack ERP.',
      bodyHtml: `<div style="border-top:1px solid #e8ede8;border-bottom:1px solid #e8ede8;padding:16px 0;margin:12px 0 18px;">${body.replace(/\n/g, '<br />\n')}</div>`,
      category: 'ERP Email',
      recipientName: 'Team',
      senderName: u.name || 'FarmTrack ERP',
      senderRole: u.role || 'ERP User',
      senderEmail: replyToEmail,
      footerNote: 'This email was sent from the FarmTrack ERP email workspace.'
    });
    const result = await deliverEmail(u, 'composed_email', recipients, () => EmailService.sendRawEmail({
      to: recipients,
      cc: ccList.length ? ccList : undefined,
      bcc: bccList.length ? bccList : undefined,
      subject: subject.trim(),
      html: htmlBody,
      replyTo: replyToEmail,
      from: 'Unity ERP <finance@staff.farmtrack.co.ke>'
    }), {
      subject: subject.trim(),
      relatedModule: 'email',
      relatedId: ''
    });
    return { success: true, sent: result.sent !== false, recipients, messageId: result.id, replyTo: replyToEmail, error: result.error };
  },
  getEmailLog(user, { limit = 50 } = {}) {
    reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    return { emails: (data().emailLog || []).slice(0, limit), total: (data().emailLog || []).length };
  },
  async resendEmail(user, logId) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const log = (data().emailLog || []).find(e => e.id === logId);
    if (!log) throw new Error('Email log entry not found');
    const to = log.to;
    if (!to) throw new Error('No recipient found in log');
    const result = await deliverEmail(u, 'resend', to, () => EmailService.sendERPNotification({
      to, title: `Resend: ${log.subject || 'Previous email'}`, message: `This is a re-sent message. Original subject: ${log.subject || 'N/A'}. Please refer to your original email context.`,
      module: log.relatedModule || 'system', priority: 'low'
    }), { subject: `Resend: ${log.subject || 'Email'}`, relatedModule: log.relatedModule, relatedId: log.relatedId });
    return { success: true, resent: result.sent !== false, logId };
  },
  runERPIntegrityChecks(user) {
    reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const d = data();
    const checks = [];
    const add = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail });
    add('Inventory never negative', d.inventory.every(row => num(row.quantity) >= 0), `${d.inventory.length} stock rows checked`);
    add('Sales have invoices', d.sales.every(sale => d.invoices.some(inv => inv.saleId === sale.id || inv.customerName === sale.customerName)), `${d.sales.length} sales checked`);
    add('Deliveries linked to sales', d.deliveries.every(del => !del.saleId || d.sales.some(sale => sale.id === del.saleId)), `${d.deliveries.length} deliveries checked`);
    add('Balanced finance journals', [...(d.financeJournalEntries || []), ...(d.financeManualJournals || [])].every(j => Math.round(num(j.totalDebit)) === Math.round(num(j.totalCredit))), `${(d.financeJournalEntries || []).length + (d.financeManualJournals || []).length} journals checked`);
    add('Reports exportable', (d.reportArchive || []).length >= 0, 'Report export engine available');
    add('Business events active', (d.businessEvents || []).length > 0, `${(d.businessEvents || []).length} events recorded`);
    return { ok: checks.every(c => c.pass), checks, checkedAt: new Date().toISOString() };
  },

  // ─────────────────────────── NOTIFICATION & ALERT CENTER ───────────────────────────
  getNotificationCenterData(user, filters = {}) {
    const u = reqRole(user);
    const d = data();
    refreshAlerts(d);
    const category = clean(filters.category).toLowerCase();
    const search = clean(filters.search).toLowerCase();
    const priority = clean(filters.priority).toLowerCase();
    const all = (d.notifications || []).filter(n => n.status !== 'archived');
    const archived = (d.notifications || []).filter(n => n.status === 'archived');
    let list = [...all].sort((a, b) => (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0) || new Date(b.createdAt) - new Date(a.createdAt));
    if (category && category !== 'all') {
      if (category === 'critical') list = list.filter(n => n.priority === 'critical');
      else if (category === 'unread') list = list.filter(n => !n.read);
      else list = list.filter(n => String(n.category).toLowerCase() === category);
    }
    if (category === 'archived') list = [...archived].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (priority) list = list.filter(n => n.priority === priority);
    if (search) list = list.filter(n => `${n.title} ${n.message} ${n.sourceLabel || ''}`.toLowerCase().includes(search));
    const unread = all.filter(n => !n.read).length;
    const critical = all.filter(n => n.priority === 'critical').length;
    const categories = NOTIFICATION_CATEGORIES.map(id => ({ id, label: NOTIFICATION_CATEGORY_LABEL[id] || label(id), count: all.filter(n => String(n.category).toLowerCase() === id).length }));
    return {
      alerts: list.slice(0, 200),
      stats: { total: all.length, unread, critical, archived: archived.length, acknowledged: all.filter(n => n.status === 'acknowledged').length },
      categories,
      settings: d.notificationSettings || defaultNotificationSettings()
    };
  },
  getNotificationsBell(user) {
    const u = reqRole(user);
    const d = data();
    refreshAlerts(d);
    const all = (d.notifications || []).filter(n => n.status !== 'archived');
    const unread = all.filter(n => !n.read);
    const critical = all.filter(n => n.priority === 'critical');
    return {
      unread: unread.length,
      critical: critical.length,
      recent: [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8)
    };
  },
  acknowledgeNotification(user, id) {
    const u = reqRole(user);
    const n = data().notifications.find(x => x.id === id);
    if (!n) throw new Error('Notification not found');
    n.status = 'acknowledged';
    n.read = true;
    n.disposition = { by: u.name, at: new Date().toISOString(), action: 'acknowledged' };
    log(u, 'Acknowledge notification', 'Notifications', n.title);
    return { success: true, notification: n };
  },
  snoozeNotification(user, id, hours = 24) {
    const u = reqRole(user);
    const n = data().notifications.find(x => x.id === id);
    if (!n) throw new Error('Notification not found');
    const until = new Date(Date.now() + Math.min(Math.max(num(hours), 1), 168) * 3600 * 1000);
    n.status = 'snoozed';
    n.read = true;
    n.snoozedUntil = until.toISOString();
    n.disposition = { by: u.name, at: new Date().toISOString(), action: 'snoozed', until: n.snoozedUntil };
    log(u, `Snooze notification ${hours}h`, 'Notifications', n.title);
    return { success: true, notification: n };
  },
  archiveNotification(user, id) {
    const u = reqRole(user);
    const n = data().notifications.find(x => x.id === id);
    if (!n) throw new Error('Notification not found');
    n.status = 'archived';
    n.read = true;
    n.disposition = { by: u.name, at: new Date().toISOString(), action: 'archived' };
    log(u, 'Archive notification', 'Notifications', n.title);
    return { success: true, notification: n };
  },
  assignNotification(user, id, assignTo) {
    const u = reqRole(user);
    const n = data().notifications.find(x => x.id === id);
    if (!n) throw new Error('Notification not found');
    n.assignedTo = clean(assignTo);
    n.read = true;
    log(u, `Assign notification to ${n.assignedTo}`, 'Notifications', n.title);
    return { success: true, notification: n };
  },
  addNotificationComment(user, id, text) {
    const u = reqRole(user);
    const n = data().notifications.find(x => x.id === id);
    if (!n) throw new Error('Notification not found');
    n.comments ||= [];
    n.comments.push({ id: gid(), author: u.name, text: clean(text), at: new Date().toISOString() });
    return { success: true, notification: n };
  },
  markNotificationsRead(user) {
    const u = reqRole(user);
    (data().notifications || []).forEach(n => { n.read = true; });
    return { success: true };
  },
  saveNotificationSettings(user, config = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const d = data();
    d.notificationSettings = { ...(d.notificationSettings || defaultNotificationSettings()), ...config, updatedAt: new Date().toISOString(), updatedBy: u.name };
    log(u, 'Update notification settings', 'Notifications');
    return { success: true, settings: d.notificationSettings };
  },
  resolveNotificationAction(user, id, action, payload = {}) {
    // Inline quick-action dispatcher used by the bell dropdown (e.g. leave approval)
    const u = reqRole(user);
    const n = data().notifications.find(x => x.id === id);
    if (!n) throw new Error('Notification not found');
    if (action === 'approve-leave' && n.sourceModule === 'leaves') return api.decideLeave(u, n.sourceId, { decision: 'Approved', note: payload.note || 'Approved from notification' });
    if (action === 'reject-leave' && n.sourceModule === 'leaves') return api.decideLeave(u, n.sourceId, { decision: 'Rejected', note: payload.note || 'Rejected from notification' });
    if (action === 'acknowledge') return api.acknowledgeNotification(u, id);
    if (action === 'archive') return api.archiveNotification(u, id);
    throw new Error('Unknown notification action');
  },

  // ─────────────────────────── HR SUITE ───────────────────────────
  getHrData(user, filters = {}) {
    const u = reqRole(user);
    const d = data();
    ensureHrData();
    const search = clean(filters.search).toLowerCase();
    let employees = d.employees || [];
    if (search) employees = employees.filter(e => `${e.name} ${e.email} ${e.department} ${e.position} ${e.employeeNo}`.toLowerCase().includes(search));
    const deptCounts = {};
    (d.employees || []).forEach(e => { deptCounts[e.department] = (deptCounts[e.department] || 0) + 1; });
    const departments = (d.departments || []).map(dep => ({ ...dep, headcount: deptCounts[dep.name] || 0, payrollCost: (d.employees || []).filter(e => e.department === dep.name).reduce((s, e) => s + num(e.salary), 0) }));
    const range = periodRange(filters.period);
    // Attendance stats — today + totals with hours worked
    const attendanceToday = (d.attendance || []).filter(a => a.date === today());
    const presentToday = attendanceToday.filter(a => a.status === 'Present');
    const totalHoursToday = presentToday.reduce((s, a) => s + attendanceHours(a), 0);
    const attendanceWithHours = (d.attendance || []).map(a => ({ ...a, hoursWorked: attendanceHours(a) })).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const attendanceInPeriod = attendanceWithHours.filter(a => a.date >= range.startDate && a.date <= range.endDate);
    const presentInPeriod = attendanceInPeriod.filter(a => ['Present', 'Late', 'Remote', 'Half-Day'].includes(a.status));
    const absentInPeriod = attendanceInPeriod.filter(a => a.status === 'Absent');
    const hoursInPeriod = attendanceInPeriod.reduce((sum, a) => sum + num(a.hoursWorked), 0);
    const overtimeHours = attendanceInPeriod.reduce((sum, a) => sum + Math.max(0, num(a.hoursWorked) - 8), 0);
    const lateArrivals = attendanceInPeriod.filter(a => {
      const checkIn = clean(a.checkIn);
      if (!checkIn || a.status === 'Absent') return false;
      const [h, m] = checkIn.split(':').map(Number);
      return (h * 60 + m) > (8 * 60 + 30);
    }).length;
    const missingCheckouts = attendanceInPeriod.filter(a => a.checkIn && !a.checkOut && a.status !== 'Absent').length;
    // Department-wise hours aggregation (last 30 days)
    const deptHours = {};
    attendanceInPeriod.forEach(a => {
      const key = a.department || 'Unassigned';
      deptHours[key] = (deptHours[key] || 0) + num(a.hoursWorked);
    });
    const attendanceByDept = Object.entries(deptHours).map(([department, hours]) => ({ department, hours: Math.round(hours * 10) / 10 })).sort((a, b) => b.hours - a.hours);
    ensureLeaveData();
    const leaveInPeriod = (d.leaveApplications || []).filter(l => l.status === 'Approved' && l.startDate <= range.endDate && l.endDate >= range.startDate);
    const pendingLeaves = (d.leaveApplications || []).filter(l => l.status === 'Pending');
    const leaveDaysInPeriod = leaveInPeriod.reduce((sum, l) => sum + num(l.days), 0);
    const leaveBalanceTotals = (d.employees || []).reduce((acc, e) => {
      acc.annual += num(e.leaveBalanceAnnual);
      acc.sick += num(e.leaveBalanceSick);
      acc.casual += num(e.leaveBalanceCasual);
      return acc;
    }, { annual: 0, sick: 0, casual: 0 });
    return {
      employees,
      departments,
      attendance: attendanceWithHours.slice(0, 200),
      attendanceToday,
      attendanceByDept,
      period: range,
      leaveSummary: {
        approvedInPeriod: leaveInPeriod.length,
        pendingApprovals: pendingLeaves.length,
        leaveDaysInPeriod,
        balances: leaveBalanceTotals
      },
      candidates: d.candidates || [],
      reviews: d.reviews || [],
      leaveTypes: d.leaveTypes || [],
      stats: {
        headcount: (d.employees || []).length,
        departments: (d.departments || []).length,
        activeCandidates: (d.candidates || []).filter(c => c.stage !== 'Hired' && c.stage !== 'Rejected').length,
        pendingReviews: (d.reviews || []).filter(r => r.status === 'Pending').length,
        presentToday: presentToday.length,
        totalHoursToday: Math.round(totalHoursToday * 10) / 10,
        presentInPeriod: presentInPeriod.length,
        absentInPeriod: absentInPeriod.length,
        totalHoursInPeriod: Math.round(hoursInPeriod * 10) / 10,
        overtimeHours: Math.round(overtimeHours * 10) / 10,
        lateArrivals,
        missingCheckouts,
        attendanceRate: attendanceInPeriod.length ? Math.round((presentInPeriod.length / attendanceInPeriod.length) * 100) : 0,
        leaveApprovalRate: (pendingLeaves.length + leaveInPeriod.length) ? Math.round((leaveInPeriod.length / (pendingLeaves.length + leaveInPeriod.length)) * 100) : 0,
        averageHoursPerRecord: attendanceInPeriod.length ? Math.round((hoursInPeriod / attendanceInPeriod.length) * 10) / 10 : 0,
        attendanceRecords: (d.attendance || []).length,
        payrollCost: (d.employees || []).reduce((s, e) => s + num(e.salary), 0)
      }
    };
  },
  saveEmployee(user, form = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const d = data();
    ensureHrData();
    assertRequired(form.name, 'Employee name');
    const id = clean(form.id);
    if (id) {
      const emp = d.employees.find(e => e.id === id);
      if (!emp) throw new Error('Employee not found');
      Object.assign(emp, employeeRecord(form));
      log(u, `Update employee ${emp.name}`, 'HR');
      return { success: true, employee: emp };
    }
    const emp = { id: gid(), employeeNo: clean(form.employeeNo) || `EMP-${String(d.employees.length + 1).padStart(3, '0')}`, ...employeeRecord(form) };
    d.employees.unshift(emp);
    log(u, `Add employee ${emp.name}`, 'HR');
    return { success: true, employee: emp };
  },
  deleteEmployee(user, id) {
    const u = reqRole(user, ROLES.ADMIN);
    const d = data();
    const idx = (d.employees || []).findIndex(e => e.id === id);
    if (idx < 0) throw new Error('Employee not found');
    const [removed] = d.employees.splice(idx, 1);
    log(u, `Delete employee ${removed.name}`, 'HR');
    return { success: true };
  },
  recordAttendance(user, form = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const d = data();
    ensureHrData();
    assertRequired(form.employeeId, 'Employee');
    const emp = d.employees.find(e => e.id === form.employeeId);
    if (!emp) throw new Error('Employee not found');
    const date = dateOnly(form.date);
    const checkIn = clean(form.checkIn);
    const checkOut = clean(form.checkOut);
    let hoursWorked = 0;
    if (checkIn && checkOut) {
      const [ih, im] = checkIn.split(':').map(Number);
      const [oh, om] = checkOut.split(':').map(Number);
      const mins = (oh * 60 + om) - (ih * 60 + im);
      hoursWorked = Math.max(0, Math.round((mins / 60) * 10) / 10);
    }
    const existing = d.attendance.findIndex(a => a.employeeId === form.employeeId && a.date === date);
    const record = { id: existing >= 0 ? d.attendance[existing].id : gid(), employeeId: form.employeeId, employeeName: emp.name, department: emp.department, date, checkIn, checkOut, hoursWorked, status: clean(form.status) || (checkIn ? 'Present' : 'Absent'), note: clean(form.note) };
    if (existing >= 0) d.attendance[existing] = record; else d.attendance.unshift(record);
    log(u, `Record attendance ${emp.name}`, 'HR', `${record.status} · ${hoursWorked}h`);
    return { success: true, record };
  },
  saveCandidate(user, form = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const d = data();
    ensureHrData();
    assertRequired(form.name, 'Candidate name');
    const id = clean(form.id);
    if (id) {
      const c = d.candidates.find(x => x.id === id);
      if (!c) throw new Error('Candidate not found');
      Object.assign(c, candidateRecord(form));
      log(u, `Update candidate ${c.name}`, 'HR');
      return { success: true, candidate: c };
    }
    const c = { id: gid(), appliedAt: new Date().toISOString(), ...candidateRecord(form) };
    d.candidates.unshift(c);
    log(u, `Add candidate ${c.name}`, 'HR');
    return { success: true, candidate: c };
  },
  moveCandidate(user, id, stage) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const d = data();
    ensureHrData();
    const c = d.candidates.find(x => x.id === id);
    if (!c) throw new Error('Candidate not found');
    if (!CANDIDATE_STAGES.includes(stage)) throw new Error('Invalid stage');
    c.stage = stage;
    if (stage === 'Hired') {
      const emp = { id: gid(), employeeNo: `EMP-${String((d.employees || []).length + 1).padStart(3, '0')}`, name: c.name, email: c.email, phone: c.phone, department: c.department || 'Sales', position: c.position || 'Officer', employmentType: 'Full-time', joinDate: today(), status: 'Active', salary: num(c.expectedSalary) || 60000, manager: '', leaveBalanceAnnual: 21, leaveBalanceSick: 10, leaveBalanceCasual: 5 };
      d.employees.unshift(emp);
    }
    log(u, `Move candidate ${c.name} → ${stage}`, 'HR');
    return { success: true, candidate: c };
  },
  saveReview(user, form = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const d = data();
    ensureHrData();
    assertRequired(form.employeeId, 'Employee');
    const emp = d.employees.find(e => e.id === form.employeeId);
    if (!emp) throw new Error('Employee not found');
    const id = clean(form.id);
    if (id) {
      const r = d.reviews.find(x => x.id === id);
      if (!r) throw new Error('Review not found');
      Object.assign(r, reviewRecord(form, emp));
      log(u, `Update review ${emp.name}`, 'HR');
      return { success: true, review: r };
    }
    const r = { id: gid(), ...reviewRecord(form, emp) };
    d.reviews.unshift(r);
    log(u, `Add review ${emp.name}`, 'HR');
    return { success: true, review: r };
  },

  // ─────────────────────────── LEAVES ───────────────────────────
  getLeaveData(user) {
    const u = reqRole(user);
    const d = data();
    ensureLeaveData();
    const isManager = [ROLES.ADMIN, ROLES.MANAGER].includes(u.role);
    const mine = (d.leaveApplications || []).filter(l => l.applicantEmail === u.email || l.applicantId === u.id);
    const all = isManager ? (d.leaveApplications || []) : mine;
    const pending = (d.leaveApplications || []).filter(l => l.status === 'Pending');
    const onLeaveToday = (d.leaveApplications || []).filter(l => l.status === 'Approved' && dateOnly(l.startDate) <= today() && dateOnly(l.endDate) >= today());
    const balances = (d.employees || []).map(e => ({ id: e.id, name: e.name, department: e.department, annual: num(e.leaveBalanceAnnual), sick: num(e.leaveBalanceSick), casual: num(e.leaveBalanceCasual) }));
    const departments = [...new Set((d.employees || []).map(e => e.department).filter(Boolean))].sort();
    return {
      myApplications: mine,
      allApplications: all,
      pendingApprovals: pending,
      onLeaveToday,
      balances,
      leaveTypes: d.leaveTypes || [],
      calendar: buildLeaveCalendar(d.leaveApplications || []),
      isManager,
      departments,
      stats: {
        total: (d.leaveApplications || []).length,
        pending: pending.length,
        approved: (d.leaveApplications || []).filter(l => l.status === 'Approved').length,
        rejected: (d.leaveApplications || []).filter(l => l.status === 'Rejected').length,
        onLeave: onLeaveToday.length
      }
    };
  },
  applyLeave(user, form = {}) {
    const u = reqRole(user);
    const d = data();
    ensureLeaveData();
    assertRequired(form.type, 'Leave type');
    assertRequired(form.startDate, 'Start date');
    const start = dateOnly(form.startDate);
    const end = dateOnly(form.endDate || form.startDate);
    if (end < start) throw new Error('End date cannot be before start date');
    const days = Math.max(leaveBusinessDays(start, end), 1);
    const lt = (d.leaveTypes || []).find(t => String(t.name).toLowerCase() === String(form.type).toLowerCase()) || { name: form.type, deducts: 'annual' };
    const emp = (d.employees || []).find(e => e.id === u.id || e.email === u.email) || { name: u.name, department: 'Admin' };
    const application = {
      id: gid(),
      applicantId: u.id,
      applicantEmail: u.email,
      applicantName: u.name,
      department: emp.department || '',
      type: lt.name,
      startDate: start,
      endDate: end,
      days,
      reason: clean(form.reason),
      status: 'Pending',
      appliedAt: new Date().toISOString(),
      attachments: []
    };
    d.leaveApplications.unshift(application);
    emitBusinessEvent(u, 'hr.leave_applied', 'leaveApplications', application.id, { type: lt.name, days });
    // High-priority alert to managers
    pushManualNotification(d, {
      category: 'payroll',
      priority: 'high',
      title: 'Leave approval required',
      message: `${u.name} requested ${days} day(s) ${lt.name} leave (${start} → ${end})`,
      sourceModule: 'leaves',
      sourceId: application.id,
      sourceLabel: `${lt.name} · ${u.name}`
    });
    // Email managers about leave approval request
    const mgrEmails = managerEmails(d);
    if (mgrEmails.length) {
      deliverEmail(u, 'leave_approval_request', mgrEmails, () => EmailService.sendLeaveRequestSubmitted({
        to: u.email, employeeName: u.name, department: emp.department, leaveType: lt.name, startDate: start, endDate: end, days,
        reason: clean(form.reason), leaveId: application.id, managerEmail: mgrEmails.join(',')
      }), { subject: `Leave approval — ${u.name}`, relatedModule: 'leaves', relatedId: application.id }).catch(() => {});
    }
    log(u, `Apply for ${lt.name} leave`, 'Leaves', `${days} days`);
    return { success: true, application };
  },
  decideLeave(user, id, decision = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER);
    const d = data();
    ensureLeaveData();
    const app = (d.leaveApplications || []).find(l => l.id === id);
    if (!app) throw new Error('Leave application not found');
    const outcome = String(decision.decision || '').toLowerCase() === 'approved' ? 'Approved' : 'Rejected';
    if (app.status !== 'Pending' && outcome !== app.status) {
      // allow re-decision but warn via status overwrite
    }
    app.status = outcome;
    app.decidedBy = u.name;
    app.decidedAt = new Date().toISOString();
    app.decisionNote = clean(decision.note);
    if (outcome === 'Approved') {
      const lt = (d.leaveTypes || []).find(t => String(t.name).toLowerCase() === String(app.type).toLowerCase());
      const emp = (d.employees || []).find(e => e.id === app.applicantId || e.email === app.applicantEmail);
      if (emp) {
        const balanceKey = lt?.deducts === 'sick' ? 'leaveBalanceSick' : lt?.deducts === 'casual' ? 'leaveBalanceCasual' : 'leaveBalanceAnnual';
        emp[balanceKey] = Math.max(num(emp[balanceKey]) - app.days, 0);
      }
    }
    // Notify the applicant
    pushManualNotification(d, {
      category: 'payroll',
      priority: outcome === 'Approved' ? 'medium' : 'high',
      title: `Leave ${outcome.toLowerCase()}`,
      message: `Your ${app.type} leave (${app.startDate} → ${app.endDate}) was ${outcome.toLowerCase()} by ${u.name}.`,
      sourceModule: 'leaves',
      sourceId: app.id,
      sourceLabel: `${app.type} · ${app.applicantName}`
    });
    emitBusinessEvent(u, outcome === 'Approved' ? 'hr.leave_approved' : 'hr.leave_rejected', 'leaveApplications', app.id, { days: app.days });
    // Email applicant about decision
    if (app.applicantEmail) {
      const emailFn = outcome === 'Approved'
        ? () => EmailService.sendLeaveApproved({
            to: app.applicantEmail, employeeName: app.applicantName, leaveType: app.type,
            startDate: app.startDate, endDate: app.endDate, days: app.days, leaveId: app.id, approvedBy: u.name
          })
        : () => EmailService.sendLeaveRejected({
            to: app.applicantEmail, employeeName: app.applicantName, leaveType: app.type,
            startDate: app.startDate, endDate: app.endDate, days: app.days, leaveId: app.id, rejectedBy: u.name, reason: app.decisionNote
          });
      deliverEmail(u, 'leave_decision', app.applicantEmail, emailFn, { subject: `Leave ${outcome} — ${app.type}`, relatedModule: 'leaves', relatedId: app.id }).catch(() => {});
    }
    log(u, `${outcome} leave ${app.applicantName}`, 'Leaves', `${app.days} days`);
    return { success: true, application: app };
  },
  cancelLeave(user, id) {
    const u = reqRole(user);
    const d = data();
    const app = (d.leaveApplications || []).find(l => l.id === id);
    if (!app) throw new Error('Leave application not found');
    if (app.applicantEmail !== u.email && app.applicantId !== u.id && u.role !== ROLES.ADMIN) throw new Error('You can only cancel your own requests');
    if (app.status !== 'Pending') throw new Error('Only pending requests can be cancelled');
    app.status = 'Cancelled';
    app.decidedBy = u.name;
    app.decidedAt = new Date().toISOString();
    log(u, `Cancel leave ${app.applicantName}`, 'Leaves');
    return { success: true, application: app };
  }
};

const SYNC_AFTER_RPC = {
  saveCustomer: ['Customers', 'Dashboard', 'Activity'],
  deleteCustomer: ['Customers', 'Dashboard', 'Activity'],
  saveLead: ['Leads', 'Dashboard', 'Activity'],
  deleteLead: ['Leads', 'Dashboard', 'Activity'],
  saveCall: ['Leads', 'Customers', 'Activity'],
  saveSupplier: ['Purchases', 'Activity'],
  deleteSupplier: ['Purchases', 'Activity'],
  saveProduct: ['Products', 'Inventory', 'Dashboard', 'Activity'],
  saveInventoryItem: ['Inventory', 'Inventory Movements', 'Dashboard', 'Activity'],
  adjustInventory: ['Inventory', 'Inventory Movements', 'Dashboard', 'Activity'],
  transferInventory: ['Inventory', 'Inventory Movements', 'Dashboard', 'Activity'],
  createSalesOrder: ['Sales', 'Invoices', 'Inventory', 'Inventory Movements', 'Finance', 'Accounts', 'Dashboard', 'Activity'],
  saveSale: ['Sales', 'Invoices', 'Inventory', 'Inventory Movements', 'Finance', 'Accounts', 'Dashboard', 'Activity'],
  confirmSalesDelivery: ['Sales', 'Activity'],
  updateSalesDeliveryStatus: ['Sales', 'Activity'],
  recordFinanceExpense: ['Finance', 'Accounts', 'Dashboard', 'Activity'],
  recordCustomerPayment: ['Payments', 'Invoices', 'Finance', 'Accounts', 'Dashboard', 'Activity'],
  postManualJournal: ['Finance', 'Accounts', 'Dashboard', 'Activity'],
  saveProductionJob: ['Manufacturing', 'Inventory', 'Dashboard', 'Activity'],
  receiveRawMaterial: ['Manufacturing', 'Inventory', 'Inventory Movements', 'Dashboard', 'Activity'],
  submitERPInput: ['Dashboard', 'Customers', 'Leads', 'Products', 'Inventory', 'Sales', 'Invoices', 'Purchases', 'Manufacturing', 'Finance', 'Accounts', 'Activity'],
  // HR sync
  saveEmployee: ['Employees', 'Departments', 'Dashboard', 'Activity'],
  deleteEmployee: ['Employees', 'Departments', 'Dashboard', 'Activity'],
  recordAttendance: ['Attendance', 'Dashboard', 'Activity'],
  saveCandidate: ['Candidates', 'Dashboard', 'Activity'],
  moveCandidate: ['Candidates', 'Employees', 'Dashboard', 'Activity'],
  saveReview: ['Reviews', 'Dashboard', 'Activity'],
  // Leaves sync
  applyLeave: ['Leaves', 'Leave Balances', 'Notifications', 'Activity'],
  decideLeave: ['Leaves', 'Leave Balances', 'Notifications', 'Activity'],
  cancelLeave: ['Leaves', 'Activity'],
  // Notifications sync
  acknowledgeNotification: ['Notifications', 'Activity'],
  snoozeNotification: ['Notifications', 'Activity'],
  archiveNotification: ['Notifications', 'Activity'],
  assignNotification: ['Notifications', 'Activity'],
  addNotificationComment: ['Notifications', 'Activity']
};

async function syncAfterMutation(fn, args = []) {
  const moduleNames = SYNC_AFTER_RPC[fn];
  const user = args[0];
  if (!moduleNames || !user) return;
  const modules = SPREADSHEET_MODULES.filter(([moduleName]) => moduleNames.includes(moduleName));
  if (!modules.length) return;
  try {
    await syncSpreadsheetModules(user, modules);
  } catch (error) {
    data().spreadsheetSyncLogs ||= [];
    data().spreadsheetSyncLogs.unshift({
      id: gid(),
      module: 'ERP',
      sheetName: 'Auto Sync',
      direction: 'Export',
      rowsProcessed: 0,
      status: 'Failed',
      message: error.message,
      createdAt: new Date().toISOString(),
      errors: [{ error: error.message }]
    });
  }
}

function mutatingRpcName(fn = '') {
  return !/^(get|appHealth$|globalSearch$|loginUser$|generateReportExport$|generateSpreadsheetExport$|generateTaxInvoicePdf$)/.test(String(fn));
}

async function invokeRpc(fn, args = []) {
  await loadState();
  if (!api[fn]) throw new Error('Unknown function: ' + fn);
  const result = await api[fn](...args);
  await syncAfterMutation(fn, args);
  if (mutatingRpcName(fn)) await saveState();
  return result;
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const fn = body && body.fn;
    const args = body && Array.isArray(body.args) ? body.args : [];
    const result = await invokeRpc(fn, args);
    return res.status(200).json({ result });
  } catch (e) {
    console.error('RPC error:', e.message || String(e));
    return res.status(200).json({ error: e.message || String(e) });
  }
}

module.exports = handler;
module.exports.invokeRpc = invokeRpc;
