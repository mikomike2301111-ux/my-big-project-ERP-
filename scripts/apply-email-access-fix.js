#!/usr/bin/env node
/**
 * Align Email and Email Admin RPC access with the page-access matrix.
 * Regular Email views are user-scoped; Email Admin is all-log access for
 * Admin, Developer, Executive, and Manager. UI appearance is unchanged.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');
const rpcPath = path.join(root, 'api', 'rpc.js');
const mainPath = path.join(root, 'src', 'main.jsx');
const MARK = '/* email-access-fix-v1 */';

function checkJs(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'syntax check failed').slice(0, 1000));
}
function replaceOnce(source, oldText, newText, label) {
  if (source.includes(newText)) return source;
  if (!source.includes(oldText)) throw new Error('Anchor not found: ' + label);
  return source.replace(oldText, newText);
}

let rpc = fs.readFileSync(rpcPath, 'utf8');
if (!rpc || rpc.trim() === 'PLACEHOLDER' || rpc.length < 50000) throw new Error('rpc.js not restored');
if (!rpc.includes(MARK)) {
  const oldSig = "getEmailLog(user, { limit = 50, module = '', status = '', search = '', startDate = '', endDate = '', page = 0 } = {}) {\n    reqRole(user, ROLES.ADMIN, ROLES.MANAGER);\n    let all = (data().emailLog || []).slice();";
  const newSig = [
    "getEmailLog(user, options = {}) {",
    "    " + MARK,
    "    const { limit = 50, module = '', status = '', search = '', startDate = '', endDate = '', page = 0, adminView = false } = options || {};",
    "    const u = reqRole(user);",
    "    const canViewAll = [ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE, ROLES.MANAGER].includes(u.role);",
    "    if (adminView && !canViewAll) throw new Error('Insufficient permissions');",
    "    let all = (data().emailLog || []).slice();",
    "    if (!adminView && !canViewAll) {",
    "      const ownerKeys = new Set([u.id, u.name, u.email].filter(Boolean).map(value => String(value).trim().toLowerCase()));",
    "      all = all.filter(entry => ownerKeys.has(String(entry.createdBy || entry.created_by || '').trim().toLowerCase()));",
    "    }"
  ].join('\n');
  if (!rpc.includes(oldSig)) throw new Error('getEmailLog access signature not found');
  rpc = rpc.replace(oldSig, newSig);
}
fs.writeFileSync(rpcPath, rpc);
checkJs(rpcPath);

let main = fs.readFileSync(mainPath, 'utf8');
if (!main || main.trim() === 'PLACEHOLDER' || main.length < 50000) throw new Error('main.jsx not restored');
main = replaceOnce(
  main,
  "rpc('getEmailLog', [user, { limit: 500 }])",
  "rpc('getEmailLog', [user, { limit: 500, adminView: true }])",
  'Email Admin stats'
);
main = replaceOnce(
  main,
  "rpc('getEmailLog', [user, { ...filters, limit: 50 }])",
  "rpc('getEmailLog', [user, { ...filters, limit: 50, adminView: true }])",
  'Email Admin filtered logs'
);
fs.writeFileSync(mainPath, main);
console.log('[email-access-fix] Email logs are scoped; Email Admin role access aligned');
