# Accounting + performance harden (safe, no UI change)

## What changed
1. **server/accountingEngine.js** — double-entry helpers (cents, account resolve, invoice/payment/expense posting, balances).
2. **server/d1Client.js** — expanded normalized tables + `syncFullStateToNormalizedTables()` after saves.
3. **scripts/apply-accounting-harden.js** — patches api/rpc.js at build time (journals + sync hooks).
4. **sql-migrations/009-d1-accounting-hardening.sql** — additive tables/indexes only.
5. **scripts/backfill-normalized-from-state.js** — one-way fill of tables from erp_state (does not modify erp_state).

## Data safety
- No deletes of erp_state.
- No UI redesign.
- Normalized writes best-effort; full document remains authoritative.

## Deploy
1. Push/merge `full-erp` (Vercel build applies patches).
2. Optional: apply SQL 009 on D1.
3. Optional: run backfill script with Cloudflare env.
