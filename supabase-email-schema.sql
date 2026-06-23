-- FarmTrack ERP - Email System Supabase Schema
-- Run this in Supabase SQL Editor to create all email-related tables

-- =============================================
-- EMAIL LOGS - Complete history of all sent emails
-- =============================================
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  recipient text not null,
  sender text,
  subject text not null,
  html_content text,
  module_source text default 'system',
  reference_type text,
  reference_id text,
  status text not null default 'sent',
  tracking_id text,
  error_message text,
  retry_count integer default 0,
  last_retry_at timestamptz,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  last_clicked_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for email logs
create index if not exists idx_email_logs_status on public.email_logs (status);
create index if not exists idx_email_logs_module on public.email_logs (module_source);
create index if not exists idx_email_logs_sent_at on public.email_logs (sent_at desc);
create index if not exists idx_email_logs_recipient on public.email_logs (recipient);
create index if not exists idx_email_logs_tracking on public.email_logs (tracking_id);

-- Enable RLS
alter table public.email_logs enable row level security;

-- Admins can read all email logs
drop policy if exists "Admins can read email logs" on public.email_logs;
create policy "Admins can read email logs"
  on public.email_logs
  for select
  to authenticated
  using (
    (select role from public.profiles where auth_user_id = auth.uid()) = 'Admin'
  );

-- Service role can insert/update
drop policy if exists "Service role can manage email logs" on public.email_logs;
create policy "Service role can manage email logs"
  on public.email_logs
  for all
  to service_role
  using (true)
  with check (true);

-- =============================================
-- EMAIL TRACKING - Track opens, clicks, deliveries
-- =============================================
create table if not exists public.email_tracking (
  id text primary key,
  recipient text not null,
  sender text,
  subject text,
  module_source text,
  reference_type text,
  reference_id text,
  status text not null default 'pending',
  resend_id text,
  metadata jsonb default '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  last_clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  error_message text,
  failed_at timestamptz,
  open_count integer default 0,
  click_count integer default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_tracking_status on public.email_tracking (status);
create index if not exists idx_email_tracking_module on public.email_tracking (module_source);
create index if not exists idx_email_tracking_reference on public.email_tracking (reference_type, reference_id);

alter table public.email_tracking enable row level security;

drop policy if exists "Service role can manage email tracking" on public.email_tracking;
create policy "Service role can manage email tracking"
  on public.email_tracking
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Anyone can read tracking for their own emails" on public.email_tracking;
create policy "Anyone can read tracking for their own emails"
  on public.email_tracking
  for select
  using (recipient = current_user);

-- =============================================
-- EMAIL ACTIVITIES - Granular activity log (opens, clicks per link)
-- =============================================
create table if not exists public.email_activities (
  id uuid primary key default gen_random_uuid(),
  tracking_id text not null references public.email_tracking(id) on delete cascade,
  activity_type text not null,
  ip_address text,
  user_agent text,
  link_url text,
  timestamp timestamptz not null default now(),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_activities_tracking on public.email_activities (tracking_id);
create index if not exists idx_email_activities_type on public.email_activities (activity_type);
create index if not exists idx_email_activities_timestamp on public.email_activities (timestamp desc);

alter table public.email_activities enable row level security;

drop policy if exists "Service role can manage email activities" on public.email_activities;
create policy "Service role can manage email activities"
  on public.email_activities
  for all
  to service_role
  using (true)
  with check (true);

-- =============================================
-- EMAIL PREFERENCES - User notification preferences
-- =============================================
create table if not exists public.email_preferences (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  user_id uuid references public.profiles(id) on delete cascade,
  leave_notifications boolean default true,
  invoice_notifications boolean default true,
  asset_notifications boolean default true,
  hr_notifications boolean default true,
  report_notifications boolean default true,
  system_alerts boolean default true,
  marketing boolean default false,
  digest_frequency text default 'instant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_preferences_email on public.email_preferences (email);

alter table public.email_preferences enable row level security;

drop policy if exists "Users can read own preferences" on public.email_preferences;
create policy "Users can read own preferences"
  on public.email_preferences
  for select
  using (email = current_user OR auth.uid() = user_id);

drop policy if exists "Users can update own preferences" on public.email_preferences;
create policy "Users can update own preferences"
  on public.email_preferences
  for update
  using (email = current_user OR auth.uid() = user_id);

drop policy if exists "Service role can manage preferences" on public.email_preferences;
create policy "Service role can manage preferences"
  on public.email_preferences
  for all
  to service_role
  using (true)
  with check (true);

-- =============================================
-- EMAIL TEMPLATES - Reusable email templates
-- =============================================
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  category text,
  subject_template text not null,
  html_template text not null,
  variables jsonb default '[]'::jsonb,
  is_system boolean default false,
  created_by uuid references public.profiles(id),
  status text default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;

drop policy if exists "Service role can manage templates" on public.email_templates;
create policy "Service role can manage templates"
  on public.email_templates
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Admins can manage templates" on public.email_templates;
create policy "Admins can manage templates"
  on public.email_templates
  for all
  to authenticated
  using (
    (select role from public.profiles where auth_user_id = auth.uid()) = 'Admin'
  )
  with check (
    (select role from public.profiles where auth_user_id = auth.uid()) = 'Admin'
  );

-- =============================================
-- EMAIL ATTACHMENTS - Keep track of attachments
-- =============================================
create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  email_log_id uuid references public.email_logs(id) on delete cascade,
  tracking_id text references public.email_tracking(id) on delete cascade,
  filename text not null,
  content_type text,
  file_size integer,
  storage_path text,
  created_at timestamptz not null default now()
);

alter table public.email_attachments enable row level security;

drop policy if exists "Service role can manage attachments" on public.email_attachments;
create policy "Service role can manage attachments"
  on public.email_attachments
  for all
  to service_role
  using (true)
  with check (true);

-- =============================================
-- VIEWS for dashboard
-- =============================================

-- Email dashboard summary view
create or replace view public.email_dashboard_summary as
select
  count(*) filter (where status = 'sent') as total_sent,
  count(*) filter (where status = 'failed') as total_failed,
  count(*) filter (where status = 'pending') as total_pending,
  count(*) filter (where opened_at is not null) as total_opened,
  count(*) filter (where delivered_at is not null) as total_delivered,
  count(*) filter (where created_at >= now() - interval '24 hours') as sent_last_24h,
  round(
    (count(*) filter (where status = 'sent')::numeric / 
     nullif(count(*), 0)::numeric) * 100, 1
  ) as delivery_rate
from public.email_logs;

-- Module-wise email stats
create or replace view public.email_module_stats as
select
  module_source,
  count(*) as total,
  count(*) filter (where status = 'sent') as sent,
  count(*) filter (where status = 'failed') as failed,
  count(*) filter (where opened_at is not null) as opened,
  max(sent_at) as last_sent_at
from public.email_logs
group by module_source
order by total desc;

-- Daily email volume
create or replace view public.email_daily_volume as
select
  date_trunc('day', sent_at)::date as date,
  count(*) as total,
  count(*) filter (where status = 'sent') as sent,
  count(*) filter (where status = 'failed') as failed
from public.email_logs
where sent_at >= now() - interval '90 days'
group by 1
order by 1 desc;