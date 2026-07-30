# FarmTrack ERP Follow Up

Date prepared: 2026-07-01
Project: FarmTrack ERP / Unity ERP
Production URL: https://erpftc.vercel.app
Repository: mikomike2301111-ux/my-big-project-ERP-

This file is a living follow-up document for the ERP work. It records what changed, what stayed the same, what is working, what needs another human test pass, and what was intentionally left stable so the project code is not destroyed by broad rewrites.

The user requested a very long follow-up file. Instead of adding thousands of filler lines, this document is structured as a practical handover that can keep growing after every deployment.

## Current Status Summary

- The ERP is still a React/Vite frontend with Vercel serverless API routes.
- The production alias remains `https://erpftc.vercel.app`.
- CRM, Accounts, Finance, HR, Email, Manufacturing, Reports, Inventory, Sales, and Purchases are still the main operating areas.
- Supabase/server persistence is used through the existing RPC layer.
- Google Sheets sync is still present, but save actions were changed so spreadsheet sync does not block the user and cause 504 timeouts.
- Resend email remains the email provider path.
- The UI styling has been moving toward quieter ERP screens with more useful data density.

## Important Safety Notes

- No secrets are written in this document.
- API tokens, Supabase keys, Vercel tokens, GitHub tokens, and Resend keys should stay in environment variables only.
- Any old tokens pasted in chat should be rotated if they are still live.
- Large UI changes should be verified with `npm run build` before pushing.
- Any workflow that changes customer, sale, invoice, call, delivery, leave, or payment records should be tested with one temporary record and then cleaned up.

## Timeline

### 2026-06-30

Initial major continuation work focused on deployment, CRM reports, invoice printing, HR/leave email approvals, Supabase integration, Google Sheets export, and skeleton/loading states.

Changes made:

- Connected Vercel deployment flow for the existing ERP project.
- Preserved the production alias `https://erpftc.vercel.app`.
- Added CRM spreadsheet export actions.
- Added calls spreadsheet export action.
- Added open Google Sheet link in CRM.
- Improved CRM report header color direction from green-heavy to blue/black in report header areas.
- Added spreadsheet export fallback when Google export is unavailable.
- Added CRM delivery report preview actions.
- Added delivery confirmation actions and delivery record status controls.
- Added invoice print/download/email controls in Accounts.
- Added invoice PDF generation through the backend.
- Added tax invoice layout based on the FarmTrack template.
- Added HR leave action email flow and server action handling.
- Added email tracking route and related email log support.
- Added Supabase diagnostics and integration status areas.
- Improved dashboard period buttons so Week, Month, Year affect data instead of only sitting visually.
- Reduced overly zoomed layout behavior in later CSS passes.
- Improved CRM customer pagination to show smaller batches.
- Added customer detail modal with purchases, calls, and deliveries.
- Added CRM pipeline drag/drop optimistic updates.
- Added follow-up and call comment workflow.
- Added latest calls view with a limited starting display.
- Added "load more" for calls, later replaced with scroll behavior.

What stayed the same:

- Main navigation list stayed intact.
- Existing data model names stayed mostly intact.
- Main RPC route stayed the central backend gateway.
- Vercel project link stayed unchanged.
- The overall ERP page structure stayed in place.

Working after this pass:

- Production build completed.
- Git push completed.
- Vercel production deploy completed.
- CRM spreadsheet export returned rows in earlier live testing.
- Calls spreadsheet export returned rows in earlier live testing.
- Invoice PDF generation worked locally.
- CRM customer save and lead move worked in a local RPC smoke test.

Risks noted:

- Browser cache can show old frontend after deployment until hard refresh.
- Serverless function timeouts can happen if mutation waits for slow external sync.
- Some pages still had old black buttons and inconsistent green styling.
- Email workspace UI was functional but not polished.

### 2026-07-01

Second continuation focused on finishing CRM persistence, Accounts improvements, Email UI rebuild, green action button styling, scroll surfaces, and this follow-up document.

Changes made:

- Changed mutation flow so records save before external spreadsheet sync runs.
- Spreadsheet sync now runs in the background after a mutation.
- Save path no longer waits for slow Google Sheets sync.
- This directly targets `HTTP 504: empty response from server` during saves.
- CRM Log Call now starts blank instead of pre-filling the first customer.
- CRM Log Call can still link to an existing customer.
- CRM Log Call can create a call lead when no existing customer is selected.
- CRM input modal was widened.
- CRM input modal now has external data paste/import-to-form support.
- CRM input modal now shows possible existing customer matches.
- CRM input modal got an African-pattern side accent.
- CRM Analytics now includes pipeline stage health.
- CRM Analytics now includes follow-up pressure.
- CRM Analytics now includes delivery watch.
- CRM Analytics now includes recent purchase signals.
- Accounts overview now includes a stronger command strip.
- Accounts overview now includes multi-metric Accounts Movement chart.
- Accounts Movement shows revenue, expenses, cash, AR, AP, and profit together.
- Accounts CSV export buttons were added for receivables.
- Accounts CSV export buttons were added for payables.
- Accounts CSV export button was added for chart of accounts.
- Accounts CSV export button was added for bank transactions.
- Accounts CSV export button was added for ledger lines.
- Accounts CSV export button was added for journals.
- Accounts Cash Position now reads `cashBalance` or falls back to `cashPosition`.
- Invoice preview now shows invoice number clearly.
- Invoice PDF now supports VAT modes: auto, no VAT, and 16 percent VAT.
- Invoice PDF header spacing was improved.
- Invoice PDF line item spacing was improved.
- Invoice PDF fallback item uses subtotal correctly when VAT is added.
- Email workspace tabs expanded to Compose, Drafts, Sent, Templates.
- Email workspace added draft save/load using browser local storage.
- Email template list added search.
- Email template list added category filter.
- Email template UI moved closer to the supplied screenshot: white shell, tab bar, cards, tools row.
- Long CRM calls moved away from "load more" into scroll behavior.
- A general scroll treatment was added for long tables and feature lists.
- A green action button layer was added under page content, excluding black hero/top areas.
- Small action buttons stay small through scoped CSS.
- Larger primary actions keep larger sizing.

What stayed the same:

- Email send RPC remains `sendComposedEmail`.
- Resend integration remains the email delivery route.
- Existing email log screen remains available.
- Existing main page heroes remain black/dark where already designed.
- Sidebar and topbar were not repainted by the green action layer.
- Core backend tables and RPC names were not renamed.
- Existing report generation structure remains.
- Existing invoice email backend remains.

Working after this pass:

- Local build had passed before the Email/style continuation.
- RPC saveCustomer smoke test worked.
- RPC saveLead stage move smoke test worked.
- Finance workspace data loaded locally.
- Invoice PDF generation worked locally.

Still to verify after final build:

- Email workspace JSX compiles after the new Email shell changes.
- Green button layer does not overpaint modal close buttons in a bad way.
- Scroll surfaces feel good on laptop and mobile.
- CRM call table remains usable with many rows.
- Email draft local storage works in browser.
- Template search and category filter work in browser.
- Production Vercel deployment succeeds after these latest UI changes.

## Module Follow Up

### Dashboard

Changed:

- Period buttons had earlier work so Week, Month, Year affect the data passed into pages.
- Dashboard layout stayed visually close to the existing ERP style.

Stayed:

- Black hero/topbar visual identity stayed.
- KPI structure stayed.

Working:

- Build previously passed with the period-related changes.

Next:

- Human test Week/Month/Year on production after hard refresh.
- Confirm all dependent pages receive the expected period.

### Analytics

Changed:

- Analytics got several rounds of improvement.
- CRM analytics now shows actual CRM operating data instead of only generic charts.
- Accounts movement now has a multi-metric chart.

Stayed:

- Recharts remains the charting library.
- Existing analytics page architecture stayed intact.

Working:

- Previous build passed after Accounts chart introduction.

Next:

- Check chart colors on laptop screens.
- Confirm no labels overlap on mobile.
- Confirm Revenue Heatmap is still readable.

### CRM

Changed:

- New customer and call flows were improved.
- Log Call starts blank.
- Existing customer suggestions appear while typing.
- External data can be pasted into the CRM form.
- Customer cards are paginated and clickable.
- Customer detail modal shows purchases, calls, and deliveries.
- Calls table is now scroll-oriented instead of load-more-oriented.
- CRM reports got spreadsheet actions and report exports.
- Pipeline saves are designed to persist through the RPC backend.

Stayed:

- CRM route remains `#/crm/...`.
- Main tabs remain overview, pipeline, customers, leads, calls, activities, reports, analytics.
- Existing customer records and imported QuickBooks-style data stay in place.

Working:

- Local RPC save customer test worked.
- Local RPC lead stage move test worked.
- Spreadsheet export had earlier successful row output.

