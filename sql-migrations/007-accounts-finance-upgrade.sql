-- ============================================================
-- Migration 007: ACCOUNTS & FINANCE UPGRADE
-- Run on Supabase SQL Editor (project rajnrkgcisgpxtzzfmcl).
--
-- Adds normalized financial periods (weekly + monthly buckets behind the
-- Accounts weekly trend), per-account period balances (the Chart of Accounts
-- "Balance" column and balance-sheet source), account tags/groups, and
-- invoice numbering (the configurable INV-FTC prefix / next number).
--
-- These tables pair with the ERP RPC layer (api/rpc.js): getFinanceWorkspaceData
-- returns accountBalances + trendWeekly, and nextInvoiceNo / invoice pricing
-- settings read/save invoice_number_prefix. The app "communicates" with this
-- layer through the existing bridge / supabase sync.
-- ============================================================

-- 1. Financial periods (weekly '2026-W32' and monthly '2026-08' buckets)
create table if not exists public.financial_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  period_key text not null,
  period_type text not null default 'month',
  start_date date not null,
  end_date date not null,
  label text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  unique (tenant_id, period_type, period_key)
);

-- 2. Per-account period balances (Chart of Accounts balance column source)
create table if not exists public.account_balances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  account_id uuid references public.finance_accounts(id) on delete cascade,
  account_code text,
  account_name text,
  account_type text,
  period_key text not null default 'all',
  opening numeric(18,2) not null default 0,
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  closing numeric(18,2) not null default 0,
  computed_at timestamptz not null default now(),
  unique (account_id, period_key)
);

-- 3. Account tags / classification groups on the chart of accounts
create table if not exists public.account_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  account_id uuid references public.finance_accounts(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  unique (account_id, tag)
);

-- 4. Invoice numbering (drives the configurable INV-FTC prefix / next number)
create table if not exists public.invoice_numbering (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  prefix text not null default 'INV-FTC',
  next_number integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (tenant_id, prefix)
);

-- Indexes for fast period / balance lookups
create index if not exists idx_account_balances_period
  on public.account_balances (tenant_id, period_key);
create index if not exists idx_account_balances_account
  on public.account_balances (account_id, period_key);
create index if not exists idx_financial_periods_key
  on public.financial_periods (tenant_id, period_type, start_date);
create index if not exists idx_invoice_numbering_tenant
  on public.invoice_numbering (tenant_id);

-- Function: roll journal_lines into account_balances (closing = debit - credit).
-- Run `select public.compute_account_balances();` to (re)compute the ledger->chart link.
create or replace function public.compute_account_balances()
returns integer language plpgsql as $$
declare
  updated_count integer := 0;
begin
  insert into public.account_balances (tenant_id, account_id, account_code, account_name, account_type, period_key, debit, credit, closing, computed_at)
  select
    acc.tenant_id,
    jl.account_id,
    acc.code,
    acc.name,
    acc.type,
    'all',
    sum(coalesce(jl.debit, 0)),
    sum(coalesce(jl.credit, 0)),
    sum(coalesce(jl.debit, 0)) - sum(coalesce(jl.credit, 0)),
    now()
  from public.journal_lines jl
  join public.finance_accounts acc on acc.id = jl.account_id
  group by acc.tenant_id, jl.account_id, acc.code, acc.name, acc.type
  on conflict (account_id, period_key) do update
    set debit = excluded.debit, credit = excluded.credit,
        closing = excluded.closing, computed_at = now();
  get diagnostics updated_count = row_count;
  return updated_count;
end; $$;

-- Row Level Security: tenant-scoped (same policy shape as migration 004)
alter table public.financial_periods enable row level security;
alter table public.account_balances enable row level security;
alter table public.account_tags enable row level security;
alter table public.invoice_numbering enable row level security;
