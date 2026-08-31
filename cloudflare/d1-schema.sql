-- ============================================================
-- CLOUDFLARE D1 SCHEMA — Farmtrack/Unity ERP
-- SQLite dialect (D1). Mirrors the Supabase normalized schema.
-- Apply via:  npx wrangler d1 execute <DB_NAME> --remote --file=cloudflare/d1-schema.sql
-- ============================================================

-- Single JSON-bridge document (equivalent of Supabase erp_state row)
create table if not exists erp_state (
  id text primary key,
  data text not null,
  updated_at text not null default (datetime('now'))
);

create table if not exists tenants (
  id text primary key,
  name text not null default 'Farmtrack Biosciences Ltd',
  created_at text not null default (datetime('now'))
);

create table if not exists profiles (
  id text primary key,
  tenant_id text,
  full_name text,
  email text,
  role text default 'staff',
  created_at text not null default (datetime('now'))
);

create table if not exists products (
  id text primary key,
  tenant_id text,
  sku text,
  name text not null,
  category text,
  type text default 'product',
  unit text default 'unit',
  cost_price real default 0,
  selling_price real default 0,
  min_stock real default 0,
  is_manufactured integer default 0,
  status text default 'active',
  created_at text not null default (datetime('now'))
);

create table if not exists suppliers (
  id text primary key,
  tenant_id text,
  name text not null,
  phone text,
  email text,
  category text,
  status text default 'active',
  created_at text not null default (datetime('now'))
);

create table if not exists customers (
  id text primary key,
  tenant_id text,
  name text not null,
  phone text,
  email text,
  city text,
  address text,
  balance real default 0,
  status text default 'active',
  created_at text not null default (datetime('now'))
);

-- Accounts / Finance
create table if not exists finance_accounts (
  id text primary key,
  tenant_id text,
  code text,
  name text,
  type text,
  parent text,
  status text default 'active'
);

create table if not exists journal_entries (
  id text primary key,
  tenant_id text,
  journal_date text,
  reference text,
  description text,
  source_module text,
  status text default 'posted',
  created_at text not null default (datetime('now'))
);

create table if not exists journal_lines (
  id text primary key,
  tenant_id text,
  journal_entry_id text,
  account_id text,
  account_code text,
  account_name text,
  debit real default 0,
  credit real default 0,
  source_module text,
  reference text
);

create table if not exists invoices (
  id text primary key,
  tenant_id text,
  invoice_no text,
  customer_id text,
  customer_name text,
  invoice_date text,
  due_date text,
  subtotal real default 0,
  tax real default 0,
  total real default 0,
  paid real default 0,
  balance real default 0,
  status text default 'Pending',
  discount_mode text,
  round_to text,
  created_at text not null default (datetime('now'))
);

create table if not exists invoice_items (
  id text primary key,
  invoice_id text,
  product_id text,
  product_name text,
  quantity real default 1,
  unit_price real default 0,
  discount real default 0,
  total real default 0
);
create table if not exists payments (
  id text primary key,
  tenant_id text,
  payment_no text,
  date text,
  invoice_id text,
  customer_id text,
  customer_name text,
  amount real default 0,
  method text default 'Cash',
  status text default 'Completed',
  created_at text not null default (datetime('now'))
);

create table if not exists credit_notes (
  id text primary key,
  tenant_id text,
  credit_no text,
  customer_id text,
  customer_name text,
  invoice_id text,
  amount real default 0,
  reason text,
  status text default 'Draft',
  created_at text not null default (datetime('now'))
);

create table if not exists quotations (
  id text primary key,
  tenant_id text,
  quote_no text,
  customer_id text,
  customer_name text,
  total real default 0,
  status text default 'Draft',
  valid_until text,
  created_at text not null default (datetime('now'))
);

create table if not exists audit_trail (
  id text primary key,
  tenant_id text,
  module text,
  action text,
  user_id text,
  user_name text,
  entity_type text,
  entity_id text,
  details text,
  created_at text not null default (datetime('now'))
);

-- Inventory + Raw Materials
create table if not exists inventory (
  id text primary key,
  tenant_id text,
  product_id text,
  product_name text,
  sku text,
  warehouse_name text,
  quantity real default 0,
  unit_cost real default 0,
  status text default 'Active',
  created_at text not null default (datetime('now'))
);

create table if not exists inventory_transactions (
  id text primary key,
  tenant_id text,
  product_id text,
  product_name text,
  warehouse_name text,
  transaction_type text,
  quantity real default 0,
  unit_cost real default 0,
  reference_type text,
  reference_id text,
  created_by text,
  created_at text not null default (datetime('now'))
);

