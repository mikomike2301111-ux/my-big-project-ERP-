-- ============================================================
-- UNITY/FARMTRACK ERP - SELF-CONTAINED BASE + FIXED 001/002/003
-- One script, correct dependency order. Paste the WHOLE thing
-- into the Supabase SQL Editor and run once.
--
-- Fixes:
--   001 error "relation public.production_jobs does not exist"
--      => production_jobs is created FIRST (before the tables that
--         reference it), plus the base tables it was missing.
--   002 / 003 error "column tenant_id does not exist"
--      => base tables (customers, invoices, sales_orders, products,
--         suppliers, profiles, tenants) are created here WITH a
--         tenant_id column BEFORE the module tables.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- BASE TABLES (created here so 002/003 no longer fail on tenant_id)
-- ============================================================
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Farmtrack Biosciences Ltd',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  full_name text, email text, role text default 'staff',
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  sku text, name text not null, category text, type text default 'product',
  unit text default 'unit', cost_price numeric(14,2) default 0,
  selling_price numeric(14,2) default 0, min_stock numeric(14,2) default 0,
  is_manufactured boolean default false, status text default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  name text not null, phone text, email text, category text,
  status text default 'active', created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  name text not null, phone text, email text, city text, address text,
  balance numeric(14,2) default 0, status text default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  invoice_no text, customer_id uuid references public.customers(id),
  customer_name text, invoice_date date default current_date, due_date date,
  subtotal numeric(14,2) default 0, tax numeric(14,2) default 0, total numeric(14,2) default 0,
  paid numeric(14,2) default 0, balance numeric(14,2) default 0, status text default 'Pending',
  created_at timestamptz not null default now()
);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  so_no text, customer_id uuid references public.customers(id), customer_name text,
  total numeric(14,2) default 0, status text default 'Open',
  created_at timestamptz not null default now()
);
-- ============================================================
-- FIX FOR 001: production_jobs must exist BEFORE the tables that
-- reference it (material_consumption / production_output).
-- ============================================================
create table if not exists public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_no text not null,
  product_id uuid not null references public.products(id),
  bom_id uuid,
  planned_qty numeric(14,3) not null default 0,
  completed_qty numeric(14,3) default 0,
  wastage_qty numeric(14,3) default 0,
  status text default 'pending',
  material_cost numeric(14,2) default 0,
  total_material_cost numeric(14,2) default 0,
  total_labor_cost numeric(14,2) default 0,
  total_actual_cost numeric(14,2) default 0,
  packaging_cost numeric(14,2) default 0,
  consumable_cost numeric(14,2) default 0,
  machine_cost numeric(14,2) default 0,
  utility_cost numeric(14,2) default 0,
  overhead_cost numeric(14,2) default 0,
  cost_per_unit numeric(14,2) default 0,
  gross_margin numeric(14,2) default 0,
  source_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, job_no)
);

-- ============================================================
-- MIGRATION 001 (corrected) - manufacturing / raw materials / BOM
-- ============================================================
create table if not exists public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  material_code text not null, barcode text, qr_code text, material_name text not null,
  description text, category text default 'Generic', unit_of_measure text not null default 'KG',
  base_unit text not null default 'G', conversion_factor numeric(14,6) default 1000,
  default_cost_per_unit numeric(14,2) default 0, unit_cost numeric(14,2) default 0,
  average_cost numeric(14,2) default 0, last_purchase_price numeric(14,2) default 0,
  supplier_id uuid references public.suppliers(id), supplier_name text,
  warehouse text default 'Main Warehouse', bin_location text default 'A1',
  min_stock_level numeric(14,3) default 0, max_stock_level numeric(14,3) default 0,
  reorder_point numeric(14,3) default 0, reorder_level numeric(14,3) default 0,
  lead_time_days integer default 0, lead_time integer default 0,
  storage_condition text default 'Room Temp', hazardous boolean default false,
  current_quantity numeric(14,3) default 0, available_quantity numeric(14,3) default 0,
  reserved_quantity numeric(14,3) default 0, consumed_quantity numeric(14,3) default 0,
  current_stock numeric(14,3) default 0, available_stock numeric(14,3) default 0,
  reserved_stock numeric(14,3) default 0,
  cost_confirmed_at timestamptz, cost_confirmed_by uuid references public.profiles(id),
  status text not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, material_code)
);

-- warehouses may not exist yet; ensure a minimal one so FKs never fail
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  name text not null, location text, manager text, status text default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.raw_material_inventory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  raw_material_id uuid not null references public.raw_materials(id),
  warehouse_id uuid references public.warehouses(id),
  batch_no text, quantity_on_hand numeric(14,3) not null default 0,
  quantity_reserved numeric(14,3) not null default 0, unit_cost numeric(14,2) default 0,
  received_date date default current_date, expiry_date date, supplier_batch_no text,
  quality_status text default 'quarantine', storage_location text,
  status text not null default 'in_stock',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.bill_of_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id),
  name text not null, version text default 'v1', output_qty numeric(14,3) default 1,
  output_unit text default 'unit', labor_cost numeric(14,2) default 0,
  overhead_cost numeric(14,2) default 0, machine_cost numeric(14,2) default 0,
  utility_cost numeric(14,2) default 0, total_estimated_cost numeric(14,2) default 0,
  status text default 'active', approval_status text default 'Draft',
  created_by uuid references public.profiles(id), approved_by uuid references public.profiles(id),
  approved_at timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bill_of_material_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bom_id uuid not null references public.bill_of_materials(id) on delete cascade,
  raw_material_id uuid not null references public.raw_materials(id),
  quantity numeric(14,3) not null, unit text not null default 'KG',
  waste_percent numeric(5,2) default 0, cost_contribution numeric(14,2) default 0,
  material_category text, notes text
);

