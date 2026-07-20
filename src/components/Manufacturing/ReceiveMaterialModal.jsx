import React, { useState } from 'react';

const num = value => Number.parseFloat(value || 0) || 0;

/**
 * ReceiveMaterialModal — Receive raw material into inventory with batch/lot tracking
 * Creates a batch record and updates material aggregate quantities
 */
export default function ReceiveMaterialModal({ user, materials, uoms, onClose, onSaved, rpc }) {
  const safeMaterials = (materials || []).filter(Boolean);
  const firstMaterial = safeMaterials[0] || {};
  const [form, setForm] = useState({
    materialId: firstMaterial?.id || '',
    materialName: firstMaterial?.materialName || '',
    materialCode: firstMaterial?.materialCode || '',
    quantity: 500,
    unit: firstMaterial?.unitOfMeasure || 'KG',
    costPerUnit: firstMaterial?.costPerUnit || firstMaterial?.unitCost || 0,
    supplier: firstMaterial?.supplier || '',
    warehouse: firstMaterial?.warehouse || 'Raw Materials Store',
    storageLocation: firstMaterial?.binLocation || firstMaterial?.storageLocation || 'A1',
    batchNumber: '',
    expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    receivedDate: new Date().toISOString().slice(0, 10)
  });
  const [saving, setSaving] = useState(false);

  function selectMaterial(id) {
    const mat = safeMaterials.find(m => m?.id === id) || firstMaterial;
    setForm(prev => ({
      ...prev,
      materialId: mat?.id || '',
      materialName: mat?.materialName || '',
      materialCode: mat?.materialCode || '',
      unit: mat?.unitOfMeasure || prev.unit,
      costPerUnit: mat?.costPerUnit || mat?.unitCost || 0,
      supplier: mat?.supplier || prev.supplier,
      warehouse: mat?.warehouse || prev.warehouse,
      storageLocation: mat?.binLocation || mat?.storageLocation || prev.storageLocation
    }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('receiveRawMaterial', [user, form]);
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
        <header><h2>Receive Raw Material</h2><button type="button" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button></header>
        <div className="modal-grid">
          <label>Material
            <select value={form.materialId} onChange={e => selectMaterial(e.target.value)}>
              {safeMaterials.map((m, i) => (
                <option key={m?.id ?? i} value={m?.id}>{m?.materialCode || '—'} — {m?.materialName || '—'} ({m?.unitOfMeasure || ''}) — Avail: {m?.availableQuantity ?? 0}</option>
              ))}
            </select>
          </label>
          <label>Material Name<input value={form.materialName} onChange={e => setForm({ ...form, materialName: e.target.value })} /></label>
          <label>Material Code<input value={form.materialCode} onChange={e => setForm({ ...form, materialCode: e.target.value })} /></label>
          <label>Quantity<input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></label>
          <label>Unit
            <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
              {(uoms || []).map(u => <option key={u.code} value={u.code}>{u.name}</option>)}
            </select>
          </label>
          <label>Cost Per Base Unit<input type="number" step="0.01" value={form.costPerUnit} onChange={e => setForm({ ...form, costPerUnit: e.target.value })} /></label>
          <label>Supplier<input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></label>
          <label>Warehouse<input value={form.warehouse} onChange={e => setForm({ ...form, warehouse: e.target.value })} /></label>
          <label>Storage Location / Bin<input value={form.storageLocation} onChange={e => setForm({ ...form, storageLocation: e.target.value })} /></label>
          <label>Batch Number<input value={form.batchNumber} onChange={e => setForm({ ...form, batchNumber: e.target.value })} placeholder="Auto-generated if empty" /></label>
          <label>Received Date<input type="date" value={form.receivedDate} onChange={e => setForm({ ...form, receivedDate: e.target.value })} /></label>
          <label>Expiry Date<input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} /></label>
        </div>
        <button className="primary-action" disabled={saving}>{saving ? 'Receiving...' : 'Receive + Auto Convert'}</button>
      </form>
    </div>
  );
}
