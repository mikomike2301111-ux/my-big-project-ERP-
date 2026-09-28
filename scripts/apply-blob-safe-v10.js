/** Idempotent: make restored api/rpc.js pass concurrency tokens into D1 saves. */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'api', 'rpc.js');
if (!fs.existsSync(file)) { console.warn('[blob-v10] missing rpc.js'); process.exit(0); }
let src = fs.readFileSync(file, 'utf8');
if (src.length < 50000) { console.warn('[blob-v10] rpc.js still bootstrap — skip'); process.exit(0); }
if (src.includes('BLOB_SAFE_V10')) { console.log('[blob-v10] already applied'); process.exit(0); }

const oldSave = 'await d1.saveErpStateDocument(persistedState);';
const newSave = `await d1.saveErpStateDocument(persistedState, { baseGen: (db && db._d1BaseGen) || persistedState._d1BaseGen, baseVersion: Math.max(0, Number((db && db._writeVersion) || persistedState._writeVersion || 1) - 1), mergeOnConflict: true }); // BLOB_SAFE_V10`;
if (src.includes(oldSave)) {
  src = src.replace(oldSave, newSave);
  console.log('[blob-v10] saveState passes baseGen/baseVersion');
} else {
  console.warn('[blob-v10] saveErpStateDocument call not found');
}

if (!src.includes('db._d1BaseGen') && src.includes('d1.getErpStateDocument()')) {
  src = src.replace(
    'const doc = await d1.getErpStateDocument();\n        if (doc && doc.data && typeof doc.data === \'object\') {\n          return [{ data: doc.data }];',
    'const doc = await d1.getErpStateDocument();\n        if (doc && doc.data && typeof doc.data === \'object\') {\n          if (doc.baseGen) doc.data._d1BaseGen = doc.baseGen;\n          return [{ data: doc.data }];'
  );
  console.log('[blob-v10] load stamps _d1BaseGen');
}

fs.writeFileSync(file, src);
console.log('[blob-v10] done bytes=', src.length);