create table if not exists public.cost_confirmations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null, entity_id uuid not null, field_name text not null,
  old_value numeric(14,2), new_value numeric(14,2),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz not null default now(), notes text
);

create table if not exists public.material_consumption (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  production_job_id uuid not null references public.production_jobs(id),
  raw_material_id uuid not null references public.raw_materials(id),
  raw_material_inventory_id uuid references public.raw_material_inventory(id),
  batch_no text, quantity_consumed numeric(14,3) not null, unit text not null,
  unit_cost numeric(14,2) default 0, total_cost numeric(14,2) default 0,
  consumed_by uuid references public.profiles(id),
  consumed_at timestamptz not null default now(), immutable boolean default true
);

create table if not exists public.production_output (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  production_job_id uuid not null references public.production_jobs(id),
  product_id uuid not null references public.products(id),
  batch_no text, quantity_produced numeric(14,3) not null, quantity_waste numeric(14,3) default 0,
  expected_waste numeric(14,3) default 0, unit text not null,
  unit_cost numeric(14,2) default 0, total_cost numeric(14,2) default 0,
  raw_material_cost numeric(14,2) default 0, packaging_cost numeric(14,2) default 0,
  consumable_cost numeric(14,2) default 0, labor_cost numeric(14,2) default 0,
  overhead_cost numeric(14,2) default 0, machine_cost numeric(14,2) default 0,
  utility_cost numeric(14,2) default 0, cost_per_unit numeric(14,2) default 0,
  suggested_selling_price numeric(14,2) default 0, gross_margin numeric(14,2) default 0,
  quality_status text default 'pending', produced_by uuid references public.profiles(id),
  produced_at timestamptz not null default now(), immutable boolean default true
);
create table if not exists public.bom_version_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bom_id uuid not null references public.bill_of_materials(id) on delete cascade,
  version text not null, action text not null, user_name text,
  timestamp timestamptz not null default now(), item_count integer default 0
);

create table if not exists public.quality_control_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  production_job_id uuid references public.production_jobs(id),
  batch_no text, product_name text, inspector uuid references public.profiles(id),
  checks jsonb default '[]', status text default 'Pending', notes text,
  date date default current_date, created_at timestamptz not null default now()
);

create table if not exists public.waste_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  production_job_id uuid references public.production_jobs(id),
  batch_no text, order_no text, product_name text, expected_waste numeric(14,3) default 0,
  actual_waste numeric(14,3) default 0, yield_percent numeric(14,2) default 0,
  loss_percent numeric(14,2) default 0, scrap_materials numeric(14,3) default 0,
  recovered_materials numeric(14,3) default 0, recorded_by uuid references public.profiles(id),
  date date default current_date, created_at timestamptz not null default now()
);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  transaction_type text not null, product_name text, batch_no text,
  quantity numeric(14,3) default 0, unit text, warehouse text, reference text,
  date date default current_date, created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_raw_materials_tenant on public.raw_materials (tenant_id, status);
create index if not exists idx_bom_product on public.bill_of_materials (tenant_id, product_id);
create index if not exists idx_material_consumption_job on public.material_consumption (tenant_id, production_job_id);
create index if not exists idx_production_output_job on public.production_output (tenant_id, production_job_id);

