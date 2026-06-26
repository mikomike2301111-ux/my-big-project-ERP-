-- Farmtrack ERP Enterprise - Supabase foundation schema
-- Run this in Supabase SQL Editor.
-- It keeps the current Vercel demo bridge table, then adds a real connected ERP core.

create extension if not exists pgcrypto;

-- Current Vercel bridge. The deployed app can persist the demo state here.
create table if not exists public.erp_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.erp_state enable row level security;

drop policy if exists "Service role can manage ERP state" on public.erp_state;
create policy "Service role can manage ERP state"
on public.erp_state
for all
to service_role
using (true)
with check (true);

-- Multi-tenant core
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
  auth_user_id uuid unique,
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

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  city text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id),
  name text not null,
  code text not null,
  type text default 'main',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

-- Event bus: every business action writes here.
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

create index if not exists idx_business_events_tenant_created on public.business_events (tenant_id, created_at desc);
create index if not exists idx_business_events_type on public.business_events (tenant_id, event_type, created_at desc);

-- Dashboard preferences only. The dashboard reads business data from source tables.
create table if not exists public.dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  widget_key text not null,
  title text not null,
  source_tables text[] not null default '{}',
  default_config jsonb not null default '{}'::jsonb,
  required_role text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (tenant_id, widget_key)
);

create table if not exists public.dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role text not null,
  layout_name text not null default 'Executive Command Center',
  layout jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, role, layout_name)
);

create table if not exists public.dashboard_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  dashboard_layout_id uuid references public.dashboard_layouts(id) on delete set null,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, profile_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  table_name text not null,
  record_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_tenant_created on public.audit_logs (tenant_id, created_at desc);

-- CRM single source of truth
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

create index if not exists idx_customers_tenant_status on public.customers (tenant_id, status);
create index if not exists idx_customers_search on public.customers using gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,'')));

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id),
  name text not null,
  company text,
  email text,
  phone text,
  source text,
  stage text not null default 'new',
  estimated_value numeric(14,2) default 0,
  assigned_to uuid references public.profiles(id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_tenant_stage on public.leads (tenant_id, stage, status);

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

-- Product and inventory engine
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

create index if not exists idx_products_tenant_status on public.products (tenant_id, status);
create index if not exists idx_products_search on public.products using gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(sku,'')));

create table if not exists public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id),
  warehouse_id uuid not null references public.warehouses(id),
  batch_no text,
  quantity_on_hand numeric(14,3) not null default 0,
  quantity_reserved numeric(14,3) not null default 0,
  unit_cost numeric(14,2) default 0,
  expiry_date date,
  received_date date default current_date,
  status text not null default 'in_stock',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_lots_product on public.inventory_lots (tenant_id, product_id, warehouse_id);
create index if not exists idx_inventory_lots_expiry on public.inventory_lots (tenant_id, expiry_date);

create or replace view public.inventory_availability as
select
  il.tenant_id,
  il.product_id,
  p.sku,
  p.name as product_name,
  sum(il.quantity_on_hand) as quantity_on_hand,
  sum(il.quantity_reserved) as quantity_reserved,
  sum(il.quantity_on_hand - il.quantity_reserved) as quantity_available,
  max(p.min_stock) as min_stock
from public.inventory_lots il
join public.products p on p.id = il.product_id
where il.status = 'in_stock'
group by il.tenant_id, il.product_id, p.sku, p.name;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id),
  warehouse_id uuid references public.warehouses(id),
  movement_type text not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2) default 0,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_movements_product_created on public.inventory_movements (tenant_id, product_id, created_at desc);

-- Sales flow: quotation -> sales order -> reservation -> delivery -> invoice -> payment
create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_no text not null,
  customer_id uuid not null references public.customers(id),
  status text not null default 'draft',
  subtotal numeric(14,2) default 0,
  tax numeric(14,2) default 0,
  total numeric(14,2) default 0,
  valid_until date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, quote_no)
);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_no text not null,
  customer_id uuid not null references public.customers(id),
  quotation_id uuid references public.quotations(id),
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

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  sales_order_item_id uuid not null references public.sales_order_items(id) on delete cascade,
  product_id uuid not null references public.products(id),
  warehouse_id uuid references public.warehouses(id),
  quantity numeric(14,3) not null,
  status text not null default 'reserved',
  created_at timestamptz not null default now()
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

-- Procurement and production automation
create table if not exists public.procurement_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_no text not null,
  product_id uuid not null references public.products(id),
  quantity_required numeric(14,3) not null,
  reason text not null,
  status text not null default 'draft',
  source_event_id uuid references public.business_events(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, request_no)
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

create table if not exists public.bills_of_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  finished_product_id uuid not null references public.products(id),
  name text not null,
  version text default 'v1',
  output_qty numeric(14,3) default 1,
  status text default 'active'
);

create table if not exists public.bill_of_material_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bom_id uuid not null references public.bills_of_materials(id) on delete cascade,
  component_product_id uuid not null references public.products(id),
  quantity numeric(14,3) not null
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

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  delivery_no text not null,
  customer_id uuid not null references public.customers(id),
  sales_order_id uuid references public.sales_orders(id),
  status text default 'pending',
  driver text,
  vehicle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, delivery_no)
);

-- Accounting traceability
create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null,
  status text default 'active',
  unique (tenant_id, code)
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entry_no text not null,
  source_event_id uuid references public.business_events(id),
  memo text,
  posted_at timestamptz not null default now(),
  unique (tenant_id, entry_no)
);

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts(id),
  debit numeric(14,2) default 0,
  credit numeric(14,2) default 0
);

-- Deterministic event automation.
create or replace function public.record_business_event(
  p_tenant_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_actor_id uuid default null,
  p_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
as $$
declare
  v_event_id uuid;
begin
  insert into public.business_events (tenant_id, event_type, entity_type, entity_id, actor_id, payload)
  values (p_tenant_id, p_event_type, p_entity_type, p_entity_id, p_actor_id, coalesce(p_payload, '{}'::jsonb))
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.reserve_inventory_for_order(p_sales_order_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_order public.sales_orders%rowtype;
  v_item record;
  v_available numeric(14,3);
  v_event_id uuid;
  v_product public.products%rowtype;
begin
  select * into v_order from public.sales_orders where id = p_sales_order_id;
  if not found then
    raise exception 'Sales order not found: %', p_sales_order_id;
  end if;

  v_event_id := public.record_business_event(v_order.tenant_id, 'SalesOrderCreated', 'sales_order', v_order.id, v_order.created_by, to_jsonb(v_order));

  for v_item in
    select * from public.sales_order_items where sales_order_id = p_sales_order_id
  loop
    select coalesce(sum(quantity_on_hand - quantity_reserved), 0)
      into v_available
      from public.inventory_lots
      where tenant_id = v_item.tenant_id
        and product_id = v_item.product_id
        and status = 'in_stock';

    select * into v_product from public.products where id = v_item.product_id;

    if v_available >= v_item.quantity then
      update public.inventory_lots
      set quantity_reserved = quantity_reserved + v_item.quantity,
          updated_at = now()
      where id = (
        select id
        from public.inventory_lots
        where tenant_id = v_item.tenant_id
          and product_id = v_item.product_id
          and status = 'in_stock'
          and quantity_on_hand - quantity_reserved >= v_item.quantity
        order by expiry_date nulls last, received_date
        limit 1
      );

      insert into public.inventory_reservations (
        tenant_id, sales_order_id, sales_order_item_id, product_id, quantity
      ) values (
        v_item.tenant_id, p_sales_order_id, v_item.id, v_item.product_id, v_item.quantity
      );

      perform public.record_business_event(v_item.tenant_id, 'InventoryReserved', 'sales_order_item', v_item.id, v_order.created_by, to_jsonb(v_item));
    else
      if v_product.is_manufactured then
        insert into public.production_jobs (tenant_id, job_no, product_id, planned_qty, status, source_event_id)
        values (v_item.tenant_id, 'PJ-' || extract(epoch from now())::bigint || '-' || left(v_item.id::text, 4), v_item.product_id, v_item.quantity - v_available, 'pending', v_event_id);

        perform public.record_business_event(v_item.tenant_id, 'ProductionRequired', 'product', v_item.product_id, v_order.created_by, jsonb_build_object('shortage', v_item.quantity - v_available));
      else
        insert into public.procurement_requests (tenant_id, request_no, product_id, quantity_required, reason, status, source_event_id)
        values (v_item.tenant_id, 'PR-' || extract(epoch from now())::bigint || '-' || left(v_item.id::text, 4), v_item.product_id, v_item.quantity - v_available, 'Sales order shortage', 'draft', v_event_id);

        perform public.record_business_event(v_item.tenant_id, 'ProcurementRequired', 'product', v_item.product_id, v_order.created_by, jsonb_build_object('shortage', v_item.quantity - v_available));
      end if;
    end if;

    if (v_available - v_item.quantity) <= v_product.min_stock then
      perform public.record_business_event(v_item.tenant_id, 'InventoryLow', 'product', v_item.product_id, v_order.created_by, jsonb_build_object('available_after_order', v_available - v_item.quantity, 'min_stock', v_product.min_stock));
    end if;
  end loop;
end;
$$;

-- Dashboard aggregate view. Use this instead of recalculating large sales tables on every page load.
create or replace view public.dashboard_sales_monthly as
select
  tenant_id,
  date_trunc('month', created_at)::date as month,
  count(*) as orders,
  sum(total) as revenue,
  sum(paid) as collected,
  sum(balance) as outstanding
from public.sales_orders
group by tenant_id, date_trunc('month', created_at)::date;

-- GeoSales territory-management foundation for Kenya-wide field sales.
create table if not exists public.counties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  region text,
  latitude numeric(10,6),
  longitude numeric(10,6),
  potential_customers integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.sub_counties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  county_id uuid not null references public.counties(id) on delete cascade,
  name text not null,
  latitude numeric(10,6),
  longitude numeric(10,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, county_id, name)
);

create table if not exists public.territory_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  county_id uuid not null references public.counties(id) on delete cascade,
  sales_rep_id uuid references public.profiles(id),
  status text not null default 'active',
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, county_id, sales_rep_id)
);

