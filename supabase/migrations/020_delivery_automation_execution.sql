-- NXTGEN Delivery Automation Execution: queue, n8n dispatch, callbacks and Slack escalation

alter table public.delivery_project_tasks
  add column if not exists automation_enabled boolean not null default false,
  add column if not exists automation_key text,
  add column if not exists automation_status text not null default 'idle'
    check (automation_status in ('idle','queued','running','succeeded','failed','cancelled')),
  add column if not exists last_automation_at timestamptz,
  add column if not exists automation_attempts integer not null default 0;

create table if not exists public.delivery_automation_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.delivery_projects(id) on delete cascade,
  task_id uuid not null references public.delivery_project_tasks(id) on delete cascade,
  automation_key text not null,
  provider text not null default 'n8n' check (provider in ('n8n','custom_webhook')),
  status text not null default 'queued' check (status in ('queued','dispatching','running','succeeded','failed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  external_execution_id text,
  callback_token uuid not null default gen_random_uuid(),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.delivery_projects(id) on delete cascade,
  task_id uuid references public.delivery_project_tasks(id) on delete cascade,
  job_id uuid references public.delivery_automation_jobs(id) on delete cascade,
  channel text not null default 'slack' check (channel in ('slack','email','in_app','webhook')),
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  recipient_reference text,
  message text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  provider_message_id text,
  sent_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.delivery_automation_jobs enable row level security;
alter table public.delivery_notifications enable row level security;

create policy delivery_automation_jobs_org_access on public.delivery_automation_jobs for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy delivery_notifications_org_access on public.delivery_notifications for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_delivery_automation_jobs_queue
  on public.delivery_automation_jobs(status,next_attempt_at,created_at);
create index if not exists idx_delivery_automation_jobs_task
  on public.delivery_automation_jobs(task_id,created_at desc);
create index if not exists idx_delivery_notifications_queue
  on public.delivery_notifications(status,channel,created_at);

create or replace function public.queue_delivery_automation(p_task_id uuid)
returns public.delivery_automation_jobs
language plpgsql security definer set search_path=public as $$
declare
  v_task public.delivery_project_tasks;
  v_project public.delivery_projects;
  v_job public.delivery_automation_jobs;
begin
  select * into v_task from public.delivery_project_tasks
  where id=p_task_id and public.is_org_member(organization_id);
  if v_task.id is null then raise exception 'Task not found'; end if;
  if not v_task.automation_enabled or nullif(v_task.automation_key,'') is null then
    raise exception 'Automation is not configured for this task';
  end if;
  if v_task.status in ('done','cancelled') then raise exception 'Completed tasks cannot be dispatched'; end if;

  select * into v_project from public.delivery_projects where id=v_task.project_id;

  insert into public.delivery_automation_jobs(
    organization_id,project_id,task_id,automation_key,payload,created_by
  ) values (
    v_task.organization_id,v_task.project_id,v_task.id,v_task.automation_key,
    jsonb_build_object(
      'event','delivery.task.execute',
      'organization_id',v_task.organization_id,
      'project_id',v_task.project_id,
      'project_name',v_project.name,
      'task_id',v_task.id,
      'task_title',v_task.title,
      'task_description',v_task.description,
      'stage',v_task.stage,
      'priority',v_task.priority,
      'owner_role',v_task.owner_role,
      'due_at',v_task.due_at,
      'automation_key',v_task.automation_key,
      'metadata',v_task.metadata
    ),auth.uid()
  ) returning * into v_job;

  update public.delivery_project_tasks set
    automation_status='queued',
    automation_attempts=automation_attempts+1,
    last_automation_at=now(),
    updated_at=now()
  where id=v_task.id;

  insert into public.delivery_task_events(
    organization_id,project_id,task_id,event_type,message,metadata
  ) values (
    v_task.organization_id,v_task.project_id,v_task.id,'automation_started',
    'Automation wurde zur Ausführung eingeplant.',
    jsonb_build_object('job_id',v_job.id,'automation_key',v_task.automation_key)
  );

  return v_job;
end; $$;

create or replace function public.complete_delivery_automation(
  p_callback_token uuid,
  p_status text,
  p_result jsonb default '{}'::jsonb,
  p_error text default null,
  p_external_execution_id text default null
) returns public.delivery_automation_jobs
language plpgsql security definer set search_path=public as $$
declare
  v_job public.delivery_automation_jobs;
  v_event text;
  v_message text;
begin
  if p_status not in ('running','succeeded','failed') then raise exception 'Invalid status'; end if;
  select * into v_job from public.delivery_automation_jobs where callback_token=p_callback_token;
  if v_job.id is null then raise exception 'Job not found'; end if;

  update public.delivery_automation_jobs set
    status=p_status,
    result=coalesce(p_result,'{}'::jsonb),
    last_error=p_error,
    external_execution_id=coalesce(p_external_execution_id,external_execution_id),
    started_at=case when p_status='running' then coalesce(started_at,now()) else started_at end,
    completed_at=case when p_status in ('succeeded','failed') then now() else null end,
    updated_at=now()
  where id=v_job.id returning * into v_job;

  update public.delivery_project_tasks set
    automation_status=p_status,
    external_execution_id=coalesce(p_external_execution_id,external_execution_id),
    status=case when p_status='running' and status='open' then 'in_progress' else status end,
    updated_at=now()
  where id=v_job.task_id;

  v_event := case when p_status='succeeded' then 'automation_succeeded' when p_status='failed' then 'automation_failed' else 'status_change' end;
  v_message := case when p_status='succeeded' then 'Automation erfolgreich abgeschlossen.' when p_status='failed' then coalesce(p_error,'Automation fehlgeschlagen.') else 'Automation läuft.' end;

  insert into public.delivery_task_events(organization_id,project_id,task_id,event_type,message,metadata)
  values(v_job.organization_id,v_job.project_id,v_job.task_id,v_event,v_message,
    jsonb_build_object('job_id',v_job.id,'result',coalesce(p_result,'{}'::jsonb),'external_execution_id',p_external_execution_id));

  if p_status='failed' then
    insert into public.delivery_notifications(organization_id,project_id,task_id,job_id,channel,event_type,severity,message,metadata)
    values(v_job.organization_id,v_job.project_id,v_job.task_id,v_job.id,'slack','delivery.automation.failed','critical',
      'NXTGEN Automation fehlgeschlagen: '||coalesce(p_error,'Unbekannter Fehler'),
      jsonb_build_object('automation_key',v_job.automation_key,'job_id',v_job.id));
  end if;

  return v_job;
end; $$;
