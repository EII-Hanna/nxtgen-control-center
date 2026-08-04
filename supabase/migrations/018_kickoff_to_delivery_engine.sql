-- NXTGEN stable automation hub: webhook lead intake and run audit

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

alter table public.automation_connections enable row level security;
alter table public.automation_run_log enable row level security;

drop policy if exists automation_connections_org_access on public.automation_connections;
create policy automation_connections_org_access on public.automation_connections for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists automation_run_log_org_access on public.automation_run_log;
create policy automation_run_log_org_access on public.automation_run_log for select
using (public.is_org_member(organization_id));

create index if not exists idx_automation_connections_org
  on public.automation_connections(organization_id,status);
create index if not exists idx_automation_run_log_org_created
  on public.automation_run_log(organization_id,started_at desc);

insert into public.automation_connections(organization_id,connection_key,name,provider,status)
select o.id,'lead-intake','Lead Intake Webhook','webhook','active'
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

grant execute on function public.ensure_lead_intake_connection() to authenticated;
