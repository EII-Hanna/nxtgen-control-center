-- NXTGEN operational fulfillment: assignees, blockers, approvals and progress
alter table public.delivery_project_tasks
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists blocked_reason text,
  add column if not exists approval_required boolean not null default false,
  add column if not exists approval_status text not null default 'not_required' check (approval_status in ('not_required','pending','approved','changes_requested')),
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists external_trigger_status text not null default 'idle' check (external_trigger_status in ('idle','queued','running','succeeded','failed')),
  add column if not exists external_execution_id text;

create table if not exists public.delivery_task_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.delivery_projects(id) on delete cascade,
  task_id uuid references public.delivery_project_tasks(id) on delete cascade,
  event_type text not null check (event_type in ('created','status_changed','blocked','unblocked','approval_requested','approved','changes_requested','comment','automation_queued','automation_succeeded','automation_failed')),
  message text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.delivery_task_events enable row level security;
create policy delivery_task_events_org_access on public.delivery_task_events for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create index if not exists idx_delivery_task_events_task on public.delivery_task_events(task_id,created_at desc);

create or replace function public.recalculate_delivery_project(p_project_id uuid)
returns public.delivery_projects language plpgsql security definer set search_path=public as $$
declare v_project public.delivery_projects; v_total int; v_done int; v_blocked int; v_progress int; v_stage text;
begin
  select * into v_project from public.delivery_projects where id=p_project_id and public.is_org_member(organization_id);
  if v_project.id is null then raise exception 'Project not found'; end if;
  select count(*),count(*) filter(where status='done'),count(*) filter(where status='blocked') into v_total,v_done,v_blocked
  from public.delivery_project_tasks where project_id=p_project_id and status<>'cancelled';
  v_progress:=case when v_total=0 then 0 else round((v_done::numeric/v_total)*100)::int end;
  select stage into v_stage from public.delivery_project_tasks where project_id=p_project_id and status not in ('done','cancelled')
  order by case stage when 'briefing' then 1 when 'analysis' then 2 when 'blueprint' then 3 when 'provisioning' then 4 when 'implementation' then 5 when 'qa' then 6 when 'client_approval' then 7 else 8 end,sort_order limit 1;
  update public.delivery_projects set progress=v_progress,current_stage=coalesce(v_stage,current_stage),status=case when v_blocked>0 then 'blocked' when v_progress=100 then 'completed' when v_progress>0 then 'active' else status end,updated_at=now()
  where id=p_project_id returning * into v_project;
  return v_project;
end; $$;

create or replace function public.update_delivery_task_status(p_task_id uuid,p_status text,p_blocked_reason text default null)
returns public.delivery_project_tasks language plpgsql security definer set search_path=public as $$
declare v_task public.delivery_project_tasks; v_old text;
begin
  select * into v_task from public.delivery_project_tasks where id=p_task_id and public.is_org_member(organization_id);
  if v_task.id is null then raise exception 'Task not found'; end if;
  v_old:=v_task.status;
  update public.delivery_project_tasks set status=p_status,blocked_reason=case when p_status='blocked' then p_blocked_reason else null end,
    started_at=case when p_status='in_progress' then coalesce(started_at,now()) else started_at end,
    completed_at=case when p_status='done' then now() else null end,updated_at=now()
  where id=p_task_id returning * into v_task;
  insert into public.delivery_task_events(organization_id,project_id,task_id,event_type,message,actor_user_id,metadata)
  values(v_task.organization_id,v_task.project_id,v_task.id,case when p_status='blocked' then 'blocked' when v_old='blocked' then 'unblocked' else 'status_changed' end,
    coalesce(p_blocked_reason,v_old||' → '||p_status),auth.uid(),jsonb_build_object('old_status',v_old,'new_status',p_status));
  perform public.recalculate_delivery_project(v_task.project_id);
  return v_task;
end; $$;

create or replace function public.review_delivery_task(p_task_id uuid,p_decision text,p_message text default null)
returns public.delivery_project_tasks language plpgsql security definer set search_path=public as $$
declare v_task public.delivery_project_tasks;
begin
  select * into v_task from public.delivery_project_tasks where id=p_task_id and public.is_org_member(organization_id);
  if v_task.id is null then raise exception 'Task not found'; end if;
  update public.delivery_project_tasks set approval_status=p_decision,approved_by=case when p_decision='approved' then auth.uid() else null end,
    approved_at=case when p_decision='approved' then now() else null end,status=case when p_decision='approved' then 'done' else 'in_progress' end,updated_at=now()
  where id=p_task_id returning * into v_task;
  insert into public.delivery_task_events(organization_id,project_id,task_id,event_type,message,actor_user_id)
  values(v_task.organization_id,v_task.project_id,v_task.id,case when p_decision='approved' then 'approved' else 'changes_requested' end,p_message,auth.uid());
  perform public.recalculate_delivery_project(v_task.project_id);
  return v_task;
end; $$;