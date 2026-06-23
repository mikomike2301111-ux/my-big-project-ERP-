-- Unity/Farmtrack ERP normalized core.
-- Run this in the Supabase SQL Editor for project qiwggxoaqeptdqzpwgft.
-- It matches api/rpc.js normalized sync and unlocks full table-by-table persistence.

create extension if not exists pgcrypto;

create table if not exists public.erp_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  country text default 'KE',
  base_currency text default 'KES',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'viewer',
  phone text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  type text default 'main',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_no text not null,
  name text not null,
  email text,
  phone text,
  city text,
  type text default 'Farm',
  tax_id text,
  credit_limit numeric(14,2) default 0,
  balance numeric(14,2) default 0,
  health_score numeric(5,2) default 100,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, customer_no)
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_no text not null,
  name text not null,
  email text,
  phone text,
  category text,
  payment_terms text default 'Net 30',
  on_time_rate numeric(5,2) default 0,
  delivery_rate numeric(5,2) default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, supplier_no)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sku text not null,
  name text not null,
  category text,
  type text not null default 'finished_good',
  unit text not null default 'unit',
  cost_price numeric(14,2) default 0,
  selling_price numeric(14,2) default 0,
  tax_rate numeric(5,2) default 16,
  min_stock numeric(14,3) default 0,
  reorder_qty numeric(14,3) default 0,
  valuation_method text default 'FIFO',
  is_manufactured boolean default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid references public.products(id),
  warehouse_id uuid references public.warehouses(id),
  sku text,
  product_name text not null,
  category text,
  batch_no text,
  quantity_available numeric(14,3) not null default 0,
  quantity_reserved numeric(14,3) not null default 0,
  quantity_incoming numeric(14,3) not null default 0,
  quantity_outgoing numeric(14,3) not null default 0,
  reorder_level numeric(14,3) not null default 0,
  reorder_point numeric(14,3) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  selling_price numeric(14,2) not null default 0,
  valuation_method text not null default 'FIFO',
  expiry_date date,
  last_movement_at timestamptz,
  status text not null default 'in_stock',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete cascade,
  product_id uuid references public.products(id),
  warehouse_id uuid references public.warehouses(id),
  transaction_type text not null,
  quantity numeric(14,3) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_no text not null,
  customer_id uuid not null references public.customers(id),
  status text not null default 'draft',
  subtotal numeric(14,2) default 0,
  tax numeric(14,2) default 0,
  total numeric(14,2) default 0,
  paid numeric(14,2) default 0,
  balance numeric(14,2) default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, order_no)
);

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(14,3) not null,
  reserved_quantity numeric(14,3) default 0,
  unit_price numeric(14,2) not null,
  unit_cost numeric(14,2) default 0,
  total numeric(14,2) generated always as (quantity * unit_price) stored
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_no text not null,
  customer_id uuid not null references public.customers(id),
  sales_order_id uuid references public.sales_orders(id),
  status text not null default 'unpaid',
  subtotal numeric(14,2) default 0,
  tax numeric(14,2) default 0,
  total numeric(14,2) default 0,
  paid numeric(14,2) default 0,
  balance numeric(14,2) default 0,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, invoice_no)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_no text not null,
  customer_id uuid references public.customers(id),
  invoice_id uuid references public.invoices(id),
  amount numeric(14,2) not null,
  method text default 'cash',
  status text default 'completed',
  created_at timestamptz not null default now(),
  unique (tenant_id, payment_no)
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  po_no text not null,
  supplier_id uuid references public.suppliers(id),
  status text not null default 'draft',
  subtotal numeric(14,2) default 0,
  tax numeric(14,2) default 0,
  total numeric(14,2) default 0,
  expected_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, po_no)
);

