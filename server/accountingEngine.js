/**
 * FarmTrack ERP — Accounting engine (double-entry helpers)
 * Pure helpers used by api/rpc.js. Never touches D1 directly.
 * Safe: only mutates the in-memory db object passed/returned by callers.
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money2(v) {
  return Math.round(num(v) * 100) / 100;
}

function gid() {
  return 'AE-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Resolve account by exact name, then by code, then by fuzzy name contains. */
function findAccount(db, nameOrCode) {
  const accounts = Array.isArray(db.financeAccounts) ? db.financeAccounts : [];
  const key = String(nameOrCode || '').trim();
  if (!key) return null;
  let hit = accounts.find(a => String(a.name || '').trim() === key);
  if (hit) return hit;
  hit = accounts.find(a => String(a.code || '').trim() === key);
  if (hit) return hit;
  const lower = key.toLowerCase();
  hit = accounts.find(a => String(a.name || '').toLowerCase() === lower);
  if (hit) return hit;
  hit = accounts.find(a => String(a.name || '').toLowerCase().includes(lower));
  return hit || null;
}

/**
 * Ensure core COA accounts exist (additive only — never deletes or renames).
 */
function ensureCoreAccounts(db) {
  if (!db || typeof db !== 'object') return db;
  db.financeAccounts = Array.isArray(db.financeAccounts) ? db.financeAccounts : [];
  const seed = [
    ['1000', 'Assets', 'Asset', ''],
    ['1100', 'Cash on Hand', 'Asset', '1000'],
    ['1110', 'KCB Bank', 'Asset', '1000'],
    ['1120', 'M-Pesa Till', 'Asset', '1000'],
    ['1200', 'Accounts Receivable', 'Asset', '1000'],
    ['1300', 'Inventory Asset', 'Asset', '1000'],
    ['2000', 'Liabilities', 'Liability', ''],
    ['2100', 'Accounts Payable', 'Liability', '2000'],
    ['2200', 'Tax Payable', 'Liability', '2000'],
    ['3000', 'Equity', 'Equity', ''],
    ['4000', 'Sales Revenue', 'Income', ''],
    ['4100', 'Other Income', 'Income', ''],
    ['5000', 'Cost of Goods Sold', 'Expense', ''],
    ['6000', 'Operating Expenses', 'Expense', ''],
    ['6100', 'Office Expenses', 'Expense', '6000'],
  ];
  const codes = new Set(db.financeAccounts.map(a => String(a.code || '').trim()));
  const names = new Set(db.financeAccounts.map(a => String(a.name || '').trim().toLowerCase()));
  for (const [code, name, type, parent] of seed) {
    if (codes.has(code) || names.has(name.toLowerCase())) continue;
    db.financeAccounts.push({
      id: gid(),
      code,
      name,
      type,
      parent: parent || type,
      balance: 0,
      status: 'Active',
      createdAt: new Date().toISOString(),
    });
    codes.add(code);
    names.add(name.toLowerCase());
  }
  return db;
}

/**
 * Post a balanced journal (2 lines). Uses cents precision.
 * Returns the entry or null if accounts missing / amount zero.
 */
