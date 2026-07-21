# FarmTrack ERP — Sales Forms & Visits Plan

Date prepared: 2026-07-21
Direct Sales Sheet: https://docs.google.com/spreadsheets/d/1Ki9B7NjGLaJaKvEfJbicf8pK3IPOafoyF084QdK7QMs/edit?gid=603206959#gid=603206959
Visits Google Form: https://docs.google.com/forms/d/e/1FAIpQLSfpabQbCcjmPflzWccaqXR62ZNsP9-2ImEi6dBrc7zEbue4mg/viewform
ERP Sales → Import tab + Sales → Visits tab consume the CSV that comes out of these forms.

## Overview

You will create **5 Google Forms** total:

1. **Direct Sales — Edna** (pre-filled salesperson = Edna)
2. **Direct Sales — Njoroge** (pre-filled salesperson = Njoroge)
3. **Direct Sales — Joseph** (pre-filled salesperson = Joseph)
4. **Direct Sales — Purity** (pre-filled salesperson = Purity)
5. **Field Visit Log** (shared by all 4 salespeople, salesperson is a dropdown)

All 5 forms link their responses to **one master Google Sheet** (the existing sheet above). Use a different tab/sheet per form inside that one spreadsheet:
- Tab `Edna` · Tab `Njoroge` · Tab `Joseph` · Tab `Purity` · Tab `Visits`

From each tab you can export CSV and import it straight into the ERP (Sales → Import for orders, Sales → Visits → Import CSV for visits), or use Apps Script to push rows into the ERP automatically.

---

## Part A — The 4 Direct Sales Forms (one per salesperson)

Each of the 4 forms is **identical in structure**. The only difference is the salesperson name is pre-set on each form so the rep doesn't pick themselves.

### Form Title (put this at the top of each form)
**Sales Order Form — [Salesperson Name]**

Example for Edna's form:
> **Sales Order Form — Edna**

### Description (put this right under the title)
> Submit new customer orders here. Required fields are marked with *. One form entry = one order line. Please ensure the Product name matches the product list exactly. Your details will create the sales order, invoice, and delivery in the ERP and update the customer's CRM record. The salesperson field is pre-filled for you.

### The 10 questions (in order)

| # | Question | Field Type | Required? | Notes |
|---|---|---|---|---|
| 1 | Customer / Business Name | Short answer | **Yes** | |
| 2 | Contact Person Name | Short answer | **Yes** | |
| 3 | Phone Number | Short answer (number validation) | **Yes** | |
| 4 | Order Date | Date (default today) | **Yes** | |
| 5 | Product / Service Name | **Dropdown** | **Yes** | Use the 24-item product list below |
| 6 | Quantity | Short answer (number, min 1) | **Yes** | |
| 7 | Unit Price (KES) | Short answer (number) | **Yes** | |
| 8 | Total Amount (KES) | Short answer (number) | **Yes** | qty × unit price |
| 9 | Payment Terms | Dropdown: Cash / M-Pesa / Credit 30 days / Credit 60 days | No | maps to paymentMethod |
| 10 | Notes / Special Requests | Paragraph | No | |

> **Email is NOT required.** Email is in the "extra" section below and is optional — the order does not depend on it.

### Product dropdown (use exactly these 24 options + "Other")

1. Bactrolure
2. Cue Lure Plug
3. Cera-Lure
4. Torula/Bait Track
5. FCM Lure
6. TutaLure
7. FAW Lure
8. Dupontrack Lure
9. Helitrack Lure
10. Supa Track Lure
11. Spodotrack Lure
12. Metatrack Plus
13. Miltrack Fungicide
14. Yellow / Clear Lynfield Trap
15. MaXtrap
16. Yellow & Blue Rollers
17. Delta Inserts
18. Delta Trap
19. Blue and Yellow Sticky Cards
20. Femitrack
21. Bacitrack
22. Wiltrack
23. Tichotrack
24. Other

