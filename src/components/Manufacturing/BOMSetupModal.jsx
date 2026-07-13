import React, { useState, useEffect } from 'react';

const num = value => Number.parseFloat(value || 0) || 0;
const currency = value => `KES ${Number(value || 0).toLocaleString()}`;

/**
 * BOMSetupModal — Bill of Materials setup with dynamic cost preview
 * Links a product to its raw material consumption quantities
 */
export default function BOMSetupModal({ user, products, rawMaterials, onClose, onSaved, rpc }) {
  const [form, setForm] = useState({
    productId: '',
    name: '',
    outputQty: 1,
    outputUnit: 'unit',
    laborCost: 0,
    overheadCost: 0,
    items: [{ rawMaterialId: '', quantity: 1, unit: 'KG', wastePercent: 0 }]
  });
  const [saving, setSaving] = useState(false);
  const [costPreview, setCostPreview] = useState({ materials: 0, total: 0 });

  useEffect(() => {
    const materialCost = form.items.reduce((sum, item) => {
      const mat = rawMaterials.find(m => m.id === item.rawMaterialId);
      return sum + (mat ? num(mat.costPerUnit) * num(item.quantity) : 0);
    }, 0);
    setCostPreview({
      materials: materialCost,
      total: materialCost + num(form.laborCost) + num(form.overheadCost)
    });
  }, [form.items, form.laborCost, form.overheadCost, rawMaterials]);

  const addItem = () => setForm({
    ...form,
    items: [...form.items, { rawMaterialId: '', quantity: 1, unit: 'KG', wastePercent: 0 }]
  });

  const removeItem = (index) => setForm({
    ...form,
    items: form.items.filter((_, i) => i !== index)
  });

  const updateItem = (index, field, value) => {
    const items = [...form.items];
    items[index][field] = value;
    setForm({ ...form, items });
  };

  async function save(e) {
    e.preventDefault();
    if (!form.productId) { alert('Please select a product'); return; }
    if (form.items.some(item => !item.rawMaterialId)) {
      alert('All BOM items must have a raw material selected');
      return;
    }

    // Cost confirmation
    if (costPreview.total > 0) {
      const confirmed = window.confirm(
        `Total estimated cost: ${currency(costPreview.total)}\n` +
        `Material cost: ${currency(costPreview.materials)}\n` +
        `Labor: ${currency(num(form.laborCost))}\n` +
        `Overhead: ${currency(num(form.overheadCost))}\n\n` +
        `Confirm these costs?`
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      await rpc('saveBOM', [user, { ...form, totalEstimatedCost: costPreview.total }]);
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
          <h2>Bill of Materials Setup</h2>
          <button type="button" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="bom-setup-grid">
          <div className="bom-header-fields">
            <label>
              Product *
              <select value={form.productId} onChange={e => {
                const product = products.find(p => p.id === e.target.value);
                setForm({
                  ...form,
                  productId: e.target.value,
                  name: product?.name || '',
                  outputUnit: product?.unit || 'unit'
                });
              }} required>
                <option value="">Select product...</option>
                {products.filter(p => p.isManufactured !== false).map(p => (
                  <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                ))}
              </select>
            </label>
            <label>
              BOM Name
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Auto-filled from product" />
            </label>
            <label>
              Output Qty
              <input type="number" value={form.outputQty} onChange={e => setForm({ ...form, outputQty: e.target.value })} />
            </label>
            <label>
              Output Unit
              <input value={form.outputUnit} onChange={e => setForm({ ...form, outputUnit: e.target.value })} />
            </label>
          </div>

          <div className="bom-items-section">
            <h3>Raw Materials Consumed</h3>
            {form.items.map((item, index) => {
              const mat = rawMaterials.find(m => m.id === item.rawMaterialId);
              const lineCost = mat ? num(mat.costPerUnit) * num(item.quantity) : 0;
              return (
                <div key={index} className="bom-item-row">
                  <select
                    value={item.rawMaterialId}
                    onChange={e => updateItem(index, 'rawMaterialId', e.target.value)}
                    required
                  >
                    <option value="">Select material...</option>
                    {rawMaterials.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.materialName} ({m.unitOfMeasure}) — {currency(m.costPerUnit)}/{m.unitOfMeasure}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.001"
                    value={item.quantity}
                    onChange={e => updateItem(index, 'quantity', e.target.value)}
                    placeholder="Qty"
                  />
                  <input
                    value={item.unit}
                    onChange={e => updateItem(index, 'unit', e.target.value)}
                    placeholder="Unit"
                  />
                  <input
                    type="number"
                    value={item.wastePercent}
                    onChange={e => updateItem(index, 'wastePercent', e.target.value)}
                    placeholder="Waste %"
                  />
                  <span className="bom-line-cost">{currency(lineCost)}</span>
                  <button type="button" className="bom-remove-btn" onClick={() => removeItem(index)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d92d20" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              );
            })}
            <button type="button" className="bom-add-btn" onClick={addItem}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Raw Material
            </button>
          </div>

          <div className="bom-cost-preview">
            <h3>Cost Preview (per output unit)</h3>
            <div className="bom-cost-details">
              <article>
                <span>Material Cost</span>
                <strong>{currency(costPreview.materials)}</strong>
              </article>
              <article>
                <span>Labor Cost</span>
                <input type="number" value={form.laborCost} onChange={e => setForm({ ...form, laborCost: e.target.value })} placeholder="0" />
              </article>
              <article>
                <span>Overhead Cost</span>
                <input type="number" value={form.overheadCost} onChange={e => setForm({ ...form, overheadCost: e.target.value })} placeholder="0" />
              </article>
              <article className="total">
                <span>Total Est. Cost</span>
                <strong>{currency(costPreview.total)}</strong>
              </article>
              <article>
                <span>Suggested Selling Price (cost × 1.35)</span>
                <strong>{currency(costPreview.total * 1.35)}</strong>
              </article>
            </div>
          </div>
        </div>

        <button className="primary-action" disabled={saving}>
          {saving ? 'Saving...' : 'Save BOM'}
        </button>
      </form>
    </div>
  );
}