create table if not exists public.sales_visits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sales_rep_id uuid references public.profiles(id),
  customer_id uuid references public.customers(id),
  county_id uuid references public.counties(id),
  sub_county_id uuid references public.sub_counties(id),
  location text,
  latitude numeric(10,6),
  longitude numeric(10,6),
  visit_date date not null default current_date,
  visit_start timestamptz,
  visit_end timestamptz,
  purpose text,
  outcome text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_checkins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sales_visit_id uuid not null references public.sales_visits(id) on delete cascade,
  sales_rep_id uuid references public.profiles(id),
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  check_in_latitude numeric(10,6),
  check_in_longitude numeric(10,6),
  check_out_latitude numeric(10,6),
  check_out_longitude numeric(10,6),
  duration_minutes integer,
  gps_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sales_rep_id uuid references public.profiles(id),
  route_date date not null default current_date,
  route_name text,
  counties jsonb not null default '[]'::jsonb,
  distance_km numeric(12,2) not null default 0,
  travel_cost numeric(14,2) not null default 0,
  revenue numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.county_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  county_id uuid not null references public.counties(id) on delete cascade,
  period date not null default date_trunc('month', current_date)::date,
  revenue_target numeric(14,2) not null default 0,
  visit_target integer not null default 0,
  customer_target integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, county_id, period)
);

create table if not exists public.territory_performance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  county_id uuid not null references public.counties(id) on delete cascade,
  period date not null default date_trunc('month', current_date)::date,
  revenue numeric(14,2) not null default 0,
  profit numeric(14,2) not null default 0,
  visits integer not null default 0,
  orders integer not null default 0,
  quotations integer not null default 0,
  pipeline numeric(14,2) not null default 0,
  coverage_score numeric(6,2) not null default 0,
  opportunity_score numeric(6,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, county_id, period)
);

create index if not exists idx_sales_visits_tenant_county_date on public.sales_visits (tenant_id, county_id, visit_date desc);
create index if not exists idx_sales_visits_tenant_rep_date on public.sales_visits (tenant_id, sales_rep_id, visit_date desc);
create index if not exists idx_sales_checkins_tenant_rep on public.sales_checkins (tenant_id, sales_rep_id, check_in_at desc);
create index if not exists idx_sales_routes_tenant_rep_date on public.sales_routes (tenant_id, sales_rep_id, route_date desc);

-- Analytics 2.0 foundation. These materialized views are intended for sub-second analytics at scale.
create schema if not exists analytics;

create materialized view if not exists analytics.materialized_revenue as
select
  so.tenant_id,
  date_trunc('month', so.created_at)::date as period,
  count(*) as orders,
  sum(so.subtotal) as gross_revenue,
  sum(so.tax) as tax,
  sum(so.total) as net_revenue,
  sum(so.paid) as collected,
  sum(so.balance) as outstanding
from public.sales_orders so
group by so.tenant_id, date_trunc('month', so.created_at)::date;

create unique index if not exists ux_materialized_revenue_tenant_period
on analytics.materialized_revenue (tenant_id, period);

create materialized view if not exists analytics.materialized_inventory as
select
  ia.tenant_id,
  ia.product_id,
  ia.sku,
  ia.product_name,
  ia.quantity_on_hand,
  ia.quantity_reserved,
  ia.quantity_available,
  ia.min_stock,
  case
    when ia.quantity_available <= 0 then 'dead'
    when ia.quantity_available <= ia.min_stock then 'low'
    when ia.quantity_available > ia.min_stock * 3 then 'overstock'
    else 'healthy'
  end as health_status
from public.inventory_availability ia;

create unique index if not exists ux_materialized_inventory_tenant_product
on analytics.materialized_inventory (tenant_id, product_id);

create materialized view if not exists analytics.materialized_customers as
select
  c.tenant_id,
  c.id as customer_id,
  c.name,
  c.city,
  c.type,
  coalesce(sum(so.total), 0) as lifetime_value,
  coalesce(sum(so.balance), 0) as outstanding,
  count(so.id) as orders,
  case
    when coalesce(sum(so.balance), 0) > coalesce(sum(so.total), 0) * 0.35 then 'critical'
    when count(so.id) = 0 then 'at_risk'
    else 'healthy'
  end as health
from public.customers c
left join public.sales_orders so on so.customer_id = c.id
group by c.tenant_id, c.id, c.name, c.city, c.type;

create unique index if not exists ux_materialized_customers_tenant_customer
on analytics.materialized_customers (tenant_id, customer_id);

create materialized view if not exists analytics.materialized_procurement as
select
  po.tenant_id,
  po.supplier_id,
  s.name as supplier_name,
  count(po.id) as purchase_orders,
  sum(po.total) as procurement_spend,
  avg(extract(day from coalesce(po.expected_date, current_date)::timestamp - po.created_at)) as avg_lead_time_days
from public.purchase_orders po
left join public.suppliers s on s.id = po.supplier_id
group by po.tenant_id, po.supplier_id, s.name;

create unique index if not exists ux_materialized_procurement_tenant_supplier
on analytics.materialized_procurement (tenant_id, supplier_id);

create materialized view if not exists analytics.materialized_production as
select
  pj.tenant_id,
  pj.product_id,
  p.name as product_name,
  count(*) as jobs,
  sum(pj.planned_qty) as planned_qty,
  sum(pj.completed_qty) as completed_qty,
  sum(pj.wastage_qty) as wastage_qty,
  sum(pj.material_cost) as material_cost,
  case when sum(pj.planned_qty) > 0 then round(sum(pj.completed_qty) / sum(pj.planned_qty) * 100, 2) else 0 end as yield_percent
from public.production_jobs pj
join public.products p on p.id = pj.product_id
group by pj.tenant_id, pj.product_id, p.name;

create unique index if not exists ux_materialized_production_tenant_product
on analytics.materialized_production (tenant_id, product_id);

create materialized view if not exists analytics.materialized_risks as
select
  tenant_id,
  'inventory_low' as risk_type,
  count(*) as risk_count,
  jsonb_agg(jsonb_build_object('product_id', product_id, 'product_name', product_name, 'available', quantity_available, 'min_stock', min_stock)) as records
from analytics.materialized_inventory
where health_status in ('low', 'dead')
group by tenant_id
union all
select
  tenant_id,
  'cash_outstanding' as risk_type,
  count(*) as risk_count,
  jsonb_agg(jsonb_build_object('invoice_id', id, 'invoice_no', invoice_no, 'balance', balance)) as records
from public.invoices
where balance > 0
group by tenant_id;

create index if not exists idx_materialized_risks_tenant_type
on analytics.materialized_risks (tenant_id, risk_type);

create materialized view if not exists analytics.materialized_executive as
select
  r.tenant_id,
  sum(r.net_revenue) as revenue,
  sum(r.collected) as collected,
  sum(r.outstanding) as outstanding,
  (select count(*) from analytics.materialized_inventory i where i.tenant_id = r.tenant_id and i.health_status = 'low') as low_inventory_items,
  (select count(*) from public.procurement_requests pr where pr.tenant_id = r.tenant_id and pr.status in ('draft','pending')) as procurement_requests,
  (select count(*) from public.production_jobs pj where pj.tenant_id = r.tenant_id and pj.status <> 'completed') as open_production_jobs
from analytics.materialized_revenue r
group by r.tenant_id;

create unique index if not exists ux_materialized_executive_tenant
on analytics.materialized_executive (tenant_id);

create materialized view if not exists analytics.mv_county_revenue as
select
  c.tenant_id,
  c.id as county_id,
  c.name as county,
  date_trunc('month', so.created_at)::date as period,
  count(distinct so.id) as orders,
  coalesce(sum(so.total), 0) as revenue,
  coalesce(sum(so.total - (soi.quantity * soi.unit_cost)), 0) as estimated_profit
from public.counties c
left join public.customers cu on cu.tenant_id = c.tenant_id and cu.city = c.name
left join public.sales_orders so on so.tenant_id = c.tenant_id and so.customer_id = cu.id
left join public.sales_order_items soi on soi.tenant_id = so.tenant_id and soi.sales_order_id = so.id
group by c.tenant_id, c.id, c.name, date_trunc('month', so.created_at)::date;

create unique index if not exists ux_mv_county_revenue_tenant_county_period
on analytics.mv_county_revenue (tenant_id, county_id, period);