### Extra fields (include them, but NOT required)

These map directly to ERP `saveSale` / `importSalesOrders` fields. Add them after question 10:

| Question | Field Type | Required? | Maps to |
|---|---|---|---|
| Email Address | Email | No | customerEmail |
| Shipping Address | Paragraph | No | destination |
| Delivery Method | Dropdown: Pick-up / Our Transport / Courier | No | deliveryMethod |
| County / Town | Short answer | No | city |
| Preferred Delivery Date | Date | No | (informational) |
| Salesperson | Short answer **pre-filled** | No | (pre-filled per form) |

**How to pre-fill the salesperson per form:** In Google Forms, add `?prefill_salesperson=Edna` style via the pre-fill link, OR just hard-code a hidden/short-answer field with the default value set to that rep's name. The simplest approach: add "Salesperson" as a Short answer with the default value set to that rep's name (Edna / Njoroge / Joseph / Purity) and mark it **not required** but **pre-filled**, so the rep sees it but doesn't have to touch it.

### How to set each form up

1. Create the form once with all the questions above.
2. Duplicate it 3 times (Google Forms: ⋮ → Make a copy).
3. On each copy, change only:
   - The title suffix (Edna / Njoroge / Joseph / Purity)
   - The pre-filled Salesperson value
4. On each form: **Responses → Link to Sheets** → choose the existing master sheet → create a new tab named after the rep.

### Master Sheet columns (auto-created by the forms)

When you link responses to the sheet, Google will create these columns automatically:
`Timestamp, Customer / Business Name, Contact Person Name, Phone Number, Order Date, Product / Service Name, Quantity, Unit Price (KES), Total Amount (KES), Payment Terms, Notes / Special Requests, Email Address, Shipping Address, Delivery Method, County / Town, Preferred Delivery Date, Salesperson`

Add these extra columns in the sheet for ERP tracking:
- `Order ID` (auto via Apps Script)
- `Status` (New / Confirmed / Imported)
- `CRM Customer ID`
- `ERP Sale No` (filled when imported into the ERP)

---

## Part B — The Field Visit Log Form (1 shared form)

This is the daily-activity / follow-up / potential-spotting form used by all 4 salespeople.

### Form Title
**Field Visit Log**

### Description (put this at the top)
> Log every shop/customer visit here. One form entry = one visit. This feeds the Visits page in the ERP: follow-ups, sales potentials, and the daily activity log. If the outcome is "Interested" or "Order placed", the ERP will automatically create a CRM lead for that shop.

### The 8 questions (in order)

| # | Question | Field Type | Required? | Notes |
|---|---|---|---|---|
| 1 | Salesperson | Dropdown: Edna / Njoroge / Joseph / Purity | **Yes** | who is filling the form |
| 2 | Shop / Customer Name | Short answer | **Yes** | the shop or customer visited |
| 3 | Contact Person | Short answer | No | person spoken to |
| 4 | Phone | Short answer (number) | No | |
| 5 | Product Discussed | Dropdown (same 24-item list + Other) | No | |
| 6 | Outcome of the Visit | Dropdown: Interested / Stock check done / Left sample / Follow-up needed / Not interested / Order placed / No decision | **Yes** | drives potentials + auto-lead |
| 7 | Stock Levels Observed | Short answer | No | e.g. "3 cartons of FCM Lure" |
| 8 | Next Expected Appointment | Date | No | drives the follow-up board |

### Extra fields (include, not required)

| Question | Field Type | Required? | Maps to |
|---|---|---|---|
| Email (optional) | Email | No | email |
| Potential Value (KES) | Short answer (number) | No | potentialValue |
| Comments / Notes | Paragraph | No | comments |
| Visit Date | Date (default today) | No | visitDate |

### Master Sheet tab for visits

