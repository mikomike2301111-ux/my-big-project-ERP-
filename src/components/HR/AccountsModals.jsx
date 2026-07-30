import React, { useState } from 'react';
import { X, Plus, Trash2, Download, Printer, FileText, CheckCircle2, AlertTriangle, Calendar, DollarSign, Landmark, TrendingUp, PieChart, BarChart3, RefreshCw, Search, Eye } from 'lucide-react';

function ModalCard({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-card ${wide ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>
        <header><h2>{title}</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        {children}
      </div>
    </div>
  );
}

// ─── BUDGET VS ACTUAL ───
export function BudgetModal({ user, departments, onClose, onSave }) {
  const [form, setForm] = useState({
    department: '', fiscalYear: new Date().getFullYear(), period: 'Monthly',
    budgetAmount: 0, actualAmount: 0, category: 'Operating', notes: ''
  });

  return (
    <ModalCard title="Budget vs Actual Tracking" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Budget Details</legend><div>
          <label>Department<select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
            <option value="">Select department...</option>
            {(departments || []).map(d => <option key={d.id || d.name} value={d.name}>{d.name}</option>)}
          </select></label>
          <label>Fiscal Year<input type="number" value={form.fiscalYear} onChange={e => setForm({ ...form, fiscalYear: Number(e.target.value) })} /></label>
          <label>Period<select value={form.period} onChange={e => setForm({ ...form, period: e.target.value })}>
            {['Monthly', 'Quarterly', 'Yearly'].map(p => <option key={p}>{p}</option>)}
          </select></label>
          <label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {['Operating', 'Capital', 'Revenue', 'Payroll', 'Marketing', 'R&D', 'Admin'].map(c => <option key={c}>{c}</option>)}
          </select></label>
          <label>Budget Amount (KES)<input type="number" value={form.budgetAmount} onChange={e => setForm({ ...form, budgetAmount: Number(e.target.value) })} /></label>
          <label>Actual Amount (KES)<input type="number" value={form.actualAmount} onChange={e => setForm({ ...form, actualAmount: Number(e.target.value) })} /></label>
          {form.budgetAmount > 0 && (
            <div style={{ background: '#f0f9ff', borderRadius: 8, padding: 12, marginTop: 8 }}>
              <strong>Variance: </strong>
              <span style={{ color: form.actualAmount > form.budgetAmount ? '#ef4444' : '#22c55e' }}>
                {currency(form.actualAmount - form.budgetAmount)} ({Math.round(((form.actualAmount - form.budgetAmount) / form.budgetAmount) * 100)}%)
              </span>
            </div>
          )}
          <label>Notes<textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Save Budget Record</button>
      </form>
    </ModalCard>
  );
}

// ─── CASH FLOW FORECAST ───
export function CashFlowModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    forecastDate: new Date().toISOString().slice(0, 10), period: '30 Days',
    openingBalance: 0, expectedInflows: 0, expectedOutflows: 0, notes: ''
  });

  const closingBalance = form.openingBalance + form.expectedInflows - form.expectedOutflows;

  return (
    <ModalCard title="Cash Flow Forecast" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Forecast Details</legend><div>
          <label>Forecast Date<input type="date" value={form.forecastDate} onChange={e => setForm({ ...form, forecastDate: e.target.value })} /></label>
          <label>Forecast Period<select value={form.period} onChange={e => setForm({ ...form, period: e.target.value })}>
            {['7 Days', '14 Days', '30 Days', '60 Days', '90 Days'].map(p => <option key={p}>{p}</option>)}
          </select></label>
          <label>Opening Balance (KES)<input type="number" value={form.openingBalance} onChange={e => setForm({ ...form, openingBalance: Number(e.target.value) })} /></label>
          <label>Expected Inflows (KES)<input type="number" value={form.expectedInflows} onChange={e => setForm({ ...form, expectedInflows: Number(e.target.value) })} placeholder="Receivables, sales, etc" /></label>
          <label>Expected Outflows (KES)<input type="number" value={form.expectedOutflows} onChange={e => setForm({ ...form, expectedOutflows: Number(e.target.value) })} placeholder="Payables, expenses, payroll" /></label>
          <label>Notes<textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        </div></fieldset>
        {form.openingBalance > 0 && (
          <div style={{ background: '#f0f9ff', borderRadius: 8, padding: 16, margin: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span>Opening Balance</span><strong>{currency(form.openingBalance)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#22c55e' }}><span>+ Inflows</span><strong>{currency(form.expectedInflows)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#ef4444' }}><span>- Outflows</span><strong>{currency(form.expectedOutflows)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '2px solid #e5e7eb', marginTop: 4 }}>
              <strong>Projected Closing Balance</strong>
              <strong style={{ color: closingBalance < 0 ? '#ef4444' : '#22c55e', fontSize: 18 }}>{currency(closingBalance)}</strong>
            </div>
          </div>
        )}
        <button className="primary-action" type="submit">Save Forecast</button>
      </form>
    </ModalCard>
  );
}

// ─── FIXED ASSET MANAGEMENT ───
export function FixedAssetModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    assetName: '', category: 'Equipment', purchaseDate: new Date().toISOString().slice(0, 10),
    purchaseCost: 0, usefulLifeYears: 5, salvageValue: 0, depreciationMethod: 'Straight Line',
    location: '', department: '', status: 'Active', serialNumber: '', notes: ''
  });

  const annualDepreciation = form.depreciationMethod === 'Straight Line'
    ? (form.purchaseCost - form.salvageValue) / Math.max(1, form.usefulLifeYears)
    : form.purchaseCost * 0.3;
  const monthlyDepreciation = annualDepreciation / 12;
  const currentValue = form.purchaseCost - annualDepreciation;

  return (
    <ModalCard title="Fixed Asset Management" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Asset Details</legend><div>
          <label>Asset Name<input value={form.assetName} onChange={e => setForm({ ...form, assetName: e.target.value })} required placeholder="e.g. Toyota Hilux KBX 001A" /></label>
          <label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {['Equipment', 'Vehicle', 'Building', 'Furniture', 'Computer', 'Machinery', 'Land', 'Leasehold'].map(c => <option key={c}>{c}</option>)}
          </select></label>
          <label>Serial Number<input value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} /></label>
          <label>Purchase Date<input type="date" value={form.purchaseDate} onChange={e => setForm({ ...form, purchaseDate: e.target.value })} /></label>
          <label>Purchase Cost (KES)<input type="number" value={form.purchaseCost} onChange={e => setForm({ ...form, purchaseCost: Number(e.target.value) })} /></label>
          <label>Useful Life (Years)<input type="number" value={form.usefulLifeYears} onChange={e => setForm({ ...form, usefulLifeYears: Number(e.target.value) })} /></label>
          <label>Salvage Value (KES)<input type="number" value={form.salvageValue} onChange={e => setForm({ ...form, salvageValue: Number(e.target.value) })} /></label>
          <label>Depreciation Method<select value={form.depreciationMethod} onChange={e => setForm({ ...form, depreciationMethod: e.target.value })}>
            {['Straight Line', 'Declining Balance', 'Sum of Years'].map(m => <option key={m}>{m}</option>)}
          </select></label>
          <label>Location<input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></label>
          <label>Department<input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {['Active', 'Disposed', 'Sold', 'Under Maintenance', 'Written Off'].map(s => <option key={s}>{s}</option>)}
          </select></label>
          <label>Notes<textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        </div></fieldset>
        {form.purchaseCost > 0 && (
          <div style={{ background: '#f0f9ff', borderRadius: 8, padding: 16, margin: '8px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div><span style={{ fontSize: 12, color: '#667085' }}>Annual Depreciation</span><strong>{currency(annualDepreciation)}</strong></div>
              <div><span style={{ fontSize: 12, color: '#667085' }}>Monthly Depreciation</span><strong>{currency(monthlyDepreciation)}</strong></div>
              <div><span style={{ fontSize: 12, color: '#667085' }}>Current Book Value</span><strong>{currency(currentValue)}</strong></div>
            </div>
          </div>
        )}
        <button className="primary-action" type="submit">Save Asset</button>
      </form>
    </ModalCard>
  );
}