function postBalancedJournal(db, user, opts = {}) {
  ensureCoreAccounts(db);
  db.financeManualJournals = Array.isArray(db.financeManualJournals) ? db.financeManualJournals : [];
  db.financeManualJournalLines = Array.isArray(db.financeManualJournalLines) ? db.financeManualJournalLines : [];
  db.financeManualLedger = Array.isArray(db.financeManualLedger) ? db.financeManualLedger : [];
  db.financeManualAuditLogs = Array.isArray(db.financeManualAuditLogs) ? db.financeManualAuditLogs : [];

  const amount = money2(opts.amount);
  if (!(amount > 0)) return null;

  const debit = findAccount(db, opts.debitAccountName);
  const credit = findAccount(db, opts.creditAccountName);
  if (!debit || !credit) {
    console.warn('[accounting] skip journal — missing account', opts.debitAccountName, opts.creditAccountName);
    return null;
  }

  // Idempotency: skip if same sourceId+reference+amount already posted
  if (opts.sourceId && opts.reference) {
    const exists = db.financeManualJournals.some(
      j => j.sourceId === opts.sourceId && j.reference === opts.reference && money2(j.totalDebit) === amount && j.description === opts.description
    );
    if (exists) return null;
  }

  const id = gid();
  const jeCount = (db.financeJournalEntries || []).length + db.financeManualJournals.length + 1;
  const entry = {
    id,
    journalNo: `JE-${String(jeCount).padStart(5, '0')}`,
    date: opts.date || today(),
    description: opts.description || 'Journal',
    sourceModule: opts.sourceModule || 'Finance',
    sourceId: opts.sourceId || '',
    reference: opts.reference || '',
    totalDebit: amount,
    totalCredit: amount,
    approvalStatus: 'Auto Posted',
    postedBy: (user && (user.name || user.email)) || 'System',
    immutable: true,
    createdAt: new Date().toISOString(),
  };
  const debitLine = {
    id: gid(),
    journalEntryId: id,
    accountId: debit.id,
    accountCode: debit.code,
    accountName: debit.name,
    accountType: debit.type,
    debit: amount,
    credit: 0,
    sourceModule: entry.sourceModule,
    reference: entry.reference,
    date: entry.date,
  };
  const creditLine = {
    id: gid(),
    journalEntryId: id,
    accountId: credit.id,
    accountCode: credit.code,
    accountName: credit.name,
    accountType: credit.type,
    debit: 0,
    credit: amount,
    sourceModule: entry.sourceModule,
    reference: entry.reference,
    date: entry.date,
  };
  db.financeManualJournals.unshift(entry);
  db.financeManualJournalLines.unshift(creditLine, debitLine);
  db.financeManualLedger.unshift(
    { id: gid(), ...creditLine, runningBalance: 0 },
    { id: gid(), ...debitLine, runningBalance: 0 }
  );
  db.financeManualAuditLogs.unshift({
    id: gid(),
    user: entry.postedBy,
    date: entry.date,
    module: entry.sourceModule,
    action: 'Finance Journal Auto Posted',
    reference: entry.reference,
    oldValue: '',
    newValue: `${amount}/${amount}`,
    reason: entry.description,
    approval: entry.approvalStatus,
    immutable: true,
  });
  return entry;
}

/** Invoice posted: Dr AR / Cr Revenue (+ optional VAT). */
function postInvoiceJournals(db, user, invoice) {
  if (!invoice || !invoice.id) return [];
  ensureCoreAccounts(db);
  const posted = [];
  const invNo = invoice.invNo || invoice.invoiceNo || invoice.id;
  const date = invoice.date || invoice.invoiceDate || today();
  const subtotal = money2(invoice.subtotal);
  const tax = money2(invoice.tax);
  const paid = money2(invoice.paid);
  const revenueName = invoice.revenueAccountName || 'Sales Revenue';

  if (subtotal > 0) {
    const e = postBalancedJournal(db, user, {
      date,
      sourceModule: 'Sales',
      sourceId: invoice.id,
      reference: invNo,
      description: `Sales invoice ${invNo}`,
      debitAccountName: 'Accounts Receivable',
      creditAccountName: revenueName,
      amount: subtotal,
    });
    if (e) posted.push(e);
  }
  if (tax > 0) {
    const e = postBalancedJournal(db, user, {
      date,
      sourceModule: 'Taxes',
      sourceId: invoice.id,
      reference: invNo,
      description: `Output VAT ${invNo}`,
      debitAccountName: 'Accounts Receivable',
      creditAccountName: 'Tax Payable',
      amount: tax,
    });
    if (e) posted.push(e);
  }
  if (paid > 0) {
    const bank = invoice.paymentAccountName || (String(invoice.method || '').toLowerCase().includes('mpesa') ? 'M-Pesa Till' : String(invoice.method || '').toLowerCase().includes('cash') ? 'Cash on Hand' : 'KCB Bank');
    const e = postBalancedJournal(db, user, {
      date,
      sourceModule: 'Banking',
      sourceId: invoice.id,
      reference: invNo,
      description: `Customer receipt ${invNo}`,
      debitAccountName: bank,
      creditAccountName: 'Accounts Receivable',
      amount: paid,
    });
    if (e) posted.push(e);
  }
  return posted;
}

