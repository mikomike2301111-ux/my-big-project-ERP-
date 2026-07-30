import React, { useState } from 'react';
import { X, Package, Clock, AlertTriangle, CheckCircle2, ArrowRight, Download, FileText, Printer, Phone, Mail, Edit3, Eye, Activity } from 'lucide-react';

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

// ─── INTERACTIVE INVENTORY ITEM DETAIL ───
export function InventoryItemDetail({ item, movements = [], audits = [], onClose, user }) {
  if (!item) return null;
  const itemMovements = movements.filter(m => m.productName === item.productName || m.sku === item.sku);
  const itemAudits = audits.filter(a => a.productName === item.productName || a.sku === item.sku);

  return (
    <ModalCard title={`${item.productName} (${item.sku})`} onClose={onClose} wide>
      <div className="dashboard-grid" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="span-12" style={{ display: 'flex', gap: 16, padding: 16, background: '#f9fafb', borderRadius: 12, marginBottom: 8 }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, background: '#050505', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
            <Package size={32} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0 }}>{item.productName}</h3>
            <p style={{ margin: 0, color: '#667085' }}>SKU: {item.sku} · Category: {item.category} · ABC: {item.abcClass}</p>
            <span className={`status ${item.status === 'In Stock' ? 'active' : item.status === 'Low Stock' ? 'partial' : 'cancelled'}`}>{item.status}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="panel-action-button" onClick={() => downloadRowsFile(`inventory-${item.sku}`, [item, ...itemMovements], 'CSV')}><Download size={14} /> Export</button>
            <button className="panel-action-button" onClick={() => printText(item.productName, JSON.stringify(item, null, 2))}><Printer size={14} /> Print</button>
          </div>
        </div>

        {/* KPIs */}
        <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#101828' }}>{item.quantityAvailable || 0}</strong><span>Available</span></div></div>
        <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#2563eb' }}>{item.quantityReserved || 0}</strong><span>Reserved</span></div></div>
        <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#f79009' }}>{item.quantityIncoming || 0}</strong><span>Incoming</span></div></div>
        <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#f79009' }}>{item.quantityOutgoing || 0}</strong><span>Outgoing</span></div></div>

        {/* Details Grid */}
        <div className="settings-kv-grid span-6">
          <article><span>Warehouse</span><strong>{item.warehouseName || 'N/A'}</strong></article>
          <article><span>Bin Location</span><strong>{item.shelfLocation || item.binNumber || 'N/A'}</strong></article>
          <article><span>Shelf</span><strong>{item.shelfLocation || 'N/A'}</strong></article>
          <article><span>Bin Number</span><strong>{item.binNumber || 'N/A'}</strong></article>
          <article><span>Unit Cost</span><strong>{currency(item.unitCost)}</strong></article>
          <article><span>Total Value</span><strong>{currency(item.inventoryValue)}</strong></article>
        </div>
        <div className="settings-kv-grid span-6">
          <article><span>Damaged</span><strong style={{ color: item.damagedQuantity ? '#ef4444' : '#22c55e' }}>{item.damagedQuantity || 0}</strong></article>
          <article><span>Expired</span><strong style={{ color: item.expiredQuantity ? '#ef4444' : '#22c55e' }}>{item.expiredQuantity || 0}</strong></article>
          <article><span>Quarantined</span><strong style={{ color: item.quarantinedQuantity ? '#f79009' : '#22c55e' }}>{item.quarantinedQuantity || 0}</strong></article>
          <article><span>Supplier</span><strong>{item.supplier || item.preferredSupplier || 'N/A'}</strong></article>
          <article><span>Reorder Point</span><strong>{item.reorderPoint || 'N/A'}</strong></article>
          <article><span>Min Stock</span><strong>{item.minimumStock || 'N/A'}</strong></article>
        </div>

        {/* Movements */}
        <div className="span-12">
          <div className="panel-header"><h3>Stock Movements ({itemMovements.length})</h3></div>
          {itemMovements.length === 0 && <div className="empty-state">No movements recorded for this item.</div>}
          {itemMovements.slice(0, 8).map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #f2f4f7', alignItems: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: m.transactionType?.includes('In') ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {m.transactionType?.includes('In') ? '📥' : m.transactionType?.includes('Out') ? '📤' : '🔄'}
              </div>
              <div style={{ flex: 1 }}>
                <strong>{m.transactionType || 'Movement'}</strong>
                <div style={{ fontSize: 12, color: '#667085' }}>{m.referenceType || ''} · {m.createdBy || ''} · {m.date || ''}</div>
              </div>
              <strong style={{ color: m.transactionType?.includes('In') ? '#22c55e' : '#ef4444' }}>{m.transactionType?.includes('In') ? '+' : '-'}{m.quantity || 0}</strong>
              <span style={{ fontSize: 12, color: '#667085' }}>{currency(m.unitCost)}</span>
            </div>
          ))}
        </div>

        {/* Audit History */}
        <div className="span-6">
          <div className="panel-header"><h3>Audit History ({itemAudits.length})</h3></div>
          {itemAudits.length === 0 && <div className="empty-state">No audits recorded yet. Use Cycle Count to audit this item.</div>}
          {itemAudits.slice(0, 5).map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f2f4f7', fontSize: 13 }}>
              <span style={{ color: '#667085' }}>{a.date || ''}</span>
              <span style={{ color: a.difference > 0 ? '#ef4444' : '#22c55e' }}>System: {a.systemQuantity} → Physical: {a.physicalQuantity} (Diff: {a.difference})</span>
              <span>{a.reason || ''}</span>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="span-6">
          <div className="panel-header"><h3>Item Timeline</h3></div>
          <div style={{ fontSize: 13, color: '#667085' }}>
            <div style={{ padding: 6 }}>📦 Created: {item.createdAt || item.date || 'N/A'}</div>
            <div style={{ padding: 6 }}>🔄 Last Movement: {item.lastMovementDate || 'N/A'}</div>
            <div style={{ padding: 6 }}>📋 Last Audit: {item.lastAuditDate || 'N/A'}</div>
            <div style={{ padding: 6 }}>📊 ABC Class: {item.abcClass || 'N/A'}</div>
            <div style={{ padding: 6 }}>🏷️ Status: {item.status || 'Active'}</div>
          </div>
        </div>
      </div>
    </ModalCard>
  );
}