// ─── TAX MANAGEMENT ───
export function TaxModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    taxType: 'VAT', period: new Date().toISOString().slice(0, 7), dueDate: '',
    taxableAmount: 0, taxAmount: 0, paidAmount: 0, filingDate: '', status: 'Pending', notes: ''
  });

  return (
    <ModalCard title="Tax Management" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Tax Details</legend><div>
          <label>Tax Type<select value={form.taxType} onChange={e => setForm({ ...form, taxType: e.target.value })}>
            {['VAT (16%)', 'Withholding Tax (5%)', 'Withholding Tax (3%)', 'Corporate Tax (30%)', 'PAYE', 'NSSF', 'NHIF', 'Excise Duty', 'Import Duty'].map(t => <option key={t}>{t}</option>)}
          </select></label>
          <label>Period (YYYY-MM)<input type="month" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} /></label>
          <label>Due Date<input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></label>
          <label>Taxable Amount (KES)<input type="number" value={form.taxableAmount} onChange={e => setForm({ ...form, taxableAmount: Number(e.target.value) })} /></label>
          <label>Tax Amount (KES)<input type="number" value={form.taxAmount} onChange={e => setForm({ ...form, taxAmount: Number(e.target.value) })} /></label>
          <label>Amount Paid (KES)<input type="number" value={form.paidAmount} onChange={e => setForm({ ...form, paidAmount: Number(e.target.value) })} /></label>
          <label>Filing Date<input type="date" value={form.filingDate} onChange={e => setForm({ ...form, filingDate: e.target.value })} /></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {['Pending', 'Filed', 'Paid', 'Overdue', 'Audited'].map(s => <option key={s}>{s}</option>)}
          </select></label>
          <label>Notes<textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Save Tax Record</button>
      </form>
    </ModalCard>
  );
}

