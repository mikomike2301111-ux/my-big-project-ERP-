import React, { useState, useEffect } from 'react';

const num = value => Number.parseFloat(value || 0) || 0;
const currency = value => `KES ${Number(value || 0).toLocaleString()}`;

/**
 * ProductionExecutionModal — Professional production validation & execution
 * Validates: materials, packaging, expiry, formula, permissions, warehouse
 * Executes: auto-deduct, create transactions, batch records, audit logs
 */
export default function ProductionExecutionModal({ user, order, rawMaterials, formulas, formulaVersions, onClose, onSaved, rpc }) {
  const [mode, setMode] = useState('validate'); // validate | execute | qc
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [form, setForm] = useState({
    completedQty: order?.plannedQty || 1,
    wastageQty: 0,
    operator: order?.operator || user?.name || '',
    warehouse: order?.warehouse || 'Main Store Nairobi',
    notes: ''
  });
  const [qc, setQc] = useState({
    weight: { checked: false, result: '' },
    appearance: { checked: false, result: '' },
    packaging: { checked: false, result: '' },
    labelAccuracy: { checked: false, result: '' },
    chemicalConcentration: { checked: false, result: '' },
    sealIntegrity: { checked: false, result: '' },
    quantity: { checked: false, result: '' },
    inspector: user?.name || '',
    status: 'Pending',
    notes: ''
  });

  useEffect(() => {
    if (order?.id) validateOrder();
  }, [order?.id]);

  async function validateOrder() {
    if (!order?.id) return;
    setValidating(true);
    try {
      const result = await rpc('validateProductionOrder', [user, order.id]);
      setValidation(result);
      if (result.valid) setMode('execute');
    } catch (err) {
      alert(err.message);
    } finally {
      setValidating(false);
    }
  }

  async function startProduction() {
    if (!order?.id) return;
    try {
      await rpc('startProductionOrder', [user, order.id]);
      alert('Production started successfully');
    } catch (err) {
      alert(err.message);
    }
  }

  async function completeProduction() {
    if (!order?.id) return;
    if (qc.status === 'Pending') {
      if (!window.confirm('QC not marked as Passed. Continue anyway?')) return;
    }
    setExecuting(true);
    try {
      const qcResult = {
        status: qc.status,
        inspector: qc.inspector,
        checks: Object.entries(qc).filter(([k]) => !['status', 'inspector', 'notes'].includes(k)).map(([name, data]) => ({
          name, checked: data.checked, result: data.result
        })),
        notes: qc.notes
      };
      const result = await rpc('completeProductionJob', [
        user,
        order.id,
        form.completedQty,
        form.wastageQty,
        0,
        qcResult
      ]);
      alert(`Production completed! Batch: ${result.batch?.batchNo}`);
      onSaved?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setExecuting(false);
    }
  }

  if (!order) return null;

  const formula = formulas.find(f => f.id === order.formulaId) || {};
  const formulaItems = formulaVersions.filter(v => v.formulaId === order.formulaId && v.version === order.formulaVersion);
  const requiredMaterials = formulaItems.map(item => {
    const mat = rawMaterials.find(m => m.id === item.rawMaterialId);
    const reqQty = Math.round(num(item.quantity) * num(order.plannedQty));
    return { ...item, materialName: mat?.materialName || item.materialName, unit: mat?.unitOfMeasure || item.unit, requiredQty, available: mat?.availableQuantity || 0, cost: mat ? num(mat.costPerUnit || mat.unitCost) * reqQty : 0 };
  });
  const totalMaterialCost = requiredMaterials.reduce((s, x) => s + x.cost, 0);
  const expectedWaste = Math.round(num(order.plannedQty) * 0.02);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card wide production-execution-modal" onClick={e => e.stopPropagation()}>
        <header>
          <h2>Production Execution — {order.orderNo}</h2>
          <button type="button" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="production-meta-bar">
          <span><strong>Product:</strong> {order.productName}</span>
          <span><strong>Formula:</strong> {formula.formulaName} ({order.formulaVersion})</span>
          <span><strong>Planned:</strong> {order.plannedQty} {order.outputUnit}</span>
          <span className={`status-badge ${order.status?.toLowerCase().replace(' ', '-')}`}>{order.status}</span>
        </div>

        {mode === 'validate' && (
          <div className="validation-panel">
            <h3>Pre-Production Validation</h3>
            {validating && <div className="loading-state">Validating...</div>}
            {validation && (
              <div className="validation-checks">
                {validation.checks?.map((check, i) => (
                  <div key={i} className={`validation-check ${check.pass ? 'pass' : 'fail'}`}>
                    <span className="check-icon">{check.pass ? '✓' : '✗'}</span>
                    <div>
                      <strong>{check.name}</strong>
                      <span>{check.detail}</span>
                    </div>
                  </div>
                ))}
                {validation.shortages?.length > 0 && (
                  <div className="shortage-report">
                    <h4>Material Shortages</h4>
                    <table className="shortage-table">
                      <thead><tr><th>Material</th><th>Required</th><th>Available</th><th>Unit</th></tr></thead>
                      <tbody>
                        {validation.shortages.map((s, i) => (
                          <tr key={i}><td>{s.materialName}</td><td>{s.required}</td><td>{s.available}</td><td>{s.unit}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {validation.valid ? (
                  <button className="primary-action" onClick={() => setMode('execute')}>Proceed to Execution</button>
                ) : (
                  <div className="validation-blocked">Production blocked. Resolve issues above before proceeding.</div>
                )}
              </div>
            )}
          </div>
        )}

        {mode === 'execute' && (
          <div className="execution-panel">
            <div className="material-requirements">
              <h3>Required Materials (Auto-calculated for {order.plannedQty} {order.outputUnit})</h3>
              <table className="requirements-table">
                <thead>
                  <tr><th>Material</th><th>Category</th><th>Per Unit</th><th>Required</th><th>Available</th><th>Unit</th><th>Cost (KES)</th></tr>
                </thead>
                <tbody>
                  {requiredMaterials.map((req, i) => (
                    <tr key={i} className={req.available >= req.requiredQty ? 'sufficient' : 'shortage'}>
                      <td>{req.materialName}</td>
                      <td>{req.materialCategory || '—'}</td>
                      <td>{req.quantity}</td>
                      <td><strong>{req.requiredQty}</strong></td>
                      <td>{req.available}</td>
                      <td>{req.unit}</td>
                      <td>{currency(req.cost)}</td>
                    </tr>
                  ))}
                  <tr className="total-row"><td colSpan={6}><strong>Total Material Cost</strong></td><td><strong>{currency(totalMaterialCost)}</strong></td></tr>
                </tbody>
              </table>
            </div>

            <div className="execution-form">
              <h3>Production Output</h3>
              <div className="modal-grid three-col">
                <label>Completed Qty<input type="number" value={form.completedQty} onChange={e => setForm({ ...form, completedQty: e.target.value })} /></label>
                <label>Wastage Qty<input type="number" value={form.wastageQty} onChange={e => setForm({ ...form, wastageQty: e.target.value })} /></label>
                <label>Expected Waste<em>{expectedWaste} {order.outputUnit}</em></label>
                <label>Operator<input value={form.operator} onChange={e => setForm({ ...form, operator: e.target.value })} /></label>
                <label>Warehouse<input value={form.warehouse} onChange={e => setForm({ ...form, warehouse: e.target.value })} /></label>
                <label>Notes<input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
              </div>
            </div>

            <div className="cost-breakdown">
              <h3>Cost Breakdown</h3>
              <div className="cost-grid">
                <span>Raw Material Cost</span><strong>{currency(totalMaterialCost)}</strong>
                <span>Packaging Cost</span><strong>{currency(requiredMaterials.filter(r => r.materialCategory === 'Packaging Materials' || r.materialCategory === 'Packaging').reduce((s, r) => s + r.cost, 0))}</strong>
                <span>Labor Cost (15%)</span><strong>{currency(totalMaterialCost * 0.15)}</strong>
                <span>Overhead Cost (8%)</span><strong>{currency(totalMaterialCost * 0.08)}</strong>
                <span>Machine Cost (5%)</span><strong>{currency(totalMaterialCost * 0.05)}</strong>
                <span>Utility Cost (3%)</span><strong>{currency(totalMaterialCost * 0.03)}</strong>
                <span className="total">Total Cost</span><strong className="total">{currency(totalMaterialCost * 1.31)}</strong>
                <span>Cost Per Unit</span><strong>{currency((totalMaterialCost * 1.31) / num(form.completedQty || 1))}</strong>
                <span>Suggested Selling Price</span><strong>{currency((totalMaterialCost * 1.31) / num(form.completedQty || 1) * 1.35)}</strong>
              </div>
            </div>

            <div className="qc-panel">
              <h3>Quality Control Checks</h3>
              <div className="qc-checks-grid">
                {[
                  ['weight', 'Weight'],
                  ['appearance', 'Appearance'],
                  ['packaging', 'Packaging'],
                  ['labelAccuracy', 'Label Accuracy'],
                  ['chemicalConcentration', 'Chemical Concentration'],
                  ['sealIntegrity', 'Seal Integrity'],
                  ['quantity', 'Quantity']
                ].map(([key, label]) => (
                  <label key={key} className="qc-check-item">
                    <input type="checkbox" checked={qc[key].checked} onChange={e => setQc({ ...qc, [key]: { ...qc[key], checked: e.target.checked } })} />
                    <span>{label}</span>
                    <input value={qc[key].result} onChange={e => setQc({ ...qc, [key]: { ...qc[key], result: e.target.value } })} placeholder="Result / Notes" />
                  </label>
                ))}
              </div>
              <div className="qc-summary">
                <label>Inspector<input value={qc.inspector} onChange={e => setQc({ ...qc, inspector: e.target.value })} /></label>
                <label>QC Status
                  <select value={qc.status} onChange={e => setQc({ ...qc, status: e.target.value })}>
                    <option>Pending</option><option>Passed</option><option>Failed</option>
                  </select>
                </label>
                <label>QC Notes<input value={qc.notes} onChange={e => setQc({ ...qc, notes: e.target.value })} /></label>
              </div>
            </div>

            <div className="execution-actions">
              {order.status === 'Pending' && (
                <button className="secondary-action" onClick={startProduction} disabled={executing}>Start Production</button>
              )}
              {order.status === 'In Production' && (
                <button className="primary-action" onClick={completeProduction} disabled={executing}>
                  {executing ? 'Completing...' : 'Complete Production & Create Batch'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