Need human test:

- Add a real customer from `#/crm/customers`.
- Add a call for a new caller.
- Drag a pipeline card, refresh, confirm stage remains.
- Open CRM spreadsheet action.
- Export CRM reports.
- Confirm delivery records reflect sales/accounts records.

### Accounts

Changed:

- Create Order action is present in Accounts.
- Confirm Paid action is present.
- Balance Expense action is present.
- CSV export actions added.
- Accounts Movement chart shows multiple lines.
- Cash Position fallback fixed.
- Invoice controls improved.
- Invoice number is visible.
- VAT can be auto, no VAT, or 16 percent.

Stayed:

- Accounts still uses the Finance workspace backend.
- Existing tabs remain Overview, Chart, Receivables, Payables, Banking, Trial, Journals, Reconciliation, Reports.
- InvoiceDocumentTable remains the shared invoice action surface.

Working:

- Finance payload loaded locally.
- Invoice PDF generated locally.

Need human test:

- Create order from Accounts.
- Confirm it appears in CRM customer purchases.
- Confirm delivery queue receives sale/delivery.
- Export receivables CSV.
- Export payables CSV.
- Print invoice with no VAT.
- Print invoice with 16 percent VAT.
- Email invoice to a customer with an email address.

### Finance

Changed:

- Accounts/Finance data relationship is clearer.
- Long tables get scroll behavior.
- CSV export options are more visible in Accounts views.

Stayed:

- Finance dashboard remains separate from Accounts workspace.
- Finance quick posting remains.
- Trial balance and ledger remain.

Working:

- Finance workspace data loaded locally with accounts, receivables, payables, journals, and bank transactions.

Need human test:

- Confirm cash and profit values match expected accounting records.
- Check long ledger scroll.
- Export bank transactions.

### Email

Changed:

- Email page now has Compose, Drafts, Sent, Templates.
- Drafts are saved in browser local storage.
- Template search added.
- Template category filter added.
- Template cards follow the screenshot more closely.
- Primary actions use the new green action style.

Stayed:

- Email backend uses existing `sendComposedEmail`.
- Email log is still read through `getEmailLog`.
- Email Admin remains a separate page.
- Resend remains the configured sender service.

Working:

- The backend email route had already been wired.
- Earlier test email support exists in Settings/Email.

Need human test:

- Compose email to a test recipient.
- Save a draft, leave the tab, return to Drafts, reload it.
- Use a template to fill subject and body.
- Send from template.
- Check Sent.
- Check Email Admin log.

### HR And Leaves

Changed:

- Leave workflow was improved earlier with email approval action routes.
- HR input screens were expanded earlier.
- Leave balances and approvals were improved earlier.

Stayed:

- HR page remains the main staff/leave/attendance area.
- Leave action API route remains.

Working:

- Email approval routes exist and were part of earlier backend work.

Need human test:

- Apply for leave as employee.
- Confirm boss/HR receives email.
- Approve from email button.
- Confirm status changes inside ERP.
- Confirm applicant receives decision email.

### Manufacturing

Changed:

- Manufacturing input areas were made more workable earlier.
- Long manufacturing tables now benefit from general scroll treatment.
- Action buttons now receive the green action style.

Stayed:

- Manufacturing tabs and production order flow remain.
- Existing raw material and production order forms remain.

Need human test:

- Receive raw material.
- Create production order.
- Start production order.
- Complete production order.
- Confirm inventory impact.

### Inventory

Changed:

- Long inventory tables now benefit from scroll treatment.
- Existing action buttons receive the green action style.

Stayed:

- Inventory core sections remain stock, warehouses, movements, adjustments, transfers, receiving, dispatch, audits, expiry, damaged, alerts, reports, analytics, forecasting, AI.

Need human test:

- Stock adjustment.
- Transfer stock.
- Check alert center.
- Export inventory reports.

### Sales

Changed:

- Sales order creation remains linked to invoice/delivery flow.
- Action buttons receive the green style.

Stayed:

- Sales workspace remains the main sales order and delivery queue path.

Need human test:

- Create sale.
- Confirm invoice appears in Accounts.
- Confirm customer purchase appears in CRM.
- Confirm delivery record appears.

### Reports

Changed:

- Report export buttons now inherit green action styling.
- Report tables and lists have better scroll behavior.

Stayed:

- Report generation center remains.
- PDF, Excel, CSV, Print, Email package options remain.

