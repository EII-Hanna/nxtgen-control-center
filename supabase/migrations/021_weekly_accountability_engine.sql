-- NXTGEN Weekly Accountability: pre-call briefing, KPI snapshots and post-call continuity

create table if not exists public.client_kpi_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  key text not null,
  label text not null,
  unit text,
  target_value numeric,
  direction text not null default 'increase' check (direction in ('increase','decrease','maintain')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,key)
);

create table if not exists public.client_kpi_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  kpi_definition_id uuid references public.client_kpi_definitions(id) on delete cascade,
  measured_at timestamptz not null default now(),
  value numeric not null,
  source text not null default 'manual',
  source_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.client_weekly_briefings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  project_id uuid references public.delivery_projects(id) on delete set null,
  upcoming_meeting_at timestamptz,
  period_start date not null,
  period_end date not null,
  status text not null default 'generated' check (status in ('queued','generated','reviewed','used','superseded','failed')),
  executive_summary text,
  project_snapshot jsonb not null default '{}'::jsonb,
  recent_meetings jsonb not null default '[]'::jsonb,
  wins jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  decisions_needed jsonb not null default '[]'::jsonb,
  next_actions jsonb not null default '[]'::jsonb,
  kpi_snapshot jsonb not null default '[]'::jsonb,
  recommended_agenda jsonb not null default '[]'::jsonb,
  client_risks jsonb not null default '[]'::jsonb,
  expansion_signals jsonb not null default '[]'::jsonb,
  source_counts jsonb not null default '{}'::jsonb,
  generated_by text not null default 'nxtgen-weekly-v1',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,period_start,period_end)
);

alter table public.client_kpi_definitions enable row level security;
alter table public.client_kpi_measurements enable row level security;
alter table public.client_weekly_briefings enable row level security;

create policy client_kpi_definitions_org_access on public.client_kpi_definitions for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy client_kpi_measurements_org_access on public.client_kpi_measurements for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy client_weekly_briefings_org_access on public.client_weekly_briefings for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create index if not exists idx_client_kpi_measurements_workspace_date on public.client_kpi_measurements(workspace_id,measured_at desc);
create index if not exists idx_client_weekly_briefings_workspace_date on public.client_weekly_briefings(workspace_id,period_start desc);

create or replace function public.generate_weekly_briefing(
  p_workspace_id uuid,
  p_upcoming_meeting_at timestamptz default null
) returns public.client_weekly_briefings
language plpgsql security definer set search_path=public
as $$
declare
  v_workspace public.client_workspaces;
  v_project public.delivery_projects;
  v_start date := current_date - 7;
  v_end date := current_date;
  v_brief public.client_weekly_briefings;
  v_done jsonb;
  v_blockers jsonb;
  v_reviews jsonb;
  v_next jsonb;
  v_meetings jsonb;
  v_kpis jsonb;
  v_risks jsonb := '[]'::jsonb;
  v_expansion jsonb := '[]'::jsonb;
  v_summary text;
