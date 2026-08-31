#!/usr/bin/env node
/**
 * Fix Accounts/Finance 404: setPage('accounts'|'finance') was writing #/accounts
 * but pageFromRoute only allowed nav ids → __404__. Allow accounts/finance routes.
 */
const fs = require('fs');
const path = require('path');
const MAIN = path.join(__dirname, '..', 'src', 'main.jsx');
let t = fs.readFileSync(MAIN, 'utf8');

if (!t.includes('Accounts + Finance are real workspaces')) {
  const re = /const pageFromRoute = \(\) => \{[\s\S]*?return page;\n\};/;
  if (!re.test(t)) {
    console.warn('pageFromRoute not found');
  } else {
    t = t.replace(re, `const pageFromRoute = () => {
  const raw = window.location.hash.replace(/^#\\/?/, '').split('/')[0] || 'dashboard';
  const page = routeAliases[raw] || raw;
  if (nav.some(item => item.id === page)) return page;
  // Accounts + Finance are real workspaces (tabs under Accounting) — never 404 them
  if (page === 'accounts' || page === 'finance' || page === 'accounting') return page === 'accounting' ? 'accounting' : page;
  if (raw && !pageAliases[raw]) return '__404__';
  return page;
};`);
    console.log('Fixed pageFromRoute for accounts/finance');
  }
} else {
  console.log('pageFromRoute already fixed');
}

if (!t.includes("page === 'finance' || page === 'accounts' || page === 'accounting'")) {
  console.warn('AccountingWorkspace render gate may be missing');
} else {
  console.log('AccountingWorkspace render gate OK');
}

fs.writeFileSync(MAIN, t);
console.log('apply-accounts-404-fix done');