create materialized view if not exists analytics.mv_county_profitability as
select
  tenant_id,
  county_id,
  county,
  period,
  revenue,
  estimated_profit,
  case when revenue > 0 then round((estimated_profit / revenue) * 100, 2) else 0 end as profit_margin
from analytics.mv_county_revenue;

create unique index if not exists ux_mv_county_profitability_tenant_county_period
on analytics.mv_county_profitability (tenant_id, county_id, period);

create materialized view if not exists analytics.mv_county_coverage as
select
  c.tenant_id,
  c.id as county_id,
  c.name as county,
  c.potential_customers,
  count(distinct cu.id) as current_customers,
  count(distinct sv.id) as visits,
  count(distinct so.id) as orders,
  coalesce(ct.revenue_target, 0) as revenue_target,
  coalesce(ct.visit_target, 0) as visit_target,
  case
    when count(distinct sv.id) >= coalesce(nullif(ct.visit_target, 0), 5) then 'covered'
    when count(distinct sv.id) > 0 then 'low'
    else 'neglected'
  end as coverage_status,
  least(100, round(
    (count(distinct sv.id)::numeric / greatest(1, coalesce(nullif(ct.visit_target, 0), 5))) * 45 +
    (count(distinct cu.id)::numeric / greatest(1, c.potential_customers)) * 35 +
    (count(distinct so.id)::numeric * 4)
  , 2)) as coverage_score
from public.counties c
left join public.customers cu on cu.tenant_id = c.tenant_id and cu.city = c.name
left join public.sales_visits sv on sv.tenant_id = c.tenant_id and sv.county_id = c.id and sv.visit_date >= current_date - interval '90 days'
left join public.sales_orders so on so.tenant_id = c.tenant_id and so.customer_id = cu.id and so.created_at >= current_date - interval '90 days'
left join public.county_targets ct on ct.tenant_id = c.tenant_id and ct.county_id = c.id and ct.period = date_trunc('month', current_date)::date
group by c.tenant_id, c.id, c.name, c.potential_customers, ct.revenue_target, ct.visit_target;

create unique index if not exists ux_mv_county_coverage_tenant_county
on analytics.mv_county_coverage (tenant_id, county_id);

create materialized view if not exists analytics.mv_sales_routes as
select
  sr.tenant_id,
  sr.id as route_id,
  sr.sales_rep_id,
  p.full_name as sales_rep,
  sr.route_date,
  sr.counties,
  sr.distance_km,
  sr.travel_cost,
  sr.revenue,
  case when sr.travel_cost > 0 then round(sr.revenue / sr.travel_cost, 2) else 0 end as route_roi
from public.sales_routes sr
left join public.profiles p on p.id = sr.sales_rep_id;

create unique index if not exists ux_mv_sales_routes_tenant_route
on analytics.mv_sales_routes (tenant_id, route_id);

create materialized view if not exists analytics.mv_sales_rep_coverage as
select
  ta.tenant_id,
  ta.sales_rep_id,
  p.full_name as sales_rep,
  count(distinct ta.county_id) as assigned_counties,
  count(distinct sv.id) as visits,
  count(distinct so.id) as orders,
  coalesce(sum(so.total), 0) as revenue
from public.territory_assignments ta
left join public.profiles p on p.id = ta.sales_rep_id
left join public.sales_visits sv on sv.tenant_id = ta.tenant_id and sv.sales_rep_id = ta.sales_rep_id and sv.county_id = ta.county_id
left join public.customers cu on cu.tenant_id = ta.tenant_id and cu.city = (select name from public.counties c where c.id = ta.county_id)
left join public.sales_orders so on so.tenant_id = ta.tenant_id and so.customer_id = cu.id
group by ta.tenant_id, ta.sales_rep_id, p.full_name;

create unique index if not exists ux_mv_sales_rep_coverage_tenant_rep
on analytics.mv_sales_rep_coverage (tenant_id, sales_rep_id);

-- Public API wrappers for Vercel/Supabase REST. These expose precomputed analytics without raw table scans.
create or replace view public.analytics_revenue_summary as
select * from analytics.materialized_revenue;

create or replace view public.analytics_inventory_health as
select * from analytics.materialized_inventory;

create or replace view public.analytics_customer_value as
select * from analytics.materialized_customers;

create or replace view public.analytics_procurement_metrics as
select * from analytics.materialized_procurement;

create or replace view public.analytics_production_metrics as
select * from analytics.materialized_production;

create or replace view public.analytics_risk_center as
select * from analytics.materialized_risks;

create or replace view public.analytics_executive_summary as
select * from analytics.materialized_executive;

create or replace function analytics.refresh_all()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently analytics.materialized_revenue;
  refresh materialized view concurrently analytics.materialized_inventory;
  refresh materialized view concurrently analytics.materialized_customers;
  refresh materialized view concurrently analytics.materialized_procurement;
  refresh materialized view concurrently analytics.materialized_production;
  refresh materialized view analytics.materialized_risks;
  refresh materialized view analytics.materialized_executive;
  refresh materialized view concurrently analytics.mv_county_revenue;
  refresh materialized view concurrently analytics.mv_county_profitability;
  refresh materialized view concurrently analytics.mv_county_coverage;
  refresh materialized view concurrently analytics.mv_sales_routes;
  refresh materialized view concurrently analytics.mv_sales_rep_coverage;
end;
$$;

-- RLS: service_role can manage everything. Authenticated users are tenant-scoped through profiles.
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.warehouses enable row level security;
alter table public.business_events enable row level security;
alter table public.dashboard_widgets enable row level security;
alter table public.dashboard_layouts enable row level security;
alter table public.dashboard_preferences enable row level security;
alter table public.audit_logs enable row level security;
alter table public.customers enable row level security;
alter table public.leads enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.quotations enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.procurement_requests enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.bills_of_materials enable row level security;
alter table public.bill_of_material_items enable row level security;
alter table public.production_jobs enable row level security;
alter table public.deliveries enable row level security;
alter table public.counties enable row level security;
alter table public.sub_counties enable row level security;
alter table public.territory_assignments enable row level security;
alter table public.sales_visits enable row level security;
alter table public.sales_checkins enable row level security;
alter table public.sales_routes enable row level security;
alter table public.county_targets enable row level security;
alter table public.territory_performance enable row level security;
alter table public.chart_of_accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants','profiles','branches','warehouses','business_events','dashboard_widgets','dashboard_layouts','dashboard_preferences','audit_logs','customers','leads','suppliers',
    'products','inventory_lots','inventory_movements','quotations','sales_orders','sales_order_items',
    'inventory_reservations','invoices','payments','procurement_requests','purchase_orders','bills_of_materials',
    'bill_of_material_items','production_jobs','deliveries','counties','sub_counties','territory_assignments',
    'sales_visits','sales_checkins','sales_routes','county_targets','territory_performance',
    'chart_of_accounts','journal_entries','journal_lines'
  ] loop
    execute format('drop policy if exists "service role all" on public.%I', t);
    execute format('create policy "service role all" on public.%I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;

-- Manufacturing and production traceability upgrade
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

create table if not exists public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  material_code text not null,
  material_name text not null,
  category text,
  unit_of_measure text not null,
  current_quantity numeric(18,6) not null default 0,
  available_quantity numeric(18,6) not null default 0,
  reserved_quantity numeric(18,6) not null default 0,
  consumed_quantity numeric(18,6) not null default 0,
  supplier_id uuid,
  supplier_name text,
  cost_per_unit numeric(18,6) not null default 0,
  warehouse text,
  storage_location text,
  batch_number text,
  manufacture_date date,
  expiry_date date,
  status text not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, material_code)
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

create table if not exists public.production_calendar (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  period text,
  planned_orders integer,
  planned_output numeric(18,6),
  status text
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

create index if not exists idx_raw_material_batches_material on public.raw_material_batches(material_id);
create index if not exists idx_raw_material_consumption_order on public.raw_material_consumption(production_order_id);
create index if not exists idx_raw_material_consumption_batch on public.raw_material_consumption(batch_number);
create index if not exists idx_production_batches_order on public.production_batches(production_order_id);

create materialized view if not exists analytics.mv_manufacturing_health as
select tenant_id, material_id, material_name, sum(quantity_base) as consumed_base_qty, sum(cost_consumed) as consumed_cost, count(*) as consumption_events
from public.raw_material_consumption
group by tenant_id, material_id, material_name;

create materialized view if not exists analytics.mv_batch_profitability as
select tenant_id, batch_no, product_name, quantity_produced, production_cost, sales_revenue, profit, profit_margin
from public.production_batches;

create materialized view if not exists analytics.mv_batch_traceability as
select tenant_id, production_order_no, material_name, batch_number, quantity_consumed, unit, cost_consumed, consumed_at
from public.raw_material_consumption;

create unique index if not exists ux_mv_manufacturing_health on analytics.mv_manufacturing_health(tenant_id, material_id);
create unique index if not exists ux_mv_batch_profitability on analytics.mv_batch_profitability(tenant_id, batch_no);
create index if not exists idx_mv_batch_traceability on analytics.mv_batch_traceability(tenant_id, batch_number);

do $$
declare
  t text;
begin
  foreach t in array array[
    'unit_of_measure','unit_conversions','raw_materials','raw_material_batches','raw_material_consumption',
    'product_formulas','formula_versions','production_batches','production_batch_materials','production_batch_costs',
    'production_batch_yields','production_storage_history','production_quality_checks','production_downtime',
    'production_capacity','production_calendar','manufacturing_documents','batch_recalls'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service role all" on public.%I', t);
    execute format('create policy "service role all" on public.%I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;

-- Enterprise Finance & Financial Intelligence Platform.
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null,
  parent_account_id uuid references public.accounts(id),
  status text not null default 'active',
  unique (tenant_id, code)
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journal_no text not null,
  journal_date date not null default current_date,
  description text not null,
  source_module text,
  source_id uuid,
  reference text,
  total_debit numeric(14, 2) not null default 0,
  total_credit numeric(14, 2) not null default 0,
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
  account_id uuid not null references public.accounts(id),
  debit numeric(14, 2) not null default 0,
  credit numeric(14, 2) not null default 0,
  source_module text,
  reference text,
  line_date date not null default current_date,
  check (debit >= 0 and credit >= 0),
  check (not (debit > 0 and credit > 0))
);

create table if not exists public.general_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journal_line_id uuid references public.journal_lines(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  debit numeric(14, 2) not null default 0,
  credit numeric(14, 2) not null default 0,
  running_balance numeric(14, 2) not null default 0,
  source_module text,
  reference text,
  posted_at timestamptz not null default now()
);

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_name text not null,
  bank_name text not null,
  account_number text not null,
  currency text not null default 'KES',
  opening_balance numeric(14, 2) not null default 0,
  current_balance numeric(14, 2) not null default 0,
  status text not null default 'active'
);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bank_account_id uuid references public.bank_accounts(id),
  transaction_date date not null default current_date,
  reference text,
  description text,
  deposit numeric(14, 2) not null default 0,
  withdrawal numeric(14, 2) not null default 0,
  reconciled boolean not null default false
);

