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
      live health probe).
- [x] This file re-created with no secrets.
- [ ] Remove stray pre-deploy `*.log` artifacts before next release.