// ─── HR EMPLOYEE AUDIT MODAL ───
export function EmployeeAuditModal({ user, employee, onClose, onSave }) {
  const [form, setForm] = useState({
    employeeId: employee?.id || '',
    auditDate: new Date().toISOString().slice(0, 10),
    auditType: 'Compliance Check',
    findings: '',
    actions: '',
    status: 'Pass',
    reviewedBy: user?.name || '',
    nextAuditDate: ''
  });

  return (
    <ModalCard title={`Employee Audit: ${employee?.name || 'N/A'}`} onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Audit Details</legend><div>
          <label>Employee<input value={employee?.name || ''} disabled /></label>
          <label>Audit Date<input type="date" value={form.auditDate} onChange={e => setForm({ ...form, auditDate: e.target.value })} /></label>
          <label>Audit Type<select value={form.auditType} onChange={e => setForm({ ...form, auditType: e.target.value })}>
            {['Compliance Check', 'Performance Review', 'Documentation Audit', 'Attendance Audit', 'Payroll Audit', 'Skills Assessment', 'Contract Review', 'Training Compliance', 'Health & Safety', 'Data Integrity'].map(t => <option key={t}>{t}</option>)}
          </select></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {['Pass', 'Pass with Notes', 'Needs Improvement', 'Fail'].map(s => <option key={s}>{s}</option>)}
          </select></label>
          <label>Findings<textarea rows={4} value={form.findings} onChange={e => setForm({ ...form, findings: e.target.value })} placeholder="Detailed audit findings..." required /></label>
          <label>Recommended Actions<textarea rows={3} value={form.actions} onChange={e => setForm({ ...form, actions: e.target.value })} placeholder="Actions to address findings..." /></label>
          <label>Reviewed By<input value={form.reviewedBy} onChange={e => setForm({ ...form, reviewedBy: e.target.value })} /></label>
          <label>Next Audit Date<input type="date" value={form.nextAuditDate} onChange={e => setForm({ ...form, nextAuditDate: e.target.value })} /></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Save Audit Record</button>
      </form>
    </ModalCard>
  );
}

