/**
 * Adds Email buttons to Admin Office PO table and email prompt after create.
 * Idempotent string transforms on src/main.jsx.
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

const oldBtn = `                        <button type="button" className="mini-action" onClick={async () => {
                          try {
                            const file = await rpc('generatePurchaseOrderPdf', [user, row.id || row.poNo]);
                            if (file?.base64) {
                              const a = document.createElement('a');
                              a.href = \`data:${file.contentType || 'application/pdf'};base64,${file.base64}\`;
                              a.download = file.fileName || 'purchase-order.pdf';
                              a.click();
                            }
                          } catch (err) { alert(err.message); }
                        }}>PDF</button>`;

const newBtn = oldBtn + `
                        <button type="button" className="mini-action" onClick={async () => {
                          try {
                            const to = window.prompt('Send PO PDF to email (supplier):', '');
                            if (to === null) return;
                            const result = await rpc('emailPurchaseOrder', [user, row.id || row.poNo, { to: to || undefined }]);
                            alert(result?.sent !== false ? \`Emailed to ${result.to}\` : (\`Email failed: ${result?.result?.error || 'check Resend'}\`));
                          } catch (err) { alert(err.message); }
                        }}>Email</button>`;

if (!m.includes("generatePurchaseOrderPdf', [user, row.id")) {
  console.warn('[po-email-ui] PDF button not found — run po-admin-ui patch first');
  process.exit(0);
}

if (m.includes(oldBtn)) {
  m = m.replace(oldBtn, newBtn);
} else {
  // looser replace: after first PO PDF button closing
  m = m.replace(
    "}}>PDF</button>\n                      </td>\n                    </tr>\n                  ))}\n                  {(data?.quotations || []).map",
    "}}>PDF</button>\n                        <button type=\"button\" className=\"mini-action\" onClick={async () => {\n                          try {\n                            const to = window.prompt('Send PO PDF to email (supplier):', '');\n                            if (to === null) return;\n                            const result = await rpc('emailPurchaseOrder', [user, row.id || row.poNo, { to: to || undefined }]);\n                            alert(result?.sent !== false ? `Emailed to ${result.to}` : (`Email failed: ${result?.result?.error || 'check Resend'}`));\n                          } catch (err) { alert(err.message); }\n                        }}>Email</button>\n                      </td>\n                    </tr>\n                  ))}\n                  {(data?.quotations || []).map"
  );
}

// After create: prompt to email
const marker = "alert(`Purchase order ${res?.po?.poNo || ''} created`);";
if (m.includes(marker) && !m.includes("email this PO to supplier")) {
  m = m.replace(
    marker,
    `const sendTo = window.prompt('Email this PO to supplier? Enter email or Cancel to skip:', '');
                  if (sendTo) {
                    try {
                      const em = await rpc('emailPurchaseOrder', [user, res.po.id, { to: sendTo }]);
                      alert(`PO ${res?.po?.poNo || ''} created and emailed to ${em.to}`);
                    } catch (emErr) {
                      alert(`PO created but email failed: ${emErr.message}`);
                    }
                  } else {
                    alert(`Purchase order ${res?.po?.poNo || ''} created`);
                  }`
  );
}

fs.writeFileSync(mainPath, m);
console.log('[po-email-ui] Email actions wired');
