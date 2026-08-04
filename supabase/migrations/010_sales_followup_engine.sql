-- NXTGEN Sprint 1: Follow-ups, reminders and sales task engine

create table if not exists public.sales_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  conversation_id uuid references public.sales_conversations(id) on delete cascade,
  task_type text not null default 'follow_up' check (task_type in ('follow_up','meeting_reminder','no_show_recovery','call','email','whatsapp','proposal_reminder','custom')),
  title text not null,
  description text,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open','completed','cancelled','snoozed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  channel text check (channel in ('manual','email','whatsapp','linkedin','phone','calendar','slack')),
  automation_key text,
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, lead_id, automation_key)
);

alter table public.sales_tasks enable row level security;

create policy sales_tasks_org_access on public.sales_tasks for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_sales_tasks_due
  on public.sales_tasks(organization_id, status, due_at);
create index if not exists idx_sales_tasks_lead
  on public.sales_tasks(lead_id, created_at desc);

create or replace function public.sync_sales_tasks(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer := 0;
  v_rows integer := 0;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'Kein Zugriff auf Organisation';
  end if;

  -- Explicit follow-up dates on leads
  insert into public.sales_tasks(
    organization_id, lead_id, task_type, title, description, due_at,
    priority, channel, automation_key, created_by
  )
  select
    l.organization_id,
    l.id,
    'follow_up',
    'Follow-up: ' || l.company_name,
    coalesce(l.next_step, 'Interessenten erneut kontaktieren'),
    l.next_follow_up_at,
    case when l.next_follow_up_at < now() then 'high' else 'normal' end,
    'manual',
    'lead-followup-' || l.id::text || '-' || extract(epoch from l.next_follow_up_at)::bigint::text,
    auth.uid()
  from public.leads l
  where l.organization_id = p_organization_id
    and l.next_follow_up_at is not null
    and l.stage not in ('won','lost')
  on conflict (organization_id, lead_id, automation_key) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  -- Meeting reminder 24 hours before
  insert into public.sales_tasks(
    organization_id, lead_id, task_type, title, description, due_at,
    priority, channel, automation_key, created_by
  )
  select
    l.organization_id,
    l.id,
    'meeting_reminder',
    'Termin vorbereiten: ' || l.company_name,
    'Gespräch prüfen, Lead-Akte lesen und Termin bestätigen.',
    l.meeting_at - interval '24 hours',
    'high',
    'calendar',
    'meeting-reminder-24h-' || l.id::text || '-' || extract(epoch from l.meeting_at)::bigint::text,
    auth.uid()
  from public.leads l
  where l.organization_id = p_organization_id
    and l.meeting_at is not null
    and coalesce(l.meeting_status,'planned') in ('planned','booked')
    and l.stage not in ('won','lost')
  on conflict (organization_id, lead_id, automation_key) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  -- Meeting reminder 1 hour before
  insert into public.sales_tasks(
    organization_id, lead_id, task_type, title, description, due_at,
    priority, channel, automation_key, created_by
  )
  select
    l.organization_id,
    l.id,
    'meeting_reminder',
    'Termin in 1 Stunde: ' || l.company_name,
    coalesce(l.meeting_url, 'Meeting-Link und Unterlagen prüfen.'),
    l.meeting_at - interval '1 hour',
    'urgent',
    'calendar',
    'meeting-reminder-1h-' || l.id::text || '-' || extract(epoch from l.meeting_at)::bigint::text,
    auth.uid()
  from public.leads l
  where l.organization_id = p_organization_id
    and l.meeting_at is not null
    and coalesce(l.meeting_status,'planned') in ('planned','booked')
    and l.stage not in ('won','lost')
  on conflict (organization_id, lead_id, automation_key) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  -- No-show recovery on the next business day (simple +1 day MVP)
  insert into public.sales_tasks(
    organization_id, lead_id, task_type, title, description, due_at,
    priority, channel, automation_key, created_by
  )
  select
    l.organization_id,
    l.id,
    'no_show_recovery',
    'No-Show nachfassen: ' || l.company_name,
    'Neuen Termin anbieten und Grund dokumentieren.',
    coalesce(l.meeting_at, now()) + interval '1 day',
    'high',
    'email',
    'no-show-recovery-' || l.id::text || '-' || extract(epoch from coalesce(l.meeting_at, now()))::bigint::text,
    auth.uid()
  from public.leads l
  where l.organization_id = p_organization_id
    and l.meeting_status = 'no_show'
    and l.stage not in ('won','lost')
  on conflict (organization_id, lead_id, automation_key) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  return v_count;
end;
$$;

grant execute on function public.sync_sales_tasks(uuid) to authenticated;

create or replace function public.complete_sales_task(p_task_id uuid)
returns public.sales_tasks
language plpgsql
security definer
set search_path=public
as $$
declare
  v_task public.sales_tasks;
begin
  update public.sales_tasks
  set status='completed', completed_at=now(), updated_at=now()
  where id=p_task_id
    and public.is_org_member(organization_id)
  returning * into v_task;

  if v_task.id is null then raise exception 'Aufgabe nicht gefunden'; end if;
  return v_task;
end;
$$;

grant execute on function public.complete_sales_task(uuid) to authenticated;

create or replace function public.snooze_sales_task(p_task_id uuid, p_due_at timestamptz)
returns public.sales_tasks
language plpgsql
security definer
set search_path=public
as $$
declare
  v_task public.sales_tasks;
begin
  update public.sales_tasks
  set status='snoozed', due_at=p_due_at, updated_at=now()
  where id=p_task_id
    and public.is_org_member(organization_id)
  returning * into v_task;

  if v_task.id is null then raise exception 'Aufgabe nicht gefunden'; end if;
  return v_task;
end;
$$;

grant execute on function public.snooze_sales_task(uuid,timestamptz) to authenticated;
