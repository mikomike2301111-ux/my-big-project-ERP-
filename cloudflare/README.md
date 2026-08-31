# Migrate the ERP from Supabase to Cloudflare D1

This guide moves the Unity/Farmtrack ERP off Supabase onto Cloudflare **D1
(SQLite)**, keeping the same JSON-bridge architecture so the app behaves
identically while data lives in Cloudflare.

## 0) Fix the API token (do this first — the current token is Read-only for D1)

The token you provided is valid but only has **D1:Read** (create returned
`HTTP 401 Authentication error`). Add the D1 write permission:

1. Go to <https://dash.cloudflare.com/profile/api-tokens>
2. Edit the ERP token → **Permissions**
3. Add: **Account → D1 → Edit**  (keep Account = `<account_id>` → All)
4. Save, then copy the (newly shown) token value.

Keep using the same **Account ID**: `228098755f87923ef8ee22459f97ca03`.

## 1) Create the D1 database (after fixing the token)

```sh
npx wrangler d1 create erpftc_full
# -> note the database_id it prints
```

Or create it in the dashboard: Workers & Pages → D1 → Create database → `erpftc_full`.

## 2) Apply the schema

```sh
npx wrangler d1 execute erpftc_full --remote --file=cloudflare/d1-schema.sql
```

This creates the `erp_state` bridge table plus all the normalized tables
(accounts, invoices, payments, credit notes, inventory, raw materials,
manufacturing, HR, CRM, procurement, notifications…).

## 3) Move your data (Supabase → D1)

Your app stores everything in the single `erp_state` JSON document in Supabase
(the same bridge D1 uses). To copy it over:

```sh
# Pull from Supabase (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
node cloudflare/export-erp-state.js > erp-state.json

# Then import into D1 as the bridge document
npx wrangler d1 execute erpftc_full --remote --command \
  "INSERT OR REPLACE INTO erp_state (id, data, updated_at) VALUES ('FTC-STATE-001', '$(cat erp-state.json | tr "\n" " ")', datetime('now'));"
```

> The ERP also seeds the normalized tables automatically through its sync layer,
> so after the bridge document is in D1 the app keeps working like it did on
> Supabase.

## 4) Point the app at D1 (Cloudflare Workers)

`api/rpc.js` is the Vercel-style handler. To run it on Cloudflare, wrap it in a
Worker that binds the D1 database:

- **wrangler.toml / [d1_databases]** binding: `binding = "DB"`, `database_id = "<id>"`
- The Worker `fetch` handler reads/writes the `erp_state` row instead of Supabase,
  and the `SUPABASE_*` env vars are ignored once `USE_D1=1`.

The `ftcerp-to-cloudflare-public` repo is the intended home for this deployment.

## R2 (S3 storage)

Use the R2 credentials you created for attachments/PDFs/logos:
- **Endpoint**: `https://228098755f87923ef8ee22459f97ca03.r2.cloudflarestorage.com`
- **Access Key**: `1d3aacac385b4fbb9026997646de3ad6`
- **Secret**: `6717b6986a1a5de84b08207174c826913bc1373085c45e3ffec13fc1aa65261b`

Recommended bucket: `erp-static` (invoice logos, PDFs, reports).
