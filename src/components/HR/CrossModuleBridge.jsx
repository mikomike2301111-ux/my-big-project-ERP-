import React, { useState } from 'react';
import { X, Plus, Package, Factory, ArrowRight, ArrowLeftRight, CheckCircle2, AlertTriangle, ClipboardCheck } from 'lucide-react';

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

// ─── INVENTORY → MANUFACTURING: Reserve Materials for Production ───
export function ReserveForProduction({ user, stockItems, formulas, onClose, onSave }) {
  const [form, setForm] = useState({
    formulaId: '', productionOrder: '', quantity: 1, warehouse: '',
    items: (stockItems || []).slice(0, 3).map(s => ({
      stockId: s.id, productName: s.productName, sku: s.sku,
      available: s.quantityAvailable || 0, quantityToReserve: 0
    }))
  });

  const selectedFormula = (formulas || []).find(f => f.id === form.formulaId);
  const updateItem = (i, val) => {
    const next = [...form.items];
    next[i] = { ...next[i], quantityToReserve: Number(val) };
    setForm({ ...form, items: next });
  };

  return (
    <ModalCard title="Reserve Inventory for Manufacturing" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Production Details</legend><div>
          <label>Formula / BOM<select value={form.formulaId} onChange={e => setForm({ ...form, formulaId: e.target.value })}>
            <option value="">Select formula...</option>
            {(formulas || []).map(f => <option key={f.id} value={f.id}>{f.productName} - {f.formulaName} (v{f.activeVersion})</option>)}
          </select></label>
          {selectedFormula && (
            <div style={{ background: '#f0f9ff', borderRadius: 8, padding: 12, marginTop: 8 }}>
              <strong>{selectedFormula.productName}</strong> - Output: {selectedFormula.outputQuantity} {selectedFormula.outputUnit} - Cost: {currency(selectedFormula.totalEstimatedCost)}
            </div>
          )}
          <label>Production Order #<input value={form.productionOrder} onChange={e => setForm({ ...form, productionOrder: e.target.value })} placeholder="PO-001" /></label>
          <label>Quantity to Produce<input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></label>
          <label>Warehouse<select value={form.warehouse} onChange={e => setForm({ ...form, warehouse: e.target.value })}>
            <option value="">Select warehouse...</option>
            {[...new Set((stockItems || []).map(s => s.warehouseName).filter(Boolean))].map(w => <option key={w}>{w}</option>)}
          </select></label>
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Materials to Reserve</legend>
          <div className="table-wrap">
            <table>
              <thead><tr><th>SKU</th><th>Product</th><th>Available</th><th>Reserve Qty</th><th>After Reserve</th></tr></thead>
              <tbody>
                {form.items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.sku}</td>
                    <td>{item.productName}</td>
                    <td>{item.available}</td>
                    <td><input type="number" min="0" max={item.available} value={item.quantityToReserve}
                      onChange={e => updateItem(i, e.target.value)}
                      style={{ width: 80, padding: '4px 8px', border: '1px solid #d0d5dd', borderRadius: 6 }} /></td>
                    <td style={{ color: item.available - item.quantityToReserve < 0 ? '#ef4444' : '#22c55e' }}>
                      {item.available - item.quantityToReserve}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>
        <button className="primary-action" type="submit">Reserve Materials & Create Production Order</button>
      </form>
    </ModalCard>
  );
}

// ─── MANUFACTURING → INVENTORY: Move Finished Goods to Inventory ───
export function FinishedGoodsToInventory({ user, productionBatches, warehouses, onClose, onSave }) {
  const [form, setForm] = useState({
    batchId: '', batchNo: '', productName: '', quantity: 0, unit: 'BAG',
    warehouse: '', productionDate: new Date().toISOString().slice(0, 10), qualityStatus: 'Passed'
  });

  const selectBatch = (e) => {
    const batch = (productionBatches || []).find(b => b.id === e.target.value || b.batchNo === e.target.value);
    if (batch) setForm({ ...form, batchId: batch.id, batchNo: batch.batchNo, productName: batch.productName, quantity: batch.quantityProduced || 0 });
  };

  return (
    <ModalCard title="Transfer Finished Goods to Inventory" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Production Batch</legend><div>
          <label>Production Batch<select value={form.batchId} onChange={selectBatch} required>
            <option value="">Select completed batch...</option>
            {(productionBatches || []).filter(b => b.status === 'Completed' || b.qualityStatus === 'Passed').map(b => (
              <option key={b.id} value={b.id}>{b.batchNo} - {b.productName} ({b.quantityProduced} {b.outputUnit || 'units'})</option>
            ))}
          </select></label>
          <label>Product Name<input value={form.productName} onChange={e => setForm({ ...form, productName: e.target.value })} /></label>
          <label>Quantity Produced<input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></label>
          <label>Unit<select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
            {['BAG', 'KG', 'L', 'PCS', 'CTN', 'PLT', 'DRM', 'BOX'].map(u => <option key={u}>{u}</option>)}
          </select></label>
          <label>Target Warehouse<select value={form.warehouse} onChange={e => setForm({ ...form, warehouse: e.target.value })} required>
            <option value="">Select warehouse...</option>
            {(warehouses || []).map(w => <option key={w.id || w.name} value={w.name}>{w.name}</option>)}
          </select></label>
          <label>Production Date<input type="date" value={form.productionDate} onChange={e => setForm({ ...form, productionDate: e.target.value })} /></label>
          <label>Quality Status<select value={form.qualityStatus} onChange={e => setForm({ ...form, qualityStatus: e.target.value })}>
            {['Passed', 'Pending QC', 'Quarantine'].map(s => <option key={s}>{s}</option>)}
          </select></label>
        </div></fieldset>
        {form.quantity > 0 && (
          <div style={{ background: '#f0f9ff', borderRadius: 8, padding: 16, margin: '8px 0' }}>
            <strong>Summary:</strong> Moving {form.quantity} {form.unit} of <strong>{form.productName}</strong> (Batch: {form.batchNo}) to <strong>{form.warehouse}</strong>
          </div>
        )}
        <button className="primary-action" type="submit">Transfer to Inventory</button>
      </form>
    </ModalCard>
  );
}

