/**
 * Branded Non-PO / supplier invoice PDF (Accounts).
 * Mirrors the classic formal PO layout: company header, invoice number,
 * bill-to block, meta row, line items, totals, terms & notes.
 */
const PDFDocument = require('pdfkit');

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return num(v).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function supplierInvoicePdfBuffer({ invoice = {}, items = [], supplier = {}, settings = {} }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', layout: 'portrait', margin: 40, autoFirstPage: true, bufferPages: true,
    });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const BLUE = '#1a3a6b';
    const LINE = '#333333';

    const company = {
      name: settings.company_name || 'Farmtrack Biosciences Ltd',
      slogan: settings.company_slogan || 'Agricultural Biological Solutions',
      address: settings.company_address_line1 || settings.company_address || 'Nairobi, Kenya',
      city: settings.company_city || 'Nairobi',
      postal: settings.company_postal || '00100',
      phone: settings.company_phone || '+254 711 495 522',
      fax: settings.company_fax || '',
      email: settings.company_email || 'farmtrack.consulting@gmail.com',
      pin: settings.company_kra_pin || settings.kra_pin || 'P051234567X',
    };

    const invNo = invoice.invoiceNo || invoice.id || 'NPO-001';
    const invDate = String(invoice.invoiceDate || invoice.date || invoice.createdAt || new Date().toISOString()).slice(0, 10);
    const dueDate = String(invoice.dueDate || '').slice(0, 10) || invDate;
    const terms = invoice.paymentTerms || supplier.paymentTerms || 'Net 30';
    const category = invoice.category || 'Direct purchase';
    const createdBy = invoice.createdBy || '';

    const toName = supplier.name || invoice.supplierName || '';
    const toAddr = supplier.address || '';
    const toCity = [supplier.city, supplier.postal].filter(Boolean).join(', ') || '';
    const toPhone = supplier.phone || '';
    const toPin = supplier.kraPin || supplier.kra_pin || supplier.pin || '';

    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(11).text(company.name, left, 40, { width: width * 0.55 });
    doc.fillColor('#555').font('Helvetica-Oblique').fontSize(8).text(company.slogan, left, 54, { width: width * 0.55 });
    doc.fillColor('#333').font('Helvetica').fontSize(8);
    doc.text(company.address, left, 68, { width: width * 0.55 });
    doc.text(`${company.city} ${company.postal}`, left, 80, { width: width * 0.55 });
    doc.text(`Phone ${company.phone}${company.fax ? `  Fax ${company.fax}` : ''}`, left, 92, { width: width * 0.55 });
    doc.text(`VAT PIN: ${company.pin}`, left, 104, { width: width * 0.55 });

    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(18).text('NON-PO INVOICE', left, 40, { width, align: 'right' });
    doc.fillColor('#333').font('Helvetica').fontSize(8);
    doc.font('Helvetica-Bold').fontSize(10).text(`INVOICE NUMBER: ${invNo}`, left, 128, { width });
    doc.font('Helvetica').fontSize(8).text('Please remit payment directly to the account listed below.', left, 144, { width });

    const blockY = 164;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BLUE).text('BILL TO / SUPPLIER:', left, blockY);
    doc.font('Helvetica').fontSize(8).fillColor('#333');
    let ty = blockY + 14;
    [toName, toAddr, toCity, toPhone, toPin ? `Tax PIN: ${toPin}` : ''].filter(Boolean).forEach((line) => {
      doc.text(String(line), left, ty, { width: width * 0.55 });
      ty += 11;
    });

    const metaY = Math.max(ty, blockY + 60) + 4;
    const metaCols = [
      { label: 'INVOICE DATE', value: invDate, w: width * 0.25 },
      { label: 'DUE DATE', value: dueDate, w: width * 0.25 },
      { label: 'TERMS', value: terms, w: width * 0.25 },
      { label: 'CATEGORY', value: category, w: width * 0.25 },
    ];
    let mx = left;
    doc.strokeColor(LINE).lineWidth(0.8);
    doc.rect(left, metaY, width, 36).stroke();
    metaCols.forEach((c, i) => {
      if (i > 0) doc.moveTo(mx, metaY).lineTo(mx, metaY + 36).stroke();
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#333').text(c.label, mx + 4, metaY + 4, { width: c.w - 8 });
      doc.font('Helvetica').fontSize(8).text(String(c.value || ''), mx + 4, metaY + 18, { width: c.w - 8 });
      mx += c.w;
    });
    const tableTop = metaY + 50;
    const colQty = 50;
    const colUnit = 60;
    const colPrice = 80;
    const colTotal = 80;
    const colDesc = width - colQty - colUnit - colPrice - colTotal;
    doc.strokeColor(LINE).lineWidth(1);
    doc.rect(left, tableTop, width, 20).fill('#f2f4f7').stroke();
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8);
    doc.text('QTY', left + 4, tableTop + 6, { width: colQty - 8 });
    doc.text('UNIT', left + colQty + 4, tableTop + 6, { width: colUnit - 8 });
    const pNameX = left + colQty + colUnit;
    doc.text('DESCRIPTION', pNameX + 4, tableTop + 6, { width: colDesc - 8 });
    const pPriceX = pNameX + colDesc;
    doc.text('UNIT PRICE', pPriceX + 2, tableTop + 6, { width: colPrice - 8, align: 'right' });
    const pTotalX = pPriceX + colPrice;
    doc.text('AMOUNT', pTotalX + 2, tableTop + 6, { width: colTotal - 8, align: 'right' });

    const safeItems = (Array.isArray(items) && items.length ? items : []).filter(Boolean).map(it => ({
      quantity: num(it.quantity || it.qty || 1),
      unit: it.unit || it.uom || '',
      productName: it.productName || it.description || it.name || 'Item',
      unitPrice: num(it.unitCost || it.unitPrice || it.rate || 0),
      total: num(it.total) || (num(it.quantity || it.qty || 1) * num(it.unitCost || it.unitPrice || it.rate || 0)),
    }));
    if (!safeItems.length) {
      safeItems.push({ quantity: 1, unit: '', productName: invoice.notes || 'Goods / services', unitPrice: num(invoice.subtotal || invoice.invoiceAmount || 0), total: num(invoice.subtotal || invoice.invoiceAmount || 0) });
    }
    let rowY = tableTop + 24;
    doc.lineWidth(0.5);
    safeItems.forEach(it => {
      doc.strokeColor('#e4e7ec').moveTo(left, rowY).lineTo(right, rowY).stroke();
      doc.font('Helvetica').fontSize(8).fillColor('#333');
      doc.text(String(it.quantity), left + 4, rowY + 3, { width: colQty - 8 });
      doc.text(String(it.unit || ''), left + colQty + 4, rowY + 3, { width: colUnit - 8 });
      doc.text(String(it.productName).slice(0, 120), pNameX + 4, rowY + 3, { width: colDesc - 8 });
      doc.text(money(it.unitPrice), pPriceX + 2, rowY + 3, { width: colPrice - 8, align: 'right' });
      doc.text(money(it.total), pTotalX + 2, rowY + 3, { width: colTotal - 8, align: 'right' });
      rowY += 18;
    });

    const totalsTop = Math.max(rowY + 8, tableTop + 24 + safeItems.length * 18 + 8);
    const subtotal = safeItems.reduce((sum, it) => sum + num(it.total), 0);
    const tax = num(invoice.tax) || 0;
    const total = num(invoice.invoiceAmount || invoice.total || subtotal + tax);
    const paid = num(invoice.paidAmount || 0);
    const balance = Math.max(0, total - paid);
    const tl = left + width * 0.52;
    const rowsTot = [['Sub Total', money(subtotal)], ['VAT', money(tax)], ['Invoice Total', money(total)]];
    if (paid) rowsTot.push(['Amount Paid', money(paid)]);
    rowsTot.push(['Balance Due', money(balance)]);
    let cl = totalsTop;
    rowsTot.forEach(([lab, val]) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(BLUE).text(lab, tl, cl, { width: width * 0.26 });
      doc.font('Helvetica').fontSize(8).fillColor('#333').text(String(val), tl + width * 0.26, cl, { width: width * 0.22, align: 'right' });
      cl += 14;
    });

    const instrY = cl + 20;
    doc.strokeColor(LINE).lineWidth(0.8).rect(left, instrY, width * 0.55, 90).stroke();
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8).text('TERMS & NOTES', left + 8, instrY + 6);
    doc.font('Helvetica').fontSize(8).fillColor('#333');
    const noteLines = [invoice.notes || 'Goods/services were supplied without a purchase order.', category ? `Category: ${category}` : '', invoice.paymentRef || ''].filter(Boolean);
    doc.text(noteLines.join('\n'), left + 8, instrY + 18, { width: width * 0.48 });
    if (createdBy) doc.text(`Prepared by: ${createdBy}`, left + 8, instrY + 74, { width: width * 0.48 });

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#333').text('Authorized by: ___________________________', left + width * 0.55 + 10, instrY + 8, { width: width * 0.42 });
    doc.text(`Date: ${invDate}`, left + width * 0.55 + 10, instrY + 22, { width: width * 0.42 });

    doc.end();
  });
}

module.exports = { supplierInvoicePdfBuffer };