create table if not exists public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  custodian_id uuid references public.profiles(id),
  opening_balance numeric(14, 2) not null default 0,
  current_balance numeric(14, 2) not null default 0,
  status text not null default 'active'
);

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  default_account_id uuid references public.accounts(id),
  status text not null default 'active'
);

create table if not exists public.expense_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  expense_id uuid,
  amount numeric(14, 2) not null default 0,
  requested_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_no text not null,
  name text not null,
  department text,
  position text,
  bank_details jsonb not null default '{}'::jsonb,
  tax_info jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  unique (tenant_id, employee_no)
);

create table if not exists public.payroll (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid references public.employees(id),
  period date not null,
  basic_salary numeric(14, 2) not null default 0,
  allowances numeric(14, 2) not null default 0,
  deductions numeric(14, 2) not null default 0,
  paye numeric(14, 2) not null default 0,
  nssf numeric(14, 2) not null default 0,
  nhif numeric(14, 2) not null default 0,
  net_pay numeric(14, 2) not null default 0,
  status text not null default 'draft'
);

create table if not exists public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  tax_type text not null,
  rate numeric(8, 4) not null default 0,
  effective_from date not null default current_date,
  status text not null default 'active'
);

create table if not exists public.tax_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tax_type text not null,
  period date not null,
  liability numeric(14, 2) not null default 0,
  status text not null default 'open',
  source_module text,
  source_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  asset_name text not null,
  category text not null,
  acquisition_date date not null default current_date,
  location text,
  department text,
  purchase_cost numeric(14, 2) not null default 0,
  useful_life_months integer not null default 60,
  depreciation_method text not null default 'straight_line',
  accumulated_depreciation numeric(14, 2) not null default 0,
  current_value numeric(14, 2) not null default 0,
  status text not null default 'active'
);

create table if not exists public.asset_depreciation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  asset_id uuid not null references public.fixed_assets(id) on delete cascade,
  period date not null,
  depreciation_amount numeric(14, 2) not null default 0,
  journal_entry_id uuid references public.journal_entries(id)
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  department text not null,
  period date not null,
  budget numeric(14, 2) not null default 0,
  actual numeric(14, 2) not null default 0,
  forecast numeric(14, 2) not null default 0,
  status text not null default 'active'
);

create table if not exists public.budget_variances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  budget_id uuid references public.budgets(id) on delete cascade,
  variance numeric(14, 2) not null default 0,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  department text not null,
  manager_id uuid references public.profiles(id),
  revenue numeric(14, 2) not null default 0,
  cost numeric(14, 2) not null default 0,
  profitability numeric(14, 2) not null default 0,
  unique (tenant_id, code)
);

create table if not exists public.financial_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  report_type text not null,
  filters jsonb not null default '{}'::jsonb,
  last_generated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.financial_forecasts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  metric text not null,
  current_value numeric(14, 2) not null default 0,
  forecast_30 numeric(14, 2) not null default 0,
  confidence numeric(6, 2) not null default 0,
  forecast_date date not null default current_date
);

create table if not exists public.financial_ai_insights (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  detail text not null,
  sources text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_journal_entries_date on public.journal_entries (tenant_id, journal_date desc);
create index if not exists idx_journal_lines_account_date on public.journal_lines (tenant_id, account_id, line_date desc);
create index if not exists idx_general_ledger_account on public.general_ledger (tenant_id, account_id, posted_at desc);
create index if not exists idx_bank_transactions_date on public.bank_transactions (tenant_id, transaction_date desc);
create index if not exists idx_tax_records_period on public.tax_records (tenant_id, period, tax_type);

alter table public.accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.general_ledger enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expense_approvals enable row level security;
alter table public.employees enable row level security;
alter table public.payroll enable row level security;
alter table public.tax_rates enable row level security;
alter table public.tax_records enable row level security;
alter table public.fixed_assets enable row level security;
alter table public.asset_depreciation enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_variances enable row level security;
alter table public.cost_centers enable row level security;
alter table public.financial_reports enable row level security;
alter table public.financial_forecasts enable row level security;
alter table public.financial_ai_insights enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts','journal_entries','journal_lines','general_ledger','bank_accounts','bank_transactions','cash_accounts',
    'expense_categories','expense_approvals','employees','payroll','tax_rates','tax_records','fixed_assets',
    'asset_depreciation','budgets','budget_variances','cost_centers','financial_reports','financial_forecasts',
    'financial_ai_insights'
  ] loop
    execute format('drop policy if exists "service role all" on public.%I', t);
    execute format('create policy "service role all" on public.%I for all to service_role using (true) with check (true)', t);
    execute format('drop policy if exists "tenant read" on public.%I', t);
    execute format('create policy "tenant read" on public.%I for select to authenticated using (tenant_id = public.current_tenant_id())', t);
  end loop;
end $$;

create materialized view if not exists analytics.mv_financial_summary as
select tenant_id, sum(total_credit) filter (where source_module = 'Sales') as revenue, sum(total_debit) filter (where source_module = 'Expenses') as expenses, count(*) as journals
from public.journal_entries
group by tenant_id;

create materialized view if not exists analytics.mv_profitability as
select tenant_id, date_trunc('month', journal_date)::date as period, sum(total_credit) as credits, sum(total_debit) as debits
from public.journal_entries
group by tenant_id, date_trunc('month', journal_date)::date;

create materialized view if not exists analytics.mv_cashflow as
select tenant_id, transaction_date as period, sum(deposit) as deposits, sum(withdrawal) as withdrawals, sum(deposit - withdrawal) as net_cashflow
from public.bank_transactions
group by tenant_id, transaction_date;

create materialized view if not exists analytics.mv_receivables as
select tenant_id, status, count(*) as invoices, sum(balance) as balance
from public.invoices
group by tenant_id, status;

create materialized view if not exists analytics.mv_payables as
select tenant_id, payment_status, count(*) as invoices, sum(outstanding_balance) as outstanding_balance
from public.accounts_payable
group by tenant_id, payment_status;

create materialized view if not exists analytics.mv_budget_variance as
select tenant_id, department, sum(budget) as budget, sum(actual) as actual, sum(budget - actual) as variance
from public.budgets
group by tenant_id, department;

create materialized view if not exists analytics.mv_payroll_summary as
select tenant_id, period, sum(basic_salary + allowances) as gross_pay, sum(deductions) as deductions, sum(net_pay) as net_pay
from public.payroll
group by tenant_id, period;

create materialized view if not exists analytics.mv_tax_summary as
select tenant_id, period, tax_type, sum(liability) as liability
from public.tax_records
group by tenant_id, period, tax_type;

create materialized view if not exists analytics.mv_financial_forecasts as
select tenant_id, forecast_date, metric, sum(current_value) as current_value, sum(forecast_30) as forecast_30, avg(confidence) as confidence
from public.financial_forecasts
group by tenant_id, forecast_date, metric;

-- Reliable ERP data intake and event processing.
create table if not exists public.input_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source text not null default 'manual',
  module text not null,
  submitted_by uuid references public.profiles(id),
  status text not null default 'received',
  record_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.input_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  batch_id uuid references public.input_batches(id) on delete set null,
  module text not null,
  payload jsonb not null default '{}'::jsonb,
  validation_status text not null default 'pending',
  processing_status text not null default 'pending',
  target_table text,
  target_id uuid,
  error_message text,
  submitted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.input_validation_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  input_record_id uuid references public.input_records(id) on delete cascade,
  rule_name text not null,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_processing_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  business_event_id uuid references public.business_events(id) on delete set null,
  processor text not null,
  status text not null,
  message text,
  attempts integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_input_records_module_status on public.input_records (tenant_id, module, processing_status, created_at desc);
