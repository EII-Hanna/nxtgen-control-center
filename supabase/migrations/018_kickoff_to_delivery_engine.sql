-- NXTGEN Kickoff Intelligence -> approved roadmap -> delivery provisioning

create table if not exists public.client_kickoff_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  meeting_record_id uuid references public.meeting_intelligence_records(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','generated','reviewed','approved','provisioned','failed')),
  company_status_quo text,
  systems jsonb not null default '[]'::jsonb,
  data_sources jsonb not null default '[]'::jsonb,
  team_roles jsonb not null default '[]'::jsonb,
  capabilities jsonb not null default '[]'::jsonb,
  pain_points jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  success_metrics jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  ai_summary text,
  confidence integer not null default 0 check (confidence between 0 and 100),
  generated_by text not null default 'nxtgen',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_kickoff_initiatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  assessment_id uuid not null references public.client_kickoff_assessments(id) on delete cascade,
  title text not null,
  problem text,
  solution text,
  expected_outcome text,
  impact integer not null default 5 check (impact between 1 and 10),
  confidence integer not null default 5 check (confidence between 1 and 10),
  effort integer not null default 5 check (effort between 1 and 10),
  ice_score numeric generated always as ((impact * confidence)::numeric / greatest(effort,1)) stored,
  recommended_phase text not null default 'quick_win' check (recommended_phase in ('quick_win','phase_2','phase_3','later')),
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','provisioned')),
  owner_role text,
  target_weeks integer,
  source_evidence jsonb not null default '[]'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  status text not null default 'planned' check (status in ('planned','active','blocked','qa','client_review','live','completed','cancelled')),
  current_stage text not null default 'briefing' check (current_stage in ('briefing','analysis','blueprint','provisioning','implementation','qa','client_approval','go_live')),
  objective text,
  target_go_live date,
  progress integer not null default 0 check (progress between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id)
);

create table if not exists public.delivery_project_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.delivery_projects(id) on delete cascade,
  roadmap_item_id uuid references public.client_roadmap_items(id) on delete set null,
  title text not null,
  description text,
  stage text not null default 'briefing' check (stage in ('briefing','analysis','blueprint','provisioning','implementation','qa','client_approval','go_live')),
  status text not null default 'open' check (status in ('open','in_progress','blocked','review','done','cancelled')),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  owner_role text,
  due_at date,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_kickoff_assessments enable row level security;
alter table public.client_kickoff_initiatives enable row level security;
alter table public.delivery_projects enable row level security;
alter table public.delivery_project_tasks enable row level security;

create policy client_kickoff_assessments_org_access on public.client_kickoff_assessments for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy client_kickoff_initiatives_org_access on public.client_kickoff_initiatives for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy delivery_projects_org_access on public.delivery_projects for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy delivery_project_tasks_org_access on public.delivery_project_tasks for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create index if not exists idx_kickoff_assessments_workspace on public.client_kickoff_assessments(workspace_id,created_at desc);
create index if not exists idx_kickoff_initiatives_assessment on public.client_kickoff_initiatives(assessment_id,status,ice_score desc);
create index if not exists idx_delivery_projects_workspace on public.delivery_projects(workspace_id,status);
create index if not exists idx_delivery_tasks_project on public.delivery_project_tasks(project_id,status,stage,sort_order);

create or replace function public.approve_kickoff_initiative(p_initiative_id uuid)
returns public.client_kickoff_initiatives language plpgsql security definer set search_path=public as $$
declare v_item public.client_kickoff_initiatives; v_roadmap uuid;
begin
  select * into v_item from public.client_kickoff_initiatives where id=p_initiative_id and public.is_org_member(organization_id);
  if v_item.id is null then raise exception 'Initiative not found'; end if;
  update public.client_kickoff_initiatives set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=p_initiative_id returning * into v_item;
  insert into public.client_roadmap_items(organization_id,workspace_id,title,problem,solution,expected_impact,impact,confidence,effort,phase)
  values(v_item.organization_id,v_item.workspace_id,v_item.title,v_item.problem,v_item.solution,v_item.expected_outcome,v_item.impact,v_item.confidence,v_item.effort,
    case when v_item.recommended_phase='later' then 'backlog' else v_item.recommended_phase end)
  returning id into v_roadmap;
  update public.client_kickoff_initiatives set source_evidence=source_evidence || jsonb_build_array(jsonb_build_object('roadmap_item_id',v_roadmap)) where id=p_initiative_id returning * into v_item;
  return v_item;
end; $$;

create or replace function public.provision_delivery_from_kickoff(p_assessment_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_assessment public.client_kickoff_assessments; v_workspace public.client_workspaces; v_project uuid; v_item record; v_roadmap uuid;
begin
  select * into v_assessment from public.client_kickoff_assessments where id=p_assessment_id and public.is_org_member(organization_id);
  if v_assessment.id is null then raise exception 'Assessment not found'; end if;
  select * into v_workspace from public.client_workspaces where id=v_assessment.workspace_id;
  insert into public.delivery_projects(organization_id,workspace_id,client_id,name,status,current_stage,objective,target_go_live,metadata)
  values(v_assessment.organization_id,v_workspace.id,v_workspace.client_id,'NXTGEN Delivery · '||coalesce(v_workspace.strategic_goal,'Kundenprojekt'),'planned','briefing',coalesce(v_assessment.ai_summary,v_workspace.strategic_goal),current_date+interval '90 days',jsonb_build_object('kickoff_assessment_id',v_assessment.id))
  on conflict(workspace_id) do update set objective=excluded.objective,updated_at=now()
  returning id into v_project;

  for v_item in select * from public.client_kickoff_initiatives where assessment_id=p_assessment_id and status='approved' order by ice_score desc loop
    select id into v_roadmap from public.client_roadmap_items where workspace_id=v_item.workspace_id and title=v_item.title order by created_at desc limit 1;
    insert into public.delivery_project_tasks(organization_id,project_id,roadmap_item_id,title,description,stage,priority,owner_role,due_at,sort_order,metadata)
    values(v_item.organization_id,v_project,v_roadmap,v_item.title,coalesce(v_item.solution,v_item.problem),
      case when v_item.recommended_phase='quick_win' then 'blueprint' when v_item.recommended_phase='phase_2' then 'implementation' else 'provisioning' end,
      case when v_item.impact>=8 then 'high' else 'medium' end,v_item.owner_role,current_date+coalesce(v_item.target_weeks,6)*7,
      round(v_item.ice_score)::int,jsonb_build_object('kickoff_initiative_id',v_item.id));
    update public.client_kickoff_initiatives set status='provisioned',updated_at=now() where id=v_item.id;
  end loop;

  update public.client_kickoff_assessments set status='provisioned',approved_at=coalesce(approved_at,now()),updated_at=now() where id=p_assessment_id;
  update public.client_workspaces set status='delivery',current_phase='roadmap',next_milestone='Delivery-Projekt starten',updated_at=now() where id=v_workspace.id;
  update public.client_repo_sections set status='complete',updated_at=now() where workspace_id=v_workspace.id and section_key='kickoff';
  update public.client_repo_sections set status='active',updated_at=now() where workspace_id=v_workspace.id and section_key='roadmap';
  return v_project;
end; $$;
