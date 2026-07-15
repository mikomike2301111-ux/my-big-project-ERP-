import React, { useState, useEffect } from 'react';

const num = value => Number.parseFloat(value || 0) || 0;
const currency = value => `KES ${Number(value || 0).toLocaleString()}`;

const UOMS = ['ml', 'L', 'g', 'kg', 'Piece', 'Box', 'Roll', 'Bottle', 'Carton', 'KG', 'G', 'ML', 'PCS', 'Bags'];

function MaterialSearchSelect({ rawMaterials, value, onChange, placeholder, category }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = rawMaterials.filter(m => {
    if (category && m.category !== category) return false;
    return String(m.materialName).toLowerCase().includes(search.toLowerCase()) ||
           String(m.materialCode).toLowerCase().includes(search.toLowerCase());
  }).slice(0, 50);
  const selected = rawMaterials.find(m => m.id === value);
  return (
    <div className="material-search-select" style={{ position: 'relative', flex: 1 }}>
      <input
        value={open ? search : (selected ? `${selected.materialName} (${selected.unitOfMeasure})` : '')}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{ width: '100%' }}
      />
      {open && (
        <div className="material-search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, maxHeight: 200, overflow: 'auto', background: '#fff', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {filtered.map(m => (
            <button key={m.id} type="button" className="material-search-option" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', background: value === m.id ? '#f0f4ff' : '#fff', cursor: 'pointer' }}
              onClick={() => { onChange(m.id); setOpen(false); setSearch(''); }}>
              <strong>{m.materialName}</strong> <small>({m.category})</small>
              <span style={{ display: 'block', color: '#667085', fontSize: 11 }}>{m.materialCode} — {currency(m.costPerUnit || m.unitCost)}/{m.unitOfMeasure}</span>
            </button>
          ))}
          {filtered.length === 0 && <div style={{ padding: 10, color: '#888' }}>No materials found</div>}
        </div>
      )}
    </div>
  );
}

/**
 * BOMSetupModal — Professional Formula / Bill of Materials Builder
 * Supports version control, draft/publish/archive, cost preview, material search
 */