// ─── INVENTORY → MANUFACTURING: Raw Material Consumption Tracking ───
export function MaterialConsumption({ user, productionOrders, stockItems, onClose, onSave }) {
  const [form, setForm] = useState({
    productionOrderId: '', date: new Date().toISOString().slice(0, 10),
    operator: user?.name || '', items: [{ stockId: '', productName: '', quantity: 0, unit: 'KG' }]
  });

  const addItem = () => setForm({ ...form, items: [...form.items, { stockId: '', productName: '', quantity: 0, unit: 'KG' }] });
  const updateItem = (i, field, val) => {
    const next = [...form.items];
    if (field === 'stockId') {
      const item = (stockItems || []).find(s => s.id === val || s.productName === val);
      next[i] = { ...next[i], stockId: val, productName: item?.productName || val };
    } else {
      next[i] = { ...next[i], [field]: val };
    }
    setForm({ ...form, items: next });
  };
  const removeItem = i => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });

  return (
    <ModalCard title="Record Material Consumption" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Production Order</legend><div>
          <label>Production Order<select value={form.productionOrderId} onChange={e => setForm({ ...form, productionOrderId: e.target.value })} required>
            <option value="">Select active order...</option>
            {(productionOrders || []).filter(o => o.status === 'In Production').map(o => (
              <option key={o.id} value={o.id}>{o.orderNo} - {o.productName} (Qty: {o.plannedQty})</option>
            ))}
          </select></label>
          <label>Date<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
          <label>Operator<input value={form.operator} onChange={e => setForm({ ...form, operator: e.target.value })} /></label>
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Materials Consumed</legend>
          <button type="button" className="panel-action-button" onClick={addItem} style={{ marginBottom: 8 }}><Plus size={14} /> Add Material</button>
          {form.items.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 6, marginBottom: 6, padding: 10, background: '#f9fafb', borderRadius: 8, alignItems: 'end' }}>
              <label>Material<select value={item.stockId} onChange={e => updateItem(i, 'stockId', e.target.value)}>
                <option value="">Select material...</option>
                {(stockItems || []).filter(s => s.quantityAvailable > 0).map(s => (
                  <option key={s.id} value={s.id}>{s.productName} ({s.quantityAvailable} avail)</option>
                ))}
              </select></label>
              <label>Qty<input type="number" min="0" value={item.quantity} onChange={e => updateItem(i, 'quantity', Number(e.target.value))} /></label>
              <label>Unit<select value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)}>
                {['KG', 'G', 'L', 'ML', 'PCS', 'BAG', 'CTN'].map(u => <option key={u}>{u}</option>)}
              </select></label>
              <button type="button" className="mini-action" onClick={() => removeItem(i)} style={{ color: '#ef4444' }}><X size={14} /></button>
            </div>
          ))}
        </fieldset>
        <button className="primary-action" type="submit">Record Consumption & Reduce Inventory</button>
      </form>
    </ModalCard>
  );
}

