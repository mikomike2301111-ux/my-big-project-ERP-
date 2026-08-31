-- ============================================================
-- Migration 006: RESTORE MANUFACTURING TABLES
-- Run on Supabase SQL Editor (project rajnrkgcisgpxtzzfmcl).
--
-- Re-creates the Manufacturing module tables after migration 005 dropped them.
-- Data in these tables was cleared by 005 and cannot be recovered; tables come
-- back empty and ready for new manufacturing data.
-- The ERP app code again preserves (does not wipe) manufacturing data.
-- ============================================================

drop table if exists public.batch_recalls cascade;
drop table if exists public.bill_of_material_items cascade;
drop table if exists public.bills_of_materials cascade;
drop table if exists public.bom_version_history cascade;
drop table if exists public.formula_versions cascade;
drop table if exists public.manufacturing_documents cascade;
drop table if exists public.material_consumption cascade;
drop table if exists public.product_formulas cascade;
drop table if exists public.production_batch_costs cascade;
drop table if exists public.production_batch_materials cascade;
drop table if exists public.production_batch_yields cascade;
drop table if exists public.production_batches cascade;
drop table if exists public.production_calendar cascade;
drop table if exists public.production_capacity cascade;
drop table if exists public.production_downtime cascade;
drop table if exists public.production_jobs cascade;
drop table if exists public.production_material_requests cascade;
drop table if exists public.production_output cascade;
drop table if exists public.production_quality_checks cascade;
drop table if exists public.production_storage_history cascade;
drop table if exists public.quality_control_records cascade;
drop table if exists public.raw_material_batches cascade;
drop table if exists public.raw_material_consumption cascade;
drop table if exists public.raw_materials cascade;
drop table if exists public.unit_conversions cascade;
drop table if exists public.unit_of_measure cascade;
drop table if exists public.waste_records cascade;

create table if not exists public.batch_recalls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  recall_no text not null,
  material_batch text,
  affected_batches jsonb not null default '[]'::jsonb,
  reason text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.bill_of_material_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bom_id uuid not null references public.bills_of_materials(id) on delete cascade,
  raw_material_id uuid not null references public.raw_materials(id),
  quantity numeric(14,3) not null,
  unit text not null default 'KG',
  waste_percent numeric(5,2) default 0,
  cost_contribution numeric(14,2) default 0,
  material_category text,
  notes text
);

create table if not exists public.bills_of_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  finished_product_id uuid not null references public.products(id),
  name text not null,
  version text default 'v1',
  output_qty numeric(14,3) default 1,
  status text default 'active'
);

create table if not exists public.bom_version_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bom_id uuid not null references public.bills_of_materials(id) on delete cascade,
  version text not null,
  action text not null,
  user_name text,
  timestamp timestamptz not null default now(),
  item_count integer default 0
);

create table if not exists public.formula_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  formula_id uuid references public.product_formulas(id),
  version text not null,
  material_id uuid references public.raw_materials(id),
  material_name text not null,
  quantity numeric(18,6) not null,
  unit text not null,
  effective_from date not null default current_date,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.manufacturing_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  title text not null,
  type text,
  product_name text,
  version text,
  file_url text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

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

create table if not exists public.product_formulas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  product_id uuid,
  product_name text not null,
  formula_name text not null,
  active_version text not null,
  output_quantity numeric(18,6) not null default 1,
  output_unit text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.production_batch_costs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  production_batch_id uuid,
  batch_no text,
  material_cost numeric(18,4) not null default 0,
  labor_cost numeric(18,4) not null default 0,
  utilities_cost numeric(18,4) not null default 0,
  total_cost numeric(18,4) not null default 0,
  cost_per_unit numeric(18,6) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.production_batch_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  production_batch_id uuid,
  production_batch_no text,
  material_id uuid references public.raw_materials(id),
  material_name text,
  batch_used text,
  quantity_consumed numeric(18,6),
  unit text,
  cost_consumed numeric(18,4),
  created_at timestamptz not null default now()
);

