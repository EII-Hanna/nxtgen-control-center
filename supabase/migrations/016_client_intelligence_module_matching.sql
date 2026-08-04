-- NXTGEN Client Intelligence: AI recommendations with human approval

create table if not exists public.client_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  source_summary text,
  detected_pains jsonb not null default '[]'::jsonb,
  detected_goals jsonb not null default '[]'::jsonb,
  detected_constraints jsonb not null default '[]'::jsonb,
  qualification_score integer not null default 0 check (qualification_score between 0 and 100),
  confidence integer not null default 0 check (confidence between 0 and 100),
  model_provider text,
  model_name text,
  status text not null default 'generated' check (status in ('queued','generated','reviewed','superseded','failed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create table if not exists public.client_module_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  snapshot_id uuid references public.client_intelligence_snapshots(id) on delete cascade,
  product_code text not null,
  module_code text,
  recommendation_type text not null default 'primary' check (recommendation_type in ('primary','add_on','later','exclude')),
  title text not null,
  rationale text,
  pain_match jsonb not null default '[]'::jsonb,
  expected_outcome text,
  suggested_phase text not null default 'quick_win' check (suggested_phase in ('quick_win','phase_2','phase_3','later')),
  score integer not null default 0 check (score between 0 and 100),
  suggested_setup_fee numeric(12,2) not null default 0,
  suggested_monthly_fee numeric(12,2) not null default 0,
  suggested_term_months integer not null default 12,
  status text not null default 'recommended' check (status in ('recommended','approved','rejected','offered','activated')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, product_code, coalesce(module_code,''), snapshot_id)
);

create table if not exists public.client_repo_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  section_key text not null,
  section_order integer not null,
  title text not null,
  description text,
  status text not null default 'empty' check (status in ('empty','ready','active','complete','blocked')),
  ai_managed boolean not null default true,
  human_review_required boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,section_key)
);

alter table public.client_intelligence_snapshots enable row level security;
alter table public.client_module_recommendations enable row level security;
alter table public.client_repo_sections enable row level security;

create policy client_intelligence_org_access on public.client_intelligence_snapshots for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy client_module_recommendations_org_access on public.client_module_recommendations for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy client_repo_sections_org_access on public.client_repo_sections for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create index if not exists idx_client_intelligence_workspace on public.client_intelligence_snapshots(workspace_id,created_at desc);
create index if not exists idx_client_recommendations_workspace on public.client_module_recommendations(workspace_id,status,score desc);
create index if not exists idx_client_repo_sections_workspace on public.client_repo_sections(workspace_id,section_order);

create or replace function public.initialize_client_repo(p_workspace_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.client_workspaces where id=p_workspace_id and public.is_org_member(organization_id);
  if v_org is null then raise exception 'Workspace not found'; end if;
  insert into public.client_repo_sections(organization_id,workspace_id,section_key,section_order,title,description,human_review_required) values
  (v_org,p_workspace_id,'overview',0,'Overview','Kunden-Snapshot, Zielbild und aktueller Status',false),
  (v_org,p_workspace_id,'sales',1,'Sales & Discovery','Transkripte, Closer-Input und Qualifizierung',true),
  (v_org,p_workspace_id,'briefing',2,'Auto-Briefing','Automatisches Briefing für Account und Delivery',true),
  (v_org,p_workspace_id,'onboarding',3,'Onboarding','Agenda, Zugänge und organisatorischer Start',true),
  (v_org,p_workspace_id,'kickoff',4,'Kick-off','Status quo, Systeme, Team, Ziele und Constraints',true),
  (v_org,p_workspace_id,'roadmap',5,'Roadmap','Priorisierte Quick Wins und Umsetzungsphasen',true),
  (v_org,p_workspace_id,'weekly',6,'Weekly Accountability','KPIs, Fortschritt, Blocker und nächste Schritte',false),
  (v_org,p_workspace_id,'assistant',7,'Client AI Assistant','Kundenspezifischer Assistent auf freigegebenem Kontext',true),
  (v_org,p_workspace_id,'deliverables',8,'Deliverables','Strategien, Systeme, Reports und Assets',true),
  (v_org,p_workspace_id,'value_story',9,'Value Story & Expansion','Vorher/Nachher, ROI, Renewal und Upsell',true)
  on conflict(workspace_id,section_key) do nothing;
end; $$;

create or replace function public.approve_module_recommendation(p_recommendation_id uuid)
returns public.client_module_recommendations language plpgsql security definer set search_path=public as $$
declare v_rec public.client_module_recommendations;
begin
  select * into v_rec from public.client_module_recommendations
  where id=p_recommendation_id and public.is_org_member(organization_id);
  if v_rec.id is null then raise exception 'Recommendation not found'; end if;

  update public.client_module_recommendations set status='approved',approved_at=now(),approved_by=auth.uid(),updated_at=now()
  where id=p_recommendation_id returning * into v_rec;

  insert into public.client_roadmap_items(organization_id,workspace_id,title,problem,solution,expected_impact,impact,confidence,effort,phase)
  values(v_rec.organization_id,v_rec.workspace_id,v_rec.title,
    array_to_string(array(select jsonb_array_elements_text(v_rec.pain_match)),', '),
    coalesce(v_rec.rationale,'Empfohlenes NXTGEN Modul'),v_rec.expected_outcome,
    greatest(1,least(10,ceil(v_rec.score/10.0)::int)),
    greatest(1,least(10,ceil(v_rec.score/10.0)::int)),
    case when v_rec.suggested_phase='quick_win' then 3 when v_rec.suggested_phase='phase_2' then 5 else 7 end,
    case when v_rec.suggested_phase='later' then 'backlog' else v_rec.suggested_phase end);
  return v_rec;
end; $$;
