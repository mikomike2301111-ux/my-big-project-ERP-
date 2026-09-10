const fs = require('fs');
const path = require('path');
const dir = __dirname;
let src = '';
for (let i = 0; i < 10; i++) {
  const p = path.join(dir, `rpc.p${String(i).padStart(2, '0')}.txt`);
  src += fs.readFileSync(p, 'utf8');
}
const Module = require('module');
const m = new Module(path.join(dir, 'rpc.assembled.js'));
m.filename = path.join(dir, 'rpc.assembled.js');
m.paths = Module._nodeModulePaths(dir);
m._compile(src, m.filename);
module.exports = m.exports;
if (m.exports && m.exports.invokeRpc) module.exports.invokeRpc = m.exports.invokeRpc;