// ─── CREDIT NOTE / DEBIT NOTE ───
export function CreditDebitNoteModal({ user, invoices, onClose, onSave }) {
  const [form, setForm] = useState({
    type: 'Credit Note', invoiceId: '', customerName: '', date: new Date().toISOString().slice(0, 10),
    amount: 0, reason: '', reference: '', status: 'Draft'
  });

  return (
    <ModalCard title="Credit / Debit Note" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Note Details</legend><div>
          <label>Type<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {['Credit Note', 'Debit Note'].map(t => <option key={t}>{t}</option>)}
          </select></label>
          <label>Reference Invoice<select value={form.invoiceId} onChange={e => {
            const inv = (invoices || []).find(i => (i.id || i.invoiceId) === e.target.value);
            setForm({ ...form, invoiceId: e.target.value, customerName: inv?.customerName || '' });
          }}>
            <option value="">Select invoice...</option>
            {(invoices || []).map(inv => <option key={inv.id || inv.invoiceId} value={inv.id || inv.invoiceId}>{inv.invNo || inv.invoiceNo} - {inv.customerName} - {currency(inv.total)}</option>)}
          </select></label>
          <label>Customer<input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} /></label>
          <label>Date<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
          <label>Amount (KES)<input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></label>
          <label>Reference #<input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></label>
          <label>Reason<textarea rows={3} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Reason for credit/debit note..." /></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {['Draft', 'Approved', 'Applied', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
          </select></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Save {form.type}</button>
      </form>
    </ModalCard>
  );
}

// ─── PERIOD CLOSE ───
export function PeriodCloseModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    period: new Date().toISOString().slice(0, 7), closeDate: new Date().toISOString().slice(0, 10),
    checklist: {
      allInvoicesPosted: false, allExpensesRecorded: false, journalsBalanced: false,
      bankReconciled: false, payrollPosted: false, taxFiled: false
    }, notes: ''
  });

  const toggleCheck = (item) => setForm({
    ...form,
    checklist: { ...form.checklist, [item]: !form.checklist[item] }
  });

  const allChecked = Object.values(form.checklist).every(Boolean);
  const checkedCount = Object.values(form.checklist).filter(Boolean).length;
  const totalItems = Object.keys(form.checklist).length;

  return (
    <ModalCard title="Period Close" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Close Period</legend><div>
          <label>Period (YYYY-MM)<input type="month" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} /></label>
          <label>Close Date<input type="date" value={form.closeDate} onChange={e => setForm({ ...form, closeDate: e.target.value })} /></label>
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Close Checklist ({checkedCount}/{totalItems})</legend>
          <div style={{ display: 'grid', gap: 8 }}>
            {[
              ['allInvoicesPosted', 'All invoices posted and reconciled'],
              ['allExpensesRecorded', 'All expenses recorded'],
              ['journalsBalanced', 'Journals balanced (Debit = Credit)'],
              ['bankReconciled', 'Bank accounts reconciled'],
              ['payrollPosted', 'Payroll posted to finance'],
              ['taxFiled', 'Tax filed for period']
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: form.checklist[key] ? '#dcfce7' : '#f9fafb', borderRadius: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.checklist[key]} onChange={() => toggleCheck(key)} />
                <span style={{ textDecoration: form.checklist[key] ? 'line-through' : 'none', color: form.checklist[key] ? '#22c55e' : '#344054' }}>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label>Close Notes<textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes for this period close..." /></label>
        <button className="primary-action" type="submit" disabled={!allChecked}>
          {allChecked ? 'Close Period' : `Complete ${totalItems - checkedCount} remaining items to close`}
        </button>
      </form>
    </ModalCard>
  );
}

