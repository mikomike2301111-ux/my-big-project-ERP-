-- ============================================================
-- RUN THIS FIRST (STEP 1): deletes partial/broken tables so the
-- fixed migration recreates everything with the correct columns
-- (including tenant_id). Safe because the live app stores data
-- in erp_state, not in these normalized tables.
-- Then re-run: 000-base-and-fixed-001-003.sql  (STEP 2)
-- ============================================================
drop table if exists public.customer_statement_lines cascade;
drop table if exists public.customer_statements cascade;
drop table if exists public.quotation_pdfs cascade;
drop table if exists public.credit_notes cascade;
drop table if exists public.audit_trail cascade;
drop table if exists public.customer_overpayments cascade;
drop table if exists public.payment_allocations cascade;
drop table if exists public.payments cascade;
drop table if exists public.quotation_audit_trail cascade;
drop table if exists public.quotation_items cascade;
drop table if exists public.quotations cascade;
drop table if exists public.inventory_transactions cascade;
drop table if exists public.waste_records cascade;
drop table if exists public.quality_control_records cascade;
drop table if exists public.bom_version_history cascade;
drop table if exists public.production_output cascade;
drop table if exists public.material_consumption cascade;
drop table if exists public.cost_confirmations cascade;
drop table if exists public.bill_of_material_items cascade;
drop table if exists public.bill_of_materials cascade;
drop table if exists public.raw_material_inventory cascade;
drop table if exists public.raw_materials cascade;
drop table if exists public.production_jobs cascade;
drop table if exists public.sales_orders cascade;
drop table if exists public.invoices cascade;
drop table if exists public.customers cascade;
drop table if exists public.suppliers cascade;
drop table if exists public.products cascade;
drop table if exists public.profiles cascade;
drop table if exists public.tenants cascade;
drop table if exists public.warehouses cascade;
drop table if exists public.departments cascade;
drop table if exists public.employees cascade;
drop table if exists public.attendance cascade;
drop table if exists public.leave_applications cascade;
drop table if exists public.deliveries cascade;
drop table if exists public.leads cascade;
drop table if exists public.expenses cascade;
drop table if exists public.notifications cascade;
drop table if exists public.requisitions cascade;