// ─── HR DOCUMENT MANAGEMENT ───
export function EmployeeDocumentModal({ user, employees, onClose, onSave }) {
  const [form, setForm] = useState({
    employeeId: '', documentType: 'Contract', documentName: '', fileUrl: '',
    expiryDate: '', status: 'Active', notes: ''
  });

  return (
    <ModalCard title="Employee Document Management" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Document Details</legend><div>
          <label>Employee<select value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })} required>
            <option value="">Select employee...</option>
            {employees?.map(emp => <option key={emp.id} value={emp.id}>{emp.name} - {emp.department}</option>)}
          </select></label>
          <label>Document Type<select value={form.documentType} onChange={e => setForm({ ...form, documentType: e.target.value })}>
            {['Contract', 'ID/Passport', 'KRA PIN', 'NSSF', 'NHIF', 'Academic Certificate', 'Professional Cert', 'Medical Report', 'Disciplinary Letter', 'Performance Review', 'Training Cert', 'Other'].map(t => <option key={t}>{t}</option>)}
          </select></label>
          <label>Document Name<input value={form.documentName} onChange={e => setForm({ ...form, documentName: e.target.value })} placeholder="e.g. Employment Contract 2026" /></label>
          <label>File URL<input value={form.fileUrl} onChange={e => setForm({ ...form, fileUrl: e.target.value })} placeholder="URL or upload path" /></label>
          <label>Expiry Date<input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} /></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {['Active', 'Expired', 'Pending Renewal', 'Archived'].map(s => <option key={s}>{s}</option>)}
          </select></label>
          <label>Notes<textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Save Document Record</button>
      </form>
    </ModalCard>
  );
}

// ─── HR BENEFITS & COMPENSATION ───
export function BenefitsModal({ user, employees, onClose, onSave }) {
  const [form, setForm] = useState({
    employeeId: '', benefitType: 'Medical Insurance', provider: '', coverage: '',
    startDate: new Date().toISOString().slice(0, 10), endDate: '', monthlyCost: 0,
    employeeContribution: 0, employerContribution: 0, status: 'Active'
  });

  return (
    <ModalCard title="Benefits & Compensation" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Benefit Details</legend><div>
          <label>Employee<select value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })} required>
            <option value="">Select employee...</option>
            {employees?.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select></label>
          <label>Benefit Type<select value={form.benefitType} onChange={e => setForm({ ...form, benefitType: e.target.value })}>
            {['Medical Insurance', 'Life Insurance', 'Pension/Retirement', 'Gym Membership', 'Company Vehicle', 'Housing Allowance', 'Education Allowance', 'Stock Options', 'Bonus Plan', 'Commission Structure'].map(t => <option key={t}>{t}</option>)}
          </select></label>
          <label>Provider<input value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} placeholder="Insurance company name" /></label>
          <label>Coverage Details<input value={form.coverage} onChange={e => setForm({ ...form, coverage: e.target.value })} placeholder="Coverage description" /></label>
          <label>Start Date<input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></label>
          <label>End Date<input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></label>
          <label>Monthly Cost<input type="number" value={form.monthlyCost} onChange={e => setForm({ ...form, monthlyCost: Number(e.target.value) })} /></label>
          <label>Employee Contribution<input type="number" value={form.employeeContribution} onChange={e => setForm({ ...form, employeeContribution: Number(e.target.value) })} /></label>
          <label>Employer Contribution<input type="number" value={form.employerContribution} onChange={e => setForm({ ...form, employerContribution: Number(e.target.value) })} /></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {['Active', 'Pending', 'Expired', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
          </select></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Save Benefit Record</button>
      </form>
    </ModalCard>
  );
}

