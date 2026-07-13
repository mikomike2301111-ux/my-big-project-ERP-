import React, { useState } from 'react';

const num = value => Number.parseFloat(value || 0) || 0;

/**
 * RawMaterialSetupModal — Two-step modal for creating raw materials
 * Step 1: Material details (name, category, UOM, cost, supplier, etc.)
 * Step 2: Cost confirmation overlay
 */
export default function RawMaterialSetupModal({ user, onClose, onSaved, rpc }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    materialCode: '',
    materialName: '',
    category: 'Ingredient',
    unitOfMeasure: 'KG',
    baseUnit: 'G',
    conversionFactor: 1000,
    costPerUnit: 0,
    supplier: '',
    minStockLevel: 0,
    maxStockLevel: 0,
    reorderPoint: 0,
    leadTimeDays: 0,
    storageCondition: 'Room Temp',
    hazardous: false
  });
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();

    // Step 1 → Step 2 (cost confirmation) if cost > 0
    if (step === 1 && num(form.costPerUnit) > 0) {
      setStep(2);
      return;
    }

    setSaving(true);
    try {
      await rpc('saveRawMaterial', [user, form]);
      onSaved?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card" onSubmit={save} onClick={e => e.stopPropagation()}>
        <header>
          <h2>{step === 1 ? 'New Raw Material' : 'Confirm Price'}</h2>
          <button type="button" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {step === 1 && (
          <div className="modal-grid">
            <label>
              Material Code
              <input value={form.materialCode} onChange={e => setForm({ ...form, materialCode: e.target.value })} placeholder="Auto-generated if empty" />
            </label>
            <label>
              Material Name *
              <input value={form.materialName} onChange={e => setForm({ ...form, materialName: e.target.value })} required />
            </label>
            <label>
              Category
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                <option>Ingredient</option>
                <option>Chemical</option>
                <option>Packaging</option>
                <option>Consumable</option>
                <option>Spare Part</option>
                <option>Other</option>
              </select>
            </label>
            <label>
              Unit of Measure
              <select value={form.unitOfMeasure} onChange={e => setForm({ ...form, unitOfMeasure: e.target.value })}>
                <option>KG</option><option>G</option><option>L</option><option>ML</option>
                <option>Pieces</option><option>Cartons</option><option>Bags</option>
              </select>
            </label>
            <label>
              Base Unit (smallest unit for conversions)
              <select value={form.baseUnit} onChange={e => setForm({ ...form, baseUnit: e.target.value })}>
                <option>G</option><option>ML</option><option>Unit</option>
              </select>
            </label>
            <label>
              Conversion Factor (e.g. 1000 for KG→G)
              <input type="number" value={form.conversionFactor} onChange={e => setForm({ ...form, conversionFactor: e.target.value })} />
            </label>
            <label>
              Cost Per Unit (KES)
              <input type="number" step="0.01" value={form.costPerUnit} onChange={e => setForm({ ...form, costPerUnit: e.target.value })} />
            </label>
            <label>
              Supplier
              <input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} />
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
              Reorder Point
              <input type="number" value={form.reorderPoint} onChange={e => setForm({ ...form, reorderPoint: e.target.value })} />
            </label>
            <label>
              Lead Time (days)
              <input type="number" value={form.leadTimeDays} onChange={e => setForm({ ...form, leadTimeDays: e.target.value })} />
            </label>
            <label>
              Storage Condition
              <select value={form.storageCondition} onChange={e => setForm({ ...form, storageCondition: e.target.value })}>
                <option>Room Temp</option><option>Cold Storage</option><option>Hazardous</option>
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
              <article>
                <span>Material</span>
                <strong>{form.materialName}</strong>
              </article>
              <article>
                <span>Unit Cost</span>
                <strong className="highlight">KES {num(form.costPerUnit).toLocaleString()}</strong>
              </article>
              <article>
                <span>Unit</span>
                <strong>{form.unitOfMeasure}</strong>
              </article>
              <article>
                <span>Supplier</span>
                <strong>{form.supplier || 'Not specified'}</strong>
              </article>
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