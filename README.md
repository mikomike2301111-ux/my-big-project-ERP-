# FarmTrack ERP (erpftc)

A full-featured Enterprise Resource Planning system for agricultural businesses, built with React, Vite, and Supabase. Deployed on Vercel at **[erpftc.vercel.app](https://erpftc.vercel.app)**.

## Features

### Core Modules
- **Dashboard** — Executive command center with KPIs, revenue charts, attention alerts, and AI-powered recommendations
- **Analytics** — Advanced analytics with 9 intelligence tabs (revenue, sales, inventory, production, procurement, customer, financial, AI, forecasting)
- **Sales** — Full sales pipeline, quotes, orders, invoices, team performance, territory coverage, field visits, CSV import
- **Purchases** — Purchase requests, POs, supplier scorecards, deliveries, goods receiving, credit purchases, payables
- **Inventory** — 25+ tabs including stock control, warehouses, movements, adjustments, transfers, audits, expiry tracking, barcode/QR scanning, stock valuation (FIFO/LIFO/Weighted Average), batch & lot tracking, reorder rules, cycle counts, supplier links, stock reservations, cost analysis, ABC classification, dead stock, and manufacturing integration
- **Finance** — Full posted backend with journals, ledger, chart of accounts, receivables, payables, banking, cash management, expenses, revenue, payroll, taxes, fixed assets, budgeting, reconciliation, cost centers, forecasting, and AI insights
- **Accounts** — Chart of accounts, receivables, payables, bank transactions, trial balance, journals, reconciliation, quotations, customer statements, expenses, audit trail, and financial reports
- **Manufacturing** — Versioned BOMs (formulas), raw material management with UOM conversion, production orders with material validation, batch traceability, quality control, waste tracking, cost breakdown, capacity planning, OEE metrics, and production calendar
- **CRM** — Customer directory, pipeline kanban, leads, call logging, activities, reports, and customer intelligence with churn prediction and CLV
- **HR** — Employee directory, departments (add/edit/delete), attendance with clock in/out, performance reviews, recruitment pipeline, payroll with hourly/salary support, payslips, and HR reports
- **Leaves** — Leave application, approval workflow, balance tracking, and team calendar
- **Requisitions** — Cross-module requisition system with approval workflow, PDF generation, and email notifications
- **Email** — Compose, drafts, sent tracking, and 15+ email templates
- **Email Admin** — Delivery monitoring, module breakdown, retry failed emails, and engagement tracking
- **Notifications** — Real-time alert center with AI briefings, priority filtering, and category tabs
- **Reports** — Executive dashboard, department-specific reports, custom dashboard builder, and 6 export formats (PDF, Excel, CSV, PowerPoint, Print, Email Package)
- **Settings** — 26 configuration tabs including company profile, email integration, users, permissions, departments, warehouses, products, tax, automation, integrations, Supabase, and security

### AI Assistant
- Natural conversation style with 2-paragraph responses
- No emojis, clean markdown rendering
- Context-aware with live ERP data
- Suggested actions and navigation
- Streaming responses
- Feedback (like/dislike) system

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 6, Recharts, Lucide Icons |
| Backend | Vercel Serverless Functions (Node.js) |
| Database | Supabase (PostgreSQL) |
| Email | Resend |
| Exports | ExcelJS, PDFKit, PptxGenJS |
| AI | Gemini / OpenRouter (multi-model fallback) |
| Hosting | Vercel |
| Domain | staff.farmtrack.co.ke |

## Getting Started

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation

```bash
cd my-big-project-ERP--main
npm install
npm run dev
```

### Build

```bash
npm run build
```

### Deploy

```bash
vercel --prod
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `RESEND_API_KEY` | Resend email API key |
| `GEMINI_API_KEY` | Google Gemini API key (optional) |
| `OPENROUTER_API_KEY` | OpenRouter API key (optional, AI fallback) |

## Project Structure

```
my-big-project-ERP--main/
├── api/                    # Serverless API routes
│   ├── rpc.js              # Main RPC handler (10,000+ lines)
│   ├── ai-assistant.js     # AI assistant with natural responses
│   ├── email-track.js      # Email tracking
│   ├── resend-service-core.js  # Email service
│   └── ...
├── src/
│   ├── main.jsx            # Main app (9,000+ lines, all modules)
│   ├── styles.css          # Global styles
│   ├── components/
│   │   ├── AIAssistant/    # AI chat assistant
│   │   ├── HR/             # HR modals, payslips, departments
│   │   ├── Manufacturing/  # BOM, raw materials, production
│   │   └── Reports/        # Executive dashboard charts
│   └── hooks/              # Custom React hooks
├── data/                   # Seed data
├── sql-migrations/         # Database migrations
├── public/                 # Static assets
├── vercel.json             # Vercel deployment config
└── vite.config.js          # Vite build config
```

## License

See [LICENSE](LICENSE) file for details.

## Live Demo

Visit **[erpftc.vercel.app](https://erpftc.vercel.app)**

Demo credentials: `miko@gmail.com` / `1234567890`