create table if not exists public.production_batch_yields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  production_batch_id uuid,
  batch_no text,
  planned_qty numeric(18,6),
  actual_qty numeric(18,6),
  waste_qty numeric(18,6),
  yield_percent numeric(8,2),
  created_at timestamptz not null default now()
);

create table if not exists public.production_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  batch_no text not null,
  production_order_id uuid,
  order_no text,
  product_id uuid,
  product_name text not null,
  quantity_produced numeric(18,6) not null,
  unit text not null,
  waste_quantity numeric(18,6) not null default 0,
  production_date date not null default current_date,
  operator_name text,
  quality_status text,
  packaging_status text,
  inventory_transfer text,
  production_cost numeric(18,4) not null default 0,
  sales_revenue numeric(18,4) not null default 0,
  profit numeric(18,4) not null default 0,
  profit_margin numeric(8,2) not null default 0,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  unique (tenant_id, batch_no)
);

create table if not exists public.production_calendar (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  period text,
  planned_orders integer,
  planned_output numeric(18,6),
  status text
);

create table if not exists public.production_capacity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  resource text not null,
  type text not null,
  daily_capacity numeric(18,6),
  scheduled numeric(18,6),
  available numeric(18,6),
  unit text,
  status text not null default 'available'
);

create table if not exists public.production_downtime (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  production_order_id uuid,
  order_no text,
  reason text,
  minutes numeric(12,2),
  operator_name text,
  downtime_date date not null default current_date,
  impact text
);

create table if not exists public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_no text not null,
  product_id uuid not null references public.products(id),
  bom_id uuid references public.bills_of_materials(id),
  planned_qty numeric(14,3) not null,
  completed_qty numeric(14,3) default 0,
  wastage_qty numeric(14,3) default 0,
  status text default 'pending',
  material_cost numeric(14,2) default 0,
  source_event_id uuid references public.business_events(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, job_no)
);

create table if not exists public.production_material_requests (
  id uuid primary key default gen_random_uuid(),
  production_job_id uuid references public.production_jobs(id),
  product_id uuid references public.products(id),
  quantity numeric default 0,
  status text default 'Pending',
  created_at timestamptz default now()
);

create table if not exists public.production_output (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  production_job_id uuid not null references public.production_jobs(id),
  product_id uuid not null references public.products(id),
  batch_no text,
  quantity_produced numeric(14,3) not null,
  quantity_waste numeric(14,3) default 0,
  expected_waste numeric(14,3) default 0,
  unit text not null,
  unit_cost numeric(14,2) default 0,
  total_cost numeric(14,2) default 0,
  raw_material_cost numeric(14,2) default 0,
  packaging_cost numeric(14,2) default 0,
  consumable_cost numeric(14,2) default 0,
  labor_cost numeric(14,2) default 0,
  overhead_cost numeric(14,2) default 0,
  machine_cost numeric(14,2) default 0,
  utility_cost numeric(14,2) default 0,
  cost_per_unit numeric(14,2) default 0,
  suggested_selling_price numeric(14,2) default 0,
  gross_margin numeric(14,2) default 0,
  quality_status text default 'pending',
  produced_by uuid references public.profiles(id),
  produced_at timestamptz not null default now(),
  immutable boolean default true
);

create table if not exists public.production_quality_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  production_batch_id uuid,
  batch_no text,
  product_name text,
  parameter text,
  result text,
  inspector text,
  check_date date not null default current_date,
  status text not null default 'pending'
);

create table if not exists public.production_storage_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  batch_no text,
  product_name text,
  quantity_produced numeric(18,6),
  date_produced date,
  cost_produced numeric(18,4),
  operator_name text,
  quality_check text,
  packaging_event text,
  inventory_transfer text,
  sale_status text,
  created_at timestamptz not null default now()
);

