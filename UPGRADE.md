# Unity ERP — Upgrade Changelog

> Farmtrack Bio Sciences Ltd · Built for Kenyan Agriculture Operations

---

## v2.4.0 — 2026-06-22

### 🎨 UI / Layout Overhaul
- **Fixed mobile responsiveness** — root cause was `main-shell` width not resetting on mobile (stayed at `calc(100% - 280px)`, leaving content squished to the left). Now properly fills full screen.
- **Clean PC/Mobile breakpoint system** — two breakpoints only: 900px (tablet/mobile) and 640px (small phone). No more conflicting duplicate `@media` blocks.
- **Topbar mobile fix** — hamburger menu (40×40 tappable), search bar stays functional, bell dropdown opens as fixed full-width overlay, logout is circular avatar button.
- **Notification dropdown** constrained to 70vh on mobile, scrolls properly.
- **Search results panel** uses `position: fixed` on mobile to span full width.

### 📊 KPI Cards — De-cramped
- Reduced `min-height` from 166px → 130px.
- Font sizes: title 22px → 20px, label 14px → 13px, change badge 12px → 11px.
- Sparkline moved to corner: 92×44 → 80×36.
- Icon container: 38px → 36px.
- Breathing room restored between value and change indicator.

### 🔗 Interconnectivity Between Dashboards
- All page components now receive `setPage` prop for cross-navigation.
- New `CrossLinks` component — pill-shaped quick-links to related pages.
- Dashboard now shows 8 cross-link chips: Sales, CRM, Inventory, Finance, Purchasing, Production, HR, Leaves.
- Click any chip to jump directly to that module.

### 📱 Leave Application Redesign
- Apply modal now has **Department dropdown** — employee selects their department before submitting.
- Live **balance calculation preview**: current balance, days requested, remaining after.
- Warning when exceeding available balance (red highlight).
- Progress bars on balance chips (visual usage percentage).
- Apply tab now shows **your recent leave records inline** (type, dept, dates, status, cancel button).

### ⏰ HR Attendance — Clock In/Out + Hours Tracking
- **Check-in/out entry form**: select employee → date → check-in time → check-out time.
- Auto-calculates **hours worked** (live preview in green badge before saving).
- **Today's Summary cards**: Present count, total hours today, total records, headcount.
- **Hours by Department bar chart** (last 30 days) — horizontal bars with department labels and hours.
- Attendance log table now shows **Hours column** with color coding (green ≥8h, orange <8h, gray absent).
- `recordAttendance` RPC now computes `hoursWorked` from check-in/check-out times.
- `getHrData` RPC now returns `attendanceByDept` and `totalHoursToday` stats.

### 🔄 Google Sheets — Full Bidirectional Sync
- **ERP → Sheets**: 22 spreadsheet modules now sync (was 15):
  - Added: Employees, Departments, Attendance, Candidates, Reviews, Leave Applications, Leave Balances, Notifications & Alerts.
- **Sheets → ERP**: New `importModuleFromGoogleSheets` RPC — edit any HR/Leaves/Notifications sheet in Google Sheets and import back to ERP. Upserts by ID, merges with existing records.
- All HR/Leaves/Notification mutations trigger auto-sync to sheets via `SYNC_AFTER_RPC` mappings.
- Supported import modules: Employees, Attendance, Candidates, Leaves, Notifications.

### 🔧 Technical Fixes
- Removed conflicting duplicate `@media (max-width: 900px)` block in CSS (line ~2106) that was undoing mobile topbar rules.
- Table overflow: added `-webkit-overflow-scrolling: touch` for smooth mobile table scrolling.
- Logout button: proper circular avatar styling (42×42, black circle with initial).

---

## v2.3.0 — 2026-06-18

### 🔔 Notifications & Alert Center
- Full notification bell dropdown in topbar (polled every 60s).
- Live auto-detected alerts engine with 18 rules across all modules.
- Inline approve/reject for leave alerts in bell dropdown.
- Notification center page with priority filters, acknowledge/snooze/archive actions.
- Stable alert IDs (`AUTO-{category}-{key}`) with user disposition preservation.

### 👥 HR Module
- Employee directory with search, add, edit, delete.
- Department management with headcount and payroll cost.
- Attendance logging (now with hours calculation).
- Recruitment kanban board (Applied → Screening → Interview → Offer → Hired/Rejected).
- Performance reviews with ratings and goals.

### 🏖️ Leaves Module
- Apply for leave with balance preview.
- Approval workflow: employee applies → manager approves/rejects.
- Team leave calendar view.
- Leave types: Annual, Sick, Casual, Maternity, Paternity, Unpaid.
- Cancel pending leave requests.

### 📍 Sidebar Navigation
- Added HR, Leaves, Notifications pages above Settings.

---

## v2.2.0 — 2026-06-15

### 📄 KFA-Style Invoice PDF
- Professional invoice PDF generation matching KFA format.
- Company header, customer details, line items table, tax calculation, totals.
- Downloadable PDF via browser print dialog.

### ⚡ Performance Improvements
- Optimistic loading pattern — data loads instantly from cache, revalidates in background.
- Soft 1-hour refresh — automatic data refresh every hour without full page reload.
- Reduced perceived loading time across all pages.

### 🚀 Deployment
- Deployed to Vercel production at `erpftc.vercel.app`.
- Git repository initialized with full version history.

---

## v2.1.0 — Initial Release

### Core ERP Modules
- **Dashboard**: Revenue overview, KPI cards, charts, category breakdown.
- **Sales**: Orders, deliveries, invoicing.
- **CRM**: Customer management, leads, call logging.
- **Inventory**: Stock management, movements, transfers.
- **Purchasing**: Suppliers, purchase orders, goods receipt.
- **Manufacturing**: Production jobs, raw material tracking.
- **Finance**: Journal entries, expense recording.
- **Accounts**: General ledger, account management.
- **Analytics**: Sales analytics, performance metrics.
- **Reports**: Business intelligence reports.
- **Settings**: ERP configuration, spreadsheet integration.

### Infrastructure
- Single RPC endpoint architecture (`POST /api/rpc`).
- Supabase for state persistence (single JSON blob).
- Google Sheets integration for data export.
- Hash-based client-side routing.
- Stale-while-revalidate data fetching.
- KES (Kenyan Shillings) currency throughout.

---

## Architecture Notes

| Component | Technology |
|-----------|-----------|
| Frontend | React 18 (Vite) — single `main.jsx` |
| Styling | Plain CSS (`styles.css`) — no framework |
| API | Single serverless function `api/rpc.js` |
| Database | Supabase — `erp_state` table (JSON blob) |
| Auth | localStorage (demo mode) |
| Sheets | Google Sheets API v4 (service account) |
| Hosting | Vercel — `erpftc.vercel.app` |
| Currency | KES (Kenyan Shillings) |
