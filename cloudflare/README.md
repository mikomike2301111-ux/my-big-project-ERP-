# FarmTrack ERP — Cloudflare D1 production operations

Cloudflare D1 is the only application database. The live ERP keeps its authoritative
state in the `erp_state` table, stored as a verified, chunked generation behind
the `FTC-PTR` pointer. Normalized tables are incrementally reconciled from that
state and must never be bulk-deleted or overwritten during repair.

## Required Vercel environment variables

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_API_TOKEN` with Account D1 Edit permission
- `CLOUDFLARE_D1_DATABASE_NAME=erpftc_full`

Optional storage uses Cloudflare R2; email delivery uses Resend. Never commit
API tokens, R2 access keys, service credentials, or private environment values.

## Safe health checks

- `GET /api/health` — checks D1 connectivity and authoritative pointer metadata.
- Use Cloudflare's authenticated D1 query interface to inspect row counts.
- Before reconciliation, preserve the current `erp_state` generation and verify
  all chunks parse as JSON. Never use a broad `DELETE`, `REPLACE`, or
  destructive import as a repair strategy.

## Data model

The `erp_state` document is the compatibility source of truth for all ERP modules.
Normalized tables include customers, products, inventory, invoices and invoice
items, sales orders, expenses, finance accounts and journals, CRM leads and calls,
delivery records, HR employees and leave applications, requisitions, and
notifications. Data is repaired by inserting missing IDs only; existing rows are
preserved until an explicit, reviewed deduplication plan is approved.

## Deployments

Vercel builds the frontend and API from the `main` branch. Production build
scripts must apply the D1-only backend patch before compiling the frontend.