// ─── HR TIME & ATTENDANCE DASHBOARD ───
export function TimeAttendanceDashboard({ employees, attendance }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayAttendance = (attendance || []).filter(a => a.date === today);
  const present = todayAttendance.filter(a => a.status === 'Present').length;
  const absent = todayAttendance.filter(a => a.status === 'Absent').length;
  const late = todayAttendance.filter(a => a.status === 'Late').length;
  const onLeave = (employees || []).filter(e => e.status === 'On Leave').length;

  return (
    <div className="dashboard-grid">
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#22c55e' }}>{present}</strong><span>Present Today</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#ef4444' }}>{absent}</strong><span>Absent Today</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#f79009' }}>{late}</strong><span>Late Today</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#2563eb' }}>{onLeave}</strong><span>On Leave</span></div></div>

      <div className="span-12">
        <div className="panel-header"><h3>Today's Attendance Log</h3></div>
        <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
          <table>
            <thead><tr><th>Employee</th><th>Department</th><th>Check In</th><th>Check Out</th><th>Status</th><th>Hours</th></tr></thead>
            <tbody>
              {todayAttendance.length === 0 && <tr><td colSpan={6}><div className="empty-state">No attendance recorded yet today.</div></td></tr>}
              {todayAttendance.slice(0, 20).map(a => (
                <tr key={a.id}>
                  <td><strong>{a.employeeName}</strong></td>
                  <td>{a.department}</td>
                  <td>{a.checkIn || '--:--'}</td>
                  <td>{a.checkOut || '--:--'}</td>
                  <td><span className={`status ${a.status === 'Present' ? 'active' : a.status === 'Late' ? 'partial' : 'cancelled'}`}>{a.status}</span></td>
                  <td>{a.hoursWorked || 0}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="span-12">
        <div className="panel-header"><h3>Employees Not Clocked In Today</h3></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(employees || []).filter(e => e.status === 'Active' && !todayAttendance.find(a => a.employeeId === e.id)).slice(0, 15).map(e => (
            <div key={e.id} style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: 8, fontSize: 13 }}>
              <strong>{e.name}</strong> <span style={{ color: '#667085' }}>{e.department}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── HR SUCCESSION PLANNING ───
export function SuccessionModal({ user, employees, onClose, onSave }) {
  const [form, setForm] = useState({
    employeeId: '', targetPosition: '', readiness: '1-2 Years', developmentNeeds: '',
    potentialRating: 'High', notes: '', status: 'Active'
  });

  return (
    <ModalCard title="Succession Planning" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Succession Candidate</legend><div>
          <label>Employee<select value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })} required>
            <option value="">Select employee...</option>
            {employees?.map(emp => <option key={emp.id} value={emp.id}>{emp.name} - {emp.position}</option>)}
          </select></label>
          <label>Target Position<input value={form.targetPosition} onChange={e => setForm({ ...form, targetPosition: e.target.value })} placeholder="e.g. Operations Manager" /></label>
          <label>Readiness<select value={form.readiness} onChange={e => setForm({ ...form, readiness: e.target.value })}>
            {['Ready Now', '6-12 Months', '1-2 Years', '3-5 Years'].map(r => <option key={r}>{r}</option>)}
          </select></label>
          <label>Potential Rating<select value={form.potentialRating} onChange={e => setForm({ ...form, potentialRating: e.target.value })}>
            {['High', 'Medium', 'Low'].map(r => <option key={r}>{r}</option>)}
          </select></label>
          <label>Development Needs<textarea rows={3} value={form.developmentNeeds} onChange={e => setForm({ ...form, developmentNeeds: e.target.value })} placeholder="Skills, training, experience needed..." /></label>
          <label>Notes<textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {['Active', 'In Progress', 'Completed', 'On Hold'].map(s => <option key={s}>{s}</option>)}
          </select></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Save Succession Plan</button>
      </form>
    </ModalCard>
  );
}

// ─── INVENTORY STOCKTAKE SCHEDULER ───
export function StocktakeScheduler({ user, warehouses, onClose, onSave }) {
  const [form, setForm] = useState({
    warehouse: '', startDate: new Date().toISOString().slice(0, 10), endDate: '',
    countType: 'Full Count', assignedTo: '', notes: ''
  });

  return (
    <ModalCard title="Schedule Stocktake" onClose={onClose}>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Stocktake Schedule</legend><div>
          <label>Warehouse<select value={form.warehouse} onChange={e => setForm({ ...form, warehouse: e.target.value })} required>
            <option value="">Select warehouse...</option>
            {warehouses?.map(w => <option key={w.id || w.name} value={w.name}>{w.name}</option>)}
          </select></label>
          <label>Count Type<select value={form.countType} onChange={e => setForm({ ...form, countType: e.target.value })}>
            {['Full Count', 'Cycle Count', 'ABC Count', 'Spot Check', 'Year-End'].map(t => <option key={t}>{t}</option>)}
          </select></label>
          <label>Start Date<input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></label>
          <label>End Date<input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></label>
          <label>Assigned To<input value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })} placeholder="Counter name" /></label>
          <label>Notes<textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Schedule Stocktake</button>
      </form>
    </ModalCard>
  );
}

