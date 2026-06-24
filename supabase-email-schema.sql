-- FarmTrack ERP - Complete Schema for Leave Management & Email
-- Copy and paste ALL into Supabase SQL Editor, then click RUN

-- =============================================
-- LEAVE REQUESTS
-- =============================================
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL,
  employee_name text NOT NULL,
  employee_email text NOT NULL,
  department text DEFAULT '',
  position text DEFAULT '',
  approver_id text DEFAULT '',
  approver_email text DEFAULT '',
  leave_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_requested integer NOT NULL DEFAULT 1,
  reason text DEFAULT '',
  attachment_url text DEFAULT '',
  emergency_contact text DEFAULT '',
  covering_employee text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  decision_note text DEFAULT '',
  decided_by text DEFAULT '',
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON public.leave_requests (status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON public.leave_requests (employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_approver ON public.leave_requests (approver_id);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage leave requests" ON public.leave_requests;
CREATE POLICY "Service role can manage leave requests" ON public.leave_requests FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- LEAVE BALANCES
-- =============================================
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL UNIQUE,
  employee_name text NOT NULL,
  annual_allocated integer NOT NULL DEFAULT 21,
  annual_taken integer NOT NULL DEFAULT 0,
  sick_allocated integer NOT NULL DEFAULT 10,
  sick_taken integer NOT NULL DEFAULT 0,
  maternity_allocated integer NOT NULL DEFAULT 90,
  maternity_taken integer NOT NULL DEFAULT 0,
  paternity_allocated integer NOT NULL DEFAULT 14,
  paternity_taken integer NOT NULL DEFAULT 0,
  compassionate_allocated integer NOT NULL DEFAULT 5,
  compassionate_taken integer NOT NULL DEFAULT 0,
  unpaid_taken integer NOT NULL DEFAULT 0,
  study_allocated integer NOT NULL DEFAULT 30,
  study_taken integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage leave balances" ON public.leave_balances;
CREATE POLICY "Service role can manage leave balances" ON public.leave_balances FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- EMAIL LOGS
-- =============================================
CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  sender text DEFAULT '',
  subject text NOT NULL DEFAULT '',
  module_source text DEFAULT 'system',
  status text NOT NULL DEFAULT 'sent',
  tracking_id text DEFAULT '',
  error_message text DEFAULT '',
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  last_clicked_at timestamptz,
  click_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs (status);
CREATE INDEX IF NOT EXISTS idx_email_logs_module ON public.email_logs (module_source);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage email logs" ON public.email_logs;
CREATE POLICY "Service role can manage email logs" ON public.email_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- EMAIL TRACKING
-- =============================================
CREATE TABLE IF NOT EXISTS public.email_tracking (
  id text PRIMARY KEY,
  recipient text NOT NULL,
  sender text DEFAULT '',
  subject text DEFAULT '',
  module_source text DEFAULT 'system',
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  last_clicked_at timestamptz,
  open_count integer DEFAULT 0,
  click_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage email tracking" ON public.email_tracking;
CREATE POLICY "Service role can manage email tracking" ON public.email_tracking FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- VIEWS
-- =============================================
CREATE OR REPLACE VIEW public.leave_department_stats AS
SELECT
  department,
  COUNT(*) AS total_requests,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending,
  COUNT(*) FILTER (WHERE status = 'approved') AS approved,
  COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
  SUM(days_requested) FILTER (WHERE status = 'approved') AS days_approved
FROM public.leave_requests
GROUP BY department
ORDER BY total_requests DESC;

CREATE OR REPLACE VIEW public.leave_upcoming AS
SELECT *
FROM public.leave_requests
WHERE status = 'approved'
  AND start_date >= CURRENT_DATE
  AND start_date <= CURRENT_DATE + interval '30 days'
ORDER BY start_date;

CREATE OR REPLACE VIEW public.email_dashboard_summary AS
SELECT
  COUNT(*) AS total_all,
  COUNT(*) FILTER (WHERE status = 'sent') AS total_sent,
  COUNT(*) FILTER (WHERE status = 'failed') AS total_failed,
  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS total_opened,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS sent_last_24h,
  ROUND((COUNT(*) FILTER (WHERE status = 'sent')::numeric / NULLIF(COUNT(*), 0)::numeric) * 100, 1) AS delivery_rate
FROM public.email_logs;

CREATE OR REPLACE VIEW public.email_module_stats AS
SELECT
  module_source,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'sent') AS sent,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  MAX(sent_at) AS last_sent_at
FROM public.email_logs
GROUP BY module_source
ORDER BY total DESC;