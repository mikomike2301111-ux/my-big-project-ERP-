-- ============================================================
-- FARMTRACK ERP — Manufacturing Module Enhancement
-- Migration 001: Raw Materials, BOM, Cost Confirmation
-- ============================================================

-- 1. RAW MATERIALS MASTER TABLE
create table if not exists public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  material_code text not null,
  material_name text not null,
  category text default 'Generic',
  unit_of_measure text not null default 'KG',
  base_unit text not null default 'G',
  conversion_factor numeric(14,6) default 1000,
  default_cost_per_unit numeric(14,2) default 0,
  supplier_id uuid references public.suppliers(id),
  min_stock_level numeric(14,3) default 0,
  max_stock_level numeric(14,3) default 0,
  reorder_point numeric(14,3) default 0,
  lead_time_days integer default 0,
  storage_condition text default 'Room Temp',
  hazardous boolean default false,
  current_quantity numeric(14,3) default 0,
  available_quantity numeric(14,3) default 0,
  reserved_quantity numeric(14,3) default 0,
  consumed_quantity numeric(14,3) default 0,
  cost_confirmed_at timestamptz,
  cost_confirmed_by uuid references public.profiles(id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, material_code)
);

-- 2. RAW MATERIAL INVENTORY (batch/lot tracking)
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
  quality_status text default 'quarantine',
  storage_location text,
  status text not null default 'in_stock',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. BILL OF MATERIALS
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

-- 4. BOM ITEMS
create table if not exists public.bill_of_material_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bom_id uuid not null references public.bill_of_materials(id) on delete cascade,
  raw_material_id uuid not null references public.raw_materials(id),
  quantity numeric(14,3) not null,
  unit text not null default 'KG',
  waste_percent numeric(5,2) default 0,
  cost_contribution numeric(14,2) default 0
);

-- 5. COST CONFIRMATION LOG
create table if not exists public.cost_confirmations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  field_name text not null,
  old_value numeric(14,2),
  new_value numeric(14,2),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz not null default now(),
  notes text
);

-- 6. MATERIAL CONSUMPTION (immutable records)
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
  immutable boolean default true
);

-- 7. PRODUCTION OUTPUT (finished goods)
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
  quality_status text default 'pending',
  produced_by uuid references public.profiles(id),
  produced_at timestamptz not null default now(),
  immutable boolean default true
);

-- Indexes
create index if not exists idx_raw_materials_tenant on public.raw_materials (tenant_id, status);
create index if not exists idx_raw_material_inventory_rm on public.raw_material_inventory (tenant_id, raw_material_id);
create index if not exists idx_bom_product on public.bill_of_materials (tenant_id, product_id);
create index if not exists idx_bom_items_bom on public.bill_of_material_items (bom_id);
create index if not exists idx_cost_confirmations_entity on public.cost_confirmations (tenant_id, entity_type, entity_id);
create index if not exists idx_material_consumption_job on public.material_consumption (tenant_id, production_job_id);
create index if not exists idx_production_output_job on public.production_output (tenant_id, production_job_id);

-- View: Manufacturing cost analysis
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
  pj.total_actual_cost as total_overhead_cost,
  (coalesce(pj.total_material_cost, 0) + coalesce(pj.total_labor_cost, 0)) as total_cost,
  pj.status,
  pj.created_at
from public.production_jobs pj
join public.products p on p.id = pj.product_id;

-- Seed 15 manufactured products
insert into public.products (tenant_id, sku, name, category, type, unit, cost_price, selling_price, min_stock, is_manufactured, status)
select 
  t.id,
  sku,
  name,
  category,
  'finished_good' as type,
  unit,
  cost_price,
  selling_price,
  min_stock,
  true as is_manufactured,
  'active' as status
from public.tenants t
cross join (values
  ('FERT-001', 'Super Gro Fertilizer', 'Fertilizer', 'bag', 850, 1500, 20),
  ('COMP-002', 'Organic Compost Plus', 'Compost', 'bag', 320, 600, 30),
  ('FOLIAR-003', 'Liquid Foliar Feed', 'Foliar', 'jerrycan', 450, 850, 15),
  ('HERB-004', 'Weed Killer Pro', 'Herbicide', 'bottle', 280, 550, 25),
  ('PEST-005', 'Pest Control X', 'Pesticide', 'bottle', 350, 700, 20),
  ('SEED-006', 'Seed Starter Mix', 'Growing Media', 'bag', 180, 350, 40),
  ('DRIP-007', 'Drip Irrigation Kit', 'Irrigation', 'set', 2200, 4000, 5),
  ('GREEN-008', 'Greenhouse Film', 'Greenhouse', 'roll', 3500, 6500, 3),
  ('FEED-009', 'Animal Feed Concentrate', 'Animal Feed', 'bag', 1200, 2200, 10),
  ('FISH-010', 'Fish Pond Cleaner', 'Aquaculture', 'bottle', 250, 500, 20),
  ('PH-011', 'Soil pH Balancer', 'Soil Amendment', 'bag', 400, 750, 15),
  ('BIO-012', 'Bio-Pesticide Spray', 'Biocontrol', 'bottle', 300, 600, 25),
  ('HYDROA-013', 'Hydroponic Nutrient A', 'Hydroponics', 'bottle', 500, 950, 10),
  ('HYDROB-014', 'Hydroponic Nutrient B', 'Hydroponics', 'bottle', 500, 950, 10),
  ('NET-015', 'Crop Cover Net', 'Netting', 'roll', 2800, 5000, 5)
) as p(sku, name, category, unit, cost_price, selling_price, min_stock)
where not exists (
  select 1 from public.products pr 
  where pr.tenant_id = t.id and pr.sku = p.sku
);