create index if not exists idx_event_processing_logs_event on public.event_processing_logs (tenant_id, business_event_id, created_at desc);

alter table public.input_batches enable row level security;
alter table public.input_records enable row level security;
alter table public.input_validation_logs enable row level security;
alter table public.event_processing_logs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['input_batches','input_records','input_validation_logs','event_processing_logs'] loop
    execute format('drop policy if exists "service role all" on public.%I', t);
    execute format('create policy "service role all" on public.%I for all to service_role using (true) with check (true)', t);
    execute format('drop policy if exists "tenant read" on public.%I', t);
    execute format('create policy "tenant read" on public.%I for select to authenticated using (tenant_id = public.current_tenant_id())', t);
  end loop;
end $$;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select tenant_id from public.profiles where auth_user_id = auth.uid() limit 1
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','branches','warehouses','business_events','dashboard_widgets','dashboard_layouts','dashboard_preferences','audit_logs','customers','leads','suppliers',
    'products','inventory_lots','inventory_movements','quotations','sales_orders','sales_order_items',
    'inventory_reservations','invoices','payments','procurement_requests','purchase_orders','bills_of_materials',
    'bill_of_material_items','production_jobs','deliveries','counties','sub_counties','territory_assignments',
    'sales_visits','sales_checkins','sales_routes','county_targets','territory_performance',
    'chart_of_accounts','journal_entries','journal_lines'
  ] loop
    execute format('drop policy if exists "tenant read" on public.%I', t);
    execute format('create policy "tenant read" on public.%I for select to authenticated using (tenant_id = public.current_tenant_id())', t);
  end loop;
end $$;

-- Farmtrack demo data.
create or replace function public.seed_farmtrack_demo()
returns uuid
language plpgsql
security definer
as $$
declare
  v_tenant uuid;
  v_branch uuid;
  v_wh_main uuid;
  v_admin uuid;
  v_customer uuid;
  v_supplier uuid;
  v_product_bact uuid;
  v_product_feed uuid;
  v_order uuid;
  v_order_item uuid;
begin
  insert into public.tenants (name, slug, country, base_currency)
  values ('Farmtrack Bio Sciences Ltd', 'farmtrack-demo', 'KE', 'KES')
  on conflict (slug) do update set name = excluded.name
  returning id into v_tenant;

  insert into public.profiles (tenant_id, full_name, email, role, phone)
  values (v_tenant, 'Miko Admin', 'miko@gmail.com', 'admin', '+2540711495522')
  on conflict (tenant_id, email) do update set role = 'admin'
  returning id into v_admin;

  insert into public.branches (tenant_id, name, code, city)
  values (v_tenant, 'Nairobi HQ', 'NRB-HQ', 'Nairobi')
  on conflict (tenant_id, code) do update set name = excluded.name
  returning id into v_branch;

  insert into public.warehouses (tenant_id, branch_id, name, code, type)
  values (v_tenant, v_branch, 'Main Store Nairobi', 'MAIN-NRB', 'finished_goods')
  on conflict (tenant_id, code) do update set name = excluded.name
  returning id into v_wh_main;

  insert into public.counties (tenant_id, code, name, region, potential_customers)
  select
    v_tenant,
    lpad(row_number() over ()::text, 3, '0'),
    county_name,
    case
      when county_name in ('Mombasa','Kwale','Kilifi','Tana River','Lamu','Taita Taveta') then 'Coast'
      when county_name in ('Nairobi','Kiambu','Muranga','Nyeri','Kirinyaga','Nyandarua') then 'Central'
      when county_name in ('Nakuru','Uasin Gishu','Kajiado','Narok','Baringo','Laikipia','Nandi','Kericho','Bomet') then 'Rift Valley'
      when county_name in ('Kisumu','Siaya','Homa Bay','Migori','Kisii','Nyamira') then 'Nyanza'
      when county_name in ('Kakamega','Vihiga','Bungoma','Busia') then 'Western'
      else 'Eastern / Northern'
    end,
    90 + (row_number() over () * 7)::integer
  from unnest(array[
    'Mombasa','Kwale','Kilifi','Tana River','Lamu','Taita Taveta','Garissa','Wajir','Mandera','Marsabit',
    'Isiolo','Meru','Tharaka Nithi','Embu','Kitui','Machakos','Makueni','Nyandarua','Nyeri','Kirinyaga',
    'Muranga','Kiambu','Turkana','West Pokot','Samburu','Trans Nzoia','Uasin Gishu','Elgeyo Marakwet',
    'Nandi','Baringo','Laikipia','Nakuru','Narok','Kajiado','Kericho','Bomet','Kakamega','Vihiga',
    'Bungoma','Busia','Siaya','Kisumu','Homa Bay','Migori','Kisii','Nyamira','Nairobi'
  ]) as county_name
  on conflict (tenant_id, name) do update set potential_customers = excluded.potential_customers;

  insert into public.county_targets (tenant_id, county_id, period, revenue_target, visit_target, customer_target)
  select v_tenant, id, date_trunc('month', current_date)::date, 250000 + (row_number() over (order by name) * 12000), 8 + ((row_number() over (order by name))::integer % 10), greatest(8, round(potential_customers * 0.16)::integer)
  from public.counties
  where tenant_id = v_tenant
  on conflict (tenant_id, county_id, period) do update set revenue_target = excluded.revenue_target, visit_target = excluded.visit_target;

  insert into public.sub_counties (tenant_id, county_id, name)
  select v_tenant, id, name || ' Central'
  from public.counties
  where tenant_id = v_tenant
  on conflict (tenant_id, county_id, name) do nothing;

  insert into public.customers (tenant_id, customer_no, name, email, phone, city, type, credit_limit, balance)
  values
    (v_tenant, 'CUST-001', 'Green Valley Farm', 'info@greenvalley.co.ke', '+254722100200', 'Nakuru', 'Farm', 500000, 120000),
    (v_tenant, 'CUST-002', 'Nairobi Fresh Produce', 'orders@nairobfresh.com', '+254733200300', 'Nairobi', 'Distributor', 1000000, 250000),
    (v_tenant, 'CUST-003', 'Kiambu Organic Growers', 'info@kiambuorganic.org', '+254711300400', 'Kiambu', 'Cooperative', 300000, 45000)
  on conflict (tenant_id, customer_no) do update set name = excluded.name;

  select id into v_customer from public.customers where tenant_id = v_tenant and customer_no = 'CUST-001';

  insert into public.suppliers (tenant_id, supplier_no, name, email, phone, category, payment_terms, on_time_rate, delivery_rate)
  values
    (v_tenant, 'SUP-001', 'Yara Fertilizers Kenya', 'orders@yara.co.ke', '+254722333444', 'Fertilizers', 'Net 45', 88, 93),
    (v_tenant, 'SUP-002', 'Bayer Crop Science', 'info@bayer.co.ke', '+254733555666', 'Bio-Pesticides', 'Net 30', 91, 95)
  on conflict (tenant_id, supplier_no) do update set name = excluded.name;

  select id into v_supplier from public.suppliers where tenant_id = v_tenant and supplier_no = 'SUP-001';

  insert into public.products (tenant_id, sku, name, category, type, unit, cost_price, selling_price, min_stock, reorder_qty, is_manufactured)
  values
    (v_tenant, 'BP-001', 'Bactrolure Wick (Pack 50)', 'Bio-Pesticides', 'finished_good', 'pack', 850, 1500, 20, 100, false),
    (v_tenant, 'AF-001', 'Dairy Meal 16% 70kg', 'Animal Feed', 'finished_good', 'bag', 1800, 2800, 40, 120, true),
    (v_tenant, 'BF-001', 'Rhizobium Bio-Fertilizer', 'Bio-Fertilizers', 'finished_good', 'kg', 200, 450, 30, 80, true),
    (v_tenant, 'FT-001', 'NPK 20-20-0 Fertilizer 50kg', 'Fertilizers', 'raw_material', 'bag', 2500, 3500, 20, 75, false)
  on conflict (tenant_id, sku) do update set name = excluded.name;

  select id into v_product_bact from public.products where tenant_id = v_tenant and sku = 'BP-001';
  select id into v_product_feed from public.products where tenant_id = v_tenant and sku = 'AF-001';

  insert into public.inventory_lots (tenant_id, product_id, warehouse_id, batch_no, quantity_on_hand, quantity_reserved, unit_cost, expiry_date)
  values
    (v_tenant, v_product_bact, v_wh_main, 'BAT-001', 200, 0, 850, current_date + interval '18 months'),
    (v_tenant, v_product_feed, v_wh_main, 'FEED-001', 45, 0, 1800, current_date + interval '8 months');

  insert into public.purchase_orders (tenant_id, po_no, supplier_id, status, subtotal, tax, total, expected_date)
  values (v_tenant, 'PO-2401', v_supplier, 'open', 320000, 51200, 371200, current_date + 14)
  on conflict (tenant_id, po_no) do nothing;

  insert into public.sales_orders (tenant_id, order_no, customer_id, status, subtotal, tax, total, paid, balance, created_by)
  values (v_tenant, 'SO-2401', v_customer, 'confirmed', 245000, 39200, 284200, 120000, 164200, v_admin)
  on conflict (tenant_id, order_no) do update set status = excluded.status
  returning id into v_order;

  insert into public.sales_order_items (tenant_id, sales_order_id, product_id, quantity, unit_price, unit_cost)
  values (v_tenant, v_order, v_product_bact, 100, 1500, 850)
  returning id into v_order_item;

  insert into public.territory_assignments (tenant_id, county_id, sales_rep_id, status)
  select v_tenant, id, v_admin, 'active'
  from public.counties
  where tenant_id = v_tenant and name in ('Nairobi','Kiambu','Nakuru','Mombasa','Meru','Uasin Gishu')
  on conflict (tenant_id, county_id, sales_rep_id) do update set status = 'active';

  insert into public.sales_visits (tenant_id, sales_rep_id, customer_id, county_id, sub_county_id, location, latitude, longitude, visit_date, visit_start, visit_end, purpose, outcome, notes)
  select
    v_tenant,
    v_admin,
    v_customer,
    c.id,
    sc.id,
    c.name || ' field route',
    -1.286389,
    36.817223,
    current_date,
    now() - interval '2 hours',
    now() - interval '45 minutes',
    'Distributor review',
    'Order created',
    'Seeded GPS verified visit'
  from public.counties c
  left join public.sub_counties sc on sc.tenant_id = c.tenant_id and sc.county_id = c.id
  where c.tenant_id = v_tenant and c.name = 'Nakuru'
  limit 1;

  insert into public.sales_checkins (tenant_id, sales_visit_id, sales_rep_id, check_in_at, check_out_at, check_in_latitude, check_in_longitude, check_out_latitude, check_out_longitude, duration_minutes, gps_verified)
  select tenant_id, id, sales_rep_id, visit_start, visit_end, latitude, longitude, latitude + 0.01, longitude + 0.01, greatest(0, floor(extract(epoch from (visit_end - visit_start)) / 60)::integer), true
  from public.sales_visits
  where tenant_id = v_tenant and customer_id = v_customer
  order by created_at desc
  limit 1;

  insert into public.sales_routes (tenant_id, sales_rep_id, route_date, route_name, counties, distance_km, travel_cost, revenue)
  values (v_tenant, v_admin, current_date, 'Central-Rift distributor route', '["Nairobi","Kiambu","Nakuru"]'::jsonb, 318, 18500, 284200);

  insert into public.invoices (tenant_id, invoice_no, customer_id, sales_order_id, status, subtotal, tax, total, paid, balance, due_date)
  values (v_tenant, 'INV-2401', v_customer, v_order, 'partial', 245000, 39200, 284200, 120000, 164200, current_date + 30)
  on conflict (tenant_id, invoice_no) do nothing;

  perform public.reserve_inventory_for_order(v_order);

  return v_tenant;