Link this form's responses to a tab called **Visits** in the same master sheet. Columns:
`Timestamp, Salesperson, Shop / Customer Name, Contact Person, Phone, Product Discussed, Outcome of the Visit, Stock Levels Observed, Next Expected Appointment, Email, Potential Value (KES), Comments / Notes, Visit Date`

Add these tracking columns:
- `Visit ID`
- `ERP Lead Created` (Yes/No — set by ERP when imported)
- `Status` (Open / Closed / Converted)

---

## Part C — How everything links together

```
4 Direct Sales Forms ─┐
                      ├─→ One Master Google Sheet (5 tabs)
Field Visit Form ─────┘            │
                                   ├─→ Export CSV per tab
                                   │        │
                                   │        ├─→ ERP: Sales → Import  (orders → saveSale → invoice + delivery + finance)
                                   │        └─→ ERP: Sales → Visits → Import CSV  (visits → logVisit → auto-lead if interested)
                                   │
                                   └─→ (optional) Apps Script / Zapier / Make.com pushes rows to ERP RPCs:
                                            importSalesOrders(user, rows)
                                            importVisits(user, rows)
```

### What the ERP does with each

- **Direct Sales rows** → `importSalesOrders` → each row becomes a full sales order (customer matched/created in CRM, product matched from catalog, invoice + delivery + finance journals created). See ERP Sales → Import tab.
- **Visit rows** → `importVisits` → each row becomes a visit record (Sales → Visits tab). If outcome is "Interested" or "Order placed", a CRM lead is auto-created with the potential value and assigned to that salesperson.

### The Visits page in the ERP (Sales → Visits tab)

Shows:
- **Today's Visits** count
- **Open Follow-ups** board (next appointments, sorted by date)
- **Sales Potentials** board (interested/order-placed visits with potential value)
- **By Salesperson** table (visits, follow-ups, potential per rep)
- **Visit Activity Log** (full table with comments, stock levels, outcomes, edit/delete)
- **Log Visit** button (8-field form, same as the Google Form)
- **Import CSV** button (paste or upload from the Visits sheet tab)
- **Open Sheet** link (jumps to the master Google Sheet)

---

## Part D — Products master list (for the dropdowns)

Use this exact list in both the Direct Sales "Product / Service Name" dropdown and the Visit "Product Discussed" dropdown:

Bactrolure · Cue Lure Plug · Cera-Lure · Torula/Bait Track · FCM Lure · TutaLure · FAW Lure · Dupontrack Lure · Helitrack Lure · Supa Track Lure · Spodotrack Lure · Metatrack Plus · Miltrack Fungicide · Yellow / Clear Lynfield Trap · MaXtrap · Yellow & Blue Rollers · Delta Inserts · Delta Trap · Blue and Yellow Sticky Cards · Femitrack · Bacitrack · Wiltrack · Tichotrack · Other

> In the ERP these must match product names in the catalog (Inventory → Products). "Other" lets the rep type a free-form product; the ERP will flag it as "product not in catalog" on import so you can add it later.

---

## Quick checklist

- [ ] Create 1 Direct Sales form, add all 10 questions + extras + 24-product dropdown
- [ ] Duplicate it 3 times; rename each to a rep (Edna, Njoroge, Joseph, Purity); pre-fill the Salesperson field on each
- [ ] Create the Field Visit form with the 8 questions + extras + salesperson dropdown
- [ ] Link all 5 forms' responses to the **same** master Google Sheet (5 tabs: Edna, Njoroge, Joseph, Purity, Visits)
- [ ] Add the tracking columns (Order ID, Status, CRM Customer ID, ERP Sale No / Visit ID, ERP Lead Created) in each sheet tab
- [ ] (Optional) Add an Apps Script that pushes new rows to the ERP `importSalesOrders` / `importVisits` RPCs
- [ ] In the ERP: open Sales → Import to test importing a Direct Sales CSV
- [ ] In the ERP: open Sales → Visits → Import CSV to test importing a Visits CSV
- [ ] Confirm interested visits auto-create CRM leads under the right salesperson
