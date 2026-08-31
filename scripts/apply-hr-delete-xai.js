/**
 * Idempotent: restore AI if PLACEHOLDER, HR permanent delete, visible Delete, XAI const.
 * At build time downloads last known-good ai-assistant if needed.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const root = path.join(__dirname, '..');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode + ' ' + url));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

async function restoreAiIfBroken() {
  const p = path.join(root, 'api', 'ai-assistant.js');
  let s = '';
  try { s = fs.readFileSync(p, 'utf8'); } catch (e) { s = ''; }
  if (s.trim() === 'PLACEHOLDER' || s.length < 500 || !s.includes('askGemini')) {
    const url = 'https://raw.githubusercontent.com/mikomike2301111-ux/my-big-project-ERP-/35181817f7dbb15bdf9fdec19a18a79d1eeb1da7/api/ai-assistant.js';
    console.log('[hr-delete-xai] downloading good ai-assistant.js ...');
    s = await fetchText(url);
    if (!s.includes('XAI_API_KEY')) {
      s = s.replace(
        "const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';",
        "const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';\nconst GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';"
      );
    }
    if (!s.includes('async function askXai')) {
      const ask = `\nasync function askXai(messages) {\n  if (!XAI_API_KEY) throw new Error('XAI_API_KEY not set');\n  const res = await fetchWithTimeout('https://api.x.ai/v1/chat/completions', {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + XAI_API_KEY },\n    body: JSON.stringify({\n      model: 'grok-4.5',\n      max_tokens: 2048,\n      messages: messages.map(m => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content })),\n    }),\n  }, AI_TIMEOUT_MS);\n  if (!res.ok) {\n    const t = await res.text().catch(() => '');\n    throw new Error('xAI ' + res.status + ': ' + t.slice(0, 200));\n  }\n  const body = await res.json();\n  return (body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content) || '';\n}\n\n`;
      s = s.replace('async function askGemini(messages) {', ask + 'async function askGemini(messages) {');
    }
    if (!s.includes("tried.push('xai/grok-4.5')")) {
      s = s.replace(
        "if (GROQ_API_KEY) {\n      tried.push('groq/llama-3.3-70b');\n      reply = await askGroq(messages);\n      modelUsed = 'groq/llama-3.3-70b';\n      fallbackUsed = false;\n    } else {",
        "if (XAI_API_KEY) {\n      tried.push('xai/grok-4.5');\n      reply = await askXai(messages);\n      modelUsed = 'xai/grok-4.5';\n      fallbackUsed = false;\n    } else if (GROQ_API_KEY) {\n      tried.push('groq/llama-3.3-70b');\n      reply = await askGroq(messages);\n      modelUsed = 'groq/llama-3.3-70b';\n      fallbackUsed = false;\n    } else {"
      );
    }
    fs.writeFileSync(p, s);
    console.log('[hr-delete-xai] restored + XAI-wired api/ai-assistant.js');
  } else {
    console.log('[hr-delete-xai] ai-assistant ok');
  }
}

function patchRpc() {
  const p = path.join(root, 'api', 'rpc.js');
  if (!fs.existsSync(p)) return;
  let s = fs.readFileSync(p, 'utf8');
  let n = 0;
  if (s.includes('permanentlyDeleteEmployee(user, id)') && !s.includes('Employee permanently deleted')) {
    s = s.replace(
      /permanentlyDeleteEmployee\(user, id\) \{\s*const u = reqRole\(user, ROLES\.ADMIN\);/,
      'permanentlyDeleteEmployee(user, id) {\n    const u = reqRole(user, ROLES.ADMIN, ROLES.HR, ROLES.DEV, ROLES.MANAGER);'
    );
    s = s.replace(
      /const \[removed\] = d\.employees\.splice\(idx, 1\);\s*log\(u, `Permanently delete employee \$\{removed\.name\}`, 'HR'\);\s*return \{ success: true \};/,
      "const [removed] = d.employees.splice(idx, 1);\n" +
      "    d.hrAuditLog = Array.isArray(d.hrAuditLog) ? d.hrAuditLog : [];\n" +
      "    d.hrAuditLog.unshift({ id: gid(), employeeId: removed.id, action: 'Employee permanently deleted', employeeName: removed.name, employeeNo: removed.employeeNo || '', by: u.name, at: new Date().toISOString() });\n" +
      "    if (d.hrAuditLog.length > 2000) d.hrAuditLog = d.hrAuditLog.slice(0, 2000);\n" +
      "    if (removed.userId && Array.isArray(d.users)) {\n" +
      "      const usr = d.users.find(x => x.id === removed.userId);\n" +
      "      if (usr && usr.employeeId === removed.id) { usr.employeeId = ''; usr.updatedAt = new Date().toISOString(); }\n" +
      "    }\n" +
      "    log(u, `Permanently delete employee ${removed.name}`, 'HR', removed.employeeNo || removed.id);\n" +
      "    try { if (typeof saveState === 'function') Promise.resolve(saveState()).catch(() => {}); } catch {}\n" +
      "    return { success: true, deletedId: removed.id, name: removed.name };"
    );
    n += 1;
  }
  if (!s.includes("permanentlyDeleteEmployee: ['Employees")) {
    if (s.includes("deleteEmployee: ['Employees', 'Departments', 'Dashboard', 'Activity'],")) {
      s = s.replace(
        "deleteEmployee: ['Employees', 'Departments', 'Dashboard', 'Activity'],",
        "deleteEmployee: ['Employees', 'Departments', 'Dashboard', 'Activity'],\n  permanentlyDeleteEmployee: ['Employees', 'Departments', 'Dashboard', 'Activity', 'HR'],\n  restoreEmployee: ['Employees', 'Departments', 'Dashboard', 'Activity', 'HR'],"
      );
      n += 1;
    }
  }
  if (n) { fs.writeFileSync(p, s); console.log('[hr-delete-xai] rpc.js patched', n); }
  else console.log('[hr-delete-xai] rpc.js ok');
}

function patchMain() {
  const p = path.join(root, 'src', 'main.jsx');
  if (!fs.existsSync(p)) return;
  let s = fs.readFileSync(p, 'utf8');
  if (s.includes('Permanently delete from directory')) {
    console.log('[hr-delete-xai] main.jsx ok');
    return;
  }
  const needle = 'onClick: () => handleDeleteEmployeeHard(emp) }';
  const idx = s.indexOf(needle);
  if (idx < 0) {
    console.warn('[hr-delete-xai] main.jsx: hard-delete action not found');
    return;
  }
  const am = s.lastIndexOf('<ActionMenu', idx);
  if (am < 0) return;
  const inject = [
    "                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>",
    "                          {emp.status === 'Active' && (",
    '                            <button type="button" className="mini-action" title="Deactivate (keep record)" onClick={() => handleDeleteEmployee(emp)}>Deactivate</button>',
    "                          )}",
    "                          {emp.status !== 'Active' && (",
    "                            <button type=\"button\" className=\"mini-action\" title=\"Restore employee\" onClick={async () => { try { await rpc('restoreEmployee', [user, emp.id]); setRefreshKey(k => k + 1); } catch (err) { alert(err.message); } }}>Restore</button>",
    "                          )}",
    '                          <button type="button" className="mini-action danger" title="Permanently delete from directory" onClick={() => handleDeleteEmployeeHard(emp)}><Trash2 size={14} /> Delete</button>',
    ''
  ].join('\n');
  s = s.slice(0, am) + inject + s.slice(am);
  const closeTarget = '].filter(Boolean)}\n                        />\n                      </td>';
  const closeRep = '].filter(Boolean)}\n                        />\n                        </div>\n                      </td>';
  const pos = s.indexOf(closeTarget, am);
  if (pos > 0) s = s.slice(0, pos) + closeRep + s.slice(pos + closeTarget.length);
  fs.writeFileSync(p, s);
  console.log('[hr-delete-xai] main.jsx visible Delete added');
}

(async () => {
  try {
    await restoreAiIfBroken();
  } catch (e) {
    console.error('[hr-delete-xai] AI restore failed:', e.message);
  }
  patchRpc();
  patchMain();
  console.log('[hr-delete-xai] done');
})();
