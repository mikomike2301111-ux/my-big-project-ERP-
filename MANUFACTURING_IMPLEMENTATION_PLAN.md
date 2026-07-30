# Manufacturing Module — Complete Implementation Plan
## Farmtrack ERP (Unity ERP)

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [New Database Schema (Supabase)](#3-new-database-schema-supabase)
4. [Phase 1 — Raw Materials Foundation](#4-phase-1--raw-materials-foundation)
5. [Phase 2 — Products & BOM (Bill of Materials)](#5-phase-2--products--bom-bill-of-materials)
6. [Phase 3 — Manufacturing Order Flow with Inventory](#6-phase-3--manufacturing-order-flow-with-inventory)
7. [Phase 4 — Cost Confirmation System (Overlay)](#7-phase-4--cost-confirmation-system-overlay)
8. [Phase 5 — Sales/CRM/Accounts Integration](#8-phase-5--salescrmaccounts-integration)
9. [Phase 6 — Invoice Printing from Accounts](#9-phase-6--invoice-printing-from-accounts)
10. [Phase 7 — Analytics & Reports](#10-phase-7--analytics--reports)
11. [Phase 8 — Edge Cases & Error Handling](#11-phase-8--edge-cases--error-handling)
12. [Implementation Roadmap & Timeline](#12-implementation-roadmap--timeline)
13. [File-by-File Code Changes](#13-file-by-file-code-changes)

---

## 1. Executive Summary

### Business Requirements
- **15 products** each consuming specific raw materials
- **Raw material management** with cost tracking
- **Inventory add/subtract** on material receipt and consumption
- **Cost confirmation overlay** — when entering prices, a confirmation popup asks "Are you sure the price is correct?"
- **Order creation** flows through Sales → CRM → Accounts
- **Invoice printing** from Accounts module
- **Supabase integration** for new manufacturing tables

### Key Architecture Decisions
1. **JSON-bridge first, Supabase normalized second** — all data works in both modes
2. **Cost confirmation overlay** — a reusable `CostConfirmationModal` component
3. **Inventory movement hooks** — automatic debit/credit on material receipt and consumption
4. **Event-driven architecture** — every manufacturing action creates a business event
5. **UOM conversion engine** — already exists, we extend it for all raw materials

---

## 2. Current State Analysis

### What Already Exists

| Area | Status | Details |
|------|--------|---------|
| **Manufacturing UI** | ✅ Basic | 15 tabs (dashboard, materials, batches, formulas, orders, consumption, traceability, quality, capacity, calendar, downtime, documents, recalls, reports, ai) |
| **Raw Materials Page** | ✅ Basic | Shows materials table with columns for materialCode, materialName, unitOfMeasure, currentQuantity, availableQuantity, reservedQuantity, consumedQuantity |
| **Raw Material Receipt Modal** | ✅ Basic | `RawMaterialModal` exists with material selection, quantity, UOM, batch, expiry, supplier, cost, warehouse, storage location fields |
| **Production Order Modal** | ✅ Basic | `ProductionOrderModal` exists with formula selection, quantity, start date, operator fields |
| **Backend `getManufacturingWorkspaceData`** | ✅ Good | Returns comprehensive data including overview, rawMaterials, rawMaterialBatches, formulas, orders, consumption, traceability, health scores |
| **Backend RPC functions** | ✅ Partial | `startProductionOrder`, `completeProductionJob`, `receiveRawMaterial`, `saveRawMaterial`, `saveProductFormula`, `saveProductionOrder` |
| **Supabase Schema** | ✅ Good | Tables: `products`, `bills_of_materials`, `bill_of_material_items`, `production_jobs`, `inventory_lots`, `inventory_movements` |
| **UOM Conversion** | ✅ Good | Auto-converts between KG/G, L/ML, pieces/cartons with base unit system |
| **Material Locking** | ✅ Good | Production start reserves material; completion consumes it |
| **Consumption History** | ✅ Good | Immutable consumption records with cost tracking |

### What Needs to Be Built

| Feature | Priority | Description |
|---------|----------|-------------|
| **Raw Material CRUD with cost** | 🔴 High | Add/edit raw materials with costPerUnit, supplier info, category |
| **Cost Confirmation Overlay** | 🔴 High | Popup asking "Confirm price Ksh X for material Y?" before saving |
| **Product-RawMaterial Linking (BOM)** | 🔴 High | UI to set which raw materials each product consumes and in what quantity |
| **Inventory Add/Subtract Hooks** | 🔴 High | Auto-update inventory on material receipt + consumption + finished good output |
| **15 Products Setup** | 🔴 High | Pre-configure 15 products with BOM consumption data |
| **Sales Order → Production Trigger** | 🟡 Medium | Creating a sales order for a manufactured product auto-creates a production job |
| **CRM Integration** | 🟡 Medium | CRM shows manufacturing jobs linked to customer orders |
| **Accounts Invoice with Manufacturing Costs** | 🟡 Medium | Invoice shows manufacturing cost breakdown |
| **Invoice Printing** | 🟢 Low | Print invoice from Accounts module |
| **Manufacturing Analytics** | 🟢 Low | Yield rates, cost variance, material efficiency |

---

## 3. New Database Schema (Supabase)

Run this SQL in Supabase SQL Editor:

```sql
-- ============================================================
-- MANUFACTURING ENHANCEMENTS — Raw Materials & Cost Tracking
-- ============================================================

-- 1. RAW MATERIALS MASTER TABLE (separate from products)
create table if not exists public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  material_code text not null,
  material_name text not null,
  category text,                                    -- e.g., 'Chemical', 'Packaging', 'Ingredient', 'Consumable'
  unit_of_measure text not null default 'KG',
  base_unit text not null default 'G',             -- smallest unit for conversions
  conversion_factor numeric(14,6) default 1000,    -- e.g., 1000 for KG → G
  default_cost_per_unit numeric(14,2) default 0,
  supplier_id uuid references public.suppliers(id),
  min_stock_level numeric(14,3) default 0,
  max_stock_level numeric(14,3) default 0,
  reorder_point numeric(14,3) default 0,
  lead_time_days integer default 0,
  storage_condition text,                          -- 'Room Temp', 'Cold Storage', 'Hazardous'
  hazardous boolean default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, material_code)
);

-- 2. RAW MATERIAL INVENTORY (lot-level tracking)
create table if not exists public.raw_material_inventory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  raw_material_id uuid not null references public.raw_materials(id),
  warehouse_id uuid references public.warehouses(id),
  batch_no text,
  quantity_on_hand numeric(14,3) not null default 0,
  quantity_reserved numeric(14,3) not null default 0,
  unit_cost numeric(14,2) default 0,
  received_date date default current_date,
  expiry_date date,
  supplier_batch_no text,
  quality_status text default 'quarantine',        -- 'quarantine', 'passed', 'failed'
  status text not null default 'in_stock',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. BILL OF MATERIALS (enhanced — which product consumes which raw materials)
create table if not exists public.bill_of_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id),
  name text not null,
  version text default 'v1',
  output_qty numeric(14,3) default 1,
  output_unit text default 'unit',
  labor_cost numeric(14,2) default 0,
  overhead_cost numeric(14,2) default 0,
  total_estimated_cost numeric(14,2) default 0,
  status text default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. BOM ITEMS (raw materials consumed per BOM)
create table if not exists public.bill_of_material_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bom_id uuid not null references public.bill_of_materials(id) on delete cascade,
  raw_material_id uuid not null references public.raw_materials(id),
  quantity numeric(14,3) not null,
  unit text not null default 'KG',
  waste_percent numeric(5,2) default 0,            -- expected waste %
  cost_contribution numeric(14,2) default 0        -- calculated: quantity * material cost
);

-- 5. COST CONFIRMATION LOG (audit trail for price confirmations)
create table if not exists public.cost_confirmations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null,                       -- 'raw_material', 'product', 'purchase_order'
  entity_id uuid not null,
  field_name text not null,                        -- 'cost_per_unit', 'selling_price'
  old_value numeric(14,2),
  new_value numeric(14,2),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz not null default now(),
  notes text
);

-- 6. PRODUCTION JOBS (enhanced with cost tracking)
alter table public.production_jobs
  add column if not exists total_material_cost numeric(14,2) default 0,
  add column if not exists total_labor_cost numeric(14,2) default 0,
  add column if not exists total_overhead_cost numeric(14,2) default 0,
  add column if not exists total_actual_cost numeric(14,2) default 0,
  add column if not exists cost_variance numeric(14,2) default 0;

-- 7. MATERIAL CONSUMPTION RECORDS (immutable)
create table if not exists public.material_consumption (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  production_job_id uuid not null references public.production_jobs(id),
  raw_material_id uuid not null references public.raw_materials(id),
  raw_material_inventory_id uuid references public.raw_material_inventory(id),
  batch_no text,
  quantity_consumed numeric(14,3) not null,
  unit text not null,
  unit_cost numeric(14,2) default 0,
  total_cost numeric(14,2) default 0,
  consumed_by uuid references public.profiles(id),
  consumed_at timestamptz not null default now(),
  immutable boolean default true                   -- once committed, cannot be changed
);

-- 8. FINISHED GOODS PRODUCTION OUTPUT
create table if not exists public.production_output (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  production_job_id uuid not null references public.production_jobs(id),
  product_id uuid not null references public.products(id),
  batch_no text,
  quantity_produced numeric(14,3) not null,
  quantity_waste numeric(14,3) default 0,
  unit text not null,
  unit_cost numeric(14,2) default 0,
  total_cost numeric(14,2) default 0,
  quality_status text default 'pending',           -- 'pending', 'passed', 'failed'
  produced_by uuid references public.profiles(id),
  produced_at timestamptz not null default now(),
  inventory_lot_id uuid references public.inventory_lots(id),  -- linked finished good in inventory
  immutable boolean default true
);

-- Indexes for performance
create index if not exists idx_raw_materials_tenant on public.raw_materials (tenant_id, status);
create index if not exists idx_raw_material_inventory_tenant on public.raw_material_inventory (tenant_id, raw_material_id);
create index if not exists idx_material_consumption_job on public.material_consumption (tenant_id, production_job_id);
create index if not exists idx_production_output_job on public.production_output (tenant_id, production_job_id);
create index if not exists idx_cost_confirmations_entity on public.cost_confirmations (tenant_id, entity_type, entity_id);

-- Views for analytics
create or replace view public.manufacturing_cost_analysis as
select
  pj.tenant_id,
  pj.id as job_id,
  pj.job_no,
  p.name as product_name,
  pj.planned_qty,
  pj.completed_qty,
  pj.total_material_cost,
  pj.total_labor_cost,
  pj.total_overhead_cost,
  pj.total_actual_cost,
  pj.cost_variance,
  pj.status,
  pj.created_at
from public.production_jobs pj
join public.products p on p.id = pj.product_id;
```

---

## 4. Phase 1 — Raw Materials Foundation

### 4.1 What We're Building
A full CRUD system for raw materials that includes:
- Material code, name, category, UOM, base unit, conversion factor
- Default cost per unit (with confirmation overlay)
- Supplier link, stock levels (min, max, reorder point)
- Storage conditions, hazardous flag
- Material receipt with batch/lot tracking

### 4.2 Files to Create/Modify

#### A. Backend — `api/rpc.js`

**New functions:**

```javascript
// ============================================================
// RAW MATERIALS CRUD
// ============================================================

saveRawMaterial(user, material) {
  reqRole(user);
  assertRequired(material.materialName, 'Material name');
  assertRequired(material.unitOfMeasure, 'Unit of measure');
  
  const d = data();
  const existing = d.rawMaterials.find(m => m.materialCode === material.materialCode);
  
  // Cost confirmation check
  if (material.costPerUnit > 0 && material.costPerUnit !== existing?.costPerUnit) {
    // The cost confirmation happens on the frontend before calling this
    material.costConfirmedAt = new Date().toISOString();
    material.costConfirmedBy = user.name;
  }
  
  if (existing) {
    // Update
    Object.assign(existing, material, { updatedAt: new Date().toISOString() });
  } else {
    // Create
    const newMaterial = {
      id: gid(),
      materialCode: material.materialCode || 'RM-' + Date.now().toString(36).toUpperCase(),
      materialName: material.materialName,
      category: material.category || 'Generic',
      unitOfMeasure: material.unitOfMeasure,
      baseUnit: material.baseUnit || 'G',
      conversionFactor: num(material.conversionFactor) || 1000,
      costPerUnit: num(material.costPerUnit) || 0,
      supplier: material.supplier || '',
      minStockLevel: num(material.minStockLevel) || 0,
      maxStockLevel: num(material.maxStockLevel) || 0,
      reorderPoint: num(material.reorderPoint) || 0,
      leadTimeDays: num(material.leadTimeDays) || 0,
      storageCondition: material.storageCondition || 'Room Temp',
      hazardous: !!material.hazardous,
      currentQuantity: 0,
      availableQuantity: 0,
      reservedQuantity: 0,
      consumedQuantity: 0,
      costConfirmedAt: material.costConfirmedAt || '',
      costConfirmedBy: material.costConfirmedBy || '',
      status: 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    d.rawMaterials.push(newMaterial);
  }
  save(d);
  return { success: true, id: existing?.id || d.rawMaterials[d.rawMaterials.length - 1].id };
},

// Receive raw material into inventory
receiveRawMaterial(user, receipt) {
  reqRole(user);
  assertRequired(receipt.materialId, 'Raw material');
  assertPositive(receipt.quantity, 'Quantity');
  
  const d = data();
  const material = d.rawMaterials.find(m => m.id === receipt.materialId);
  if (!material) throw new Error('Raw material not found');
  
  const costPerUnit = num(receipt.costPerUnit) || material.costPerUnit;
  const quantity = num(receipt.quantity);
  const baseQuantity = convertToBaseUnit(quantity, receipt.unit || material.unitOfMeasure, material);
  
  // Create batch record
  const batch = {
    id: gid(),
    batchNumber: receipt.batchNumber || 'BATCH-' + Date.now().toString(36).toUpperCase(),
    materialId: material.id,
    materialName: material.materialName,
    supplier: receipt.supplier || material.supplier || '',
    quantity,
    availableQuantity: quantity,
    reservedQuantity: 0,
    unit: receipt.unit || material.unitOfMeasure,
    baseUnit: material.baseUnit,
    baseQuantity,
    availableBaseQuantity: baseQuantity,
    cost: costPerUnit,
    totalCost: costPerUnit * quantity,
    receivedDate: receipt.receivedDate || today(),
    expiryDate: receipt.expiryDate || '',
    warehouse: receipt.warehouse || 'Main Store',
    storageLocation: receipt.storageLocation || '',
    qualityStatus: 'quarantine',
    status: 'In Stock',
    createdBy: user.name,
    createdAt: new Date().toISOString()
  };
  d.rawMaterialBatches = d.rawMaterialBatches || [];
  d.rawMaterialBatches.push(batch);
  
  // Update material aggregate quantities
  material.currentQuantity = num(material.currentQuantity) + baseQuantity;
  material.availableQuantity = num(material.availableQuantity) + baseQuantity;
  material.costPerUnit = costPerUnit; // Weighted average
  
  // Create inventory movement record
  d.inventoryMovements = d.inventoryMovements || [];
  d.inventoryMovements.push({
    id: gid(),
    date: today(),
    type: 'Raw Material Receipt',
    materialId: material.id,
    materialName: material.materialName,
    batchNumber: batch.batchNumber,
    quantity: baseQuantity,
    unit: material.baseUnit,
    unitCost: costPerUnit,
    totalCost: costPerUnit * quantity,
    warehouse: receipt.warehouse || 'Main Store',
    reference: batch.batchNumber,
    createdBy: user.name,
    createdAt: new Date().toISOString()
  });
  
  save(d);
  return { success: true, batchId: batch.id, materialId: material.id };
}
```

**Modified functions:**
- Update `getManufacturingWorkspaceData` to return the enhanced raw materials structure
- Add factory seed data for 15 products with BOM consumption

#### B. Frontend — `src/main.jsx`

**Enhanced Manufacturing component additions:**

```jsx
// Enhanced tabs for Phase 1
const MANUFACTURING_TABS = [
  'dashboard', 'materials', 'batches', 'bom', 'products',
  'formulas', 'orders', 'consumption', 'traceability',
  'quality', 'capacity', 'calendar', 'reports', 'costs'
];

// New Material Setup Modal
function RawMaterialSetupModal({ user, onClose, onSaved }) {
  const [step, setStep] = useState(1); // 1 = details, 2 = cost confirmation
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
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={save}>
        <header>
          <h2>{step === 1 ? 'New Raw Material' : 'Confirm Price'}</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </header>

        {step === 1 && (
          <div className="modal-grid">
            <label>Material Code<input value={form.materialCode} onChange={e => setForm({...form, materialCode: e.target.value})} /></label>
            <label>Material Name*<input value={form.materialName} onChange={e => setForm({...form, materialName: e.target.value})} required /></label>
            <label>Category
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                <option>Ingredient</option><option>Chemical</option><option>Packaging</option>
                <option>Consumable</option><option>Spare Part</option><option>Other</option>
              </select>
            </label>
            <label>Unit of Measure
              <select value={form.unitOfMeasure} onChange={e => setForm({...form, unitOfMeasure: e.target.value})}>
                <option>KG</option><option>G</option><option>L</option><option>ML</option>
                <option>Pieces</option><option>Cartons</option><option>Bags</option>
              </select>
            </label>
            <label>Base Unit
              <select value={form.baseUnit} onChange={e => setForm({...form, baseUnit: e.target.value})}>
                <option>G</option><option>ML</option><option>Unit</option>
              </select>
            </label>
            <label>Conversion Factor<input type="number" value={form.conversionFactor} onChange={e => setForm({...form, conversionFactor: e.target.value})} /></label>
            <label>Cost Per Unit (KES)<input type="number" value={form.costPerUnit} onChange={e => setForm({...form, costPerUnit: e.target.value})} /></label>
            <label>Supplier<input value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})} /></label>
            <label>Min Stock Level<input type="number" value={form.minStockLevel} onChange={e => setForm({...form, minStockLevel: e.target.value})} /></label>
            <label>Max Stock Level<input type="number" value={form.maxStockLevel} onChange={e => setForm({...form, maxStockLevel: e.target.value})} /></label>
            <label>Storage Condition
              <select value={form.storageCondition} onChange={e => setForm({...form, storageCondition: e.target.value})}>
                <option>Room Temp</option><option>Cold Storage</option><option>Hazardous</option>
              </select>
            </label>
            <label><input type="checkbox" checked={form.hazardous} onChange={e => setForm({...form, hazardous: e.target.checked})} /> Hazardous Material</label>
          </div>
        )}

        {step === 2 && (
          <div className="cost-confirmation-card">
            <AlertTriangle size={24} className="cost-warning-icon" />
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
```

---

## 5. Phase 2 — Products & BOM (Bill of Materials)

### 5.1 Business Logic
- 15 products, each with a BOM listing which raw materials it consumes
- 1 unit of product = specific quantities of raw materials
- BOM cost = sum of (raw material quantity × unit cost) + labor + overhead
- When a production order is created, the BOM determines what to reserve

### 5.2 15 Sample Products with BOM

```
Product 1:  "Super Gro Fertilizer" (20KG bag)
  BOM: Nitrogen (5KG), Phosphorus (3KG), Potassium (2KG), Filler (10KG), Bag (1pc)
  
Product 2:  "Organic Compost Plus" (10KG bag)
  BOM: Compost (7KG), Bio-Enhancer (1L), Bag (1pc)
  
Product 3:  "Liquid Foliar Feed" (5L jerrycan)
  BOM: Nitrogen Solution (2L), Phosphorus Solution (1L), Potassium Solution (1L), 
        Water (1L), Jerrycan (1pc), Label (1pc)
  
Product 4:  "Weed Killer Pro" (1L bottle)
  BOM: Glyphosate (800ML), Surfactant (100ML), Water (100ML), Bottle (1pc), Label (1pc)
  
Product 5:  "Pest Control X" (500ML spray)
  BOM: Active Ingredient (250ML), Carrier Oil (200ML), Emulsifier (50ML), Bottle (1pc)

Product 6:  "Seed Starter Mix" (5KG bag)
  BOM: Coco Peat (2KG), Vermiculite (1KG), Perlite (1KG), Fertilizer (500G), 
        Mycorrhizae (100G), Lime (200G), Water (200ML), Bag (1pc)

Product 7:  "Drip Irrigation Kit" (set)
  BOM: Drip Tape 100m (1roll), Connectors (20pcs), Filter (1pc), Valve (1pc), 
        Instruction Manual (1pc), Box (1pc)

Product 8:  "Greenhouse Film" (10m roll)
  BOM: UV Film (10KG), Roll Core (1pc), Packaging (1pc)

Product 9:  "Animal Feed Concentrate" (50KG bag)
  BOM: Maize Germ (30KG), Wheat Bran (10KG), Bone Meal (5KG), Salt (1KG), 
        Vitamin Premix (1KG), Molasses (3KG), Bag (1pc)

Product 10: "Fish Pond Cleaner" (2L bottle)
  BOM: Probiotic Culture (1.5L), Enzyme Solution (500ML), Bottle (1pc)

Product 11: "Soil pH Balancer" (25KG bag)
  BOM: Lime Powder (20KG), Dolomite (5KG), Bag (1pc)

Product 12: "Bio-Pesticide Spray" (1L trigger)
  BOM: Neem Oil (500ML), Garlic Extract (200ML), Soap Solution (200ML), 
        Water (100ML), Trigger Bottle (1pc), Label (1pc)

Product 13: "Hydroponic Nutrient A" (1L bottle)
  BOM: Calcium Nitrate (200G), Potassium Nitrate (150G), Iron Chelate (50G), 
        Water (600ML), Bottle (1pc), Label (1pc)

Product 14: "Hydroponic Nutrient B" (1L bottle)
  BOM: Magnesium Sulfate (200G), Potassium Sulfate (150G), Micro Mix (50G), 
        Water (600ML), Bottle (1pc), Label (1pc)

Product 15: "Crop Cover Net" (5m × 50m roll)
  BOM: Shade Netting (12KG), Roll Core (1pc), Binding Tape (2pcs), Box (1pc)
```

### 5.3 Frontend — BOM Setup Modal

```jsx
function BOMSetupModal({ user, products, rawMaterials, onClose, onSaved }) {
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
    // Calculate cost preview whenever items or costs change
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
    if (!form.productId) { alert('Select a product'); return; }
    if (form.items.some(item => !item.rawMaterialId)) { alert('All BOM items must have a raw material'); return; }
    
    setSaving(true);
    try {
      // Cost confirmation for BOM
      if (costPreview.total > 0) {
        const confirmed = window.confirm(
          `Total estimated cost: KES ${costPreview.total.toLocaleString()}\n` +
          `Material cost: KES ${costPreview.materials.toLocaleString()}\n` +
          `Labor: KES ${num(form.laborCost).toLocaleString()}\n` +
          `Overhead: KES ${num(form.overheadCost).toLocaleString()}\n\n` +
          `Confirm these costs?`
        );
        if (!confirmed) return;
      }
      
      await rpc('saveBOM', [user, { ...form, totalEstimatedCost: costPreview.total }]);
      onSaved?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-card wide" onSubmit={save}>
        <header>
          <h2>Bill of Materials Setup</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="bom-setup-grid">
          <div className="bom-header-fields">
            <label>Product
              <select value={form.productId} onChange={e => {
                const product = products.find(p => p.id === e.target.value);
                setForm({ ...form, productId: e.target.value, name: product?.name || '', outputUnit: product?.unit || 'unit' });
              }} required>
                <option value="">Select product...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>)}
              </select>
            </label>
            <label>BOM Name<input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></label>
            <label>Output Qty<input type="number" value={form.outputQty} onChange={e => setForm({...form, outputQty: e.target.value})} /></label>
            <label>Output Unit<input value={form.outputUnit} onChange={e => setForm({...form, outputUnit: e.target.value})} /></label>
          </div>

          <div className="bom-items-section">
            <h3>Raw Materials Consumed</h3>
            {form.items.map((item, index) => (
              <div key={index} className="bom-item-row">
                <select value={item.rawMaterialId} onChange={e => updateItem(index, 'rawMaterialId', e.target.value)} required>
                  <option value="">Select material...</option>
                  {rawMaterials.map(m => <option key={m.id} value={m.id}>{m.materialName} ({m.unitOfMeasure}) - KES {num(m.costPerUnit).toLocaleString()}/{m.unitOfMeasure}</option>)}
                </select>
                <input type="number" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} placeholder="Qty" />
                <input value={item.unit} onChange={e => updateItem(index, 'unit', e.target.value)} placeholder="Unit" />
                <input type="number" value={item.wastePercent} onChange={e => updateItem(index, 'wastePercent', e.target.value)} placeholder="Waste %" />
                <button type="button" onClick={() => removeItem(index)}><X size={16} /></button>
              </div>
            ))}
            <button type="button" onClick={addItem}><Plus size={16} /> Add Material</button>
          </div>

          <div className="bom-cost-preview">
            <h3>Cost Preview</h3>
            <div className="bom-cost-details">
              <article><span>Material Cost</span><strong>KES {costPreview.materials.toLocaleString()}</strong></article>
              <article><span>Labor Cost</span><label><input type="number" value={form.laborCost} onChange={e => setForm({...form, laborCost: e.target.value})} placeholder="0" /></label></article>
              <article><span>Overhead Cost</span><label><input type="number" value={form.overheadCost} onChange={e => setForm({...form, overheadCost: e.target.value})} placeholder="0" /></label></article>
              <article className="total"><span>Total Est. Cost</span><strong>KES {costPreview.total.toLocaleString()}</strong></article>
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
```

---

## 6. Phase 3 — Manufacturing Order Flow with Inventory

### 6.1 The Complete Flow

```
1. User creates Production Order
   │
   ├─ Select product → BOM auto-loads
   ├─ Enter planned quantity
   ├─ System checks raw material availability
   │
2. User clicks "Start Production"
   │
   ├─ System reserves raw materials (decrease available, increase reserved)
   ├─ Creates inventory movement records
   ├─ Creates business event
   ├─ Order status → "In Progress"
   │
3. Production execution (manual)
   │
   ├─ Operators record material usage
   ├─ Operators record output
   ├─ Quality checks
   │
4. User clicks "Complete Production"
   │
   ├─ System consumes reserved materials (decrease reserved, increase consumed)
   ├─ System creates finished goods in inventory
   ├─ System calculates actual cost vs estimated cost (variance)
   ├─ Creates business event
   ├─ Order status → "Completed"
   │
5. Finished goods available for sale
   │
   ├─ Can be sold through Sales module
   ├─ Cost basis available for invoice pricing
   └─ Traceability link from customer → invoice → product → batch → raw materials
```

### 6.2 Backend — Enhanced Production Order Flow

```javascript
// Enhanced start production with material reservation
startProductionOrder(user, orderId) {
  reqRole(user);
  const d = data();
  const order = d.productionOrders.find(o => o.id === orderId);
  if (!order) throw new Error('Production order not found');
  if (order.status !== 'Pending' && order.status !== 'Draft') throw new Error('Order already started');
  
  // Get the BOM for this product
  const formula = d.productFormulas.find(f => f.id === order.formulaId);
  if (!formula) throw new Error('Formula/BOM not found');
  
  const bomItems = d.formulaVersions.filter(v => v.formulaId === order.formulaId);
  if (bomItems.length === 0) throw new Error('No materials defined in BOM');
  
  // Check availability and reserve
  const reservationResults = [];
  const plannedQty = num(order.plannedQty);
  
  for (const item of bomItems) {
    const requiredQty = num(item.quantity) * plannedQty;
    const material = d.rawMaterials.find(m => m.materialName === item.materialName || m.id === item.rawMaterialId);
    
    if (!material) {
      throw new Error(`Raw material "${item.materialName}" not found in inventory`);
    }
    
    if (num(material.availableQuantity) < requiredQty) {
      throw new Error(
        `Insufficient ${material.materialName}: need ${requiredQty} ${material.baseUnit}, ` +
        `available ${num(material.availableQuantity)} ${material.baseUnit}`
      );
    }
    
    // Reserve from batches (FIFO)
    const batches = d.rawMaterialBatches
      .filter(b => b.materialId === material.id && b.status === 'In Stock' && num(b.availableQuantity) > 0)
      .sort((a, b) => String(a.expiryDate || '').localeCompare(String(b.expiryDate || '')));
    
    let remaining = requiredQty;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, num(batch.availableQuantity));
      batch.availableQuantity = num(batch.availableQuantity) - take;
      batch.reservedQuantity = num(batch.reservedQuantity) + take;
      remaining -= take;
    }
    
    // Update material aggregates
    material.availableQuantity = num(material.availableQuantity) - requiredQty;
    material.reservedQuantity = num(material.reservedQuantity) + requiredQty;
    
    reservationResults.push({
      materialName: material.materialName,
      requiredQty,
      reserved: requiredQty - remaining
    });
  }
  
  // Update order
  order.status = 'In Progress';
  order.startedAt = new Date().toISOString();
  order.startedBy = user.name;
  order.reservedMaterials = reservationResults;
  
  // Create business event
  d.businessEvents = d.businessEvents || [];
  d.businessEvents.push({
    id: gid(),
    eventType: 'ProductionStarted',
    entityType: 'production_order',
    entityId: order.id,
    actor: user.name,
    details: `Production started for ${order.plannedQty} units of ${order.productName}`,
    createdAt: new Date().toISOString()
  });
  
  save(d);
  return { success: true, order, reservationResults };
},

// Enhanced complete production with cost calculation
completeProductionJob(user, orderId, actualQty, wasteQty, qualityStatus) {
  reqRole(user);
  const d = data();
  const order = d.productionOrders.find(o => o.id === orderId);
  if (!order) throw new Error('Production order not found');
  if (order.status !== 'In Progress') throw new Error('Order must be In Progress to complete');
  
  const formula = d.productFormulas.find(f => f.id === order.formulaId);
  const bomItems = d.formulaVersions.filter(v => v.formulaId === order.formulaId);
  
  // Calculate actual cost
  let totalMaterialCost = 0;
  const consumptionRecords = [];
  
  for (const item of bomItems) {
    const material = d.rawMaterials.find(m => m.materialName === item.materialName || m.id === item.rawMaterialId);
    if (!material) continue;
    
    const consumedQty = num(item.quantity) * num(order.plannedQty);
    const cost = consumedQty * num(material.costPerUnit);
    totalMaterialCost += cost;
    
    // Update material consumed
    material.reservedQuantity = num(material.reservedQuantity) - consumedQty;
    material.consumedQuantity = num(material.consumedQuantity) + consumedQty;
    
    // Create immutable consumption record
    const consumptionRecord = {
      id: gid(),
      productionOrder: order.orderNo || order.id,
      materialId: material.id,
      materialName: material.materialName,
      batchNumber: item.batchUsed || 'AUTO',
      quantityConsumed: consumedQty,
      unit: material.baseUnit,
      costConsumed: cost,
      operator: user.name,
      date: today(),
      immutable: true,
      createdAt: new Date().toISOString()
    };
    d.rawMaterialConsumption = d.rawMaterialConsumption || [];
    d.rawMaterialConsumption.push(consumptionRecord);
    consumptionRecords.push(consumptionRecord);
  }
  
  const actualOutput = num(actualQty || order.plannedQty);
  const actualWaste = num(wasteQty || 0);
  const unitCost = actualOutput > 0 ? totalMaterialCost / actualOutput : 0;
  
  // Create finished good batch in inventory
  const product = d.products.find(p => p.name === order.productName);
  const batchNo = 'FG-' + Date.now().toString(36).toUpperCase();
  
  const finishedBatch = {
    id: gid(),
    batchNo,
    productId: product?.id || '',
    productName: order.productName,
    quantityProduced: actualOutput,
    wasteQuantity: actualWaste,
    dateProduced: today(),
    costProduced: totalMaterialCost,
    unitCostProduced: unitCost,
    operator: user.name,
    qualityCheck: qualityStatus || 'Pending',
    status: 'Completed',
    createdAt: new Date().toISOString()
  };
  d.productionBatches = d.productionBatches || [];
  d.productionBatches.push(finishedBatch);
  
  // Update inventory (add finished goods)
  const existingInventory = d.inventory.find(i => i.productName === order.productName && i.status === 'In Stock');
  if (existingInventory) {
    existingInventory.quantity = num(existingInventory.quantity) + actualOutput;
    existingInventory.availableQuantity = num(existingInventory.availableQuantity || existingInventory.quantity) + actualOutput;
  } else {
    d.inventory.push({
      id: gid(),
      productName: order.productName,
      sku: product?.sku || '',
      warehouseName: 'Production Output',
      batchNo,
      quantity: actualOutput,
      availableQuantity: actualOutput,
      unitCost: unitCost,
      status: 'In Stock',
      createdAt: new Date().toISOString()
    });
  }
  
  // Update order
  order.status = 'Completed';
  order.completedAt = new Date().toISOString();
  order.completedBy = user.name;
  order.completedQty = actualOutput;
  order.wastageQty = actualWaste;
  order.materialCost = totalMaterialCost;
  order.actualCost = totalMaterialCost;
  
  // Create business event
  d.businessEvents.push({
    id: gid(),
    eventType: 'ProductionCompleted',
    entityType: 'production_order',
    entityId: order.id,
    actor: user.name,
    details: `Completed ${actualOutput} units of ${order.productName}. Cost: KES ${totalMaterialCost.toLocaleString()}`,
    createdAt: new Date().toISOString()
  });
  
  save(d);
  return {
    success: true,
    order,
    batchNo,
    consumptionRecords,
    totalMaterialCost,
    unitCost,
    actualOutput
  };
}
```

---

## 7. Phase 4 — Cost Confirmation System (Overlay)

### 7.1 The Cost Confirmation Pattern

The system must show a confirmation overlay whenever a user enters or changes:
1. Raw material cost per unit
2. Product selling price
3. BOM total estimated cost
4. Purchase order unit price

**Confirmation overlay design:**

```jsx
function CostConfirmationModal({ 
  title = 'Confirm Price',
  entity,           // { type: 'raw_material' | 'product' | 'purchase_order', name: '...' }
  field,            // { name: 'costPerUnit', label: 'Unit Cost', value: 1500 }
  onConfirm,        // () => void
  onCancel,         // () => void
  warningMessage    // optional custom message
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card cost-confirmation-modal">
        <header>
          <h2>
            <AlertTriangle size={20} style={{ color: '#f79009', marginRight: 8 }} />
            {title}
          </h2>
          <button type="button" onClick={onCancel}><X size={18} /></button>
        </header>
        
        <div className="cost-confirmation-body">
          <div className="cost-confirmation-icon">
            <CircleDollarSign size={48} />
          </div>
          
          <p className="cost-confirmation-question">
            Are you sure the price is correct?
          </p>
          
          <div className="cost-confirmation-details">
            <div className="cost-detail-row">
              <span>Entity</span>
              <strong>{entity?.name || '—'}</strong>
            </div>
            <div className="cost-detail-row">
              <span>Type</span>
              <strong>{entity?.type || '—'}</strong>
            </div>
            <div className="cost-detail-row highlight">
              <span>{field?.label || 'Price'}</span>
              <strong>KES {Number(field?.value || 0).toLocaleString()}</strong>
            </div>
          </div>
          
          {warningMessage && (
            <div className="cost-confirmation-warning">
              <AlertTriangle size={16} />
              <span>{warningMessage}</span>
            </div>
          )}
          
          <p className="cost-confirmation-hint">
            This price will be used for cost calculations across the system. 
            Please verify it is accurate before confirming.
          </p>
        </div>
        
        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary-action" onClick={onConfirm}>
            <CheckCircle2 size={16} /> Confirm Price
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 7.2 When to Show Confirmation

Create a reusable hook:

```jsx
function useCostConfirmation() {
  const [pendingConfirm, setPendingConfirm] = useState(null);
  
  const requestConfirmation = (entity, field, warningMessage) => {
    return new Promise((resolve) => {
      setPendingConfirm({
        entity,
        field,
        warningMessage,
        resolve
      });
    });
  };
  
  const clearConfirmation = () => {
    setPendingConfirm(null);
  };
  
  const ConfirmationOverlay = pendingConfirm ? (
    <CostConfirmationModal
      entity={pendingConfirm.entity}
      field={pendingConfirm.field}
      warningMessage={pendingConfirm.warningMessage}
      onConfirm={() => {
        pendingConfirm.resolve(true);
        setPendingConfirm(null);
      }}
      onCancel={() => {
        pendingConfirm.resolve(false);
        setPendingConfirm(null);
      }}
    />
  ) : null;
  
  return { requestConfirmation, ConfirmationOverlay };
}
```

### 7.3 Integration Points

Every place a price/cost is entered:

```jsx
// In RawMaterialSetupModal before saving:
if (num(form.costPerUnit) > 0) {
  const confirmed = await requestConfirmation(
    { type: 'Raw Material', name: form.materialName },
    { name: 'costPerUnit', label: 'Unit Cost', value: form.costPerUnit }
  );
  if (!confirmed) return;
}

// In NewSaleModal before saving order with prices:
if (items.some(item => num(item.unitPrice) > 0)) {
  const confirmed = await requestConfirmation(
    { type: 'Sales Order', name: `Order - ${orderNo}` },
    { name: 'total', label: 'Order Total', value: totalAmount }
  );
  if (!confirmed) return;
}
```

---

## 8. Phase 5 — Sales/CRM/Accounts Integration

### 8.1 Order → Production Pipeline

When a Sales Order is created for a manufactured product:

1. **Sales Order Created** → System checks if product `is_manufactured`
2. If yes → Auto-creates a **Production Job** (status: "Pending")
3. Notifies the production team via **Notifications** module
4. Shows in CRM under customer's "Manufacturing Orders"

### 8.2 Backend Hook in Sales Order Creation

```javascript
// Modified in saveSale function
saveSale(user, saleData) {
  // ... existing sales order creation logic ...
  
  // NEW: Check if any items are manufactured products
  const d = data();
  const manufacturedProducts = saleData.items.filter(item => {
    const product = d.products.find(p => 
      (p.id === item.productId || p.name === item.productName) && 
      p.isManufactured
    );
    return !!product;
  });
  
  for (const item of manufacturedProducts) {
    const product = d.products.find(p => 
      p.id === item.productId || p.name === item.productName
    );
    
    // Auto-create production job
    const orderNo = 'PJ-' + Date.now().toString(36).toUpperCase();
    const formula = d.productFormulas.find(f => 
      f.productName === product.name && f.status === 'Active'
    );
    
    d.productionOrders = d.productionOrders || [];
    d.productionOrders.push({
      id: gid(),
      orderNo,
      productName: product.name,
      productId: product.id,
      formulaId: formula?.id || '',
      plannedQty: num(item.quantity),
      completedQty: 0,
      wastageQty: 0,
      status: 'Pending',
      salesOrderId: sale.id,        // Link back to sales order
      customerName: saleData.customerName,
      materialCost: 0,
      source: 'Sales Order',
      createdBy: user.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    // Create notification
    d.notifications = d.notifications || [];
    d.notifications.push({
      id: gid(),
      title: `Production Required: ${product.name}`,
      message: `Sales order ${saleNo} requires ${item.quantity} units of ${product.name}. Production job ${orderNo} auto-created.`,
      priority: 'high',
      sourceModule: 'manufacturing',
      sourceId: orderNo,
      status: 'active',
      assignedTo: 'Production Supervisor',
      createdAt: new Date().toISOString()
    });
  }
  
  // ... rest of save logic ...
}
```

### 8.3 CRM Integration

In the CRM workspace, add a "Manufacturing Orders" section per customer:

```jsx
// In CRMWorkspace or CRMCustomerDetail
<Panel title="Manufacturing Orders" action={`${manufacturingOrders.length} orders`}>
  <SimpleTable 
    rows={manufacturingOrders} 
    columns={['orderNo', 'productName', 'plannedQty', 'completedQty', 'status', 'createdAt']} 
  />
</Panel>
```

### 8.4 Accounts Integration

In Accounts workspace, show manufacturing costs alongside invoices:

```jsx
// Manufacturing cost breakdown in invoice
<Panel title="Manufacturing Cost Analysis" action={`${totalManufacturingCost} total`}>
  <div className="manufacturing-cost-grid">
    {manufacturingOrders.map(order => (
      <article key={order.id}>
        <strong>{order.productName}</strong>
        <span>Qty: {order.completedQty || order.plannedQty}</span>
        <em>Material Cost: KES {num(order.materialCost).toLocaleString()}</em>
        <b>Unit Cost: KES {order.completedQty > 0 
          ? num(order.materialCost / order.completedQty).toLocaleString() 
          : '—'}
        </b>
      </article>
    ))}
  </div>
</Panel>
```

---

## 9. Phase 6 — Invoice Printing from Accounts

### 9.1 Invoice Print Flow

The system already has a tax invoice PDF generator (`taxInvoicePdfBuffer`). We need to:
1. Add an "Invoice" action button in Sales Orders
2. Create an Invoice record from a Sales Order
3. Print/Download the invoice PDF
4. Show invoice in Accounts workspace

### 9.2 Frontend — Invoice Generation & Printing

```jsx
// Enhanced sales order actions
function actionsFor(order) {
  const actions = [
    { 
      label: 'Mark Delivered', 
      icon: <Truck size={15} />, 
      onClick: () => setDeliveryStatus(order, 'Delivered'),
      disabled: order.deliveryStatus === 'Delivered'
    },
    { 
      label: 'Generate Invoice', 
      icon: <FileText size={15} />, 
      onClick: () => generateInvoice(order),
      disabled: order.invoiceGenerated
    },
    { 
      label: 'Print Invoice', 
      icon: <Printer size={15} />, 
      onClick: () => printInvoice(order.invNo || order.saleNo) 
    }
  ];
  return actions;
}

async function generateInvoice(order) {
  try {
    const result = await rpc('generateSalesInvoice', [user, order.id || order.saleNo]);
    if (result.file) {
      // Open/download the generated invoice
      openBase64File(result.file, false);
    }
    onDone?.();
  } catch (err) {
    alert(err.message);
  }
}
```

### 9.3 Backend — Invoice Generation

```javascript
generateSalesInvoice(user, saleId) {
  reqRole(user);
  const d = data();
  const sale = d.sales.find(s => s.id === saleId || s.saleNo === saleId);
  if (!sale) throw new Error('Sale not found');
  
  const customer = d.customers.find(c => 
    c.id === sale.customerId || c.name === sale.customerName
  );
  const items = (d.saleItems || []).filter(item => item.saleId === sale.id || item.saleNo === sale.saleNo);
  
  // Create or reuse invoice
  let invoice = d.invoices.find(i => i.saleNo === sale.saleNo && i.status !== 'Cancelled');
  if (!invoice) {
    const invNo = nextInvoiceNo(d);
    invoice = {
      id: gid(),
      invNo,
      saleNo: sale.saleNo,
      customerId: customer?.id || '',
      customerName: sale.customerName,
      date: sale.date || today(),
      dueDate: sale.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      subtotal: num(sale.subtotal),
      tax: num(sale.tax),
      total: num(sale.total),
      paid: num(sale.paid),
      balance: num(sale.balance || sale.total),
      status: 'Unpaid',
      items: items.map(item => ({
        productName: item.productName,
        description: item.description || item.productName,
        quantity: num(item.quantity),
        unitPrice: num(item.unitPrice || item.rate),
        tax: item.tax || 'VAT 16%',
        total: num(item.total || num(item.quantity) * num(item.unitPrice || item.rate))
      })),
      createdAt: new Date().toISOString()
    };
    d.invoices.push(invoice);
    sale.invoiceGenerated = true;
    sale.invNo = invNo;
    save(d);
  }
  
  // Generate PDF
  return {
    success: true,
    invoice,
    file: generateInvoicePdf(invoice, customer, items, d.settings || {})
  };
}

async function generateInvoicePdf(invoice, customer, items, settings) {
  const buffer = await taxInvoicePdfBuffer({
    invoice,
    items: invoice.items || items,
    customer,
    settings,
    options: {}
  });
  return {
    fileName: `INVOICE-${invoice.invNo || invoice.id}.pdf`,
    mimeType: 'application/pdf',
    content: buffer.toString('base64')
  };
}
```

### 9.4 Invoice Printing Button

```jsx
// In Accounts or Sales module
function InvoiceActions({ user, invoice, onChanged }) {
  const [printing, setPrinting] = useState(false);
  
  async function printInvoice() {
    setPrinting(true);
    try {
      const result = await rpc('printInvoice', [user, invoice.id || invoice.invNo]);
      if (result.file) {
        openBase64File(result.file, false); // Opens in new tab
        // OR use window.print() after loading
        openHtmlFile(result.file, true);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setPrinting(false);
    }
  }

  async function emailInvoice() {
    try {
      await rpc('emailInvoice', [user, invoice.id || invoice.invNo, { 
        to: invoice.customerEmail || '',
        subject: `Invoice ${invoice.invNo} from Farmtrack` 
      }]);
      alert('Invoice emailed successfully');
      onChanged?.();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="invoice-actions">
      <button onClick={printInvoice} disabled={printing}>
        <Printer size={16} /> {printing ? 'Printing...' : 'Print Invoice'}
      </button>
      <button onClick={emailInvoice}>
        <Mail size={16} /> Email Invoice
      </button>
      <button onClick={() => downloadRowsFile(`invoice-${invoice.invNo}`, [invoice], 'CSV')}>
        <Download size={16} /> Download CSV
      </button>
    </div>
  );
}
```

---

## 10. Phase 7 — Analytics & Reports

### 10.1 Manufacturing KPIs

Add to the Manufacturing dashboard:

| KPI | Calculation | Source |
|-----|------------|--------|
| Yield Rate | `completedQty / plannedQty × 100` | Production Jobs |
| Cost Variance | `(actualCost - estimatedCost) / estimatedCost × 100` | BOM vs Actual |
| Material Efficiency | `(materialUsed - waste) / materialUsed × 100` | Consumption Records |
| Production Velocity | `completedJobs / timePeriod` | Production Jobs |
| Inventory Turnover | `COGS / avgInventory` | Inventory + Consumption |

### 10.2 Manufacturing Analytics Tab

```jsx
function ManufacturingAnalytics({ data }) {
  const metrics = [
    { label: 'Yield Rate', value: `${data.yieldRate}%`, change: 3.2, tone: 'green' },
    { label: 'Cost Variance', value: `${data.costVariance}%`, change: -1.5, tone: data.costVariance <= 5 ? 'green' : 'red' },
    { label: 'Material Efficiency', value: `${data.materialEfficiency}%`, change: 2.1, tone: 'green' },
    { label: 'Production Velocity', value: `${data.productionVelocity}/day`, change: 0.5, tone: 'blue' }
  ];

  return (
    <div className="dashboard-grid">
      {metrics.map(m => <KpiCard key={m.label} icon={Gauge} label={m.label} value={m.value} change={m.change} tone={m.tone} />)}
      <Panel className="span-6" title="Production Cost Trend">
        <ResponsiveContainer width="100%" height={260}>
          <ReLineChart data={data.costTrend} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eef0f3" vertical={false} />
            <XAxis dataKey="period" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={v => `Ksh${Math.round(v / 1000)}K`} />
            <Tooltip formatter={v => currency(v)} />
            <Line type="monotone" dataKey="estimated" stroke="#667085" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="actual" stroke="#6d4aff" strokeWidth={3} dot={{ r: 4 }} />
          </ReLineChart>
        </ResponsiveContainer>
      </Panel>
      <Panel className="span-6" title="Material Consumption by Product">
        <SimpleTable rows={data.materialConsumptionSummary} columns={['productName', 'materialName', 'qtyConsumed', 'cost', 'period']} />
      </Panel>
    </div>
  );
}
```

---

## 11. Phase 8 — Edge Cases & Error Handling

### 11.1 Edge Cases Matrix

| Scenario | Handling |
|----------|----------|
| **Material out of stock** | Block production start; show insufficient quantity with details |
| **Batch expired** | Flag batch as expired; prevent use in production; quaratine alert |
| **Cost = 0** | Allow cost = 0 but warn user; show "Cost not set" badge |
| **BOM without materials** | Cannot start production; show "BOM has no materials" error |
| **Partial completion** | Allow partial output; remaining stays as "In Progress" |
| **Over-production** | Cap at planned Qty + 10% tolerance; warn if exceeded |
| **Negative inventory** | Prevent with validation; cannot consume more than available |
| **Price change mid-production** | Use original cost for in-progress jobs; new cost for new jobs |
| **Duplicate material codes** | Unique constraint; show "Code already exists" |
| **Decimal quantities** | Support up to 3 decimal places for precision |
| **Large production runs** | Batch material reservation in chunks of 1000 units |
| **Concurrent reservations** | Lock material batch during reservation; fail gracefully |

### 11.2 Error Handling Patterns

```javascript
// Backend validation
function validateProductionOrder(order, d) {
  const errors = [];
  
  // Check product exists
  const product = d.products.find(p => p.id === order.productId || p.name === order.productName);
  if (!product) errors.push('Product not found in system');
  
  // Check BOM exists
  const formula = d.productFormulas.find(f => 
    f.productId === order.productId || f.productName === order.productName
  );
  if (!formula) errors.push(`No BOM defined for product "${order.productName}"`);
  
  // Check BOM has materials
  const bomItems = d.formulaVersions.filter(v => v.formulaId === formula?.id);
  if (bomItems.length === 0) errors.push('BOM has no raw materials defined');
  
  // Check material availability
  for (const item of bomItems) {
    const material = d.rawMaterials.find(m => 
      m.materialName === item.materialName || m.id === item.rawMaterialId
    );
    if (!material) {
      errors.push(`Raw material "${item.materialName}" not found in inventory`);
      continue;
    }
    const required = num(item.quantity) * num(order.plannedQty);
    const available = num(material.availableQuantity);
    if (available < required) {
      errors.push(`Insufficient "${material.materialName}": need ${required}${material.baseUnit}, have ${available}${material.baseUnit}`);
    }
  }
  
  return errors;
}
```

---

## 12. Implementation Roadmap & Timeline

### Phase Breakdown

```
PHASE 0: Foundation (Week 1)
├─ Run Supabase migration SQL
├─ Seed 15 products and initial raw materials
├─ Verify JSON-bridge works with new tables
└─ Test data layer

PHASE 1: Raw Materials CRUD (Week 2)
├─ Backend: saveRawMaterial, receiveRawMaterial
├─ Frontend: RawMaterialSetupModal with cost confirmation
├─ Frontend: Enhanced RawMaterialReceipt modal
├─ Backend: Inventory movement hooks
└─ Test: Create 20 raw materials, receive batches

PHASE 2: BOM System (Week 3)
├─ Backend: saveBOM, getBOMData functions
├─ Frontend: BOMSetupModal
├─ Frontend: BOM list view with cost preview
├─ Cost confirmation integration
└─ Test: Set up BOMs for all 15 products

PHASE 3: Production Order Flow (Week 4)
├─ Backend: Enhanced startProductionOrder (reserve)
├─ Backend: Enhanced completeProductionJob (consume + inventory)
├─ Frontend: Production order wizard
├─ Frontend: Material consumption recording
└─ Test: Full production run for 5 products

PHASE 4: Cost Confirmation System (Week 5)
├─ Frontend: CostConfirmationModal component
├─ Frontend: useCostConfirmation hook
├─ Backend: Cost confirmation audit trail
├─ Integration: All price entry points
└─ Test: Verify confirmation appears at every cost entry

PHASE 5: Sales/CRM/Accounts Integration (Week 6)
├─ Backend: Auto-create production from sales orders
├─ Backend: Sales order → Production job linking
├─ Frontend: CRM manufacturing orders view
├─ Frontend: Manufacturing cost in invoices
└─ Test: End-to-end order → produce → invoice flow

PHASE 6: Invoice Printing (Week 7)
├─ Backend: generateSalesInvoice
├─ Frontend: Invoice generation and print
├─ Frontend: Email invoice
├─ Accounts workspace invoice view
└─ Test: Print 5 different invoice types

PHASE 7: Analytics & Reports (Week 8)
├─ Backend: Manufacturing analytics data
├─ Frontend: ManufacturingAnalytics component
├─ Frontend: Cost variance dashboard
├─ Manufacturing reports
└─ Test: Analytics accuracy verification

PHASE 8: Edge Cases & Hardening (Week 9)
├─ Negative inventory prevention
├─ Expiry date alerts
├─ Concurrent production safety
├─ Error message polish
├─ Performance optimization
└─ Final testing & bug fixes
```

---

## 13. File-by-File Code Changes

### 13.1 Files to Create

| File | Purpose |
|------|---------|
| `api/manufacturing-service.js` | Manufacturing business logic (separated from monolithic rpc.js) |
| `src/components/Manufacturing/RawMaterialSetupModal.jsx` | Raw material creation with cost confirmation |
| `src/components/Manufacturing/BOMSetupModal.jsx` | Bill of Materials setup UI |
| `src/components/Manufacturing/ProductionWizard.jsx` | Multi-step production order creation |
| `src/components/Manufacturing/CostConfirmationModal.jsx` | Reusable cost confirmation overlay |
| `src/components/Manufacturing/ManufacturingAnalytics.jsx` | Analytics dashboard |
| `src/components/Manufacturing/InvoicePrint.jsx` | Invoice generation and printing |
| `src/hooks/useCostConfirmation.js` | Hook for cost confirmation flow |
| `src/hooks/useInventoryMovement.js` | Hook for inventory add/subtract |

### 13.2 Files to Modify

| File | Changes |
|------|---------|
| `api/rpc.js` | Add new RPC handlers (saveRawMaterial, receiveRawMaterial, saveBOM, generateSalesInvoice, etc.) |
| `src/main.jsx` | Enhanced Manufacturing component with new tabs and modals |
| `src/styles.css` | New styles for cost confirmation, BOM setup, production wizard |
| `supabase-schema.sql` | Add new manufacturing tables and views |
| `supabase-normalized-core.sql` | Add normalized tables for Supabase sync |

---

## Appendix A: Sample Seed Data

### 15 Products Seed JSON

```json
{
  "products": [
    { "sku": "FERT-001", "name": "Super Gro Fertilizer", "category": "Fertilizer", "type": "finished_good", "unit": "bag", "costPrice": 850, "sellingPrice": 1500, "minStock": 20, "isManufactured": true },
    { "sku": "COMP-002", "name": "Organic Compost Plus", "category": "Compost", "type": "finished_good", "unit": "bag", "costPrice": 320, "sellingPrice": 600, "minStock": 30, "isManufactured": true },
    { "sku": "FOLIAR-003", "name": "Liquid Foliar Feed", "category": "Foliar", "type": "finished_good", "unit": "jerrycan", "costPrice": 450, "sellingPrice": 850, "minStock": 15, "isManufactured": true },
    { "sku": "HERB-004", "name": "Weed Killer Pro", "category": "Herbicide", "type": "finished_good", "unit": "bottle", "costPrice": 280, "sellingPrice": 550, "minStock": 25, "isManufactured": true },
    { "sku": "PEST-005", "name": "Pest Control X", "category": "Pesticide", "type": "finished_good", "unit": "bottle", "costPrice": 350, "sellingPrice": 700, "minStock": 20, "isManufactured": true },
    { "sku": "SEED-006", "name": "Seed Starter Mix", "category": "Growing Media", "type": "finished_good", "unit": "bag", "costPrice": 180, "sellingPrice": 350, "minStock": 40, "isManufactured": true },
    { "sku": "DRIP-007", "name": "Drip Irrigation Kit", "category": "Irrigation", "type": "finished_good", "unit": "set", "costPrice": 2200, "sellingPrice": 4000, "minStock": 5, "isManufactured": true },
    { "sku": "GREEN-008", "name": "Greenhouse Film", "category": "Greenhouse", "type": "finished_good", "unit": "roll", "costPrice": 3500, "sellingPrice": 6500, "minStock": 3, "isManufactured": true },
    { "sku": "FEED-009", "name": "Animal Feed Concentrate", "category": "Animal Feed", "type": "finished_good", "unit": "bag", "costPrice": 1200, "sellingPrice": 2200, "minStock": 10, "isManufactured": true },
    { "sku": "FISH-010", "name": "Fish Pond Cleaner", "category": "Aquaculture", "type": "finished_good", "unit": "bottle", "costPrice": 250, "sellingPrice": 500, "minStock": 20, "isManufactured": true },
    { "sku": "PH-011", "name": "Soil pH Balancer", "category": "Soil Amendment", "type": "finished_good", "unit": "bag", "costPrice": 400, "sellingPrice": 750, "minStock": 15, "isManufactured": true },
    { "sku": "BIO-012", "name": "Bio-Pesticide Spray", "category": "Biocontrol", "type": "finished_good", "unit": "bottle", "costPrice": 300, "sellingPrice": 600, "minStock": 25, "isManufactured": true },
    { "sku": "HYDROA-013", "name": "Hydroponic Nutrient A", "category": "Hydroponics", "type": "finished_good", "unit": "bottle", "costPrice": 500, "sellingPrice": 950, "minStock": 10, "isManufactured": true },
    { "sku": "HYDROB-014", "name": "Hydroponic Nutrient B", "category": "Hydroponics", "type": "finished_good", "unit": "bottle", "costPrice": 500, "sellingPrice": 950, "minStock": 10, "isManufactured": true },
    { "sku": "NET-015", "name": "Crop Cover Net", "category": "Netting", "type": "finished_good", "unit": "roll", "costPrice": 2800, "sellingPrice": 5000, "minStock": 5, "isManufactured": true }
  ]
}
```

### Sample Raw Materials Seed JSON

```json
{
  "rawMaterials": [
    { "materialCode": "RM-NIT", "materialName": "Nitrogen (46% Urea)", "category": "Chemical", "unitOfMeasure": "KG", "baseUnit": "G", "conversionFactor": 1000, "costPerUnit": 65, "minStockLevel": 100, "storageCondition": "Room Temp" },
    { "materialCode": "RM-PHOS", "materialName": "Phosphorus (DAP)", "category": "Chemical", "unitOfMeasure": "KG", "baseUnit": "G", "conversionFactor": 1000, "costPerUnit": 72, "minStockLevel": 100, "storageCondition": "Room Temp" },
    { "materialCode": "RM-POT", "materialName": "Potassium (KCl)", "category": "Chemical", "unitOfMeasure": "KG", "baseUnit": "G", "conversionFactor": 1000, "costPerUnit": 58, "minStockLevel": 100, "storageCondition": "Room Temp" },
    { "materialCode": "RM-COMP", "materialName": "Organic Compost", "category": "Organic", "unitOfMeasure": "KG", "baseUnit": "G", "conversionFactor": 1000, "costPerUnit": 15, "minStockLevel": 200, "storageCondition": "Room Temp" },
    { "materialCode": "RM-GLY", "materialName": "Glyphosate 480SL", "category": "Chemical", "unitOfMeasure": "L", "baseUnit": "ML", "conversionFactor": 1000, "costPerUnit": 450, "minStockLevel": 20, "storageCondition": "Hazardous" },
    { "materialCode": "RM-PKG-BAG", "materialName": "Packaging Bag (20KG)", "category": "Packaging", "unitOfMeasure": "Pieces", "baseUnit": "Unit", "conversionFactor": 1, "costPerUnit": 25, "minStockLevel": 500, "storageCondition": "Room Temp" },
    { "materialCode": "RM-PKG-BTL", "materialName": "Plastic Bottle (1L)", "category": "Packaging", "unitOfMeasure": "Pieces", "baseUnit": "Unit", "conversionFactor": 1, "costPerUnit": 18, "minStockLevel": 300, "storageCondition": "Room Temp" },
    { "materialCode": "RM-PKG-LBL", "materialName": "Product Label", "category": "Packaging", "unitOfMeasure": "Pieces", "baseUnit": "Unit", "conversionFactor": 1, "costPerUnit": 3, "minStockLevel": 1000, "storageCondition": "Room Temp" }
  ]
}
```

---

## Appendix B: Backend RPC Function Registry

Add these to the RPC handler map in `api/rpc.js`:

```javascript
const HANDLER_REGISTRY = {
  // Existing handlers...
  
  // NEW: Raw Materials
  saveRawMaterial: { handler: api.saveRawMaterial, auditing: true },
  receiveRawMaterial: { handler: api.receiveRawMaterial, auditing: true },
  getRawMaterials: { handler: api.getRawMaterials, auditing: false },
  
  // NEW: BOM
  saveBOM: { handler: api.saveBOM, auditing: true },
  getBOMData: { handler: api.getBOMData, auditing: false },
  
  // NEW: Production
  startProductionOrder: { handler: api.startProductionOrder, auditing: true },
  completeProductionJob: { handler: api.completeProductionJob, auditing: true },
  recordMaterialConsumption: { handler: api.recordMaterialConsumption, auditing: true },
  
  // NEW: Cost Confirmation
  confirmCost: { handler: api.confirmCost, auditing: true },
  getCostConfirmationLog: { handler: api.getCostConfirmationLog, auditing: false },
  
  // NEW: Invoice
  generateSalesInvoice: { handler: api.generateSalesInvoice, auditing: true },
  printInvoice: { handler: api.printInvoice, auditing: false },
  emailInvoice: { handler: api.emailInvoice, auditing: true },
  
  // NEW: Analytics
  getManufacturingAnalytics: { handler: api.getManufacturingAnalytics, auditing: false }
};
```

---

## Appendix C: CSS Styles to Add

```css
/* === COST CONFIRMATION === */
.cost-confirmation-modal .cost-confirmation-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px;
  text-align: center;
}

.cost-confirmation-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #fef6e7;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f79009;
}

.cost-confirmation-question {
  font-size: 18px;
  font-weight: 600;
  color: #101828;
}

.cost-confirmation-details {
  width: 100%;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
}

.cost-detail-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.cost-detail-row.highlight {
  background: #fef6e7;
  margin: 8px -16px -16px;
  padding: 16px;
  border-radius: 0 0 12px 12px;
  border-bottom: none;
}

.cost-detail-row.highlight strong {
  color: #f79009;
  font-size: 18px;
}

.cost-confirmation-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f79009;
  background: #fef6e7;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
}

.cost-confirmation-hint {
  font-size: 13px;
  color: #667085;
}

/* === BOM SETUP === */
.bom-setup-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.bom-header-fields {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 12px;
}

.bom-items-section {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
}

.bom-item-row {
  display: grid;
  grid-template-columns: 3fr 1fr 1fr 1fr auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  padding: 8px;
  background: #f9fafb;
  border-radius: 8px;
}

.bom-cost-preview {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  padding: 16px;
}

.bom-cost-details article {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
}
```

---

## Conclusion

This plan provides a comprehensive, step-by-step implementation roadmap for transforming the existing Manufacturing module into a fully-functional production system with:

1. **Raw Materials** — Full CRUD with cost tracking, batch management, and inventory hooks
2. **15 Products with BOM** — Pre-configured products with detailed raw material consumption
3. **Production Order Flow** — Reserve → Consume → Output with cost calculation
4. **Cost Confirmation** — Overlay system ensuring price accuracy
5. **Sales/CRM/Accounts Integration** — End-to-end order → produce → invoice pipeline
6. **Invoice Printing** — PDF generation with manufacturing cost breakdown
7. **Supabase Database** — New tables for raw materials, BOM, consumption, and cost confirmations

Each phase builds on the previous one, allowing for incremental delivery and testing. The JSON-bridge pattern ensures backward compatibility with the existing system while the Supabase normalized tables provide the foundation for scalable manufacturing operations.