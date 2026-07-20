import React, { useState } from 'react';

const num = value => Number.parseFloat(value || 0) || 0;

const CATEGORIES = [
  'Direct Materials',
  'Packaging Materials',
  'Consumables',
  'Indirect Materials',
  'Chemicals',
  'Labels & Printed Materials',
  'Containers',
  'Accessories',
  'Ingredient',
  'Other'
];

const UOMS = ['ml', 'L', 'g', 'kg', 'Piece', 'Box', 'Roll', 'Bottle', 'Carton', 'KG', 'G', 'ML', 'PCS', 'Bags'];

/**
 * RawMaterialSetupModal — Enhanced two-step modal for creating raw materials
 * Step 1: Material details (with full ERP fields)
 * Step 2: Cost confirmation overlay
 */
export default function RawMaterialSetupModal({ user, material: editMaterial, onClose, onSaved, rpc }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => {
    if (editMaterial) {
      return {
        id: editMaterial.id || '',
        ...editMaterial,
        category: editMaterial.category || 'Direct Materials',
        barcode: editMaterial.barcode || '',
        qrCode: editMaterial.qrCode || '',
        description: editMaterial.description || '',
        unitCost: editMaterial.unitCost || editMaterial.costPerUnit || 0,
        averageCost: editMaterial.averageCost || editMaterial.unitCost || 0,
        lastPurchasePrice: editMaterial.lastPurchasePrice || editMaterial.unitCost || 0,
        reorderLevel: editMaterial.reorderLevel || editMaterial.reorderPoint || 0,
        leadTime: editMaterial.leadTime || editMaterial.leadTimeDays || 0,
        binLocation: editMaterial.binLocation || editMaterial.storageLocation || 'A1',
        warehouse: editMaterial.warehouse || 'Main Warehouse',
        status: editMaterial.status || 'Active'
      };
    }
    return {
      materialCode: '',
      barcode: '',
      qrCode: '',
      materialName: '',
      description: '',
      category: 'Direct Materials',
      unitOfMeasure: 'KG',
      baseUnit: 'G',
      conversionFactor: 1000,
      unitCost: 0,
      averageCost: 0,
      lastPurchasePrice: 0,
      supplier: '',
      warehouse: 'Main Warehouse',
      binLocation: 'A1',
      minStockLevel: 0,
      maxStockLevel: 0,
      reorderLevel: 0,
      leadTime: 0,
      storageCondition: 'Room Temp',
      hazardous: false,
      status: 'Active'
    };
  });
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    if (step === 1 && num(form.unitCost) > 0) {
      setStep(2);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, costPerUnit: num(form.unitCost) };
      await rpc('saveRawMaterial', [user, payload]);
      onSaved?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card wide" onSubmit={save} onClick={e => e.stopPropagation()}>
        <header>
          <h2>{step === 1 ? (editMaterial ? 'Edit Raw Material' : 'New Raw Material') : 'Confirm Price'}</h2>
          <button type="button" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {step === 1 && (
          <div className="modal-grid three-col">
            <label>
              Material Code
              <input value={form.materialCode} onChange={e => setForm({ ...form, materialCode: e.target.value })} placeholder="Auto-generated if empty" />
            </label>
            <label>
              Barcode / QR Code
              <input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value, qrCode: e.target.value })} placeholder="Scan or enter barcode" />
            </label>
            <label>
              Material Name *
              <input value={form.materialName} onChange={e => setForm({ ...form, materialName: e.target.value })} required />
            </label>
            <label className="span-2">
              Description
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description of material" />
            </label>
            <label>
              Category
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>
              Unit of Measure
              <select value={form.unitOfMeasure} onChange={e => setForm({ ...form, unitOfMeasure: e.target.value })}>
                {UOMS.map(u => <option key={u}>{u}</option>)}
              </select>
            </label>
            <label>
              Base Unit
              <select value={form.baseUnit} onChange={e => setForm({ ...form, baseUnit: e.target.value })}>
                <option>G</option><option>ML</option><option>Unit</option><option>Piece</option>
              </select>
            </label>
            <label>
              Conversion Factor
              <input type="number" value={form.conversionFactor} onChange={e => setForm({ ...form, conversionFactor: e.target.value })} />
            </label>
            <label>
              Unit Cost (KES)
              <input type="number" step="0.01" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} />
            </label>
            <label>
              Average Cost (KES)
              <input type="number" step="0.01" value={form.averageCost} onChange={e => setForm({ ...form, averageCost: e.target.value })} />
            </label>
            <label>
              Last Purchase Price (KES)
              <input type="number" step="0.01" value={form.lastPurchasePrice} onChange={e => setForm({ ...form, lastPurchasePrice: e.target.value })} />
            </label>
            <label>
              Supplier
              <input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} />
            </label>
            <label>
              Warehouse
              <input value={form.warehouse} onChange={e => setForm({ ...form, warehouse: e.target.value })} />
            </label>
            <label>
              Bin Location
              <input value={form.binLocation} onChange={e => setForm({ ...form, binLocation: e.target.value })} />
            </label>
            <label>
              Min Stock Level
              <input type="number" value={form.minStockLevel} onChange={e => setForm({ ...form, minStockLevel: e.target.value })} />
            </label>
            <label>
              Max Stock Level
              <input type="number" value={form.maxStockLevel} onChange={e => setForm({ ...form, maxStockLevel: e.target.value })} />
            </label>
            <label>
              Reorder Level
              <input type="number" value={form.reorderLevel} onChange={e => setForm({ ...form, reorderLevel: e.target.value })} />
            </label>
            <label>
              Lead Time (days)
              <input type="number" value={form.leadTime} onChange={e => setForm({ ...form, leadTime: e.target.value })} />
            </label>
            <label>
              Storage Condition
              <select value={form.storageCondition} onChange={e => setForm({ ...form, storageCondition: e.target.value })}>
                <option>Room Temp</option><option>Cold Storage</option><option>Hazardous</option>
              </select>
            </label>
            <label>
              Status
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option>Active</option><option>Inactive</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.hazardous} onChange={e => setForm({ ...form, hazardous: e.target.checked })} />
              Hazardous Material
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="cost-confirmation-card">
            <div className="cost-confirmation-card-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f79009" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3>Confirm Material Price</h3>
            <div className="cost-confirmation-details">
              <article><span>Material</span><strong>{form.materialName}</strong></article>
              <article><span>Unit Cost</span><strong className="highlight">KES {num(form.unitCost).toLocaleString()}</strong></article>
              <article><span>Average Cost</span><strong>KES {num(form.averageCost).toLocaleString()}</strong></article>
              <article><span>Last Purchase</span><strong>KES {num(form.lastPurchasePrice).toLocaleString()}</strong></article>
              <article><span>Unit</span><strong>{form.unitOfMeasure}</strong></article>
              <article><span>Category</span><strong>{form.category}</strong></article>
              <article><span>Supplier</span><strong>{form.supplier || 'Not specified'}</strong></article>
              <article><span>Warehouse</span><strong>{form.warehouse}</strong></article>
            </div>
            <p className="cost-confirmation-note">
              Once confirmed, this cost will be used for production cost calculations
              and inventory valuation. You can update it later with a new confirmation.
            </p>
          </div>
        )}

        <div className="modal-actions">
          {step === 2 && (
            <button type="button" className="secondary-action" onClick={() => setStep(1)}>
              Back
            </button>
          )}
          <button className="primary-action" disabled={saving}>
            {saving ? 'Saving...' : step === 1 ? 'Continue' : 'Confirm & Save'}
          </button>
        </div>
      </form>
    </div>
  );
}