// ─── INVENTORY SUPPLIER PERFORMANCE ───
export function SupplierPerformanceModal({ user, suppliers, onClose, onSave }) {
  const [form, setForm] = useState({
    supplierId: '', supplierName: '', ratingDate: new Date().toISOString().slice(0, 10),
    deliveryAccuracy: 0, qualityScore: 0, leadTime: 0, pricing: 0,
    communication: 0, overallRating: 0, comments: ''
  });

  return (
    <ModalCard title="Supplier Performance Rating" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Rating Details</legend><div>
          <label>Supplier<select value={form.supplierId} onChange={e => {
            const s = suppliers?.find(x => x.id === e.target.value || x.name === e.target.value);
            setForm({ ...form, supplierId: e.target.value, supplierName: s?.name || e.target.value });
          }} required>
            <option value="">Select supplier...</option>
            {suppliers?.map(s => <option key={s.id || s.name} value={s.id || s.name}>{s.name}</option>)}
          </select></label>
          <label>Rating Date<input type="date" value={form.ratingDate} onChange={e => setForm({ ...form, ratingDate: e.target.value })} /></label>
          <label>Delivery Accuracy (0-100)<input type="number" min="0" max="100" value={form.deliveryAccuracy} onChange={e => setForm({ ...form, deliveryAccuracy: Number(e.target.value) })} /></label>
          <label>Quality Score (0-100)<input type="number" min="0" max="100" value={form.qualityScore} onChange={e => setForm({ ...form, qualityScore: Number(e.target.value) })} /></label>
          <label>Lead Time (0-100)<input type="number" min="0" max="100" value={form.leadTime} onChange={e => setForm({ ...form, leadTime: Number(e.target.value) })} /></label>
          <label>Pricing (0-100)<input type="number" min="0" max="100" value={form.pricing} onChange={e => setForm({ ...form, pricing: Number(e.target.value) })} /></label>
          <label>Communication (0-100)<input type="number" min="0" max="100" value={form.communication} onChange={e => setForm({ ...form, communication: Number(e.target.value) })} /></label>
          <label>Overall Rating (auto)<input readOnly value={Math.round((form.deliveryAccuracy + form.qualityScore + form.leadTime + form.pricing + form.communication) / 5)} /></label>
          <label>Comments<textarea rows={3} value={form.comments} onChange={e => setForm({ ...form, comments: e.target.value })} /></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Save Rating</button>
      </form>
    </ModalCard>
  );
}

// ─── INVENTORY BATCH TRACEABILITY ───
export function BatchTraceabilityModal({ user, batchData, onClose }) {
  if (!batchData) return null;
  return (
    <ModalCard title={`Batch Traceability: ${batchData.batchNo || batchData.lotNo || 'N/A'}`} onClose={onClose} wide>
      <div className="dashboard-grid" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <div className="span-12" style={{ background: '#f9fafb', borderRadius: 12, padding: 16 }}>
          <h3>{batchData.productName}</h3>
          <div className="settings-kv-grid">
            <article><span>Batch Number</span><strong>{batchData.batchNo || batchData.lotNo || 'N/A'}</strong></article>
            <article><span>Supplier</span><strong>{batchData.supplierName || batchData.supplier || 'N/A'}</strong></article>
            <article><span>Received Date</span><strong>{batchData.receivedDate || batchData.date || 'N/A'}</strong></article>
            <article><span>Quantity</span><strong>{batchData.quantity || 0}</strong></article>
            <article><span>Expiry Date</span><strong style={{ color: batchData.expiryDate && new Date(batchData.expiryDate) < new Date() ? '#ef4444' : '#101828' }}>{batchData.expiryDate || 'N/A'}</strong></article>
            <article><span>Warehouse</span><strong>{batchData.warehouseName || batchData.warehouse || 'N/A'}</strong></article>
            <article><span>Status</span><strong>{batchData.status || 'Active'}</strong></article>
            <article><span>Days Until Expiry</span><strong>{batchData.expiryDate ? Math.round((new Date(batchData.expiryDate) - new Date()) / 86400000) : 'N/A'}</strong></article>
          </div>
        </div>
        <div className="span-12">
          <div className="panel-header"><h3>Usage History</h3></div>
          <div className="empty-state">Batch usage tracking will be visible once this batch is used in production or sold.</div>
        </div>
      </div>
    </ModalCard>
  );
}

function currency(value) {
  return `Ksh${Number(value || 0).toLocaleString()}`;
}

function downloadRowsFile(name, rows, format) {
  const csv = [Object.keys(rows[0] || {}).join(','), ...rows.map(r => Object.values(r).map(v => `"${v || ''}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
}

function printText(title, text) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<html><head><title>${title}</title></head><body><pre>${text}</pre><script>window.print()</script></body></html>`);
  w.document.close();
}