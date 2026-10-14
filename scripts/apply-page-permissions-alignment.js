#!/usr/bin/env node
/**
 * Align module page visibility and server role checks to avoid visible pages
 * whose workspace RPC immediately rejects the current role.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const file = path.join(__dirname, '..', 'api', 'rpc.js');
const MARK = '/* page-permissions-alignment-v1 */';
let src = fs.readFileSync(file, 'utf8');
if (!src || src.trim() === 'PLACEHOLDER' || src.length < 50000) throw new Error('rpc.js not restored');
if (src.includes(MARK)) {
  console.log('[page-permissions-alignment] already applied');
  process.exit(0);
}
function replaceExact(oldText, newText, label) {
  if (src.includes(newText)) return;
  if (!src.includes(oldText)) throw new Error('Anchor not found: ' + label);
  src = src.replace(oldText, newText);
}
// HR remains allowed on Production because the RPC scopes HR to assigned records.
const productionAccess = "production: [ROLES.DEV, ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.PRODUCTION, ROLES.WAREHOUSE, ROLES.HR],";
if (!src.includes(productionAccess)) throw new Error('Production page access anchor not found');
replaceExact(
  "settings: [ROLES.DEV, ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.HR, ROLES.ACCOUNTANT],",
  "settings: [ROLES.DEV, ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.ACCOUNTANT],",
  'settings page access'
);
const settingsMethod = "getSettingsWorkspaceData(user) {\n    const _d0 = data(); ensureStaffUsers(_d0);\n\n    const u = reqRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT);";
const settingsMethodNext = "getSettingsWorkspaceData(user) {\n    /* page-permissions-alignment-v1 */\n    const _d0 = data(); ensureStaffUsers(_d0);\n\n    const u = reqRole(user, ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.ACCOUNTANT);";
replaceExact(settingsMethod, settingsMethodNext, 'settings workspace role gate');
const manufacturingMethod = "getManufacturingWorkspaceData(user, filters = {}) {\n    reqRole(user, ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.PRODUCTION, ROLES.WAREHOUSE);";
const manufacturingMethodNext = "getManufacturingWorkspaceData(user, filters = {}) {\n    reqRole(user, ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.PRODUCTION, ROLES.WAREHOUSE, ROLES.HR);";
replaceExact(manufacturingMethod, manufacturingMethodNext, 'production workspace role gate');
fs.writeFileSync(file, src);
const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (check.status !== 0) throw new Error((check.stderr || check.stdout || 'syntax check failed').slice(0, 1000));
console.log('[page-permissions-alignment] page visibility and workspace role checks aligned');
