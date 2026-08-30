/**
 * 1) Import leave-awsome.css
 * 2) Portal top-bar Compose Email as fixed overlay with clear X
 * 3) Soft class hooks on leave apply modal
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const mainPath = path.join(root, 'src', 'main.jsx');

function ensureImport(m, file) {
  if (m.includes(file)) return m;
  if (m.includes("import './styles.css';")) {
    return m.replace("import './styles.css';", `import './styles.css';\nimport '${file}';`);
  }
  if (m.includes('import "./styles.css"')) {
    return m.replace('import "./styles.css";', `import "./styles.css";\nimport "${file}";`);
  }
  return m;
}

if (!fs.existsSync(mainPath)) {
  console.warn('[leave-email] no main.jsx');
  process.exit(0);
}

let m = fs.readFileSync(mainPath, 'utf8');
m = ensureImport(m, './mobile-polish.css');
m = ensureImport(m, './leave-awsome.css');

const NEW_COMPOSE = `{composeOpen && createPortal(
        <div className="compose-email-overlay" role="dialog" aria-modal="true" aria-label="Compose Email" onClick={() => setComposeOpen(false)}>
          <form className="compose-email-card" onClick={e => e.stopPropagation()} onSubmit={async e => {
            e.preventDefault();
            if (composeSendingRef.current) return;
            composeSendingRef.current = true;
            setComposeSending(true);
            try {
              const res = await rpc('sendComposedEmail', [user, composeForm]);
              if (res.error) alert(res.error);
              else { alert('Email sent successfully'); setComposeOpen(false); setComposeForm({ to: '', cc: '', subject: '', body: '' }); }
            } catch (err) { alert(err.message); }
            finally { composeSendingRef.current = false; setComposeSending(false); }
          }}>
            <header>
              <h2>Compose Email</h2>
              <button type="button" className="compose-close" aria-label="Close" onClick={() => setComposeOpen(false)}><X size={18} /></button>
            </header>
            <label>To<input type="email" value={composeForm.to} onChange={e => setComposeForm({ ...composeForm, to: e.target.value })} placeholder="recipient@email.com" required autoFocus /></label>
            <label>CC<input type="email" value={composeForm.cc} onChange={e => setComposeForm({ ...composeForm, cc: e.target.value })} placeholder="Optional" /></label>
            <label>Subject<input value={composeForm.subject} onChange={e => setComposeForm({ ...composeForm, subject: e.target.value })} required /></label>
            <label>Message<textarea value={composeForm.body} onChange={e => setComposeForm({ ...composeForm, body: e.target.value })} rows={6} required /></label>
            <button className="primary-action" disabled={composeSending}>{composeSending ? 'Sending...' : <><Send size={14} /> Send Email</>}</button>
          </form>
        </div>,
        document.body
      )}`;

if (m.includes('compose-email-overlay')) {
  console.log('[leave-email] compose overlay already applied');
} else {
  const re = /\{composeOpen && \(\s*<div className="modal-backdrop" onClick=\{\(\) => setComposeOpen\(false\)\}>[\s\S]*?<\/div>\s*\)\}/;
  if (re.test(m)) {
    m = m.replace(re, NEW_COMPOSE);
    console.log('[leave-email] compose replaced via regex');
  } else {
    console.warn('[leave-email] compose block not matched');
  }
}

if (!m.includes('createPortal')) {
  m = m.replace(
    "import { createRoot } from 'react-dom/client';",
    "import { createPortal } from 'react-dom';\nimport { createRoot } from 'react-dom/client';"
  );
  console.log('[leave-email] createPortal import added');
}

m = m.replace(
  'ModalCard title="Apply for Leave"',
  'ModalCard title="Apply for Leave" className="leave-apply-card"'
);

fs.writeFileSync(mainPath, m);
console.log('[leave-email] done', m.length);