create table if not exists public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_no text not null,
  product_id uuid not null references public.products(id),
  planned_qty numeric(14,3) not null,
  completed_qty numeric(14,3) default 0,
  wastage_qty numeric(14,3) default 0,
  status text default 'pending',
  material_cost numeric(14,2) default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, job_no)
);

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('Asset','Liability','Equity','Revenue','Expense')),
  parent text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journal_no text not null,
  journal_date date not null default current_date,
  description text not null,
  source_module text,
  reference text,
  total_debit numeric(14,2) not null default 0,
  total_credit numeric(14,2) not null default 0,
  approval_status text not null default 'posted',
  posted_by uuid references public.profiles(id),
  immutable boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, journal_no),
  check (total_debit = total_credit)
);

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid references public.finance_accounts(id),
  account_code text not null,
  account_name text not null,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  source_module text,
  reference text,
  line_date date not null default current_date,
  created_at timestamptz not null default now(),
  check (debit >= 0 and credit >= 0),
  check (debit > 0 or credit > 0)
);

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_name text not null,
  bank text,
  account_number text,
  currency text not null default 'KES',
  opening_balance numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bank_account_id uuid references public.bank_accounts(id),
  transaction_date date not null default current_date,
  account_name text not null,
  reference text,
  description text,
  deposit numeric(14,2) not null default 0,
  withdrawal numeric(14,2) not null default 0,
  reconciled boolean not null default false,
  created_at timestamptz not null default now(),
  check (deposit >= 0 and withdrawal >= 0),
  check (deposit > 0 or withdrawal > 0)
);

create table if not exists public.accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid references public.invoices(id),
  invoice_no text,
  customer_name text not null,
  due_date date,
  total numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,
  aging_bucket text,
  risk text,
  status text not null default 'open',
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_no text,
  supplier_name text not null,
  due_date date,
  invoice_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  outstanding_balance numeric(14,2) not null default 0,
  aging_bucket text,
  risk text,
  payment_status text not null default 'open',
  updated_at timestamptz not null default now()
);

