/** Inject runWeeklyBackupToR2 + listR2Backups RPCs (admin). */
const fs = require('fs');
const path = require('path');
const rpcPath = path.join(__dirname, '..', 'api', 'rpc.js');
if (!fs.existsSync(rpcPath)) {
  console.warn('[r2-backup] no rpc.js');
  process.exit(0);
}
let rpc = fs.readFileSync(rpcPath, 'utf8');
if (rpc.includes('runWeeklyBackupToR2')) {
  console.log('[r2-backup] already present');
  process.exit(0);
}
const block = `
  async runWeeklyBackupToR2(user, opts = {}) {
    const u = reqRole(user, ROLES.ADMIN, ROLES.DEV);
    const { run } = require('../scripts/backup-weekly-r2');
    const manifest = await run({ tag: clean(opts.tag) || 'weekly' });
    log(u, 'Weekly backup to R2', 'Settings', manifest.stateKey || manifest.isoWeek);
    return { success: true, manifest };
  },
  async listR2Backups(user) {
    reqRole(user, ROLES.ADMIN, ROLES.DEV, ROLES.MANAGER);
    const r2 = require('../server/r2Client');
    if (!r2.configured()) return { backups: [], configured: false };
    try {
      const obj = await r2.getObject('backups/weekly/latest-manifest.json');
      const text = obj.buffer.toString('utf8');
      const manifest = JSON.parse(text);
      return { configured: true, backups: [manifest], latest: manifest };
    } catch (e) {
      return { configured: true, backups: [], error: e.message };
    }
  },
`;
if (rpc.includes('getBackupList:')) {
  rpc = rpc.replace('getBackupList:', block + '\n  getBackupList:');
} else if (rpc.includes('const SYNC_AFTER_RPC')) {
  rpc = rpc.replace('const SYNC_AFTER_RPC', block + '\nconst SYNC_AFTER_RPC');
}
if (rpc.includes('const SYNC_AFTER_RPC = {') && !rpc.includes('runWeeklyBackupToR2:')) {
  rpc = rpc.replace(
    'const SYNC_AFTER_RPC = {',
    "const SYNC_AFTER_RPC = {\n  runWeeklyBackupToR2: ['Settings', 'Activity'],\n  listR2Backups: ['Settings'],"
  );
}
rpc = rpc.replace(
  "createDailyBackup: () => 'Backup is configured in Vercel deployment.',",
  "createDailyBackup: async (user) => api.runWeeklyBackupToR2(user, { tag: 'manual' }),"
);
fs.writeFileSync(rpcPath, rpc);
console.log('[r2-backup] rpc wired', rpc.length);
