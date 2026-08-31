/** a11y leave, inventory label, invoice delete, photo, failed-to-fetch, login black, PWA, reports */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const mainPath = path.join(root, 'src', 'main.jsx');
const rpcPath = path.join(root, 'api', 'rpc.js');

function ensureImport(m, file) {
  if (m.includes(file)) return m;
  if (m.includes("import './styles.css';")) {
    return m.replace("import './styles.css';", `import './styles.css';\nimport '${file}';`);
  }
  return m;
}

function patchMain() {
  if (!fs.existsSync(mainPath)) { console.warn('[office] no main'); return; }
  let m = fs.readFileSync(mainPath, 'utf8');
  m = ensureImport(m, './a11y-office-polish.css');
  m = ensureImport(m, './hero-profile-fix.css');

  m = m.replace(
    "{ id: 'inventory', label: 'Procurement', icon: Boxes }",
    "{ id: 'inventory', label: 'Inventory', icon: Boxes }"
  );

  if (!m.includes('/* fetch-retry-v1 */') && m.includes("async function rpc(fn, args = [])")) {
    const old = `async function rpc(fn, args = []) {\n  const t0 = performance.now();\n  const res = await fetch('/api/rpc', {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify({ fn, args })\n  });\n  let body;\n  try {\n    body = await res.json();\n  } catch {\n    const text = await res.text().catch(() => '');\n    const status = res.status ? \`HTTP \${res.status}\` : 'Network';\n    throw new Error(text.includes('<') ? \` \${status}: server returned an HTML error page.\` : text || \` \${status}: empty response from server.\`);\n  }`;

    const neu = `async function rpc(fn, args = []) {\n  /* fetch-retry-v1 */\n  const t0 = performance.now();\n  async function doFetch() {\n    const res = await fetch('/api/rpc', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ fn, args })\n    });\n    let body;\n    try {\n      body = await res.json();\n    } catch {\n      const text = await res.text().catch(() => '');\n      const status = res.status ? \`HTTP \${res.status}\` : 'Network';\n      throw new Error(text.includes('<') ? \`\${status}: server error page (try again).\` : (text || \`\${status}: empty response. If this is "Failed to fetch", check connection or wait for server save.\`));\n    }\n    return { res, body };\n  }\n  let body;\n  try {\n    ({ body } = await doFetch());\n  } catch (netErr) {\n    await new Promise(r => setTimeout(r, 600));\n    try {\n      ({ body } = await doFetch());\n    } catch (e2) {\n      const msg = String(e2 && e2.message || netErr.message || 'Failed to fetch');\n      throw new Error(msg.includes('Failed to fetch')\n        ? 'Could not reach the server (Failed to fetch). Check internet, then retry — large saves can take up to 60s.'\n        : msg);\n    }\n  }`;

    if (m.includes(old)) {
      m = m.replace(old, neu);
      console.log('[office] rpc fetch retry');
    }
  }

  if (m.includes("await rpc('deleteRecord', [user, 'invoices', invoiceId]);") && !m.includes('/* invoice-delete-soft-v1 */')) {
    m = m.replace(
      "await rpc('deleteRecord', [user, 'invoices', invoiceId]);",
      "/* invoice-delete-soft-v1 */\n      await rpc('deleteRecord', [user, 'invoices', invoiceId, { hard: false }]);"
    );
  }

  if (!m.includes('pwa-install-toast') && m.includes('beforeinstallprompt')) {
    m = m.replace(
      /window\.addEventListener\('beforeinstallprompt',\s*\(e\)\s*=>\s*\{[\s\S]*?\}\);/,
      `window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__pwaDeferred = e;
    if (document.getElementById('pwa-install-toast')) return;
    const el = document.createElement('div');
    el.id = 'pwa-install-toast';
    el.className = 'pwa-install-toast';
    el.innerHTML = '<p><strong>Install Farmtrack</strong><br/>Add the app to your home screen for faster access.</p><button type="button" class="pwa-install-go">Install</button><button type="button" class="pwa-install-x" aria-label="Dismiss">✕</button>';
    document.body.appendChild(el);
    el.querySelector('.pwa-install-go').onclick = async () => {
      const prompt = window.__pwaDeferred;
      if (!prompt) return;
      prompt.prompt();
      await prompt.userChoice.catch(() => {});
      window.__pwaDeferred = null;
      el.remove();
    };
    el.querySelector('.pwa-install-x').onclick = () => el.remove();
  });`
    );
  }

  fs.writeFileSync(mainPath, m);
  console.log('[office] main', m.length);
}

function patchRpc() {
  if (!fs.existsSync(rpcPath)) return;
  let rpc = fs.readFileSync(rpcPath, 'utf8');

  if (rpc.includes('/* delete-gate-v2 */') && !rpc.includes('/* delete-gate-v3 */')) {
    rpc = rpc.replace(
      `const canHard = [ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE].includes(u.role);
    const canSoft = canHard || [ROLES.MANAGER, ROLES.HR, ROLES.ACCOUNTANT].includes(u.role);
    if (!canSoft) {
      throw new Error('Only managers, HR, accounts, or admins can delete records. Contact your supervisor.');
    }`,
      `/* delete-gate-v3 */
    const canHard = [ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE].includes(u.role);
    const canSoft = canHard || [ROLES.MANAGER, ROLES.HR, ROLES.ACCOUNTANT].includes(u.role)
      || (collection === 'invoices' && [ROLES.SALES, ROLES.ACCOUNTANT].includes(u.role));
    if (!canSoft) {
      throw new Error('Only managers, HR, accounts, or admins can delete records. Contact your supervisor.');
    }`
    );
  }

  if (rpc.includes("if (s.length > 450000)") && !rpc.includes('/* photo-limit-v2 */')) {
    rpc = rpc.replace(
      "if (s.length > 450000) throw new Error('Image too large — please choose a smaller photo');",
      "/* photo-limit-v2 */\n    if (s.length > 900000) throw new Error('Image too large — use a smaller photo (under ~600KB).');"
    );
  }

  if (rpc.includes("getAdminOpsWorkspaceData(user) {\n    const u = reqRole(user, ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE);")) {
    rpc = rpc.replace(
      "getAdminOpsWorkspaceData(user) {\n    const u = reqRole(user, ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE);",
      "getAdminOpsWorkspaceData(user) {\n    const u = reqRole(user, ROLES.ADMIN, ROLES.DEV, ROLES.EXECUTIVE, ROLES.MANAGER);"
    );
  }

  fs.writeFileSync(rpcPath, rpc);
  console.log('[office] rpc', rpc.length);
}

patchMain();
patchRpc();
console.log('[office] done');
