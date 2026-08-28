# BACKLOG — no-secrets tracking file

> Live/seekrit values are intentionally **not** in this file. Everything here is
> a plain-language checklist of known work, with no keys, tokens, or endpoints
> that must stay private.

## Convention
- `[x]` done & pushed · `[~]` partial · `[ ]` open
- Latest feature commit on `full-erp`: **a3c7132** (COA editing ×10 + fast-save).

## Backend save speed (root-cause perf)
- [x] Normalized / table-level write path for invoices, payments, expenses,
      requisitions, calls (`server/d1Client.js` → `upsertStateRows`).
- [x] Coalescing write worker in `api/rpc.js` so concurrent saves share one
      full-document D1 write; authoritative full-state save is always awaited
      (no data-loss regression; kill-switch envs `NORMALIZED_WRITES_DISABLED`).
- [~] Further latency reduction (dedicated write queue tuning) if needed.

## Chart of Accounts
- [x] In-place row edit: code, name, type, parent, status, normal balance
      (double-click or the Inline edit action).
- [x] New `Delete account` (hard-delete only when unused; otherwise deactivate),
      `Duplicate`, edit/duplicate/bulk-add via the account modal, CSV/PDF export.
- [x] `saveFinanceAccount` persists `description` + `normalBalance`.

## Expenses
- [x] Expense entry REQUIRES a category; account auto-mapped to COA
      (`recordFinanceExpense`), persisted with `expenseAccountId`.
- [x] Accounts → Expenses: per-category totals + bar chart by category +
      category filter dropdown.

## HR users / access
- [x] Per-user page-access checkbox grid (Settings → user edit) stored as
      `user.allowedPages`, overriding the role default.
- [x] `deleteUser` RPC — soft deactivate (guarded: can't deactivate self /
      primary developer).
- [x] `getAllowedPages` now honours the per-user override.
- [ ] (Optional) not in this build.

## Email verification
- [~] Wiring verified (Resend key present); live end-to-end inbox test still
      to be done against production.

## Navigation
- [x] Finance + Accounts merged into one **Accounting** nav item; the combined
      page toggles Accounts / Finance tab-sets. Old `finance`/`accounts` links
      still route into the merged page.

## UI polish
- [x] AI assistant FAB is now a cube/symbol with no glow.
- [x] Chart scaling: zero-baselined the money line charts (revenue/expenses/
      profit, value line, team performance) so trends no longer "bulge".

## Housekeeping
- [x] Permanent smoke test: `node scripts/smoke.js` (+ `--live <url>` for a
      live health probe), now also checks the user-audit script + productSummaryOf.
- [x] **HR user audit:** `npm run audit:users` — read-only report of all users,
      exact-email duplicates, near-dup names, and flagged test/dev accounts
      (priority P1/P2/P3 + a protected safelist + history-ref counts).
- [x] **HR can hard-delete users** — `deleteUser` now permanent (HR/Admin/Dev),
      guards self-delete + primary dev; Users & Roles gate includes HR.
- [x] **Accounts + CRM can hard-delete records** — `deleteRecord(..., { hard:true })`
      permanently removes invoices, customers, calls, leads, expenses, etc., while
      still blocking posted/accounting-linked records. UI adds "Delete permanently"
      in CRM (customer/call/lead) and Accounts (invoice) menus.
- [x] **HR directory can hard-delete** — "Delete permanently" on each employee row
      (calls `permanentlyDeleteEmployee`, Admin-guarded, keeps history).
- [x] **Page access in Settings fully fixed + 10× upgraded** — root cause fixed:
      `publicUser()` was overwriting the stored per-user `allowedPages` with role
      defaults on every login; now the stored override wins (empty = role default).
      10× upgrade: role-default preview badges, grouped sections with live counts,
      "Use role default / Grant all / Clear" buttons, and a custom-access badge
      column in the users table (`getSettingsWorkspaceData` returns allowedPages).
- [x] **Supabase → Cloudflare D1 messaging** — Settings "supabase" tab relabeled
      "D1 / Bridge"; integrations list + status endpoint show Cloudflare D1/R2 as
      primary, Supabase marked legacy/optional.
- [x] **Ring loading state** — new `.ring-loader` spinner + label in the global
      `Loading` component and CSS.
- [x] **Delivery / CRM / Sales product visibility** — delivery, CRM and Sales views
      now show product count, total units, and the product list plus destination:
      - backend `productSummaryOf()` helper; Delivery workspace + CRM delivery
        previews + Sales orders/queue + detail modals enriched with items,
        productCount, totalQty, productsSummary, destination.
- [x] **Top bar / mobile Car Requisition** — consolidated responsive CSS and made
      Car Requisition always reachable on phones (icon-only, reordered).
- [x] This file re-created with no secrets.
- [ ] Remove stray pre-deploy `*.log` artifacts before next release.
- [ ] Run `npm run audit:users`, review the flagged list, then run the one-time
      production cleanup (soft-deactivate duplicates + test accounts, keep canonicals).