export default function BOMSetupModal({ user, products, rawMaterials, formula: editFormula, onClose, onSaved, rpc }) {
  const [form, setForm] = useState(() => {
    if (editFormula) {
      const items = (editFormula.items || []);
      return {
        id: editFormula.id || '',
        productId: editFormula.productId || '',
        name: editFormula.formulaName || editFormula.name || '',
        outputQty: editFormula.outputQuantity || 1,
        outputUnit: editFormula.outputUnit || 'unit',
        laborCost: editFormula.laborCost || 0,
        overheadCost: editFormula.overheadCost || 0,
        machineCost: editFormula.machineCost || 0,
        utilityCost: editFormula.utilityCost || 0,
        status: editFormula.status || 'Active',
        approvalStatus: editFormula.approvalStatus || 'Draft',
        items: items.length > 0 ? items : [{ rawMaterialId: '', quantity: 1, unit: 'KG', wastePercent: 0, notes: '' }]
      };
    }
    return {
      id: '',
      productId: '',
      name: '',
      outputQty: 1,
      outputUnit: 'unit',
      laborCost: 0,
      overheadCost: 0,
      machineCost: 0,
      utilityCost: 0,
      status: 'Active',
      approvalStatus: 'Draft',
      items: [{ rawMaterialId: '', quantity: 1, unit: 'KG', wastePercent: 0, notes: '' }]
    };
  });
  const [saving, setSaving] = useState(false);
  const [costPreview, setCostPreview] = useState({ materials: 0, packaging: 0, total: 0 });

  useEffect(() => {
    const materialCost = form.items.reduce((sum, item) => {
      const mat = rawMaterials.find(m => m.id === item.rawMaterialId);
      return sum + (mat ? num(mat.costPerUnit || mat.unitCost) * num(item.quantity) : 0);
    }, 0);
    const packagingCost = form.items.reduce((sum, item) => {
      const mat = rawMaterials.find(m => m.id === item.rawMaterialId);
      if (mat && (mat.category === 'Packaging Materials' || mat.category === 'Packaging')) {
        return sum + (num(mat.costPerUnit || mat.unitCost) * num(item.quantity));
      }
      return sum;
    }, 0);
    setCostPreview({
      materials: materialCost,
      packaging: packagingCost,
      total: materialCost + num(form.laborCost) + num(form.overheadCost) + num(form.machineCost) + num(form.utilityCost)
    });
  }, [form.items, form.laborCost, form.overheadCost, form.machineCost, form.utilityCost, rawMaterials]);

  const addItem = () => setForm({
    ...form,
    items: [...form.items, { rawMaterialId: '', quantity: 1, unit: 'KG', wastePercent: 0, notes: '' }]
  });

  const removeItem = (index) => setForm({
    ...form,
    items: form.items.filter((_, i) => i !== index)
  });

  const moveItem = (index, direction) => {
    if (index + direction < 0 || index + direction >= form.items.length) return;
    const items = [...form.items];
    [items[index], items[index + direction]] = [items[index + direction], items[index]];
    setForm({ ...form, items });
  };

  const updateItem = (index, field, value) => {
    const items = [...form.items];
    items[index] = { ...items[index], [field]: value };
    setForm({ ...form, items });
  };

  async function saveBOM(approvalStatus) {
    setSaving(true);
    try {
      const payload = {
        ...form,
        totalEstimatedCost: costPreview.total,
        approvalStatus: approvalStatus || form.approvalStatus || 'Draft'
      };
      await rpc('saveBOM', [user, payload]);
      onSaved?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function approveBOM() {
    if (!form.id) { alert('Save as draft first'); return; }
    setSaving(true);
    try {
      await rpc('approveBOM', [user, form.id]);
      setForm({ ...form, approvalStatus: 'Approved' });
      onSaved?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function archiveBOM() {
    if (!form.id) { alert('Save as draft first'); return; }
    if (!window.confirm('Archive this formula? It will no longer be available for new production orders.')) return;
    setSaving(true);
    try {
      await rpc('archiveBOM', [user, form.id]);
      setForm({ ...form, status: 'Archived', approvalStatus: 'Archived' });
      onSaved?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function duplicateBOM() {
    if (!form.id) { alert('Save as draft first'); return; }
    setSaving(true);
    try {
      const result = await rpc('duplicateBOM', [user, form.id]);
      alert(`Formula duplicated. New ID: ${result.formulaId}`);
      onSaved?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function createNewVersion() {
    if (!form.id) { alert('Save as draft first'); return; }
    setSaving(true);
    try {
      await rpc('saveBOM', [user, { ...form, action: 'newVersion' }]);
      onSaved?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.productId) { alert('Please select a product'); return; }
    if (form.items.some(item => !item.rawMaterialId)) {
      alert('All BOM items must have a raw material selected');
      return;
    }
    await saveBOM(form.approvalStatus);
  }

  const canApprove = form.id && form.approvalStatus !== 'Approved';
  const canArchive = form.id && form.status !== 'Archived';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card wide" onSubmit={handleSubmit} onClick={e => e.stopPropagation()}>
        <header>
          <h2>{editFormula ? 'Edit Formula' : 'Formula Builder'}</h2>
          <div className="bom-actions-row">
            {form.id && (
              <>
                {canApprove && <button type="button" className="secondary-action" onClick={approveBOM} disabled={saving}>Approve</button>}
                {canArchive && <button type="button" className="secondary-action" onClick={archiveBOM} disabled={saving}>Archive</button>}
                <button type="button" className="secondary-action" onClick={duplicateBOM} disabled={saving}>Duplicate</button>
                <button type="button" className="secondary-action" onClick={createNewVersion} disabled={saving}>New Version</button>
              </>
            )}
            <button type="button" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        <div className="bom-status-bar">
          <span className={`bom-status-badge ${form.approvalStatus?.toLowerCase()}`}>{form.approvalStatus || 'Draft'}</span>
          <span className={`bom-status-badge ${form.status?.toLowerCase()}`}>{form.status || 'Active'}</span>
          {form.id && <span className="bom-id">ID: {form.id}</span>}
        </div>

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
              Formula Name
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
            <h3>Materials Consumed (per output unit)</h3>
            {form.items.map((item, index) => {
              const mat = rawMaterials.find(m => m.id === item.rawMaterialId);
              const lineCost = mat ? num(mat.costPerUnit || mat.unitCost) * num(item.quantity) : 0;
              return (
                <div key={index} className="bom-item-row">
                  <button type="button" className="bom-move-btn" onClick={() => moveItem(index, -1)} disabled={index === 0} title="Move up">↑</button>
                  <button type="button" className="bom-move-btn" onClick={() => moveItem(index, 1)} disabled={index === form.items.length - 1} title="Move down">↓</button>
                  <MaterialSearchSelect
                    rawMaterials={rawMaterials}
                    value={item.rawMaterialId}
                    onChange={val => updateItem(index, 'rawMaterialId', val)}
                    placeholder="Search material..."
                  />
                  <input
                    type="number"
                    step="0.001"
                    value={item.quantity}
                    onChange={e => updateItem(index, 'quantity', e.target.value)}
                    placeholder="Qty"
                    style={{ width: 80 }}
                  />
                  <select value={item.unit} onChange={e => updateItem(index, 'unit', e.target.value)} style={{ width: 90 }}>
                    {UOMS.map(u => <option key={u}>{u}</option>)}
                  </select>
                  <input
                    type="number"
                    value={item.wastePercent}
                    onChange={e => updateItem(index, 'wastePercent', e.target.value)}
                    placeholder="Waste %"
                    style={{ width: 70 }}
                  />
                  <input
                    value={item.notes}
                    onChange={e => updateItem(index, 'notes', e.target.value)}
                    placeholder="Notes"
                    style={{ width: 120 }}
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
              Add Material
            </button>
          </div>

          <div className="bom-cost-preview">
            <h3>Cost Preview (per output unit)</h3>
            <div className="bom-cost-details">
              <article><span>Material Cost</span><strong>{currency(costPreview.materials)}</strong></article>
              <article><span>Packaging Cost</span><strong>{currency(costPreview.packaging)}</strong></article>
              <article><span>Labor Cost</span><input type="number" value={form.laborCost} onChange={e => setForm({ ...form, laborCost: e.target.value })} placeholder="0" /></article>
              <article><span>Overhead Cost</span><input type="number" value={form.overheadCost} onChange={e => setForm({ ...form, overheadCost: e.target.value })} placeholder="0" /></article>
              <article><span>Machine Cost</span><input type="number" value={form.machineCost} onChange={e => setForm({ ...form, machineCost: e.target.value })} placeholder="0" /></article>
              <article><span>Utility Cost</span><input type="number" value={form.utilityCost} onChange={e => setForm({ ...form, utilityCost: e.target.value })} placeholder="0" /></article>
              <article className="total"><span>Total Est. Cost</span><strong>{currency(costPreview.total)}</strong></article>
              <article><span>Suggested Selling Price (cost × 1.35)</span><strong>{currency(costPreview.total * 1.35)}</strong></article>
              <article><span>Gross Margin</span><strong>{costPreview.total > 0 ? Math.round((costPreview.total * 1.35 - costPreview.total) / (costPreview.total * 1.35) * 100) : 0}%</strong></article>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={() => saveBOM('Draft')} disabled={saving}>
            Save as Draft
          </button>
          <button type="submit" className="primary-action" disabled={saving}>
            {saving ? 'Saving...' : form.id ? 'Update Formula' : 'Save & Publish'}
          </button>
        </div>
      </form>
    </div>
  );
}