-- ============================================================
-- MIGRATION 002 - Accounts / Reports / Analytics
-- ============================================================
create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_no text not null, customer_id uuid references public.customers(id),
  customer_name text not null, customer_email text, customer_phone text, customer_address text,
  contact_person text, subtotal numeric(14,2) default 0, tax_rate numeric(5,2) default 16,
  tax numeric(14,2) default 0, discount numeric(14,2) default 0, shipping numeric(14,2) default 0,
  total numeric(14,2) default 0, valid_until date, terms text, notes text,
  status text not null default 'Draft', created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  converted_to_sale_id uuid references public.sales_orders(id), invoice_id uuid references public.invoices(id),
  unique (tenant_id, quote_no)
);
create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  product_id uuid references public.products(id), product_name text not null, description text,
  quantity numeric(14,3) not null default 1, unit_price numeric(14,2) not null default 0,
  discount numeric(14,2) default 0, line_total numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.quotation_audit_trail (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  action text not null, user_id uuid references public.profiles(id), user_name text,
  timestamp timestamptz not null default now(), old_value text, new_value text, notes text, ip_address text
);
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_no text not null, date date not null default current_date,
  invoice_id uuid references public.invoices(id), customer_id uuid references public.customers(id),
  customer_name text, amount numeric(14,2) not null default 0, method text not null default 'Cash',
  bank_account text, reference text, cashier uuid references public.profiles(id), cashier_name text,
  notes text, status text not null default 'Completed',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, payment_no)
);
create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount_allocated numeric(14,2) not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.customer_overpayments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  payment_id uuid references public.payments(id), amount numeric(14,2) not null default 0,
  status text not null default 'Available', notes text, created_at timestamptz not null default now()
);
create table if not exists public.audit_trail (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source text not null default 'System', type text not null default 'System',
  module text not null, action text not null, user_id uuid references public.profiles(id),
  user_name text, entity_type text, entity_id uuid, old_value text, new_value text,
  details text, ip_address text, created_at timestamptz not null default now()
);
create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  credit_no text not null, customer_id uuid references public.customers(id), customer_name text,
  invoice_id uuid references public.invoices(id), amount numeric(14,2) not null default 0,
  reason text, status text not null default 'Draft', created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, credit_no)
);
create table if not exists public.quotation_pdfs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  file_name text, file_url text, generated_at timestamptz not null default now(),
  generated_by uuid references public.profiles(id)
);
create table if not exists public.customer_statements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  statement_date date not null default current_date, opening_balance numeric(14,2) default 0,
  closing_balance numeric(14,2) default 0, total_invoiced numeric(14,2) default 0,
  total_paid numeric(14,2) default 0, total_credits numeric(14,2) default 0,
  pdf_url text, generated_at timestamptz not null default now(), generated_by uuid references public.profiles(id)
);
create table if not exists public.customer_statement_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  statement_id uuid not null references public.customer_statements(id) on delete cascade,
  line_date date, line_type text not null, reference text, description text,
  debit numeric(14,2) default 0, credit numeric(14,2) default 0, balance numeric(14,2) default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_quotations_customer on public.quotations (tenant_id, customer_id);
create index if not exists idx_payments_tenant on public.payments (tenant_id, date);
create index if not exists idx_audit_trail_tenant on public.audit_trail (tenant_id, created_at);
create index if not exists idx_credit_notes_customer on public.credit_notes (tenant_id, customer_id);
create index if not exists idx_customer_statements_customer on public.customer_statements (tenant_id, customer_id);
-- ============================================================
-- MIGRATION 003 - full module interconnect tables
-- ============================================================
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade,
  name text not null, code text, manager text, location text, budget numeric(14,2) default 0,
  headcount integer default 0, status text default 'active', updated_at timestamptz default now()
);
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade,
  employee_no text, name text not null, email text, phone text, department text, position text,
  pay_type text default 'Salary', salary numeric(14,2) default 0, hourly_rate numeric(14,2) default 0,
  leave_annual numeric(8,2) default 21, leave_sick numeric(8,2) default 10, leave_casual numeric(8,2) default 5,
  status text default 'active', updated_at timestamptz default now()
);
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade,
  employee_id uuid, employee_name text, attendance_date date, check_in text, check_out text,
  status text default 'present', hours numeric(8,2) default 0, note text, created_at timestamptz default now()
);
create table if not exists public.leave_applications (
  id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade,
  applicant_id uuid, applicant_email text, applicant_name text, department text, leave_type text,
  start_date date, end_date date, days numeric(8,2) default 0, reason text, covering_employee text,
  status text default 'pending', decided_by text, decision_note text, applied_at timestamptz, decided_at timestamptz
);
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade,
  delivery_no text, sale_id uuid, sale_no text, customer_name text, status text default 'pending',
  driver text, vehicle text, destination text, delivered_confirmed boolean default false,
  delivery_date date, created_at timestamptz default now()
);
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade,
  name text, company text, stage text default 'New', value numeric(14,2) default 0,
  owner text, status text default 'open', created_at timestamptz default now()
);
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade,
  expense_no text, category text, description text, amount numeric(14,2) default 0,
  payment_method text, status text default 'posted', expense_date date, created_at timestamptz default now()
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade,
  category text, priority text, title text, message text, source_module text, source_id text,
  status text default 'active', is_read boolean default false, created_at timestamptz default now()
);
create table if not exists public.requisitions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade,
  req_no text, module text, title text, status text default 'pending', requested_by text,
  amount numeric(14,2) default 0, created_at timestamptz default now()
);

create index if not exists idx_employees_tenant_dept on public.employees (tenant_id, department);
create index if not exists idx_leave_tenant_status on public.leave_applications (tenant_id, status);
create index if not exists idx_notifications_tenant on public.notifications (tenant_id, created_at desc);

-- ============================================================
-- OPTIONAL: seed one tenant (needed because several FKs are on
-- public.tenants.id). Safe to re-run (ON CONFLICT DO NOTHING).
-- ============================================================
insert into public.tenants (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Farmtrack Biosciences Ltd')
on conflict do nothing;

-- ============================================================
-- DONE. You can now run 004-security-rls.sql and 007-accounts-finance-upgrade.sql.
-- ============================================================