end;
$$;

-- Uncomment after reviewing if you want to seed immediately:
-- select public.seed_farmtrack_demo();

-- Procurement Operations Center upgrade.
create table if not exists public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  procurement_request_id uuid not null references public.procurement_requests(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text,
  quantity numeric(14, 3) not null default 0,
  estimated_unit_cost numeric(14, 2) not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  contact_person text not null,
  phone text,
  email text,
  role text,
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_performance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  period date not null default date_trunc('month', current_date)::date,
  delivery_accuracy numeric(6, 2) not null default 0,
  quality_score numeric(6, 2) not null default 0,
  price_competitiveness numeric(6, 2) not null default 0,
  lead_time_days numeric(8, 2) not null default 0,
  reliability numeric(6, 2) not null default 0,
  communication numeric(6, 2) not null default 0,
  overall_rating numeric(6, 2) not null default 0,
  unique (tenant_id, supplier_id, period)
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text,
  quantity numeric(14, 3) not null default 0,
  received numeric(14, 3) not null default 0,
  unit_cost numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) generated always as (quantity * unit_cost) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  grn_no text not null,
  purchase_order_id uuid references public.purchase_orders(id),
  supplier_id uuid references public.suppliers(id),
  warehouse_id uuid references public.warehouses(id),
  received_by uuid references public.profiles(id),
  received_at timestamptz not null default now(),
  expected_quantity numeric(14, 3) not null default 0,
  received_quantity numeric(14, 3) not null default 0,
  damaged_quantity numeric(14, 3) not null default 0,
  accepted_quantity numeric(14, 3) not null default 0,
  rejected_quantity numeric(14, 3) not null default 0,
  status text not null default 'draft',
  notes text,
  unique (tenant_id, grn_no)
);

create table if not exists public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  goods_receipt_id uuid not null references public.goods_receipts(id) on delete cascade,
  product_id uuid references public.products(id),
  expected_quantity numeric(14, 3) not null default 0,
  received_quantity numeric(14, 3) not null default 0,
  damaged_quantity numeric(14, 3) not null default 0,
  accepted_quantity numeric(14, 3) not null default 0,
  rejected_quantity numeric(14, 3) not null default 0,
  unit_cost numeric(14, 2) not null default 0,
  inventory_updated boolean not null default false
);

create table if not exists public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_no text not null,
  purchase_order_id uuid references public.purchase_orders(id),
  supplier_id uuid not null references public.suppliers(id),
  invoice_date date not null default current_date,
  due_date date not null,
  invoice_amount numeric(14, 2) not null default 0,
  paid_amount numeric(14, 2) not null default 0,
  outstanding_balance numeric(14, 2) not null default 0,
  status text not null default 'open',
  payment_terms text,
  unique (tenant_id, invoice_no)
);

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_no text not null,
  supplier_invoice_id uuid references public.supplier_invoices(id),
  supplier_id uuid not null references public.suppliers(id),
  paid_at timestamptz not null default now(),
  amount numeric(14, 2) not null default 0,
  method text,
  status text not null default 'completed',
  unique (tenant_id, payment_no)
);

create table if not exists public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  supplier_invoice_id uuid references public.supplier_invoices(id),
  credit_limit numeric(14, 2) not null default 0,
  credit_terms text,
  invoice_amount numeric(14, 2) not null default 0,
  due_date date not null,
  outstanding_balance numeric(14, 2) not null default 0,
  payment_schedule text,
  status text not null default 'current',
  ai_risk_score numeric(6, 2) not null default 0
);

create table if not exists public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  due_date date not null,
  invoice_amount numeric(14, 2) not null default 0,
  paid_amount numeric(14, 2) not null default 0,
  outstanding_balance numeric(14, 2) not null default 0,
  payment_status text not null default 'open',
  aging_bucket text not null default '0-30',
  partial_payments integer not null default 0,
  credits numeric(14, 2) not null default 0,
  adjustments numeric(14, 2) not null default 0
);

create table if not exists public.procurement_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  report_type text not null,
  filters jsonb not null default '{}'::jsonb,
  last_generated_at timestamptz,
  schedule text,
  created_at timestamptz not null default now()
);

create table if not exists public.procurement_forecasts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid references public.products(id),
  recommended_order_qty numeric(14, 3) not null default 0,
  reorder_timing text,
  expected_cost numeric(14, 2) not null default 0,
  reason text,
  forecast_period date not null default date_trunc('month', current_date)::date
);

create table if not exists public.procurement_analytics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  metric text not null,
  period date not null,
  value numeric(14, 2) not null default 0,
  dimensions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.profiles(id),
  title text not null,
  body text,
  module text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.procurement_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reference_type text not null,
  reference_id uuid not null,
  note text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.procurement_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reference_type text not null,
  reference_id uuid not null,
  file_name text not null,
  file_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_order_items_po on public.purchase_order_items (tenant_id, purchase_order_id);
create index if not exists idx_goods_receipts_po on public.goods_receipts (tenant_id, purchase_order_id);
create index if not exists idx_supplier_invoices_supplier_due on public.supplier_invoices (tenant_id, supplier_id, due_date);
create index if not exists idx_accounts_payable_aging on public.accounts_payable (tenant_id, aging_bucket, due_date);
create index if not exists idx_credit_purchases_supplier on public.credit_purchases (tenant_id, supplier_id, status);
create index if not exists idx_procurement_analytics_metric_period on public.procurement_analytics (tenant_id, metric, period);

alter table public.purchase_request_items enable row level security;
alter table public.supplier_contacts enable row level security;
alter table public.supplier_performance enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_items enable row level security;
alter table public.supplier_invoices enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.credit_purchases enable row level security;
alter table public.accounts_payable enable row level security;
alter table public.procurement_reports enable row level security;
alter table public.procurement_forecasts enable row level security;
alter table public.procurement_analytics enable row level security;
alter table public.notifications enable row level security;
alter table public.procurement_notes enable row level security;
alter table public.procurement_attachments enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'purchase_request_items','supplier_contacts','supplier_performance','purchase_order_items','goods_receipts',
    'goods_receipt_items','supplier_invoices','supplier_payments','credit_purchases','accounts_payable',
    'procurement_reports','procurement_forecasts','procurement_analytics','notifications','procurement_notes',
    'procurement_attachments'
  ] loop
    execute format('drop policy if exists "service role all" on public.%I', t);
    execute format('create policy "service role all" on public.%I for all to service_role using (true) with check (true)', t);
    execute format('drop policy if exists "tenant read" on public.%I', t);
    execute format('create policy "tenant read" on public.%I for select to authenticated using (tenant_id = public.current_tenant_id())', t);
  end loop;
