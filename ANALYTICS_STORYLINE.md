# Farmtrack ERP Analytics Storyline

This file explains how the Analytics page should behave and how each intelligence section should tell a business story.

## Purpose

Analytics is the executive decision center. It should answer four questions:

- What is happening right now?
- What needs attention?
- Why is it happening?
- What should management do next?

## Page Flow

1. Executive hero confirms the analytics source and decision confidence.
2. Intelligence tabs select the business lens.
3. Filters control period, dates, products, customers, regions, and sales reps.
4. KPI cards summarize the selected lens.
5. Storyline cards explain what the selected lens means.
6. Main chart shows the trend for the selected metric.
7. Drilldown table shows the source breakdown.
8. Next Actions turns data into work.
9. Source Tables tells the user where the numbers came from.
10. Reports export the selected analysis.

## Intelligence Tabs

### Revenue Intelligence

Story: Follow money from orders to invoices, collections, costs, expenses, and net profit.

Uses:
- sales_orders
- sales_order_items
- invoices
- payments
- customers
- products

Outputs:
- Revenue trend
- Collected vs outstanding
- Revenue by product/customer/county
- Forecast revenue
- Collection actions

### Sales Intelligence

Story: Show how reps, quotes, pipeline, and territories move toward closed orders.

Uses:
- sales_orders
- quotations
- leads
- customers
- sales_visits

Outputs:
- Orders
- Pipeline value
- Quote conversion
- Sales rep performance
- Territory gaps

### Inventory Intelligence

Story: Protect availability and capital by showing low stock, dead stock, aging, movements, and demand pressure.

Uses:
- inventory
- products
- inventory_transactions
- purchase_orders
- sales_order_items

Outputs:
- Inventory value
- Low stock
- Dead stock
- Turnover
- Reorder actions

### Production Intelligence

Story: Track planned output, actual output, yield, waste, delays, and batch cost.

Uses:
- production_orders
- production_batches
- raw_materials
- raw_material_consumption
- inventory

Outputs:
- Planned vs completed
- Waste
- Delayed jobs
- Yield and profitability actions

### Procurement Intelligence

Story: Show whether suppliers and purchase orders are supporting sales demand on time.

Uses:
- suppliers
- purchase_orders
- po_items
- receiving
- inventory

Outputs:
- Supplier scorecards
- Spend
- Lead time
- Purchase requests from reorder alerts

### Customer Intelligence

Story: Rank customer value, health, churn risk, and growth opportunity.

Uses:
- customers
- sales_orders
- invoices
- payments
- calls
- leads

Outputs:
- Lifetime value
- Active customers
- At-risk customers
- Upsell actions

### Financial Intelligence

Story: Connect revenue, expenses, cash, receivables, and profit margin.

Uses:
- invoices
- payments
- expenses
- journal_entries
- sales_orders

Outputs:
- Profit
- Margin
- Receivables risk
- Cash collection actions

### AI Intelligence

Story: Explain the why behind risks and opportunities, grounded in ERP source data.

Uses:
- sales_orders
- inventory
- expenses
- production_orders
- invoices

Outputs:
- Risk explanations
- Opportunity recommendations
- Source-backed management notes

### Forecasting

Story: Predict revenue, demand, cash, and stock pressure before it happens.

Uses:
- sales history
- pipeline
- inventory movements
- invoices
- production capacity

Outputs:
- Revenue forecast
- Demand forecast
- Cash forecast
- Inventory pressure

## Data Rule

Every tab must visibly change the page when clicked. A tab is not working if only the active button changes but the storyline, actions, source tables, chart metric, KPIs, and reports stay the same.

## Performance Rule

At scale, Analytics should read from materialized views, not raw transactional tables.

Recommended views:

- mv_sales_summary
- mv_county_revenue
- mv_county_profitability
- mv_county_coverage
- mv_sales_rep_performance
- mv_product_performance
- mv_monthly_trends
- mv_pipeline_summary

## Current Implementation Note

The app now returns per-tab storyline, focus cards, next actions, source tables, KPIs, trend data, reports, and insights through `getAnalyticsTabData`.
