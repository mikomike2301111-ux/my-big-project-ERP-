-- ============================================================
-- FARMTRACK ERP — Accounts, Reports, Analytics & Backend Upgrade
-- Migration 002: Quotations, Payments, Audit Trail, RLS, Triggers
-- ============================================================

-- 1. QUOTATIONS TABLE
CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quote_no TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  contact_person TEXT,
  subtotal NUMERIC(14,2) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 16,
  tax NUMERIC(14,2) DEFAULT 0,
  discount NUMERIC(14,2) DEFAULT 0,
  shipping NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  valid_until DATE,
  terms TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  sent_by UUID REFERENCES public.profiles(id),
  viewed_at TIMESTAMPTZ,
  viewed_by UUID REFERENCES public.profiles(id),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES public.profiles(id),
  rejected_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.profiles(id),
  expired_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  converted_to_sale_id UUID REFERENCES public.sales_orders(id),
  invoiced_at TIMESTAMPTZ,
  invoice_id UUID REFERENCES public.invoices(id),
  ip_address TEXT,
  UNIQUE(tenant_id, quote_no)
);

-- 2. QUOTATION ITEMS
CREATE TABLE IF NOT EXISTS public.quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. QUOTATION AUDIT TRAIL
CREATE TABLE IF NOT EXISTS public.quotation_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id),
  user_name TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_value TEXT,
  new_value TEXT,
  notes TEXT,
  ip_address TEXT
);

-- 4. PAYMENTS TABLE (enhanced)
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_no TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_id UUID REFERENCES public.invoices(id),
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'Cash',
  bank_account TEXT,
  reference TEXT,
  cashier UUID REFERENCES public.profiles(id),
  cashier_name TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, payment_no)
);

-- 5. PAYMENT ALLOCATIONS
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount_allocated NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. CUSTOMER OVERPAYMENTS
CREATE TABLE IF NOT EXISTS public.customer_overpayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.payments(id),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Available',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. AUDIT TRAIL (unified)
CREATE TABLE IF NOT EXISTS public.audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'System',
  type TEXT NOT NULL DEFAULT 'System',
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id),
  user_name TEXT,
  entity_type TEXT,
  entity_id UUID,
  old_value TEXT,
  new_value TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. CREDIT NOTES
CREATE TABLE IF NOT EXISTS public.credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_no TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT,
  invoice_id UUID REFERENCES public.invoices(id),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, credit_no)
);

-- 9. QUOTATION PDFS
CREATE TABLE IF NOT EXISTS public.quotation_pdfs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  file_name TEXT,
  file_url TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES public.profiles(id)
);

-- 10. CUSTOMER STATEMENTS
CREATE TABLE IF NOT EXISTS public.customer_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  statement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  opening_balance NUMERIC(14,2) DEFAULT 0,
  closing_balance NUMERIC(14,2) DEFAULT 0,
  total_invoiced NUMERIC(14,2) DEFAULT 0,
  total_paid NUMERIC(14,2) DEFAULT 0,
  total_credits NUMERIC(14,2) DEFAULT 0,
  pdf_url TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES public.profiles(id)
);

