/** V9: stop hiding CRM/sales lists. perf-slim-crm-v1 capped customers at 250. */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'api', 'rpc.js');
if (!fs.existsSync(file)) process.exit(0);
let src = fs.readFileSync(file, 'utf8');
if (src.length < 50000) { console.warn('[uncap-v9] rpc.js still bootstrap — skip'); process.exit(0); }
if (src.includes('CRM_UNCAP_V9')) { console.log('[uncap-v9] already applied'); process.exit(0); }

const replacements = [
  ['customers: (customers || []).slice(0, 250)', 'customers: (customers || []).slice(0, 5000) /* CRM_UNCAP_V9 */'],
  ['leads: (leads || []).slice(0, 150)', 'leads: (leads || []).slice(0, 2000)'],
  ['calls: (calls || []).slice(0, 150)', 'calls: (calls || []).slice(0, 2000)'],
  ['orders: (orders || []).slice(0, 150)', 'orders: (orders || []).slice(0, 2000)'],
  ['invoices: (invoices || []).slice(0, 150)', 'invoices: (invoices || []).slice(0, 2000)'],
  ['deliveries: (deliveryReports || []).slice(0, 100)', 'deliveries: (deliveryReports || []).slice(0, 2000)'],
];
let n = 0;
for (const [a, b] of replacements) {
  if (src.includes(a)) { src = src.replace(a, b); n++; }
}
if (!src.includes('CRM_UNCAP_V9')) {
  src = src.replace(
    'getCRMWorkspaceData(user, filters = {}) {',
    'getCRMWorkspaceData(user, filters = {}) { // CRM_UNCAP_V9\n'
  );
}
fs.writeFileSync(file, src);
console.log('[uncap-v9] replacements=', n, 'bytes=', src.length);
