-- ============================================================
-- Migration 008: RAW MATERIALS INVENTORY MODULE
-- Run on Supabase SQL Editor AFTER 000-base-and-fixed-001-003.
-- Decimal-safe, SKU-keyed idempotent seed of the 24/07/2026 report.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.raw_materials_inventory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  name text not null,
  sku text not null unique,
  description text,
  category text default 'Raw Material',
  unit_of_measure text not null,
  quantity_on_hand numeric(18,6) not null default 0,
  minimum_stock_level numeric(18,6) default 0,
  maximum_stock_level numeric(18,6),
  unit_cost numeric(18,4),
  total_value numeric(18,4) default 0,
  status text not null default 'IN STOCK',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.raw_material_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  material_id uuid not null references public.raw_materials_inventory(id) on delete cascade,
  material_name text,
  sku text,
  transaction_type text not null,
  quantity numeric(18,6) not null default 0,
  before_quantity numeric(18,6) default 0,
  after_quantity numeric(18,6) default 0,
  unit_of_measure text,
  reference text,
  notes text,
  user_name text,
  transaction_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_rmi_sku on public.raw_materials_inventory (sku);
create index if not exists idx_rmi_tenant on public.raw_materials_inventory (tenant_id, status);
create index if not exists idx_rmm_material on public.raw_material_movements (material_id, transaction_date desc);

create or replace function public.recalc_raw_material_status(rid uuid)
returns void language plpgsql as $$
begin
  update public.raw_materials_inventory rm
  set status = case
        when rm.quantity_on_hand <= 0 then 'OUT OF STOCK'
        when rm.maximum_stock_level is not null and rm.maximum_stock_level > 0 and rm.quantity_on_hand > rm.maximum_stock_level then 'OVERSTOCKED'
        when rm.minimum_stock_level > 0 and rm.quantity_on_hand <= rm.minimum_stock_level then 'LOW STOCK'
        else 'IN STOCK'
      end,
      total_value = coalesce(rm.quantity_on_hand * rm.unit_cost, 0),
      updated_at = now()
  where rm.id = rid;
end; $$;
-- ============================================================
-- IDEMPOTENT SEED - inventory report dated 24/07/2026 (14 items)
-- ON CONFLICT (sku) DO UPDATE keeps quantities/units exact, never
-- creates duplicates on re-run.
-- ============================================================
insert into public.raw_materials_inventory (tenant_id, name, sku, category, unit_of_measure, quantity_on_hand, minimum_stock_level, unit_cost, status)
select t.id, v.name, v.sku, 'Raw Material', v.unit, v.qty, 0, null,
       case when v.qty <= 0 then 'OUT OF STOCK' else 'IN STOCK' end
from public.tenants t
cross join (values
  ('50ml agro bottles','RM-001','units',0),
  ('100ml agro bottles','RM-002','units',36),
  ('250ml agro bottles','RM-003','units',1228),
  ('500ml agro bottles','RM-004','units',1217),
  ('1L agro bottles','RM-005','units',1077),
  ('5L agro bottles','RM-006','units',1109),
  ('Biopesticide spores','RM-007','g',622.7),
  ('Cotton rolls','RM-008','units',3315),
  ('Cuelure','RM-009','kg',24.6),
  ('Bactrolure pouches','RM-010','units',8498),
  ('Cuelure pouches','RM-011','units',85028),
  ('Methyl Eugenol','RM-012','kg',89.13),
  ('Canola oil','RM-013','units',0),
  ('Oshothion','RM-014','L',5.4)
) as v(name, sku, unit, qty)
on conflict (sku) do update
  set unit_of_measure = excluded.unit_of_measure,
      quantity_on_hand = excluded.quantity_on_hand,
      status = case when excluded.quantity_on_hand <= 0 then 'OUT OF STOCK' else 'IN STOCK' end,
      updated_at = now();

-- OPENING BALANCE movements dated 24/07/2026 (idempotent, once per material)
insert into public.raw_material_movements (tenant_id, material_id, material_name, sku, transaction_type, quantity, before_quantity, after_quantity, unit_of_measure, reference, notes, user_name, transaction_date)
select
  rm.tenant_id, rm.id, rm.name, rm.sku, 'OPENING_BALANCE', rm.quantity_on_hand, 0, rm.quantity_on_hand, rm.unit_of_measure,
  'OPN-24-07-2026', 'Opening balance per inventory report 24/07/2026', 'System', '2026-07-24'
from public.raw_materials_inventory rm
where not exists (
  select 1 from public.raw_material_movements m
  where m.material_id = rm.id and m.transaction_type = 'OPENING_BALANCE' and m.transaction_date = '2026-07-24'
);

-- ============================================================
-- Row Level Security: service-role only (server path), posture of 003/004.
-- ============================================================
alter table public.raw_materials_inventory enable row level security;
alter table public.raw_material_movements enable row level security;
do $$
declare t text;
begin
  foreach t in array array['raw_materials_inventory','raw_material_movements']
  loop
    execute format('drop policy if exists "service_all_%I" on public.%I', t, t);
    execute format('create policy "service_all_%I" on public.%I for all to service_role using (true) with check (true)', t, t);
  end loop;
end $$;
