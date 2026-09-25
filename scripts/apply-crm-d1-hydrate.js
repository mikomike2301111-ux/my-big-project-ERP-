/** Idempotent patches on restored full api/rpc.js: Year period + QBCALL strip. */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'api', 'rpc.js');
if (!fs.existsSync(file)) { console.warn('[crm-hydrate] missing rpc.js'); process.exit(0); }
let src = fs.readFileSync(file, 'utf8');
if (src.length < 50000) { console.warn('[crm-hydrate] rpc.js still bootstrap — skip'); process.exit(0); }
if (src.includes('CRM_D1_HYDRATE_V9')) { console.log('[crm-hydrate] already applied'); process.exit(0); }

const prRe = /function periodRange\(\s*period\s*=\s*['"]Month['"]\s*\)\s*\{[\s\S]*?return \{ startDate:[\s\S]*?\};\s*\}/;
const prNew = `function periodRange(period = 'Year') { // CRM_D1_HYDRATE_V9
  const cleanPeriod = String(period || 'Year').toLowerCase();
  let days = 365;
  if (cleanPeriod.includes('all') || cleanPeriod.includes('history') || cleanPeriod.includes('full') || cleanPeriod.includes('lifetime')) days = 2000;
  else if (cleanPeriod.includes('day') && !cleanPeriod.includes('today')) days = 1;
  else if (cleanPeriod.includes('week')) days = 7;
  else if (cleanPeriod.includes('month')) days = 30;
  else if (cleanPeriod.includes('quarter')) days = 90;
  else if (cleanPeriod.includes('year')) days = 365;
  else days = 365;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  const label = days === 1 ? 'Day' : days === 7 ? 'Week' : days === 30 ? 'Month' : days === 90 ? 'Quarter' : days >= 2000 ? 'All' : 'Year';
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), days, label };
}`;
if (prRe.test(src)) { src = src.replace(prRe, prNew); console.log('[crm-hydrate] periodRange -> Year'); }
else console.warn('[crm-hydrate] periodRange pattern not found');

if (!src.includes('function stripQbCallJunk')) {
  const helpers = `
function stripQbCallJunk(d) {
  if (!d || !Array.isArray(d.calls)) return;
  const before = d.calls.length;
  d.calls = d.calls.filter(c => c && !String(c.id || '').startsWith('QBCALL') && !String(c.id || '').startsWith('QB-CALL'));
  if (before !== d.calls.length) console.log('[reception-restore] stripped QBCALL', before - d.calls.length, 'remaining', d.calls.length);
}
`;
  const idx = src.indexOf('function data()');
  if (idx > 0) src = src.slice(0, idx) + helpers + src.slice(idx);
}

const dataNeedle = 'function data() {\n  if (!db) seed();\n  applyQuickBooksSeed();';
const dataInject = `function data() {\n  if (!db) seed();\n  applyQuickBooksSeed();\n  try { stripQbCallJunk(db); } catch (e) { console.warn('[reception-restore]', e && e.message); }`;
if (src.includes(dataNeedle) && !src.includes('stripQbCallJunk(db)')) {
  src = src.replace(dataNeedle, dataInject);
  console.log('[crm-hydrate] data() QBCALL strip');
}

fs.writeFileSync(file, src);
console.log('[crm-hydrate] done bytes=', src.length);
