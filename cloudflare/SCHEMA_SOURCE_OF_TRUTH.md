# Schema source of truth

**Production database:** Cloudflare D1 (`erpftc_full`)

- Canonical schema: `cloudflare/d1-schema.sql`
- State document: `erp_state` table (chunked rows `FTC-STATE-001` … when large)
- Server access: `server/d1Client.js` from Vercel serverless

## Legacy Supabase SQL (docs only — do not apply to production)

Root `SUPABASE_*.sql`, `supabase-schema.sql`, `COMPLETE_SUPABASE_SCHEMA.sql`, and `sql-migrations/*` are historical.
They remain for reference during migration review. New schema changes go into `cloudflare/d1-schema.sql` only.

## Env

See `.env.example` — `CLOUDFLARE_*` only for database.