create table if not exists public.quality_control_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  production_job_id uuid references public.production_jobs(id),
  batch_no text,
  product_name text,
  inspector uuid references public.profiles(id),
  checks jsonb default '[]',
  status text default 'Pending',
  notes text,
  date date default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.raw_material_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  material_id uuid references public.raw_materials(id),
  batch_number text not null,
  supplier_id uuid,
  supplier_name text,
  quantity numeric(18,6) not null,
  available_quantity numeric(18,6) not null default 0,
  reserved_quantity numeric(18,6) not null default 0,
  unit text not null,
  cost numeric(18,4) not null default 0,
  cost_per_base_unit numeric(18,6) not null default 0,
  received_date date not null default current_date,
  expiry_date date,
  warehouse text,
  storage_location text,
  status text not null default 'available',
  created_at timestamptz not null default now(),
  unique (tenant_id, batch_number)
);

create table if not exists public.raw_material_consumption (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  production_order_id uuid,
  production_order_no text,
  production_batch_id uuid,
  material_id uuid references public.raw_materials(id),
  material_name text not null,
  batch_number text not null,
  quantity_consumed numeric(18,6) not null,
  quantity_base numeric(18,6) not null,
  unit text not null,
  operator_name text,
  consumed_at timestamptz not null default now(),
  cost_consumed numeric(18,4) not null default 0,
  immutable boolean not null default true
);

create table if not exists public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  material_code text not null,
  barcode text,
  qr_code text,
  material_name text not null,
  description text,
  category text default 'Generic',
  unit_of_measure text not null default 'KG',
  base_unit text not null default 'G',
  conversion_factor numeric(14,6) default 1000,
  default_cost_per_unit numeric(14,2) default 0,
  unit_cost numeric(14,2) default 0,
  average_cost numeric(14,2) default 0,
  last_purchase_price numeric(14,2) default 0,
  supplier_id uuid references public.suppliers(id),
  supplier_name text,
  warehouse text default 'Main Warehouse',
  bin_location text default 'A1',
  min_stock_level numeric(14,3) default 0,
  max_stock_level numeric(14,3) default 0,
  reorder_point numeric(14,3) default 0,
  reorder_level numeric(14,3) default 0,
  lead_time_days integer default 0,
  lead_time integer default 0,
  storage_condition text default 'Room Temp',
  hazardous boolean default false,
  current_quantity numeric(14,3) default 0,
  available_quantity numeric(14,3) default 0,
  reserved_quantity numeric(14,3) default 0,
  consumed_quantity numeric(14,3) default 0,
  current_stock numeric(14,3) default 0,
  available_stock numeric(14,3) default 0,
  reserved_stock numeric(14,3) default 0,
  cost_confirmed_at timestamptz,
  cost_confirmed_by uuid references public.profiles(id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, material_code)
);

create table if not exists public.unit_conversions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  from_unit text not null,
  to_unit text not null,
  factor numeric(18,8) not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (tenant_id, from_unit, to_unit)
);

create table if not exists public.unit_of_measure (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  code text not null,
  name text not null,
  family text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.waste_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  production_job_id uuid references public.production_jobs(id),
  batch_no text,
  order_no text,
  product_name text,
  expected_waste numeric(14,3) default 0,
  actual_waste numeric(14,3) default 0,
  yield_percent numeric(14,2) default 0,
  loss_percent numeric(14,2) default 0,
  scrap_materials numeric(14,3) default 0,
  recovered_materials numeric(14,3) default 0,
  recorded_by uuid references public.profiles(id),
  date date default current_date,
  created_at timestamptz not null default now()
);

-- Analytics materialized view (Analytics > Production Intelligence)
drop materialized view if exists public.analytics_production_metrics cascade;
create materialized view public.analytics_production_metrics as
select status, count(*)::int as cnt, coalesce(sum(quantity), 0) as qty
from public.production_jobs group by status;
grant select on public.analytics_production_metrics to anon, authenticated, service_role;


-- Verify

select table_name from information_schema.tables where table_schema = 'public' and table_name in ('batch_recalls','bill_of_material_items','bills_of_materials','bom_version_history','formula_versions','manufacturing_documents','material_consumption','product_formulas','production_batch_costs','production_batch_materials','production_batch_yields','production_batches','production_calendar','production_capacity','production_downtime','production_jobs','production_material_requests','production_output','production_quality_checks','production_storage_history','quality_control_records','raw_material_batches','raw_material_consumption','raw_materials','unit_conversions','unit_of_measure','waste_records') order by 1;