create table if not exists public.spreadsheet_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  provider text not null default 'Google Sheets',
  spreadsheet_id text,
  workbook_name text,
  default_sheet text not null default 'ERP Export',
  sync_direction text not null default 'Export Only',
  modules jsonb not null default '[]'::jsonb,
  status text not null default 'ready',
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spreadsheet_sync_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid references public.spreadsheet_connections(id) on delete set null,
  module text not null,
  sheet_name text,
  direction text not null default 'Export',
  rows_processed integer not null default 0,
  status text not null default 'generated',
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.business_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  actor_id uuid references public.profiles(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_customers_tenant_status on public.customers (tenant_id, status);
create index if not exists idx_products_tenant_status on public.products (tenant_id, status);
create index if not exists idx_inventory_items_tenant_product on public.inventory_items (tenant_id, product_id);
create index if not exists idx_sales_orders_tenant_created on public.sales_orders (tenant_id, created_at desc);
create index if not exists idx_invoices_tenant_status on public.invoices (tenant_id, status);
create index if not exists idx_finance_accounts_tenant_type on public.finance_accounts (tenant_id, type);
create index if not exists idx_journal_entries_tenant_date on public.journal_entries (tenant_id, journal_date desc);
create index if not exists idx_journal_lines_tenant_account on public.journal_lines (tenant_id, account_code, line_date desc);
create index if not exists idx_bank_transactions_tenant_date on public.bank_transactions (tenant_id, transaction_date desc);
create index if not exists idx_accounts_receivable_tenant_status on public.accounts_receivable (tenant_id, status);
create index if not exists idx_accounts_payable_tenant_status on public.accounts_payable (tenant_id, payment_status);
create index if not exists idx_spreadsheet_connections_tenant_status on public.spreadsheet_connections (tenant_id, status);
create index if not exists idx_spreadsheet_sync_logs_tenant_created on public.spreadsheet_sync_logs (tenant_id, created_at desc);

create or replace view public.analytics_revenue_summary as
select tenant_id,
       date_trunc('month', created_at)::date as period,
       coalesce(sum(total), 0) as net_revenue,
       coalesce(sum(tax), 0) as tax,
       coalesce(sum(balance), 0) as receivables,
       count(*) as order_count
from public.sales_orders
group by tenant_id, date_trunc('month', created_at)::date;

create or replace view public.analytics_inventory_health as
select tenant_id,
       product_id,
       product_name,
       coalesce(sum(quantity_available), 0) as available_qty,
       coalesce(sum(quantity_available * unit_cost), 0) as inventory_value,
       min(status) as status
from public.inventory_items
group by tenant_id, product_id, product_name;

create or replace view public.analytics_customer_value as
select c.tenant_id,
       c.id as customer_id,
       c.name,
       coalesce(sum(so.total), 0) as lifetime_value,
       coalesce(sum(so.balance), 0) as open_balance,
       count(so.id) as orders
from public.customers c
left join public.sales_orders so on so.tenant_id = c.tenant_id and so.customer_id = c.id
group by c.tenant_id, c.id, c.name;

create or replace view public.analytics_procurement_metrics as
select tenant_id,
       supplier_id,
       count(*) as purchase_orders,
       coalesce(sum(total), 0) as spend,
       min(status) as status
from public.purchase_orders
group by tenant_id, supplier_id;

create or replace view public.analytics_accounts_summary as
select tenant_id,
       coalesce(sum(case when total_debit = total_credit then total_debit else 0 end), 0) as posted_value,
       count(*) as journal_count,
       count(*) filter (where immutable is true) as immutable_journals,
       count(*) filter (where total_debit <> total_credit) as unbalanced_journals
from public.journal_entries
group by tenant_id;

create or replace view public.analytics_trial_balance as
select tenant_id,
       account_code,
       account_name,
       coalesce(sum(debit), 0) as debit,
       coalesce(sum(credit), 0) as credit,
       coalesce(sum(debit - credit), 0) as balance
from public.journal_lines
group by tenant_id, account_code, account_name;

create or replace view public.analytics_cash_position as
select tenant_id,
       coalesce(sum(balance), 0) as cash_balance,
       count(*) as bank_accounts
from public.bank_accounts
group by tenant_id;

create or replace view public.analytics_ar_ap_risk as
select tenant_id,
       coalesce(sum(balance), 0) as receivables,
       0::numeric as payables,
       count(*) filter (where balance > 0) as open_items,
       'receivable'::text as side
from public.accounts_receivable
group by tenant_id
union all
select tenant_id,
       0::numeric as receivables,
       coalesce(sum(outstanding_balance), 0) as payables,
       count(*) filter (where outstanding_balance > 0) as open_items,
       'payable'::text as side
from public.accounts_payable
group by tenant_id;

create or replace view public.analytics_spreadsheet_sync as
select c.tenant_id,
       c.provider,
       c.status as connection_status,
       count(l.id) as sync_runs,
       coalesce(sum(l.rows_processed), 0) as rows_processed,
       max(l.created_at) as last_sync_at
from public.spreadsheet_connections c
left join public.spreadsheet_sync_logs l on l.tenant_id = c.tenant_id and l.connection_id = c.id
group by c.tenant_id, c.provider, c.status;

create or replace view public.analytics_production_metrics as
select tenant_id,
       product_id,
       count(*) as jobs,
       coalesce(sum(planned_qty), 0) as planned_qty,
       coalesce(sum(completed_qty), 0) as completed_qty,
       coalesce(sum(wastage_qty), 0) as wastage_qty,
       coalesce(sum(material_cost), 0) as material_cost,
       min(status) as status
from public.production_jobs
group by tenant_id, product_id;

create or replace view public.analytics_risk_center as
select tenant_id, 'receivables' as risk_type, count(*) as risk_count, coalesce(sum(balance), 0) as exposure
from public.invoices
where balance > 0
group by tenant_id
union all
select tenant_id, 'low_inventory' as risk_type, count(*) as risk_count, coalesce(sum(reorder_point - quantity_available), 0) as exposure
from public.inventory_items
where quantity_available <= reorder_point
group by tenant_id;

create or replace view public.analytics_executive_summary as
select t.id as tenant_id,
       coalesce((select sum(total) from public.sales_orders so where so.tenant_id = t.id), 0) as revenue,
       coalesce((select sum(balance) from public.invoices i where i.tenant_id = t.id), 0) as receivables,
       coalesce((select sum(quantity_available * unit_cost) from public.inventory_items ii where ii.tenant_id = t.id), 0) as inventory_value,
       coalesce((select count(*) from public.customers c where c.tenant_id = t.id), 0) as customers,
       coalesce((select count(*) from public.sales_orders so where so.tenant_id = t.id), 0) as orders
from public.tenants t;

do $$
declare
  table_name text;
  tables text[] := array[
    'erp_state','tenants','profiles','warehouses','customers','suppliers','products',
    'inventory_items','inventory_transactions','sales_orders','sales_order_items',
    'invoices','payments','purchase_orders','production_jobs','finance_accounts',
    'journal_entries','journal_lines','bank_accounts','bank_transactions',
    'accounts_receivable','accounts_payable','spreadsheet_connections',
    'spreadsheet_sync_logs','business_events'
  ];
begin
  foreach table_name in array tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "Service role can manage %I" on public.%I', table_name, table_name);
    execute format('create policy "Service role can manage %I" on public.%I for all to service_role using (true) with check (true)', table_name, table_name);
  end loop;
end $$;