/** Payment against invoice: Dr Bank / Cr AR */
function postPaymentJournal(db, user, payment, invoice) {
  if (!payment || !(money2(payment.amount) > 0)) return null;
  ensureCoreAccounts(db);
  const method = String(payment.method || payment.paymentMethod || 'Bank').toLowerCase();
  let bank = 'KCB Bank';
  if (method.includes('mpesa') || method.includes('m-pesa')) bank = 'M-Pesa Till';
  else if (method.includes('cash')) bank = 'Cash on Hand';
  const ref = payment.paymentNo || payment.payNo || payment.reference || payment.id;
  const invNo = (invoice && (invoice.invNo || invoice.invoiceNo)) || payment.invoiceId || '';
  return postBalancedJournal(db, user, {
    date: payment.date || today(),
    sourceModule: 'Banking',
    sourceId: payment.id,
    reference: ref,
    description: `Payment ${ref}${invNo ? ' for ' + invNo : ''}`,
    debitAccountName: bank,
    creditAccountName: 'Accounts Receivable',
    amount: money2(payment.amount),
  });
}

/** Expense: Dr Expense category / Cr Cash|Bank|AP */
function postExpenseJournal(db, user, expense) {
  if (!expense || !(money2(expense.amount) > 0)) return null;
  ensureCoreAccounts(db);
  const category = expense.category || expense.expenseAccountName || 'Office Expenses';
  const expenseAcct = findAccount(db, category) ? category : 'Operating Expenses';
  const method = String(expense.paymentMethod || expense.method || 'Cash').toLowerCase();
  let credit = 'Cash on Hand';
  if (method.includes('mpesa')) credit = 'M-Pesa Till';
  else if (method.includes('bank') || method.includes('transfer')) credit = 'KCB Bank';
  else if (method.includes('credit') || method.includes('payable')) credit = 'Accounts Payable';
  const ref = expense.expNo || expense.expenseNo || expense.id;
  return postBalancedJournal(db, user, {
    date: expense.expenseDate || expense.date || today(),
    sourceModule: 'Expenses',
    sourceId: expense.id,
    reference: ref,
    description: expense.description || `Expense ${ref}`,
    debitAccountName: expenseAcct,
    creditAccountName: credit,
    amount: money2(expense.amount),
  });
}

/**
 * Recompute customer balances from invoices - payments - credits.
 */
function recomputeCustomerBalances(db) {
  if (!db) return 0;
  const customers = Array.isArray(db.customers) ? db.customers : [];
  const invoices = Array.isArray(db.invoices) ? db.invoices : [];
  const payments = Array.isArray(db.payments) ? db.payments : [];
  const credits = Array.isArray(db.creditNotes) ? db.creditNotes : [];
  let updated = 0;
  for (const c of customers) {
    const invs = invoices.filter(
      i => (i.customerId === c.id || i.customerName === c.name) &&
        i.status !== 'Cancelled' && i.status !== 'Deleted'
    );
    const pays = payments.filter(p => p.customerId === c.id || p.customerName === c.name);
    const creds = credits.filter(
      n => (n.customerId === c.id || n.customerName === c.name) && n.status !== 'Cancelled'
    );
    const balance = money2(
      invs.reduce((s, i) => s + num(i.total), 0) -
      pays.reduce((s, p) => s + num(p.amount), 0) -
      creds.reduce((s, n) => s + num(n.amount), 0)
    );
    if (money2(c.balance) !== balance) {
      c.balance = balance;
      c.updatedAt = new Date().toISOString();
      updated += 1;
    }
  }
  return updated;
}

/**
 * Compute account balances from journal lines.
 */
function recomputeAccountBalances(db) {
  ensureCoreAccounts(db);
  const lines = [
    ...(db.financeJournalLines || []),
    ...(db.financeManualJournalLines || []),
  ];
  const byName = new Map();
  for (const line of lines) {
    const name = String(line.accountName || '').trim();
    if (!name) continue;
    const cur = byName.get(name) || { debit: 0, credit: 0 };
    cur.debit = money2(cur.debit + num(line.debit));
    cur.credit = money2(cur.credit + num(line.credit));
    byName.set(name, cur);
  }
  for (const acc of db.financeAccounts) {
    const m = byName.get(String(acc.name || '').trim());
    if (!m) continue;
    const type = String(acc.type || '').toLowerCase();
    if (type === 'asset' || type === 'expense') {
      acc.balance = money2(m.debit - m.credit);
    } else {
      acc.balance = money2(m.credit - m.debit);
    }
  }
  return db.financeAccounts.length;
}

module.exports = {
  money2,
  findAccount,
  ensureCoreAccounts,
  postBalancedJournal,
  postInvoiceJournals,
  postPaymentJournal,
  postExpenseJournal,
  recomputeCustomerBalances,
  recomputeAccountBalances,
};