create table if not exists raw_materials_inventory (
  id text primary key,
  tenant_id text,
  name text not null,
  sku text unique,
  description text,
  category text default 'Raw Material',
  unit_of_measure text,
  quantity_on_hand real default 0,
  minimum_stock_level real default 0,
  maximum_stock_level real,
  unit_cost real,
  total_value real default 0,
  status text default 'IN STOCK',
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists raw_material_movements (
  id text primary key,
  material_id text,
  material_name text,
  sku text,
  transaction_type text,
  quantity real default 0,
  before_quantity real default 0,
  after_quantity real default 0,
  unit_of_measure text,
  reference text,
  notes text,
  user_name text,
  transaction_date text,
  created_at text not null default (datetime('now'))
);
-- Manufacturing
create table if not exists production_jobs (
  id text primary key,
  tenant_id text,
  job_no text,
  product_id text,
  product_name text,
  planned_qty real default 0,
  completed_qty real default 0,
  wastage_qty real default 0,
  status text default 'pending',
  output_unit text default 'BAG',
  operator text,
  warehouse text default 'Njiru Store',
  start_date text,
  end_date text,
  created_at text not null default (datetime('now'))
);

create table if not exists production_batches (
  id text primary key,
  tenant_id text,
  batch_no text,
  production_order_id text,
  order_no text,
  product_name text,
  quantity_produced real default 0,
  waste_quantity real default 0,
  total_cost real default 0,
  cost_per_unit real default 0,
  status text default 'completed',
  production_date text,
  created_at text not null default (datetime('now'))
);

create table if not exists raw_material_consumption (
  id text primary key,
  tenant_id text,
  material_id text,
  material_name text,
  production_order text,
  quantity_consumed real default 0,
  unit text,
  cost_consumed real default 0,
  consumption_date text,
  operator text,
  created_at text not null default (datetime('now'))
);

-- HR / Org
create table if not exists departments (
  id text primary key,
  tenant_id text,
  name text not null,
  code text,
  manager text,
  location text,
  headcount integer default 0,
  status text default 'active'
);

create table if not exists employees (
  id text primary key,
  tenant_id text,
  employee_no text,
  name text not null,
  email text,
  phone text,
  department text,
  position text,
  pay_type text default 'Salary',
  salary real default 0,
  leave_annual real default 21,
  status text default 'active',
  updated_at text not null default (datetime('now'))
);

create table if not exists attendance (
  id text primary key,
  tenant_id text,
  employee_id text,
  employee_name text,
  attendance_date text,
  check_in text,
  check_out text,
  status text default 'present',
  hours real default 0,
  note text,
  created_at text not null default (datetime('now'))
);

create table if not exists leave_applications (
  id text primary key,
  tenant_id text,
  applicant_id text,
  applicant_name text,
  department text,
  leave_type text,
  start_date text,
  end_date text,
  days real default 0,
  reason text,
  status text default 'pending',
  applied_at text,
  decided_at text
);
-- CRM / Sales / Procurement
create table if not exists leads (
  id text primary key,
  tenant_id text,
  name text,
  company text,
  stage text default 'New',
  value real default 0,
  owner text,
  status text default 'open',
  created_at text not null default (datetime('now'))
);

create table if not exists calls (
  id text primary key,
  tenant_id text,
  customer_id text,
  customer_name text,
  phone text,
  stage text,
  record_type text,
  follow_up_date text,
  assigned_to text,
  notes text,
  date text,
  created_at text not null default (datetime('now'))
);

create table if not exists sales_orders (
  id text primary key,
  tenant_id text,
  so_no text,
  customer_id text,
  customer_name text,
  total real default 0,
  status text default 'Open',
  created_at text not null default (datetime('now'))
);

create table if not exists deliveries (
  id text primary key,
  tenant_id text,
  delivery_no text,
  sale_id text,
  sale_no text,
  customer_name text,
  status text default 'pending',
  driver text,
  vehicle text,
  destination text,
  delivery_date text,
  created_at text not null default (datetime('now'))
);

create table if not exists purchase_orders (
  id text primary key,
  tenant_id text,
  po_no text,
  supplier_name text,
  total real default 0,
  status text default 'Draft',
  channel text,
  notes text,
  created_at text not null default (datetime('now'))
);

create table if not exists expenses (
  id text primary key,
  tenant_id text,
  expense_no text,
  category text,
  description text,
  amount real default 0,
  payment_method text,
  status text default 'posted',
  expense_date text,
  created_at text not null default (datetime('now'))
);

create table if not exists requisitions (
  id text primary key,
  tenant_id text,
  req_no text,
  module text,
  title text,
  status text default 'pending',
  requested_by text,
  amount real default 0,
  created_at text not null default (datetime('now'))
);

create table if not exists notifications (
  id text primary key,
  tenant_id text,
  category text,
  priority text,
  title text,
  message text,
  source_module text,
  source_id text,
  status text default 'active',
  is_read integer default 0,
  created_at text not null default (datetime('now'))
);

-- Indexes
create index if not exists idx_erp_state_id on erp_state(id);
create index if not exists idx_invoices_tenant_status on invoices (tenant_id, status);
create index if not exists idx_payments_tenant on payments (tenant_id, date);
create index if not exists idx_customers_tenant on customers (tenant_id, name);
create index if not exists idx_products_tenant on products (tenant_id, category);
create index if not exists idx_journal_lines_entry on journal_lines (journal_entry_id);
create index if not exists idx_rmi_sku on raw_materials_inventory (sku);
create index if not exists idx_rmm_material on raw_material_movements (material_id, transaction_date);
create index if not exists idx_attendance_date on attendance (employee_id, attendance_date);
create index if not exists idx_production_jobs_tenant on production_jobs (tenant_id, status);

insert into tenants (id, name) values ('00000000-0000-0000-0000-000000000001', 'Farmtrack Biosciences Ltd')
on conflict (id) do nothing;
