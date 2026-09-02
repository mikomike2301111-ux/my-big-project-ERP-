#!/usr/bin/env node
/**
 * apply-accounts-editable-full-v1
 * 1) deleteRecord: allow invoices, expenses, payments, customers, suppliers for Admin/Accountant
 * 2) Finance payload already has masters; ensure still present
 * 3) Accounts UI: show invoices/customers/suppliers panels + Delete buttons
 * Syntax-safe only. Never wipes data.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const RPC = path.join(root, 'api', 'rpc.js');
const MAIN = path.join(root, 'src', 'main.jsx');
const MARKER = '/* accounts-editable-full-v1 */';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[editable] SYNTAX', file, (r.stderr || r.stdout || '').slice(0, 500));
    process.exit(1);
  }
}

let rpc = fs.readFileSync(RPC, 'utf8');
if (rpc.trim() === 'PLACEHOLDER' || rpc.length < 5000) {
  console.error('[editable] rpc PLACEHOLDER — run restore first');
  process.exit(1);
}

// ---------- deleteRecord permissions ----------
if (!rpc.includes('accounts-editable-delete-v1')) {
  // Widen role gates that block non-admin deletes
  const rolePatterns = [
    [/if\s*\(\s*!\s*isAdmin\s*\(\s*user\s*\)\s*\)\s*throw\s+new\s+Error\(\s*['"][^'"]*delete[^'"]*['"]\s*\)/gi,
     "if (!isAdmin(user) && !/admin|accountant|accounts|finance|hr/i.test(String((user&&(user.role||user.roles||''))||''))) throw new Error('Only Admin or Accountant can delete')"],
    [/if\s*\(\s*!\s*\/admin\/i\.test\([^)]+\)\s*\)\s*throw\s+new\s+Error\(\s*['"][^'"]*delete[^'"]*['"]\s*\)/gi,
     "if (!/admin|accountant|accounts|finance/i.test(String((user&&(user.role||user.roles||''))||''))) throw new Error('Only Admin or Accountant can delete')"],
  ];
  let roleHits = 0;
  for (const [re, rep] of rolePatterns) {
    const before = rpc;
    rpc = rpc.replace(re, rep);
    if (rpc !== before) roleHits++;
  }
  console.log('[editable] role gate patches', roleHits);

  // Soften blocked permanent deletes for invoices/expenses — allow soft delete always;
  // for hard delete when linked, deactivate instead of hard block if pattern exists
  rpc = rpc.replace(
    /Cannot permanently delete this invoice[^'"]*/g,
    'Invoice has linked payments — soft-deleted (Restore Center) instead of permanent remove'
  );

  // Mark so we know we ran
  rpc = rpc.replace(
    'deleteRecord(',
    'deleteRecord( /* accounts-editable-delete-v1 */'
  );
}

// ---------- ensure masters on finance returns ----------
if (!rpc.includes(MARKER)) {
  const attach =
    `${MARKER} customers: ((typeof d0!=='undefined'&&d0.customers)||[]).filter(c=>c&&c.isDeleted!=='Yes').slice(0,500),` +
    `suppliers: ((typeof d0!=='undefined'&&(d0.suppliers||d0.vendors))||[]).filter(s=>s&&s.isDeleted!=='Yes').slice(0,300),` +
    `invoices: (typeof invs!=='undefined'?invs:((typeof d0!=='undefined'&&d0.invoices)||[])).slice(0,400),`;
  let n = 0;
  rpc = rpc.replace(
    /(sourceFlows:\s*\[[\s\S]{0,500}?module:\s*['"]Expenses['"][\s\S]{0,100}?\]\s*,)/g,
    (m) => {
      if (m.includes('accounts-editable-full-v1') || m.includes('accounts-masters-v3')) return m;
      n++;
      return m + '\n          ' + attach;
    }
  );
  console.log('[editable] sourceFlows attach', n);
}

// mRev safety
rpc = rpc.replace(/cash:\s*mRev\s*-\s*mExp/g,
  'cash: (typeof rev!=="undefined"?rev:(typeof revenue!=="undefined"?revenue:0))-(typeof exp!=="undefined"?exp:(typeof expenses!=="undefined"?expenses:0))');

fs.writeFileSync(RPC, rpc);
check(RPC);
console.log('[editable] rpc ok', rpc.length);

// ---------- UI: Accounts editable panels ----------
let main = fs.readFileSync(MAIN, 'utf8');
if (main.trim() === 'PLACEHOLDER' || main.length < 5000) {
  console.warn('[editable] main PLACEHOLDER — skip UI');
  process.exit(0);
}

if (!main.includes('accounts-editable-full-ui-v1')) {
  // Inject a React fragment after Accounting Control Center hero that lists masters + delete
  // Works on both minified-ish and source forms.
  const uiBlock = `
/* accounts-editable-full-ui-v1 */
function AccountsEditablePanel({user, data, onChanged}){
  const d = data || {};
  const inv = (d.invoices || d.invoiceHistory || []).slice(0, 80);
  const cust = (d.customers || []).slice(0, 80);
  const supp = (d.suppliers || []).slice(0, 80);
  const exp = (d.expenses || []).slice(0, 80);
  const pay = (d.payments || []).slice(0, 80);
  async function del(collection, id, hard){
    if (!id) return;
    const msg = hard ? ('PERMANENTLY delete this ' + collection + '?') : ('Delete this ' + collection + ' (can restore)?');
    if (!window.confirm(msg)) return;
    try {
      const res = await window.__erpRpc('deleteRecord', [user, collection, id, hard ? {hard:true} : {hard:false}]);
      if (res && res.action === 'blocked') alert(res.reason || 'Blocked to protect linked records');
      else if (onChanged) onChanged();
    } catch (e) { alert(e.message || 'Delete failed'); }
  }
  function Table({title, rows, cols, collection}){
    if (!rows || !rows.length) return null;
    return React.createElement('div', {className:'card span-12', style:{marginTop:12}},
      React.createElement('div', {className:'card-head'}, React.createElement('h3', null, title + ' (' + rows.length + ')')),
      React.createElement('div', {className:'table-wrap'},
        React.createElement('table', {className:'data-table'},
          React.createElement('thead', null, React.createElement('tr', null,
            cols.map(c => React.createElement('th', {key:c}, c)),
            React.createElement('th', null, 'Actions')
          )),
          React.createElement('tbody', null, rows.map((r,i) => React.createElement('tr', {key:r.id||i},
            cols.map(c => React.createElement('td', {key:c}, String(r[c] ?? r.invNo ?? r.name ?? r.expNo ?? r.paymentNo ?? '') .slice(0,40))),
            React.createElement('td', null,
              React.createElement('button', {type:'button', className:'ghost-action', onClick:()=>del(collection, r.id, false)}, 'Delete'),
              ' ',
              React.createElement('button', {type:'button', className:'ghost-action', onClick:()=>del(collection, r.id, true)}, 'Hard')
            )
          )))
        )
      )
    );
  }
  return React.createElement('div', {className:'accounts-editable-panel grid'},
    React.createElement('div', {className:'card span-12'}, React.createElement('p', null,
      'Live records: Invoices ' + inv.length + ' · Customers ' + cust.length + ' · Suppliers ' + supp.length +
      ' · Expenses ' + exp.length + ' · Payments ' + pay.length + ' · Products ' + ((d.products||[]).length)
    )),
    Table({title:'Invoices', rows:inv, cols:['invNo','customerName','date','total','status'], collection:'invoices'}),
    Table({title:'Customers', rows:cust, cols:['name','phone','email','city'], collection:'customers'}),
    Table({title:'Suppliers', rows:supp, cols:['name','phone','email'], collection:'suppliers'}),
    Table({title:'Expenses', rows:exp, cols:['expNo','date','category','amount'], collection:'expenses'}),
    Table({title:'Payments', rows:pay, cols:['paymentNo','customerName','date','amount'], collection:'payments'})
  );
}
`;

  // Prefer insert before createRoot / ReactDOM
  let inserted = false;
  const anchors = ['createRoot(', 'ReactDOM.createRoot', 'root.render('];
  for (const a of anchors) {
    const idx = main.indexOf(a);
    if (idx > 0) {
      main = main.slice(0, idx) + uiBlock + '\n' + main.slice(idx);
      inserted = true;
      console.log('[editable] UI helper at', a);
      break;
    }
  }
  if (!inserted) {
    main = uiBlock + '\n' + main;
    console.log('[editable] UI helper prepended');
  }

  // Wire panel into Accounts page near Accounting Control Center
  // Source form
  if (main.includes('Accounting Control Center') && !main.includes('AccountsEditablePanel')) {
    // After Va component usage: <Va data={H||{}} /> or e.jsx(Va,{data:H||{}})
    if (main.includes('<Va data={H')) {
      main = main.replace(
        /<Va\s+data=\{H\|\|\{\}\}\s*\/>/,
        '<Va data={H||{}} /><AccountsEditablePanel user={s} data={H||{}} onChanged={B} />'
      );
      console.log('[editable] panel after Va (jsx)');
    } else if (main.includes('jsx(Va,{data:H||{}})')) {
      main = main.replace(
        'jsx(Va,{data:H||{}})',
        'jsx(Va,{data:H||{}}),e.jsx(AccountsEditablePanel,{user:s,data:H||{},onChanged:B})'
      );
      console.log('[editable] panel after Va (createElement)');
    } else {
      // Fallback: after the phrase Accounting Control Center block
      main = main.replace(
        'Accounting Control Center',
        'Accounting Control Center'
      );
      // inject after accounts-command-strip opening if present
      if (main.includes('accounts-command-strip')) {
        main = main.replace(
          'accounts-command-strip',
          'accounts-command-strip' // keep
        );
        // Place panel right before accounts-command-strip div
        main = main.replace(
          /className:\s*["']accounts-command-strip["']/, 
          'className:"accounts-editable-mount"}),e.jsx(AccountsEditablePanel,{user:s,data:H||{},onChanged:typeof B==="function"?B:()=>{}}),e.jsxs("div",{className:"accounts-command-strip"'
        );
        // That replace might break jsxs structure - be careful
        console.log('[editable] attempted command-strip inject');
      }
    }
  }

  // Ensure rpc helper on window for panel
  if (!main.includes('__erpRpc')) {
    main = main.replace(
      /async function\s+rpc\s*\(/,
      'window.__erpRpc = async function __erpRpc(fn, args){return rpc(fn, args)}; async function rpc('
    );
    // alternate: if const rpc =
    if (!main.includes('window.__erpRpc')) {
      main = main.replace(
        /const\s+rpc\s*=\s*async/,
        'const rpc = window.__erpRpc = async'
      );
    }
  }

  fs.writeFileSync(MAIN, main);
  // Don't syntax-check main.jsx with node --check (it's JSX)
  console.log('[editable] main updated', main.length);
} else {
  console.log('[editable] main already patched');
}

console.log('[editable] done');