Need human test:

- Generate PDF.
- Generate Excel.
- Generate CSV.
- Email report.

## What The User Asked For And How It Was Addressed

Request: Stop HTTP 504 on saves.

Response:

- Mutation RPC path now saves first.
- Background sync runs after save.
- This reduces blocking external sync failures.

Request: CRM new customer not saving.

Response:

- Save path tested locally.
- CRM modal improved.
- Existing customer matching added.
- New caller creation improved.

Request: Pipeline drag/drop not sticking.

Response:

- Local RPC lead move verified.
- UI refreshes after save.
- Backend save happens before external sync.

Request: Accounts order should reflect in CRM.

Response:

- Accounts uses NewSaleModal.
- Sale creates order/delivery/invoice through existing backend.
- CRM overview already consumes orders/deliveries.

Request: Invoices should be printable and have invoice number and optional VAT.

Response:

- Invoice number shown in UI and PDF.
- VAT mode added.
- PDF spacing improved.

Request: CRM should not show too much data all at once.

Response:

- Customer grid uses pagination.
- Calls now use scroll surface.
- Reports and tables use scrollable containers.

Request: Email UI looks bad.

Response:

- Email tabs rebuilt.
- Drafts added.
- Template search/category/card interface added.
- Green button styling applied.

Request: Buttons should look green but black top areas should stay.

Response:

- Green action styling scoped to page content below heroes.
- Sidebar/topbar/hero black areas are not targeted.
- Small buttons stay compact through scoped sizing.

Request: Follow-up documentation.

Response:

- This `follow up.md` file was added.

## Verification Checklist

Run before deployment:

```bash
npm run build
node --check api/rpc.js
git diff --check
```

Optional local RPC checks:

```bash
node -e "const { invokeRpc } = require('./api/rpc.js'); console.log(typeof invokeRpc)"
```

Production checks after deployment:

- Open https://erpftc.vercel.app
- Hard refresh with Ctrl + F5.
- Open CRM Customers.
- Save a test customer.
- Delete or archive test customer if needed.
- Open CRM Pipeline.
- Drag one test lead.
- Refresh and confirm it stayed.
- Open Accounts Overview.
- Confirm Cash Position is not incorrectly zero when backend cash exists.
- Open Receivables.
- Download CSV.
- Generate invoice PDF.
- Generate invoice PDF with no VAT.
- Generate invoice PDF with 16 percent VAT.
- Open Email.
- Save a draft.
- Use a template.
- Send a test email.
- Open Email Admin logs.

## Deployment Record

Last known pushed production commit before this document:

- `3bba2c0 Improve CRM persistence and accounts workflow`

Latest local changes after that commit:

- Email UI state changes.
- Email Drafts state.
- Template search/category logic.
- Scoped green button CSS.
- Scroll surface CSS.
- CRM calls scroll change.
- This follow-up document.

These latest changes need a fresh build, commit, push, and deploy after verification.

## Known Remaining Questions

- Should drafts sync to the database instead of browser local storage?
- Should email templates be editable and saved to Supabase?
- Should every report table have per-table height settings?
- Should CRM customer import support full CSV upload, not only paste-to-form?
- Should Accounts have a dedicated order lifecycle board?
- Should delivery confirmation have signed proof of delivery attachment upload?
- Should invoice VAT default be controlled by customer/product tax rules?
- Should spreadsheet sync status be visible per module?
- Should failed background sync jobs be retried automatically?

## Recommended Next Sprint

1. Make email templates database-backed.
2. Add true CSV import wizard for CRM, Accounts, Inventory, Manufacturing, and HR.
3. Add delivery proof attachments.
4. Add audit trail modal for every customer/order/invoice.
5. Add background sync queue with retry status.
6. Add Supabase index review for high-use tables.
7. Add pagination API support for heavy tables instead of client-only scrolling.
8. Add Playwright smoke tests for CRM save, pipeline drag/drop, invoice PDF, and email send.
9. Add role-specific dashboards for HR, Accounts, Sales, and Warehouse.
10. Add clear staging/test data cleanup tools.

## Final Notes

The ERP has moved from a visual prototype toward a testable operations system. The most important improvement was making save operations return quickly and not wait on external spreadsheet sync. The second most important improvement was making CRM and Accounts share the same sale, invoice, customer, and delivery story. The newest work improves usability: green action buttons, scrollable dense data, and a cleaner Email workspace.

Keep this file updated after every push.
