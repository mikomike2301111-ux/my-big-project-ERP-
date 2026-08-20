/**
 * Classic formal Purchase Order PDF (Admin Office / Procurement).
 * Layout: company header, P.O. number, TO / SHIP TO, meta row, line items, totals, terms.
 */
const PDFDocument = require('pdfkit');

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return num(v).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function purchaseOrderPdfBuffer({ po, items = [], supplier = {}, settings = {}, shipTo = {} }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margin: 40,
      autoFirstPage: true,
      bufferPages: true,
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

    const poNo = po.poNo || po.id || 'PO-001';
    const poDate = String(po.date || po.createdAt || new Date().toISOString()).slice(0, 10);
    const requisitioner = po.requisitioner || po.createdBy || po.requestedBy || '';
    const shipVia = po.shippedVia || po.shipVia || po.shippingMethod || '';
    const fob = po.fobPoint || po.fob || '';
    const terms = po.terms || po.paymentTerms || supplier.paymentTerms || 'Net 30';

    const toName = supplier.contactPerson || supplier.name || po.supplierName || '';
    const toCompany = supplier.name || po.supplierName || '';
    const toAddr = supplier.address || po.supplierAddress || '';
    const toCity = [supplier.city, supplier.postal].filter(Boolean).join(', ') || '';
    const toPhone = supplier.phone || po.supplierPhone || '';

    const shipName = shipTo.name || company.name;
    const shipCompany = shipTo.company || company.name;
    const shipAddr = shipTo.address || company.address;
    const shipCity = shipTo.city || `${company.city} ${company.postal}`;
    const shipPhone = shipTo.phone || company.phone;

    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(11).text(company.name, left, 40, { width: width * 0.55 });
    doc.fillColor('#555').font('Helvetica-Oblique').fontSize(8).text(company.slogan, left, 54, { width: width * 0.55 });
    doc.fillColor('#333').font('Helvetica').fontSize(8);
    doc.text(company.address, left, 68, { width: width * 0.55 });
    doc.text(`${company.city} ${company.postal}`, left, 80, { width: width * 0.55 });
    doc.text(`Phone ${company.phone}${company.fax ? `  Fax ${company.fax}` : ''}`, left, 92, { width: width * 0.55 });

    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(18).text('PURCHASE ORDER', left, 40, { width, align: 'right' });

    doc.fillColor('#333').font('Helvetica').fontSize(8);
    doc.text('The following number must appear on all related', left, 112, { width });
    doc.text('correspondence, shipping papers, and invoices:', left, 124, { width });
    doc.font('Helvetica-Bold').fontSize(10).text(`P.O. NUMBER: ${poNo}`, left, 140, { width });

    const blockY = 162;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BLUE).text('TO:', left, blockY);
    doc.font('Helvetica').fontSize(8).fillColor('#333');
    let ty = blockY + 14;
    [toName, toCompany, toAddr, toCity, toPhone].filter(Boolean).forEach((line) => {
      doc.text(String(line), left, ty, { width: width * 0.45 });
      ty += 11;
    });

    const shipX = left + width * 0.52;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BLUE).text('SHIP TO:', shipX, blockY);
    doc.font('Helvetica').fontSize(8).fillColor('#333');
    let sy = blockY + 14;
    [shipName, shipCompany, shipAddr, shipCity, shipPhone].filter(Boolean).forEach((line) => {
      doc.text(String(line), shipX, sy, { width: width * 0.48 });
      sy += 11;
    });

    const metaY = Math.max(ty, sy) + 16;
    const metaCols = [
      { label: 'P.O. DATE', value: poDate, w: width * 0.18 },
      { label: 'REQUISITIONER', value: requisitioner, w: width * 0.22 },
      { label: 'SHIPPED VIA', value: shipVia, w: width * 0.2 },
      { label: 'F.O.B. POINT', value: fob, w: width * 0.2 },
      { label: 'TERMS', value: terms, w: width * 0.2 },
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

    const tableTop = metaY + 48;
    const colQty = 50;
    const colUnit = 50;
    const colDesc = width - 50 - 50 - 70 - 70;
    const colPrice = 70;
    const colTotal = 70;
    const headers = [
      { t: 'QTY', w: colQty },
      { t: 'UNIT', w: colUnit },
      { t: 'DESCRIPTION', w: colDesc },
      { t: 'UNIT PRICE', w: colPrice },
      { t: 'TOTAL', w: colTotal },
    ];
    doc.rect(left, tableTop, width, 20).stroke();
    let hx = left;
    headers.forEach((h, i) => {
      if (i > 0) doc.moveTo(hx, tableTop).lineTo(hx, tableTop + 20).stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#333').text(h.t, hx + 4, tableTop + 6, { width: h.w - 8, align: i >= 3 ? 'right' : 'left' });
      hx += h.w;
    });

    const lines = (items.length ? items : [{ quantity: '', unit: '', description: '', unitPrice: '', total: '' }]).slice(0, 16);
    let y = tableTop + 20;
    const rowH = 18;
    const maxTableBottom = 620;

    lines.forEach((item) => {
      if (y + rowH > maxTableBottom) return;
      const qty = item.quantity !== '' && item.quantity != null ? num(item.quantity) : '';
      const unit = item.unit || item.uom || '';
      const desc = item.description || item.productName || item.name || item.item || '';
      const unitPrice = item.unitPrice != null ? num(item.unitPrice) : num(item.unitCost || item.rate);
      const total = item.total != null ? num(item.total) : (qty === '' ? 0 : num(qty) * unitPrice);

      doc.rect(left, y, width, rowH).stroke();
      let cx = left;
      const cells = [
        { t: qty === '' ? '' : String(qty), w: colQty, align: 'right' },
        { t: unit, w: colUnit, align: 'left' },
        { t: desc, w: colDesc, align: 'left' },
        { t: unitPrice ? money(unitPrice) : '', w: colPrice, align: 'right' },
        { t: total ? money(total) : '', w: colTotal, align: 'right' },
      ];
      cells.forEach((cell, i) => {
        if (i > 0) doc.moveTo(cx, y).lineTo(cx, y + rowH).stroke();
        doc.font('Helvetica').fontSize(8).fillColor('#333').text(String(cell.t).slice(0, 80), cx + 3, y + 5, {
          width: cell.w - 6,
          align: cell.align,
          lineBreak: false,
        });
        cx += cell.w;
      });
      y += rowH;
    });

    while (y + rowH <= maxTableBottom && y < tableTop + 20 + rowH * 10) {
      doc.rect(left, y, width, rowH).stroke();
      let cx = left;
      [colQty, colUnit, colDesc, colPrice, colTotal].forEach((w, i) => {
        if (i > 0) doc.moveTo(cx, y).lineTo(cx, y + rowH).stroke();
        cx += w;
      });
      y += rowH;
    }

    const subtotal = num(po.subtotal != null ? po.subtotal : lines.reduce((s, it) => s + num(it.total != null ? it.total : num(it.quantity) * num(it.unitPrice || it.unitCost)), 0));
    const tax = num(po.tax);
    const shipping = num(po.shipping || po.shippingHandling);
    const other = num(po.other);
    const grand = num(po.total != null ? po.total : subtotal + tax + shipping + other);

    const totW = 160;
    const totX = right - totW;
    const labels = [
      ['SUBTOTAL', subtotal],
      ['SALES TAX', tax],
      ['SHIPPING & HANDLING', shipping],
      ['OTHER', other],
      ['TOTAL', grand],
    ];
    labels.forEach(([label, val], i) => {
      const ty2 = y + i * 16;
      doc.font(i === 4 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#333');
      doc.text(label, totX - 130, ty2 + 4, { width: 120, align: 'right' });
      doc.rect(totX, ty2, totW, 16).stroke();
      doc.text(money(val), totX + 4, ty2 + 4, { width: totW - 8, align: 'right' });
    });

    const instrY = y + labels.length * 16 + 20;
    doc.font('Helvetica').fontSize(8).fillColor('#333');
    const instructions = [
      '1. Please send two copies of your invoice.',
      '2. Enter this order in accordance with the prices, terms, delivery method, and specifications listed above.',
      '3. Please notify us immediately if you are unable to ship as specified.',
      '4. Send all correspondence to:',
    ];
    instructions.forEach((line, i) => {
      doc.text(line, left, instrY + i * 12, { width: width * 0.7 });
    });
    doc.text(company.name, left + 16, instrY + 52, { width: width * 0.5 });
    doc.text(company.address, left + 16, instrY + 64, { width: width * 0.5 });
    doc.text(`${company.city} ${company.postal}`, left + 16, instrY + 76, { width: width * 0.5 });
    doc.text(`Phone ${company.phone}${company.fax ? `  Fax ${company.fax}` : ''}`, left + 16, instrY + 88, { width: width * 0.5 });
    doc.text('Authorized by: ___________________________', left, instrY + 110, { width: width * 0.5 });
    doc.text(`Date: ${poDate}`, left + width * 0.55, instrY + 110);

    doc.end();
  });
}

module.exports = { purchaseOrderPdfBuffer };