// ─── INVENTORY vs MANUFACTURING Dashboard ───
export function InvVsMfgDashboard({ stockItems, productionOrders, formulas }) {
  const reservedStock = (stockItems || []).reduce((s, i) => s + (i.quantityReserved || 0), 0);
  const availableStock = (stockItems || []).reduce((s, i) => s + (i.quantityAvailable || 0), 0);
  const totalIncoming = (stockItems || []).reduce((s, i) => s + (i.quantityIncoming || 0), 0);
  const activeOrders = (productionOrders || []).filter(o => o.status === 'In Production' || o.status === 'Pending').length;
  const completedOrders = (productionOrders || []).filter(o => o.status === 'Completed').length;
  const lowStockMaterials = (stockItems || []).filter(s => s.quantityAvailable <= (s.minimumStock || 0) && (s.category === 'Raw Material' || s.category === 'Packaging')).length;
  const formulasCount = (formulas || []).length;

  return (
    <div className="dashboard-grid">
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#22c55e' }}>{availableStock}</strong><span>Available Stock</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#2563eb' }}>{reservedStock}</strong><span>Reserved for Mfg</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#f79009' }}>{totalIncoming}</strong><span>Incoming Stock</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: activeOrders ? '#f79009' : '#22c55e' }}>{activeOrders}</strong><span>Active Prod Orders</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#22c55e' }}>{completedOrders}</strong><span>Completed Orders</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: lowStockMaterials ? '#ef4444' : '#22c55e' }}>{lowStockMaterials}</strong><span>Low Raw Materials</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#7c3aed' }}>{formulasCount}</strong><span>Formulas/BOMs</span></div></div>

      <div className="span-12">
        <div className="panel-header"><h3>Material Availability for Production</h3></div>
        <div className="table-wrap" style={{ maxHeight: 300 }}>
          <table>
            <thead><tr><th>Material</th><th>SKU</th><th>Available</th><th>Reserved</th><th>Min Stock</th><th>Status</th><th>Can Produce?</th></tr></thead>
            <tbody>
              {(stockItems || []).filter(s => s.category === 'Raw Material' || s.category === 'Packaging').slice(0, 20).map(s => (
                <tr key={s.id}>
                  <td><strong>{s.productName}</strong></td>
                  <td>{s.sku}</td>
                  <td>{s.quantityAvailable || 0}</td>
                  <td>{s.quantityReserved || 0}</td>
                  <td>{s.minimumStock || 0}</td>
                  <td><span className={`status ${(s.quantityAvailable || 0) > (s.minimumStock || 0) ? 'active' : 'cancelled'}`}>
                    {(s.quantityAvailable || 0) > (s.minimumStock || 0) ? 'Stock OK' : 'Low Stock'}
                  </span></td>
                  <td>{s.quantityAvailable > 0 ? '✅ Yes' : '❌ No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="span-12">
        <div className="panel-header"><h3>Inventory ↔ Manufacturing Flow</h3></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, padding: 16 }}>
          <div style={{ background: '#dcfce7', borderRadius: 12, padding: 16 }}>
            <Package size={24} /> <strong>Inventory</strong>
            <div style={{ fontSize: 13, marginTop: 8 }}>
              → Raw Materials stored<br />
              → Available for production<br />
              → Reserved when order starts
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>⟷</div>
          <div style={{ background: '#dbeafe', borderRadius: 12, padding: 16 }}>
            <Factory size={24} /> <strong>Manufacturing</strong>
            <div style={{ fontSize: 13, marginTop: 8 }}>
              → Consumes raw materials<br />
              → Produces finished goods<br />
              → Output goes to inventory
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8, padding: 12, background: '#f9fafb', borderRadius: 8, fontSize: 13 }}>
          <strong>Flow:</strong> Inventory (raw materials) → Reserve → Manufacturing (consume) → Produce → Finished Goods → Inventory (stock)
        </div>
      </div>
    </div>
  );
}

// ─── BOM Cost vs Inventory Cost Comparison ───
export function BOMCostComparison({ formulas, stockItems }) {
  return (
    <div className="dashboard-grid">
      <div className="span-12">
        <div className="panel-header"><h3>BOM Cost vs Actual Inventory Cost</h3></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Formula</th><th>Product</th><th>BOM Est. Cost</th><th>Actual Mat. Cost</th><th>Variance</th><th>Status</th></tr></thead>
            <tbody>
              {(formulas || []).slice(0, 15).map(f => {
                const estCost = f.totalEstimatedCost || 0;
                const actualCost = estCost * 1.08; // Placeholder for actual calculation
                const variance = actualCost - estCost;
                return (
                  <tr key={f.id}>
                    <td><strong>{f.formulaName}</strong></td>
                    <td>{f.productName}</td>
                    <td>{currency(estCost)}</td>
                    <td>{currency(actualCost)}</td>
                    <td style={{ color: variance > 0 ? '#ef4444' : '#22c55e' }}>{variance > 0 ? '+' : ''}{currency(variance)}</td>
                    <td><span className={`status ${variance > estCost * 0.1 ? 'cancelled' : 'active'}`}>{variance > estCost * 0.1 ? 'Over Budget' : 'On Track'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function currency(v) { return `Ksh${Number(v || 0).toLocaleString()}`; }