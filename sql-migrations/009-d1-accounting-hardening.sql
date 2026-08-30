-- Additive only. Safe on live D1. Does not drop or rewrite erp_state.
-- Apply via: wrangler d1 execute erpftc_full --remote --file=sql-migrations/009-d1-accounting-hardening.sql

CREATE TABLE IF NOT EXISTS payment_allocations (
  id text primary key,
  tenant_id text,
  payment_id text,
  invoice_id text,
  amount_allocated real default 0,
  created_at text not null default (datetime('now'))
);

CREATE TABLE IF NOT EXISTS account_balances (
  id text primary key,
  tenant_id text,
  account_id text,
  account_code text,
  account_name text,
  account_type text,
  period_key text not null default 'all',
  opening real not null default 0,
  debit real not null default 0,
  credit real not null default 0,
  closing real not null default 0,
  computed_at text not null default (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_numbering (
  id text primary key,
  tenant_id text,
  prefix text not null default 'INV-FTC',
  next_number integer not null default 1,
  updated_at text not null default (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON payment_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS idx_account_balances_account ON account_balances (account_id, period_key);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices (invoice_date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines (account_code);
