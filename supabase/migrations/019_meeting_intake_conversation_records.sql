-- Stable provider-neutral meeting intake for Zoom / Fireflies / custom transcription
-- Self-contained because migration 018 may already be marked as applied with older content.

create table if not exists public.automation_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_key text not null,
  name text not null,
  provider text not null default 'webhook',
  status text not null default 'active' check (status in ('active','paused','error')),
  endpoint_token uuid not null default gen_random_uuid() unique,
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, connection_key)
);

create table if not exists public.automation_run_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.automation_connections(id) on delete set null,
  workflow_key text not null,
  status text not null default 'received' check (status in ('received','processed','duplicate','failed')),
  external_reference text,
  lead_id uuid references public.leads(id) on delete set null,
  input_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.meeting_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  provider text not null default 'zoom',
  external_meeting_id text not null,
  title text,
  participant_emails jsonb not null default '[]'::jsonb,
  recording_url text,
  transcript_url text,
  transcript_text text,
  transcript_status text not null default 'queued' check (transcript_status in ('queued','processing','ready','failed')),
  analysis_status text not null default 'queued' check (analysis_status in ('queued','processing','ready','failed')),
  summary text,
  current_process text,
  core_problem text,
  target_state text,
  decision_maker text,
  urgency text,
  budget_range text,
  next_step text,
  action_items jsonb not null default '[]'::jsonb,
  objections jsonb not null default '[]'::jsonb,
  qualification_score integer not null default 0 check (qualification_score between 0 and 100),
  ai_model text,
  provider_payload jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, provider, external_meeting_id)
);

alter table public.automation_connections enable row level security;
alter table public.automation_run_log enable row level security;
alter table public.meeting_records enable row level security;

drop policy if exists automation_connections_org_access on public.automation_connections;
create policy automation_connections_org_access on public.automation_connections for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists automation_run_log_org_access on public.automation_run_log;
create policy automation_run_log_org_access on public.automation_run_log for select
using (public.is_org_member(organization_id));

drop policy if exists meeting_records_org_access on public.meeting_records;
create policy meeting_records_org_access on public.meeting_records for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_automation_connections_org
  on public.automation_connections(organization_id,status);
create index if not exists idx_automation_run_log_org_created
  on public.automation_run_log(organization_id,started_at desc);
create index if not exists idx_meeting_records_lead
  on public.meeting_records(lead_id,created_at desc);
create index if not exists idx_meeting_records_status
  on public.meeting_records(organization_id,analysis_status,created_at desc);

insert into public.automation_connections(organization_id,connection_key,name,provider,status)
select o.id,'lead-intake','Lead Intake Webhook','webhook','active'
from public.organizations o
where o.type='internal'
on conflict(organization_id,connection_key) do nothing;

insert into public.automation_connections(organization_id,connection_key,name,provider,status)
select o.id,'meeting-intake','Zoom / Meeting Webhook','zoom','active'
from public.organizations o
where o.type='internal'
on conflict(organization_id,connection_key) do nothing;

create or replace function public.ensure_lead_intake_connection()
returns public.automation_connections
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
  v_connection public.automation_connections;
begin
  select organization_id into v_org
  from public.organization_members
  where user_id=auth.uid()
  order by created_at
  limit 1;

  if v_org is null then raise exception 'Keine Organisation gefunden'; end if;

  insert into public.automation_connections(organization_id,connection_key,name,provider,status)
  values(v_org,'lead-intake','Lead Intake Webhook','webhook','active')
  on conflict(organization_id,connection_key) do update set updated_at=now()
  returning * into v_connection;

  return v_connection;
end;
$$;

create or replace function public.ensure_meeting_intake_connection()
returns public.automation_connections
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
  v_connection public.automation_connections;
begin
  select organization_id into v_org
  from public.organization_members
  where user_id=auth.uid()
  order by created_at
  limit 1;

  if v_org is null then raise exception 'Keine Organisation gefunden'; end if;

  insert into public.automation_connections(organization_id,connection_key,name,provider,status)
  values(v_org,'meeting-intake','Zoom / Meeting Webhook','zoom','active')
  on conflict(organization_id,connection_key) do update set updated_at=now()
  returning * into v_connection;

  return v_connection;
end;
$$;

grant execute on function public.ensure_lead_intake_connection() to authenticated;
grant execute on function public.ensure_meeting_intake_connection() to authenticated;