end $$;

create materialized view if not exists analytics.mv_procurement_spend as
select tenant_id, date_trunc('month', created_at)::date as period, count(*) as purchase_orders, coalesce(sum(total), 0) as spend
from public.purchase_orders
group by tenant_id, date_trunc('month', created_at)::date;

create materialized view if not exists analytics.mv_supplier_performance as
select tenant_id, supplier_id, avg(delivery_accuracy) as delivery_accuracy, avg(quality_score) as quality_score, avg(lead_time_days) as lead_time_days, avg(overall_rating) as overall_rating
from public.supplier_performance
group by tenant_id, supplier_id;

create materialized view if not exists analytics.mv_delivery_performance as
select tenant_id, status, count(*) as deliveries
from public.deliveries
group by tenant_id, status;

create materialized view if not exists analytics.mv_credit_exposure as
select tenant_id, supplier_id, sum(outstanding_balance) as outstanding_balance, avg(ai_risk_score) as ai_risk_score
from public.credit_purchases
group by tenant_id, supplier_id;

create materialized view if not exists analytics.mv_accounts_payable as
select tenant_id, aging_bucket, count(*) as invoices, sum(outstanding_balance) as outstanding_balance
from public.accounts_payable
group by tenant_id, aging_bucket;

create materialized view if not exists analytics.mv_procurement_forecasts as
select tenant_id, product_id, forecast_period, sum(recommended_order_qty) as recommended_order_qty, sum(expected_cost) as expected_cost
from public.procurement_forecasts
group by tenant_id, product_id, forecast_period;

create materialized view if not exists analytics.mv_inventory_replenishment as
select tenant_id, product_id, sum(recommended_order_qty) as recommended_order_qty, sum(expected_cost) as expected_cost
from public.procurement_forecasts
group by tenant_id, product_id;

create unique index if not exists idx_mv_procurement_spend on analytics.mv_procurement_spend (tenant_id, period);
create index if not exists idx_mv_supplier_performance on analytics.mv_supplier_performance (tenant_id, supplier_id);
create index if not exists idx_mv_credit_exposure on analytics.mv_credit_exposure (tenant_id, supplier_id);

-- Sales order to delivery confirmation upgrade.
alter table public.deliveries add column if not exists delivered_confirmed boolean not null default false;
alter table public.deliveries add column if not exists delivered_confirmed_at timestamptz;
alter table public.deliveries add column if not exists delivered_confirmed_by uuid references public.profiles(id);
alter table public.deliveries add column if not exists actual_delivery_date date;
alter table public.deliveries add column if not exists delivery_proof jsonb not null default '{}'::jsonb;

create index if not exists idx_deliveries_sales_order_status on public.deliveries (tenant_id, sales_order_id, status);
create index if not exists idx_deliveries_confirmed on public.deliveries (tenant_id, delivered_confirmed, actual_delivery_date);

create or replace function public.confirm_sales_delivery(p_delivery_id uuid, p_confirmed boolean)
returns public.deliveries
language plpgsql
security definer
as $$
declare
  v_delivery public.deliveries;
begin
  update public.deliveries
  set
    delivered_confirmed = p_confirmed,
    delivered_confirmed_at = case when p_confirmed then now() else null end,
    actual_delivery_date = case when p_confirmed then current_date else null end,
    status = case when p_confirmed then 'delivered' else 'pending_delivery' end
  where id = p_delivery_id
  returning * into v_delivery;

  if v_delivery.id is null then
    raise exception 'Delivery not found: %', p_delivery_id;
  end if;

  update public.sales_orders
  set status = case when p_confirmed then 'delivered' else status end,
      updated_at = now()
  where id = v_delivery.sales_order_id;

  insert into public.business_events (tenant_id, event_type, aggregate_type, aggregate_id, payload)
  values (v_delivery.tenant_id, 'delivery.confirmed', 'delivery', v_delivery.id, jsonb_build_object('confirmed', p_confirmed, 'sales_order_id', v_delivery.sales_order_id));

  return v_delivery;
end;
$$;

-- Inventory Intelligence & Warehouse Operations Platform upgrade.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid references public.products(id),
  warehouse_id uuid references public.warehouses(id),
  sku text,
  product_name text not null,
  category text,
  batch_no text,
  lot_no text,
  barcode text,
  qr_code text,
  quantity_available numeric(14, 3) not null default 0,
  quantity_reserved numeric(14, 3) not null default 0,
  quantity_incoming numeric(14, 3) not null default 0,
  quantity_outgoing numeric(14, 3) not null default 0,
  reorder_level numeric(14, 3) not null default 0,
  reorder_point numeric(14, 3) not null default 0,
  unit_cost numeric(14, 2) not null default 0,
  selling_price numeric(14, 2) not null default 0,
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
  quantity numeric(14, 3) not null default 0,
  unit_cost numeric(14, 2) not null default 0,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  warehouse_id uuid references public.warehouses(id),
  code text not null,
  name text not null,
  county text,
  capacity numeric(14, 3) not null default 0,
  used numeric(14, 3) not null default 0,
  manager_id uuid references public.profiles(id),
  status text not null default 'active',
  unique (tenant_id, code)
);

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  warehouse_id uuid references public.warehouses(id),
  zone text not null,
  rack text,
  bin text,
  capacity numeric(14, 3) not null default 0,
  used numeric(14, 3) not null default 0,
  status text not null default 'active'
);

create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete cascade,
  product_id uuid references public.products(id),
  warehouse_id uuid references public.warehouses(id),
  batch_no text not null,
  lot_no text,
  quantity numeric(14, 3) not null default 0,
  manufacture_date date,
  expiry_date date,
  days_remaining integer,
  status text not null default 'active'
);

create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete cascade,
  product_id uuid references public.products(id),
  warehouse_id uuid references public.warehouses(id),
  adjustment_type text not null,
  quantity numeric(14, 3) not null default 0,
  reason text,
  approved_by uuid references public.profiles(id),
  adjustment_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  transfer_no text not null,
  inventory_item_id uuid references public.inventory_items(id),
  product_id uuid references public.products(id),
  from_warehouse_id uuid references public.warehouses(id),
  to_warehouse_id uuid references public.warehouses(id),
  quantity numeric(14, 3) not null default 0,
  status text not null default 'pending',
  requested_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  transferred_at timestamptz,
  unique (tenant_id, transfer_no)
);

create table if not exists public.inventory_audits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  audit_no text not null,
  inventory_item_id uuid references public.inventory_items(id),
  product_id uuid references public.products(id),
  warehouse_id uuid references public.warehouses(id),
  system_quantity numeric(14, 3) not null default 0,
  physical_quantity numeric(14, 3) not null default 0,
  difference numeric(14, 3) generated always as (physical_quantity - system_quantity) stored,
  reason text,
  status text not null default 'open',
  audited_by uuid references public.profiles(id),
  audit_date date not null default current_date,
  unique (tenant_id, audit_no)
);

create table if not exists public.inventory_damage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id),
  product_id uuid references public.products(id),
  warehouse_id uuid references public.warehouses(id),
  quantity numeric(14, 3) not null default 0,
  reason text,
  cost_impact numeric(14, 2) not null default 0,
  reported_by uuid references public.profiles(id),
  status text not null default 'reported',
  damage_date date not null default current_date
);

create table if not exists public.inventory_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id),
  product_id uuid references public.products(id),
  warehouse_id uuid references public.warehouses(id),
  alert_type text not null,
  severity text not null default 'medium',
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.inventory_reorder_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid references public.products(id),
  warehouse_id uuid references public.warehouses(id),
  minimum_stock numeric(14, 3) not null default 0,
  reorder_point numeric(14, 3) not null default 0,
  reorder_qty numeric(14, 3) not null default 0,
  preferred_supplier_id uuid references public.suppliers(id),
  auto_request boolean not null default false,
  status text not null default 'active'
);

create table if not exists public.inventory_forecasts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid references public.products(id),
  warehouse_id uuid references public.warehouses(id),
  forecast_period date not null,
  future_demand numeric(14, 3) not null default 0,
  stockout_risk numeric(6, 2) not null default 0,
  reorder_date date,
  seasonal_demand text,
  ai_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  report_type text not null,
  filters jsonb not null default '{}'::jsonb,
  export_formats text[] not null default array['PDF','Excel','CSV'],
  last_generated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_costs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  warehouse_id uuid references public.warehouses(id),
  period date not null default date_trunc('month', current_date)::date,
  rent numeric(14, 2) not null default 0,
  utilities numeric(14, 2) not null default 0,
  labor numeric(14, 2) not null default 0,
  damage_costs numeric(14, 2) not null default 0,
  expiry_losses numeric(14, 2) not null default 0,
  total_cost numeric(14, 2) generated always as (rent + utilities + labor + damage_costs + expiry_losses) stored
);

create table if not exists public.inventory_health_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid references public.products(id),
  warehouse_id uuid references public.warehouses(id),
  health_score numeric(6, 2) not null default 0,
  classification text not null default 'healthy',
  drivers jsonb not null default '{}'::jsonb,
  scored_at timestamptz not null default now()
);

