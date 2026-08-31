#!/usr/bin/env node
/**
 * Grant Accountant (Accounts) role full CRM page access + restorable CRM ops.
 * Additive only — does not remove existing roles.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function patchRpc() {
  const p = path.join(root, 'api', 'rpc.js');
  let t = fs.readFileSync(p, 'utf8');
  let n = 0;
  const pageLine = /customers:\s*\[([^\]]+)\]/;
  const m = t.match(pageLine);
  if (m && !m[1].includes('ROLES.ACCOUNTANT')) {
    t = t.replace(pageLine, (full, inner) => {
      n++;
      return `customers: [${inner.trim().replace(/,?\s*$/, '')}, ROLES.ACCOUNTANT]`;
    });
  }
  for (const key of ['customers', 'calls', 'leads']) {
    const re = new RegExp(`(${key}:\\s*\\{\\s*module:\\s*'CRM',\\s*roles:\\s*\\[)([^\\]]+)(\\])`);
    t = t.replace(re, (full, a, roles, c) => {
      if (roles.includes('ROLES.ACCOUNTANT')) return full;
      n++;
      return a + roles.trim().replace(/,?\s*$/, '') + ', ROLES.ACCOUNTANT' + c;
    });
  }
  fs.writeFileSync(p, t);
  console.log('[accounts-crm] rpc patches', n);
}

function patchMain() {
  const p = path.join(root, 'src', 'main.jsx');
  let t = fs.readFileSync(p, 'utf8');
  const re = /('Accountant':\s*\[[^\]]*)(\])/;
  t = t.replace(re, (full, a, c) => {
    if (a.includes("'customers'") || a.includes('"customers"')) return full;
    return a + ",'customers'" + c;
  });
  fs.writeFileSync(p, t);
  console.log('[accounts-crm] main.jsx Accountant includes customers');
}

patchRpc();
patchMain();
console.log('[accounts-crm] done');
