-- FarmTrack ERP — full module interconnect tables for Supabase
-- Run in Supabase SQL Editor AFTER supabase-normalized-core.sql
-- Project: https://qiwggxoaqeptdqzpwgft.supabase.co
--
-- These tables receive normalized upserts from api/rpc.js on every saveState().
-- erp_state remains the live operational JSON bridge for the Vite/Vercel app.
-- Normalized tables give you queryable, relational data across all modules.

create extension if not exists pgcrypto;

-- Inventory movements (sales out, production in, transfers, adjustments)
create table if not exists public.inventory_transactions (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  product_id uuid,
  product_name text,
  warehouse_name text,
  batch_no text,
  transaction_type text,
  quantity numeric(18,4) default 0,
  unit_cost numeric(14,2) default 0,
  reference_type text,
  reference_id text,
  notes text,
  created_by text,
  created_at timestamptz default now()
);

-- HR / organization
create table if not exists public.departments (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  name text not null,
  code text,
  manager text,
  location text,
  budget numeric(14,2) default 0,
  headcount integer default 0,
  status text default 'active',
  updated_at timestamptz default now()
);

create table if not exists public.employees (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  employee_no text,
  name text not null,
  email text,
  phone text,
  department text,
  position text,
  pay_type text default 'Salary',
  salary numeric(14,2) default 0,
  hourly_rate numeric(14,2) default 0,
  leave_annual numeric(8,2) default 21,
  leave_sick numeric(8,2) default 10,
  leave_casual numeric(8,2) default 5,
  status text default 'active',
  updated_at timestamptz default now()
);

create table if not exists public.attendance (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  employee_id uuid,
  employee_name text,
  attendance_date date,
  check_in text,
  check_out text,
  status text default 'present',
  hours numeric(8,2) default 0,
  note text,
  created_at timestamptz default now()
);

create table if not exists public.leave_applications (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  applicant_id uuid,
  applicant_email text,
  applicant_name text,
  department text,
  leave_type text,
  start_date date,
  end_date date,
  days numeric(8,2) default 0,
  reason text,
  covering_employee text,
  status text default 'pending',
  decided_by text,
  decision_note text,
  applied_at timestamptz,
  decided_at timestamptz
);

-- Manufacturing materials & batches
create table if not exists public.raw_materials (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  material_name text not null,
  category text,
  unit_of_measure text,
  current_quantity numeric(18,4) default 0,
  available_quantity numeric(18,4) default 0,
  reserved_quantity numeric(18,4) default 0,
  unit_cost numeric(14,2) default 0,
  warehouse text,
  reorder_level numeric(18,4) default 0,
  status text default 'available',
  updated_at timestamptz default now()
);

create table if not exists public.production_batches (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  batch_no text,
  production_order_id uuid,
  order_no text,
  product_name text,
  quantity_produced numeric(18,4) default 0,
  waste_quantity numeric(18,4) default 0,
  total_cost numeric(14,2) default 0,
  cost_per_unit numeric(14,2) default 0,
  status text default 'completed',
  production_date date,
  created_at timestamptz default now()
);

create table if not exists public.material_consumption (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  material_id uuid,
  material_name text,
  production_order text,
  quantity_consumed numeric(18,4) default 0,
  unit text,
  cost_consumed numeric(14,2) default 0,
  consumption_date date,
  operator text,
  created_at timestamptz default now()
);

-- Sales logistics / CRM / finance extras
create table if not exists public.deliveries (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  delivery_no text,
  sale_id uuid,
  sale_no text,
  customer_name text,
  status text default 'pending',
  driver text,
  vehicle text,
  destination text,
  delivered_confirmed boolean default false,
  delivery_date date,
  created_at timestamptz default now()
);

create table if not exists public.quotations (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  quote_no text,
  customer_name text,
  status text default 'draft',
  total numeric(14,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.leads (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  name text,
  company text,
  stage text default 'New',
  value numeric(14,2) default 0,
  owner text,
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists public.expenses (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  expense_no text,
  category text,
  description text,
  amount numeric(14,2) default 0,
  payment_method text,
  status text default 'posted',
  expense_date date,
  created_at timestamptz default now()
);

create table if not exists public.notifications (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  category text,
  priority text,
  title text,
  message text,
  source_module text,
  source_id text,
  status text default 'active',
  is_read boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.requisitions (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  req_no text,
  module text,
  title text,
  status text default 'pending',
  requested_by text,
  amount numeric(14,2) default 0,
  created_at timestamptz default now()
);

-- Helpful indexes for cross-module queries
create index if not exists idx_inv_tx_tenant_date on public.inventory_transactions (tenant_id, created_at desc);
create index if not exists idx_employees_tenant_dept on public.employees (tenant_id, department);
create index if not exists idx_leave_tenant_status on public.leave_applications (tenant_id, status);
create index if not exists idx_raw_mat_tenant on public.raw_materials (tenant_id, material_name);
create index if not exists idx_deliveries_sale on public.deliveries (tenant_id, sale_no);
create index if not exists idx_notifications_tenant on public.notifications (tenant_id, created_at desc);

-- Service role full access (app uses service key on Vercel)
do $$
declare
  t text;
begin
  foreach t in array array[
    'inventory_transactions','departments','employees','attendance','leave_applications',
    'raw_materials','production_batches','material_consumption','deliveries','quotations',
    'leads','expenses','notifications','requisitions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service_all_%I" on public.%I', t, t);
    execute format(
      'create policy "service_all_%I" on public.%I for all to service_role using (true) with check (true)',
      t, t
    );
  end loop;
end $$;

-- Quick health view: counts across modules
create or replace view public.erp_module_counts as
select
  (select count(*) from public.customers) as customers,
  (select count(*) from public.products) as products,
  (select count(*) from public.inventory_items) as inventory_items,
  (select count(*) from public.sales_orders) as sales_orders,
  (select count(*) from public.invoices) as invoices,
  (select count(*) from public.employees) as employees,
  (select count(*) from public.leave_applications) as leave_applications,
  (select count(*) from public.raw_materials) as raw_materials,
  (select count(*) from public.production_jobs) as production_jobs,
  (select count(*) from public.journal_entries) as journal_entries,
  (select count(*) from public.notifications) as notifications;
