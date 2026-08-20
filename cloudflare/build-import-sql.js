const fs = require('fs');
const path = require('path');
// Read the exported erp_state JSON and chunk it into 32KB pieces.
// Writes one .sql file PER chunk (each contains exactly one INSERT statement)
// so it can be uploaded statement-by-statement without splitting on semicolons.
const data = fs.readFileSync('erp-state.json', 'utf8').trim();
const MAX = 32 * 1024;
const outDir = path.join('cloudflare', 'import-chunks');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const chunks = [];
for (let i = 0; i < data.length; i += MAX) chunks.push(data.slice(i, i + MAX));
chunks.forEach((chunk, idx) => {
  const id = `FTC-STATE-${String(idx + 1).padStart(3, '0')}`;
  const escaped = chunk.replace(/'/g, "''");
  const sql = `INSERT INTO erp_state (id, data, updated_at) VALUES ('${id}', '${escaped}', datetime('now')) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=datetime('now');`;
  fs.writeFileSync(path.join(outDir, `chunk-${String(idx + 1).padStart(3, '0')}.sql`), sql);
});
console.log('chunk files written:', chunks.length);
