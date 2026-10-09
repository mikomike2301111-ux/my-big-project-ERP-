#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const p=path.join(__dirname,'..','src','main.jsx');
let t=fs.readFileSync(p,'utf8');
if(!t||t.trim()==='PLACEHOLDER'||t.length<50000) throw new Error('main.jsx not restored');
const a=t.indexOf('const pageFromRoute = () => {'),b=t.indexOf('\nconst routeParts =',a);
if(a<0||b<0) throw new Error('route function not found');
const fn=`const pageFromRoute = () => {
  const hashRoute = window.location.hash.replace(/^#\\/?/, '').split('/')[0];
  const pathRoute = window.location.pathname.replace(/^\\/+|\\/+$/g, '').split('/')[0];
  const rawInput = hashRoute || (pathRoute && pathRoute.toLowerCase() !== 'index.html' ? pathRoute : 'dashboard');
  const raw = rawInput.trim().toLowerCase().replace(/_/g, '-');
  const extraAliases = { 'accounts-finance': 'finance', 'accounts-finance-workspace': 'finance', 'finance-workspace': 'finance', 'accounting-workspace': 'accounts', 'accounts-workspace': 'accounts', 'accounting-center': 'accounts' };
  const page = routeAliases[raw] || extraAliases[raw] || raw;
  if (nav.some(item => item.id === page)) return page;
  if (page === 'accounts' || page === 'finance' || page === 'accounting') return page;
  if (raw && !pageAliases[raw]) return '__404__';
  return page;
};`;
t=t.slice(0,a)+fn+t.slice(b);
if(!t.includes("page === 'finance' || page === 'accounts' || page === 'accounting'")) throw new Error('Accounting render gate missing');
fs.writeFileSync(p,t);
console.log('[accounts-404-fix] accounts/finance/accounting routes verified');