create index if not exists idx_inventory_items_lookup on public.inventory_items (tenant_id, product_id, warehouse_id, status);
create index if not exists idx_inventory_items_search on public.inventory_items using gin (to_tsvector('english', coalesce(product_name,'') || ' ' || coalesce(sku,'') || ' ' || coalesce(batch_no,'')));
create index if not exists idx_inventory_transactions_item_created on public.inventory_transactions (tenant_id, inventory_item_id, created_at desc);
create index if not exists idx_inventory_batches_expiry on public.inventory_batches (tenant_id, expiry_date, status);
create index if not exists idx_inventory_alerts_status on public.inventory_alerts (tenant_id, status, severity);
create index if not exists idx_inventory_forecasts_period on public.inventory_forecasts (tenant_id, forecast_period, product_id);

alter table public.inventory_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.inventory_warehouses enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.inventory_adjustments enable row level security;
alter table public.inventory_transfers enable row level security;
alter table public.inventory_audits enable row level security;
alter table public.inventory_damage enable row level security;
alter table public.inventory_alerts enable row level security;
alter table public.inventory_reorder_rules enable row level security;
alter table public.inventory_forecasts enable row level security;
alter table public.inventory_reports enable row level security;
alter table public.inventory_costs enable row level security;
alter table public.inventory_health_scores enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'inventory_items','inventory_transactions','inventory_warehouses','inventory_locations','inventory_batches',
    'inventory_adjustments','inventory_transfers','inventory_audits','inventory_damage','inventory_alerts',
    'inventory_reorder_rules','inventory_forecasts','inventory_reports','inventory_costs','inventory_health_scores'
  ] loop
    execute format('drop policy if exists "service role all" on public.%I', t);
    execute format('create policy "service role all" on public.%I for all to service_role using (true) with check (true)', t);
    execute format('drop policy if exists "tenant read" on public.%I', t);
    execute format('create policy "tenant read" on public.%I for select to authenticated using (tenant_id = public.current_tenant_id())', t);
  end loop;
end $$;

create materialized view if not exists analytics.mv_inventory_summary as
select tenant_id,
       count(*) as total_skus,
       coalesce(sum(quantity_available), 0) as available_stock,
       coalesce(sum(quantity_reserved), 0) as reserved_stock,
       coalesce(sum(quantity_incoming), 0) as incoming_stock,
       coalesce(sum(quantity_outgoing), 0) as outgoing_stock,
       coalesce(sum(quantity_available * unit_cost), 0) as inventory_value,
       count(*) filter (where quantity_available <= reorder_level) as low_stock_items
from public.inventory_items
group by tenant_id;

create materialized view if not exists analytics.mv_inventory_value as
select tenant_id, warehouse_id, category, coalesce(sum(quantity_available * unit_cost), 0) as inventory_value
from public.inventory_items
group by tenant_id, warehouse_id, category;

create materialized view if not exists analytics.mv_inventory_movements as
select tenant_id, date_trunc('month', created_at)::date as period, transaction_type, count(*) as transactions, coalesce(sum(quantity), 0) as quantity
from public.inventory_transactions
group by tenant_id, date_trunc('month', created_at)::date, transaction_type;

create materialized view if not exists analytics.mv_inventory_turnover as
select tenant_id, product_id, abs(coalesce(sum(quantity) filter (where quantity < 0), 0)) as issued_quantity, coalesce(avg(unit_cost), 0) as average_unit_cost
from public.inventory_transactions
group by tenant_id, product_id;

create materialized view if not exists analytics.mv_inventory_expiry as
select tenant_id, product_id, warehouse_id, count(*) as batches, coalesce(sum(quantity), 0) as expiring_quantity, min(expiry_date) as next_expiry_date
from public.inventory_batches
where expiry_date is not null
group by tenant_id, product_id, warehouse_id;

create materialized view if not exists analytics.mv_inventory_damage as
select tenant_id, product_id, warehouse_id, coalesce(sum(quantity), 0) as damaged_quantity, coalesce(sum(cost_impact), 0) as damage_cost
from public.inventory_damage
group by tenant_id, product_id, warehouse_id;

create materialized view if not exists analytics.mv_inventory_reorders as
select rr.tenant_id, rr.product_id, rr.warehouse_id, rr.reorder_point, rr.reorder_qty, coalesce(ii.quantity_available, 0) as current_stock
from public.inventory_reorder_rules rr
left join public.inventory_items ii on ii.tenant_id = rr.tenant_id and ii.product_id = rr.product_id and ii.warehouse_id = rr.warehouse_id;

create materialized view if not exists analytics.mv_inventory_forecasts as
select tenant_id, forecast_period, product_id, warehouse_id, sum(future_demand) as future_demand, avg(stockout_risk) as stockout_risk
from public.inventory_forecasts
group by tenant_id, forecast_period, product_id, warehouse_id;

create materialized view if not exists analytics.mv_inventory_costs as
select tenant_id, warehouse_id, period, sum(total_cost) as total_cost
from public.inventory_costs
group by tenant_id, warehouse_id, period;

create materialized view if not exists analytics.mv_inventory_health as
select tenant_id, product_id, warehouse_id, avg(health_score) as health_score, min(classification) as classification
from public.inventory_health_scores
group by tenant_id, product_id, warehouse_id;

create unique index if not exists idx_mv_inventory_summary on analytics.mv_inventory_summary (tenant_id);
create index if not exists idx_mv_inventory_value on analytics.mv_inventory_value (tenant_id, warehouse_id, category);
create index if not exists idx_mv_inventory_movements on analytics.mv_inventory_movements (tenant_id, period, transaction_type);
create index if not exists idx_mv_inventory_forecasts on analytics.mv_inventory_forecasts (tenant_id, forecast_period, product_id);

-- Enterprise Reporting Engine.
create table if not exists public.report_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  module text not null,
  description text,
  filters jsonb not null default '{}'::jsonb,
  layout jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_id uuid references public.report_templates(id),
  report_name text not null,
  module text not null,
  format text not null,
  filters jsonb not null default '{}'::jsonb,
  file_url text,
  row_count integer not null default 0,
  status text not null default 'generated',
  generated_by uuid references public.profiles(id),
  generated_at timestamptz not null default now()
);

create table if not exists public.report_archive (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  export_id uuid references public.report_exports(id) on delete set null,
  report_name text not null,
  generated_by uuid references public.profiles(id),
  generated_at timestamptz not null default now(),
  filters_used jsonb not null default '{}'::jsonb,
  format text not null,
  download_link text,
  status text not null default 'available'
);

create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  report_name text not null,
  module text not null,
  filters jsonb not null default '{}'::jsonb,
  format text not null default 'PDF',
  schedule text not null default 'Monthly',
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  next_run_at timestamptz
);

create table if not exists public.report_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  schedule_id uuid references public.report_schedules(id) on delete cascade,
  email text not null,
  recipient_type text not null default 'to',
  created_at timestamptz not null default now()
);

create table if not exists public.report_email_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  export_id uuid references public.report_exports(id) on delete set null,
  report_name text not null,
  recipient text not null,
  cc text,
  bcc text,
  subject text,
  message text,
  format text not null default 'PDF',
  delivery_status text not null default 'queued',
  opened_at timestamptz,
  sent_by uuid references public.profiles(id),
  sent_at timestamptz not null default now()
);

create table if not exists public.report_generation_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  report_name text not null,
  module text not null,
  filters jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  duration_ms integer not null default 0,
  status text not null default 'success',
  generated_by uuid references public.profiles(id),
  generated_at timestamptz not null default now()
);

create table if not exists public.report_download_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  export_id uuid references public.report_exports(id) on delete cascade,
  downloaded_by uuid references public.profiles(id),
  downloaded_at timestamptz not null default now(),
  ip_address inet,
  user_agent text
);

create table if not exists public.report_filters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  module text not null,
  filter_definition jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.report_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role text not null,
  module text not null,
  can_view boolean not null default true,
  can_generate boolean not null default false,
  can_export boolean not null default false,
  can_schedule boolean not null default false,
  can_delete boolean not null default false,
  can_admin boolean not null default false,
  unique (tenant_id, role, module)
);

create index if not exists idx_report_exports_module_generated on public.report_exports (tenant_id, module, generated_at desc);
create index if not exists idx_report_archive_generated on public.report_archive (tenant_id, generated_at desc);
create index if not exists idx_report_schedules_active on public.report_schedules (tenant_id, active, next_run_at);
create index if not exists idx_report_generation_logs_module on public.report_generation_logs (tenant_id, module, generated_at desc);

alter table public.report_templates enable row level security;
alter table public.report_exports enable row level security;
alter table public.report_archive enable row level security;
alter table public.report_schedules enable row level security;
alter table public.report_recipients enable row level security;
alter table public.report_email_logs enable row level security;
alter table public.report_generation_logs enable row level security;
alter table public.report_download_logs enable row level security;
alter table public.report_filters enable row level security;
alter table public.report_permissions enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'report_templates','report_exports','report_archive','report_schedules','report_recipients',
    'report_email_logs','report_generation_logs','report_download_logs','report_filters','report_permissions'
  ] loop
    execute format('drop policy if exists "service role all" on public.%I', t);
    execute format('create policy "service role all" on public.%I for all to service_role using (true) with check (true)', t);
    execute format('drop policy if exists "tenant read" on public.%I', t);
    execute format('create policy "tenant read" on public.%I for select to authenticated using (tenant_id = public.current_tenant_id())', t);
  end loop;
end $$;