begin
  select * into v_workspace from public.client_workspaces
  where id=p_workspace_id and public.is_org_member(organization_id);
  if v_workspace.id is null then raise exception 'Workspace not found'; end if;

  select * into v_project from public.delivery_projects
  where workspace_id=p_workspace_id order by created_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('title',title,'stage',stage,'completed_at',completed_at) order by completed_at desc),'[]'::jsonb)
  into v_done from public.delivery_project_tasks
  where project_id=v_project.id and status='done' and completed_at >= v_start;

  select coalesce(jsonb_agg(jsonb_build_object('title',title,'reason',blocked_reason,'owner',owner_role,'due_at',due_at)),'[]'::jsonb)
  into v_blockers from public.delivery_project_tasks
  where project_id=v_project.id and status='blocked';

  select coalesce(jsonb_agg(jsonb_build_object('title',title,'owner',owner_role,'due_at',due_at,'approval_status',approval_status)),'[]'::jsonb)
  into v_reviews from public.delivery_project_tasks
  where project_id=v_project.id and (status='review' or approval_status='pending');

  select coalesce(jsonb_agg(jsonb_build_object('title',title,'stage',stage,'owner',owner_role,'due_at',due_at,'priority',priority) order by due_at nulls last),'[]'::jsonb)
  into v_next from (
    select * from public.delivery_project_tasks
    where project_id=v_project.id and status in ('open','in_progress','review')
    order by case priority when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end, due_at nulls last
    limit 8
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object('title',title,'started_at',started_at,'summary',coalesce(short_summary,summary_overview),'action_items',action_items,'transcript_url',transcript_url) order by started_at desc),'[]'::jsonb)
  into v_meetings from public.meeting_intelligence_records
  where organization_id=v_workspace.organization_id
    and (lead_id in (select id from public.leads where client_id=v_workspace.client_id) or participant_emails::text ilike '%' || coalesce((select email from public.contacts where client_id=v_workspace.client_id order by is_primary desc limit 1),'__none__') || '%')
    and coalesce(started_at,created_at) >= v_start;

  select coalesce(jsonb_agg(jsonb_build_object('key',d.key,'label',d.label,'unit',d.unit,'target',d.target_value,'value',m.value,'measured_at',m.measured_at,'direction',d.direction)),'[]'::jsonb)
  into v_kpis
  from public.client_kpi_definitions d
  left join lateral (
    select value,measured_at from public.client_kpi_measurements
    where kpi_definition_id=d.id order by measured_at desc limit 1
  ) m on true
  where d.workspace_id=p_workspace_id and d.is_active=true;

  if jsonb_array_length(v_blockers)>0 then
    v_risks := v_risks || jsonb_build_array('Aktive Blocker gefährden Zeitplan oder Go-live.');
  end if;
  if v_project.target_go_live is not null and v_project.target_go_live < current_date + 14 and coalesce(v_project.progress,0)<80 then
    v_risks := v_risks || jsonb_build_array('Go-live liegt innerhalb von 14 Tagen bei weniger als 80 % Fortschritt.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('title',title,'type',opportunity_type,'value',estimated_value,'confidence',confidence)),'[]'::jsonb)
  into v_expansion from public.client_opportunities
  where workspace_id=p_workspace_id and status in ('detected','qualified');

  v_summary := concat(
    'Projektfortschritt ',coalesce(v_project.progress,0),' %. ',
    jsonb_array_length(v_done),' Aufgaben wurden in den letzten sieben Tagen abgeschlossen. ',
    jsonb_array_length(v_blockers),' aktive Blocker und ',jsonb_array_length(v_reviews),' offene Freigaben.'
  );

  insert into public.client_weekly_briefings(
    organization_id,workspace_id,project_id,upcoming_meeting_at,period_start,period_end,
    executive_summary,project_snapshot,recent_meetings,wins,blockers,decisions_needed,next_actions,
    kpi_snapshot,recommended_agenda,client_risks,expansion_signals,source_counts
  ) values (
    v_workspace.organization_id,p_workspace_id,v_project.id,p_upcoming_meeting_at,v_start,v_end,
    v_summary,
    jsonb_build_object('name',v_project.name,'status',v_project.status,'stage',v_project.current_stage,'progress',v_project.progress,'target_go_live',v_project.target_go_live),
    v_meetings,v_done,v_blockers,v_reviews,v_next,v_kpis,
    jsonb_build_array('Ergebnisse seit dem letzten Call','KPI-Entwicklung','Blocker und Entscheidungen','Nächste Prioritäten','Roadmap und Go-live'),
    v_risks,v_expansion,
    jsonb_build_object('meetings',jsonb_array_length(v_meetings),'wins',jsonb_array_length(v_done),'blockers',jsonb_array_length(v_blockers),'kpis',jsonb_array_length(v_kpis))
  ) on conflict(workspace_id,period_start,period_end) do update set
    project_id=excluded.project_id, upcoming_meeting_at=excluded.upcoming_meeting_at,
    executive_summary=excluded.executive_summary, project_snapshot=excluded.project_snapshot,
    recent_meetings=excluded.recent_meetings, wins=excluded.wins, blockers=excluded.blockers,
    decisions_needed=excluded.decisions_needed, next_actions=excluded.next_actions,
    kpi_snapshot=excluded.kpi_snapshot, recommended_agenda=excluded.recommended_agenda,
    client_risks=excluded.client_risks, expansion_signals=excluded.expansion_signals,
    source_counts=excluded.source_counts, status='generated', updated_at=now()
  returning * into v_brief;

  insert into public.client_context_assets(organization_id,workspace_id,asset_type,title,content,source_provider,source_reference,metadata)
  values(v_workspace.organization_id,p_workspace_id,'weekly_summary','Weekly Pre-Call Briefing · '||to_char(v_end,'DD.MM.YYYY'),v_summary,'nxtgen',v_brief.id::text,
    jsonb_build_object('briefing_id',v_brief.id,'period_start',v_start,'period_end',v_end))
  on conflict do nothing;

  update public.client_repo_sections set status='ready',updated_at=now()
  where workspace_id=p_workspace_id and section_key='weekly';

  return v_brief;
end;
$$;