// ─── FINANCIAL RATIOS DASHBOARD ───
export function FinancialRatiosDashboard({ data }) {
  const ratios = [
    { name: 'Current Ratio', value: '2.4', target: '> 2.0', status: 'Good', color: '#22c55e' },
    { name: 'Quick Ratio', value: '1.8', target: '> 1.0', status: 'Good', color: '#22c55e' },
    { name: 'Debt to Equity', value: '0.6', target: '< 1.0', status: 'Good', color: '#22c55e' },
    { name: 'Gross Margin', value: '42%', target: '> 35%', status: 'Good', color: '#22c55e' },
    { name: 'Net Margin', value: '18%', target: '> 15%', status: 'Good', color: '#22c55e' },
    { name: 'ROI', value: '24%', target: '> 20%', status: 'Good', color: '#22c55e' },
    { name: 'AR Turnover', value: '8.5x', target: '> 6x', status: 'Good', color: '#22c55e' },
    { name: 'AP Turnover', value: '5.2x', target: '> 4x', status: 'Good', color: '#22c55e' },
    { name: 'Inventory Turnover', value: '6.1x', target: '> 5x', status: 'Good', color: '#22c55e' },
    { name: 'Cash Ratio', value: '0.9', target: '> 0.5', status: 'Good', color: '#22c55e' },
  ];

  return (
    <div className="dashboard-grid">
      {ratios.map(r => (
        <div key={r.name} className="span-3" style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#f9fafb' }}>
          <div style={{ fontSize: 12, color: '#667085', marginBottom: 4 }}>{r.name}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#050505' }}>{r.value}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12 }}>
            <span style={{ color: '#667085' }}>Target: {r.target}</span>
            <span style={{ color: r.color, fontWeight: 600 }}>{r.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── INVOICE DEEP DIVE ───
export function InvoiceDeepDive({ invoice, onClose }) {
  if (!invoice) return null;
  return (
    <ModalCard title={`Invoice: ${invoice.invNo || invoice.invoiceNo}`} onClose={onClose} wide>
      <div className="dashboard-grid" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <div className="span-12" style={{ display: 'flex', gap: 16, padding: 16, background: '#f9fafb', borderRadius: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: '#050505', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🧾</div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0 }}>{invoice.invNo || invoice.invoiceNo}</h3>
            <p style={{ margin: 0, color: '#667085' }}>{invoice.customerName} · {invoice.date || invoice.invoiceDate}</p>
            <span className={`status ${invoice.status === 'Paid' || Number(invoice.balance || 0) <= 0 ? 'active' : 'cancelled'}`}>{invoice.status || (Number(invoice.balance || 0) <= 0 ? 'Paid' : 'Open')}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{currency(invoice.total)}</div>
            <div style={{ fontSize: 12, color: '#667085' }}>Balance: <strong style={{ color: Number(invoice.balance || 0) > 0 ? '#ef4444' : '#22c55e' }}>{currency(invoice.balance)}</strong></div>
          </div>
        </div>
        <div className="settings-kv-grid span-6">
          <article><span>Invoice #</span><strong>{invoice.invNo || invoice.invoiceNo}</strong></article>
          <article><span>Customer</span><strong>{invoice.customerName}</strong></article>
          <article><span>Date</span><strong>{invoice.date || invoice.invoiceDate}</strong></article>
          <article><span>Due Date</span><strong>{invoice.dueDate || '-'}</strong></article>
          <article><span>Payment Terms</span><strong>{invoice.paymentTerms || 'N/A'}</strong></article>
          <article><span>Days Overdue</span><strong style={{ color: invoice.daysOverdue > 0 ? '#ef4444' : '#22c55e' }}>{invoice.daysOverdue ? `${invoice.daysOverdue}d` : 'Current'}</strong></article>
        </div>
        <div className="settings-kv-grid span-6">
          <article><span>Total Amount</span><strong>{currency(invoice.total)}</strong></article>
          <article><span>Amount Paid</span><strong style={{ color: '#22c55e' }}>{currency(invoice.paid)}</strong></article>
          <article><span>Outstanding</span><strong style={{ color: Number(invoice.balance || 0) > 0 ? '#ef4444' : '#22c55e' }}>{currency(invoice.balance)}</strong></article>
          <article><span>Payment Method</span><strong>{invoice.paymentMethod || 'N/A'}</strong></article>
          <article><span>Risk Status</span><strong style={{ color: invoice.risk === 'High' ? '#ef4444' : invoice.risk === 'Medium' ? '#f79009' : '#22c55e' }}>{invoice.risk || 'Low'}</strong></article>
          <article><span>Aging Bucket</span><strong>{invoice.agingBucket || 'Current'}</strong></article>
        </div>
        <div className="span-12" style={{ display: 'flex', gap: 8 }}>
          <button className="panel-action-button"><Download size={14} /> Download PDF</button>
          <button className="panel-action-button"><Printer size={14} /> Print</button>
          <button className="panel-action-button"><Mail size={14} /> Email</button>
          <button className="panel-action-button" style={{ background: '#22c55e', color: '#fff' }}><CheckCircle2 size={14} /> Mark as Paid</button>
        </div>
      </div>
    </ModalCard>
  );
}

// ─── ACCOUNT DEEP DIVE ───
export function AccountDeepDive({ account, transactions = [], onClose }) {
  if (!account) return null;
  const accountTxns = transactions.filter(t => t.accountCode === account.code || t.accountName === account.name);
  const totalDebit = accountTxns.reduce((s, t) => s + Number(t.debit || 0), 0);
  const totalCredit = accountTxns.reduce((s, t) => s + Number(t.credit || 0), 0);

  return (
    <ModalCard title={`Account: ${account.code} - ${account.name}`} onClose={onClose} wide>
      <div className="dashboard-grid" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <div className="span-12" style={{ display: 'flex', gap: 16, padding: 16, background: '#f9fafb', borderRadius: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: '#050505', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📒</div>
          <div>
            <h3 style={{ margin: 0 }}>{account.code} - {account.name}</h3>
            <p style={{ margin: 0, color: '#667085' }}>Type: {account.type} · Status: {account.status}</p>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{currency(account.balance || 0)}</div>
            <div style={{ fontSize: 12, color: '#667085' }}>Current Balance</div>
          </div>
        </div>
        <div className="settings-kv-grid span-6">
          <article><span>Account Code</span><strong>{account.code}</strong></article>
          <article><span>Account Name</span><strong>{account.name}</strong></article>
          <article><span>Type</span><strong>{account.type}</strong></article>
          <article><span>Parent</span><strong>{account.parent || 'N/A'}</strong></article>
        </div>
        <div className="settings-kv-grid span-6">
          <article><span>Status</span><strong>{account.status}</strong></article>
          <article><span>Total Debit</span><strong>{currency(totalDebit)}</strong></article>
          <article><span>Total Credit</span><strong>{currency(totalCredit)}</strong></article>
          <article><span>Net Movement</span><strong style={{ color: totalDebit > totalCredit ? '#ef4444' : '#22c55e' }}>{currency(totalDebit - totalCredit)}</strong></article>
        </div>
        <div className="span-12">
          <div className="panel-header"><h3>Transactions ({accountTxns.length})</h3></div>
          <div className="table-wrap" style={{ maxHeight: 300 }}>
            <table>
              <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th>Debit</th><th>Credit</th><th>Source</th></tr></thead>
              <tbody>
                {accountTxns.slice(0, 30).map((t, i) => (
                  <tr key={i}>
                    <td>{t.date}</td>
                    <td>{t.reference || '-'}</td>
                    <td>{t.description || '-'}</td>
                    <td style={{ color: '#ef4444' }}>{t.debit ? currency(t.debit) : '-'}</td>
                    <td style={{ color: '#22c55e' }}>{t.credit ? currency(t.credit) : '-'}</td>
                    <td>{t.sourceModule || '-'}</td>
                  </tr>
                ))}
                {accountTxns.length === 0 && <tr><td colSpan={6}><div className="empty-state">No transactions for this account.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ModalCard>
  );
}

function currency(v) { return `Ksh${Number(v || 0).toLocaleString()}`; }