-- 11. CUSTOMER STATEMENT LINES
CREATE TABLE IF NOT EXISTS public.customer_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  statement_id UUID NOT NULL REFERENCES public.customer_statements(id) ON DELETE CASCADE,
  line_date DATE,
  line_type TEXT NOT NULL,
  reference TEXT,
  description TEXT,
  debit NUMERIC(14,2) DEFAULT 0,
  credit NUMERIC(14,2) DEFAULT 0,
  balance NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_quotations_tenant_status ON public.quotations (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON public.quotations (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_quote_no ON public.quotations (tenant_id, quote_no);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON public.quotation_items (quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_audit_quotation ON public.quotation_audit_trail (quotation_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON public.payments (tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON public.payments (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON public.payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON public.payment_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS idx_customer_overpayments_customer ON public.customer_overpayments (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_tenant ON public.audit_trail (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_trail_module ON public.audit_trail (tenant_id, module);
CREATE INDEX IF NOT EXISTS idx_audit_trail_user ON public.audit_trail (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer ON public.credit_notes (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_statements_customer ON public.customer_statements (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_statement_lines_statement ON public.customer_statement_lines (statement_id);

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_overpayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_pdfs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_statement_lines ENABLE ROW LEVEL SECURITY;

-- Service role policies (allow all)
CREATE POLICY "Service role can manage quotations" ON public.quotations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage quotation items" ON public.quotation_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage quotation audit" ON public.quotation_audit_trail FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage payments" ON public.payments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage payment allocations" ON public.payment_allocations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage customer overpayments" ON public.customer_overpayments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage audit trail" ON public.audit_trail FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage credit notes" ON public.credit_notes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage quotation pdfs" ON public.quotation_pdfs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage customer statements" ON public.customer_statements FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage statement lines" ON public.customer_statement_lines FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tenant-scoped authenticated read policies
CREATE POLICY "Tenant read quotations" ON public.quotations FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant read quotation items" ON public.quotation_items FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant read quotation audit" ON public.quotation_audit_trail FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant read payments" ON public.payments FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant read payment allocations" ON public.payment_allocations FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant read customer overpayments" ON public.customer_overpayments FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant read audit trail" ON public.audit_trail FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant read credit notes" ON public.credit_notes FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant read quotation pdfs" ON public.quotation_pdfs FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant read customer statements" ON public.customer_statements FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant read statement lines" ON public.customer_statement_lines FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());

-- ============================================================
-- TRIGGERS: Auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('quotations', 'payments', 'credit_notes', 'customer_statements')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'update_' || tbl || '_updated_at' AND tgrelid = ('public.' || tbl)::regclass
    ) THEN
      EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON public.%s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', tbl, tbl);
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- TRIGGERS: Auto-log to audit_trail on mutation
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_to_audit_trail()
RETURNS TRIGGER AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_action TEXT;
  v_user_id UUID;
  v_user_name TEXT;
  v_tenant_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_action := 'DELETE';
    v_tenant_id := OLD.tenant_id;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_action := 'INSERT';
    v_tenant_id := NEW.tenant_id;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_action := 'UPDATE';
    v_tenant_id := NEW.tenant_id;
  END IF;

  v_user_id := COALESCE(
    (v_new->>'created_by')::UUID,
    (v_new->>'updated_by')::UUID,
    (v_new->>'sent_by')::UUID,
    (v_new->>'accepted_by')::UUID,
    (v_new->>'cashier')::UUID,
    (v_new->>'generated_by')::UUID,
    (v_old->>'created_by')::UUID,
    NULL
  );

  INSERT INTO public.audit_trail (
    tenant_id, source, type, module, action, user_id, entity_type, entity_id, old_value, new_value, details
  ) VALUES (
    v_tenant_id,
    'Database Trigger',
    'Auto',
    TG_TABLE_NAME,
    v_action,
    v_user_id,
    TG_TABLE_NAME,
    COALESCE(v_new->>'id', v_old->>'id')::UUID,
    v_old::TEXT,
    v_new::TEXT,
    'Automatic audit log from ' || TG_TABLE_NAME || ' ' || TG_OP
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply audit trigger to key tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('quotations', 'payments', 'credit_notes', 'customer_statements', 'sales_orders', 'invoices', 'production_jobs', 'purchase_orders', 'inventory_movements', 'journal_entries', 'journal_lines')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'audit_' || tbl AND tgrelid = ('public.' || tbl)::regclass
    ) THEN
      EXECUTE format('CREATE TRIGGER audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%s FOR EACH ROW EXECUTE FUNCTION public.log_to_audit_trail()', tbl, tbl);
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- VIEWS
-- ============================================================
CREATE OR REPLACE VIEW public.quotation_summary AS
SELECT
  q.tenant_id,
  q.id,
  q.quote_no,
  q.customer_name,
  q.total,
  q.status,
  q.valid_until,
  q.created_at,
  q.sent_at,
  q.accepted_at,
  q.rejected_at,
  q.expired_at,
  q.converted_at,
  COUNT(qi.id) AS item_count,
  COALESCE(SUM(qi.line_total), 0) AS calculated_total
FROM public.quotations q
LEFT JOIN public.quotation_items qi ON qi.quotation_id = q.id
GROUP BY q.id, q.tenant_id, q.quote_no, q.customer_name, q.total, q.status, q.valid_until, q.created_at, q.sent_at, q.accepted_at, q.rejected_at, q.expired_at, q.converted_at;

CREATE OR REPLACE VIEW public.payment_summary AS
SELECT
  p.tenant_id,
  p.id,
  p.payment_no,
  p.customer_name,
  p.amount,
  p.method,
  p.status,
  p.date,
  p.created_at,
  COUNT(pa.id) AS allocated_count,
  COALESCE(SUM(pa.amount_allocated), 0) AS total_allocated
FROM public.payments p
LEFT JOIN public.payment_allocations pa ON pa.payment_id = p.id
GROUP BY p.id, p.tenant_id, p.payment_no, p.customer_name, p.amount, p.method, p.status, p.date, p.created_at;

CREATE OR REPLACE VIEW public.customer_balance AS
SELECT
  c.tenant_id,
  c.id AS customer_id,
  c.name AS customer_name,
  COALESCE(SUM(i.total), 0) AS total_invoiced,
  COALESCE(SUM(i.paid), 0) AS total_paid,
  COALESCE(SUM(i.balance), 0) AS total_balance,
  COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE AND i.balance > 0 THEN i.balance ELSE 0 END), 0) AS overdue_balance
FROM public.customers c
LEFT JOIN public.invoices i ON i.customer_id = c.id
GROUP BY c.id, c.tenant_id, c.name;

CREATE OR REPLACE VIEW public.audit_summary AS
SELECT
  tenant_id,
  module,
  COUNT(*) AS action_count,
  COUNT(DISTINCT user_id) AS unique_users,
  MIN(created_at) AS earliest_action,
  MAX(created_at) AS latest_action
FROM public.audit_trail
GROUP BY tenant_id, module;

CREATE OR REPLACE VIEW public.quotation_conversion_funnel AS
SELECT
  tenant_id,
  status,
  COUNT(*) AS count,
  SUM(total) AS total_value
FROM public.quotations
GROUP BY tenant_id, status;

-- ============================================================
-- MATERIALIZED VIEW: Executive Dashboard KPIs
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_executive_kpis AS
SELECT
  c.tenant_id,
  (SELECT COALESCE(SUM(total), 0) FROM public.invoices WHERE tenant_id = c.tenant_id) AS total_revenue,
  (SELECT COALESCE(SUM(amount), 0) FROM public.payments WHERE tenant_id = c.tenant_id) AS total_payments,
  (SELECT COALESCE(SUM(amount), 0) FROM public.payments WHERE tenant_id = c.tenant_id AND method = 'M-Pesa') AS mpesa_payments,
  (SELECT COALESCE(SUM(amount), 0) FROM public.payments WHERE tenant_id = c.tenant_id AND method = 'Bank Transfer') AS bank_payments,
  (SELECT COUNT(*) FROM public.quotations WHERE tenant_id = c.tenant_id AND status = 'Draft') AS draft_quotes,
  (SELECT COUNT(*) FROM public.quotations WHERE tenant_id = c.tenant_id AND status = 'Sent') AS sent_quotes,
  (SELECT COUNT(*) FROM public.quotations WHERE tenant_id = c.tenant_id AND status = 'Accepted') AS accepted_quotes,
  (SELECT COUNT(*) FROM public.quotations WHERE tenant_id = c.tenant_id AND status = 'Converted') AS converted_quotes,
  (SELECT COUNT(*) FROM public.quotations WHERE tenant_id = c.tenant_id AND status = 'Expired') AS expired_quotes,
  (SELECT COUNT(*) FROM public.payments WHERE tenant_id = c.tenant_id) AS total_payments_count,
  (SELECT COALESCE(SUM(balance), 0) FROM public.invoices WHERE tenant_id = c.tenant_id AND balance > 0) AS total_outstanding,
  (SELECT COALESCE(SUM(balance), 0) FROM public.invoices WHERE tenant_id = c.tenant_id AND balance > 0 AND due_date < CURRENT_DATE) AS total_overdue
FROM public.customers c
GROUP BY c.tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_executive_kpis_tenant ON analytics.mv_executive_kpis (tenant_id);

-- ============================================================
-- SEED DATA: Payment Methods Reference
-- ============================================================
INSERT INTO public.audit_trail (tenant_id, source, type, module, action, details)
SELECT t.id, 'Migration', 'System', 'Migration', 'Schema Upgrade', 'Migration 002 applied: Accounts, Reports, Analytics & Backend Upgrade'
FROM public.tenants t
ON CONFLICT DO NOTHING;

-- ============================================================
-- GRANT ANALYTICS SCHEMA
-- ============================================================
GRANT ALL ON SCHEMA analytics TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO anon;
