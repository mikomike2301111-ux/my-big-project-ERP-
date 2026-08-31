/**
 * Adds Email buttons to Admin Office PO list (idempotent).
 */
const fs = require('fs');
const path = require('path');

const mainPath = path.join(__dirname, '..', 'src', 'main.jsx');
if (!fs.existsSync(mainPath)) {
  console.warn('[po-email-ui] main.jsx missing');
  process.exit(0);
}
let m = fs.readFileSync(mainPath, 'utf8');
if (m.includes("rpc('emailPurchaseOrder'")) {
  console.log('[po-email-ui] already wired');
  process.exit(0);
}

if (!m.includes('generatePurchaseOrderPdf')) {
  console.warn('[po-email-ui] PO PDF UI not present yet — skip');
  process.exit(0);
}

const emailBtn =
  '<button type="button" className="mini-action" onClick={async () => {\n' +
  "                          try {\n" +
  "                            const to = window.prompt('Send PO PDF to email (supplier):', '');\n" +
  "                            if (to === null) return;\n" +
  "                            const result = await rpc('emailPurchaseOrder', [user, row.id || row.poNo, { to: to || undefined }]);\n" +
  "                            alert(result?.sent !== false ? `Emailed to ${result.to}` : (`Email failed: ${result?.result?.error || 'check Resend'}`));\n" +
  "                          } catch (err) { alert(err.message); }\n" +
  '                        }}>Email</button>';

const needle = '}}>PDF</button>';
const idx = m.indexOf(needle);
if (idx === -1) {
  console.warn('[po-email-ui] PDF button not found');
  process.exit(0);
}
m = m.slice(0, idx + needle.length) + '\n                        ' + emailBtn + m.slice(idx + needle.length);

fs.writeFileSync(mainPath, m);
console.log('[po-email-ui] Email button added');
