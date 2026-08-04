-- NXTGEN Value Story Engine: baseline -> measures -> outcomes -> ROI -> expansion
create table if not exists public.client_value_stories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft','generated','reviewed','approved','presented','archived')),
  period_start date,
  period_end date,
  baseline_summary text,
  transformation_summary text,
  outcome_summary text,
  next_chapter text,
  investment_value numeric(14,2) not null default 0,
  realized_value numeric(14,2) not null default 0,
  projected_annual_value numeric(14,2) not null default 0,
  roi_percent numeric(12,2) not null default 0,
  payback_months numeric(10,2),
  executive_score integer not null default 0 check (executive_score between 0 and 100),
  evidence_strength integer not null default 0 check (evidence_strength between 0 and 100),
  recommended_expansion jsonb not null default '[]'::jsonb,
  narrative jsonb not null default '{}'::jsonb,
  generated_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, period_start, period_end)
);

create table if not exists public.client_value_story_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  story_id uuid not null references public.client_value_stories(id) on delete cascade,
  item_type text not null check (item_type in ('baseline','measure','milestone','metric','outcome','proof','risk','expansion')),
  title text not null,
  description text,
  metric_name text,
  before_value numeric,
  after_value numeric,
  unit text,
  monetary_value numeric(14,2),
  source_type text,
  source_reference text,
  confidence integer not null default 50 check (confidence between 0 and 100),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.client_value_stories enable row level security;
alter table public.client_value_story_items enable row level security;

create policy client_value_stories_org_access on public.client_value_stories for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy client_value_story_items_org_access on public.client_value_story_items for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create index if not exists idx_value_stories_workspace on public.client_value_stories(workspace_id,created_at desc);
create index if not exists idx_value_story_items_story on public.client_value_story_items(story_id,sort_order,created_at);

create or replace function public.generate_client_value_story(
  p_workspace_id uuid,
  p_period_start date default (current_date - interval '90 days')::date,
  p_period_end date default current_date
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_workspace public.client_workspaces;
  v_story uuid;
  v_investment numeric := 0;
  v_value numeric := 0;
  v_project_progress integer := 0;
  v_evidence integer := 0;
  v_roi numeric := 0;
  v_payback numeric := null;
  v_metric_count integer := 0;
  v_event_count integer := 0;
  v_expansion jsonb := '[]'::jsonb;
  v_baseline text;
  v_outcome text;
begin
  select * into v_workspace from public.client_workspaces
  where id=p_workspace_id and public.is_org_member(organization_id);
  if v_workspace.id is null then raise exception 'Workspace not found'; end if;

  select coalesce(sum(coalesce(s.monthly_price,0)),0) * 3
    into v_investment
  from public.subscriptions s
  join public.clients c on c.id=s.client_id
  where c.id=v_workspace.client_id and s.status='active';

  select coalesce(sum(coalesce(monetary_value,0)),0), count(*)
    into v_value, v_event_count
  from public.client_value_events
  where workspace_id=p_workspace_id and occurred_at::date between p_period_start and p_period_end;

  select coalesce(max(progress),0) into v_project_progress
  from public.delivery_projects where workspace_id=p_workspace_id;

  select count(*) into v_metric_count
  from public.client_kpi_measurements m
  join public.client_kpi_definitions d on d.id=m.kpi_id
  where d.workspace_id=p_workspace_id and m.measured_at::date between p_period_start and p_period_end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'title',title,'type',opportunity_type,'estimated_value',estimated_value,'confidence',confidence
  ) order by confidence desc),'[]'::jsonb)
  into v_expansion
  from public.client_opportunities
  where workspace_id=p_workspace_id and status in ('detected','qualified','proposed');

  v_evidence := least(100, v_event_count*15 + v_metric_count*8 + case when v_project_progress>0 then 20 else 0 end);
  if v_investment > 0 then v_roi := round(((v_value-v_investment)/v_investment)*100,2); end if;
  if v_value > 0 and v_investment > 0 then v_payback := round(v_investment/(v_value/3),2); end if;

  v_baseline := coalesce(v_workspace.strategic_goal,'Ausgangslage und Zielbild wurden im Kunden-Workspace dokumentiert.');
  v_outcome := case when v_value>0 then 'Messbarer Wert von '||round(v_value,0)||' EUR im betrachteten Zeitraum dokumentiert.' else 'Projektfortschritt und qualitative Ergebnisse wurden dokumentiert; monetäre Werte werden weiter angereichert.' end;

  insert into public.client_value_stories(
    organization_id,workspace_id,title,status,period_start,period_end,
    baseline_summary,transformation_summary,outcome_summary,next_chapter,
    investment_value,realized_value,projected_annual_value,roi_percent,payback_months,
    executive_score,evidence_strength,recommended_expansion,narrative,generated_at
  ) values (
    v_workspace.organization_id,p_workspace_id,'NXTGEN Value Story · '||p_period_end,'generated',p_period_start,p_period_end,
    v_baseline,
    'NXTGEN hat Sales-Kontext, Roadmap, Delivery-Aufgaben, Weekly Calls und KPIs in einem geführten Kundenbetriebssystem verbunden.',
    v_outcome,
    case when jsonb_array_length(v_expansion)>0 then 'Die nächste sinnvolle Erweiterung wurde aus Ergebnissen und offenen Engpässen abgeleitet.' else 'Nächste Phase entlang der priorisierten Roadmap fortführen.' end,
    v_investment,v_value,v_value*4,v_roi,v_payback,
    least(100,round(v_project_progress*0.6 + v_evidence*0.4)::int),v_evidence,v_expansion,
    jsonb_build_object('project_progress',v_project_progress,'metric_count',v_metric_count,'value_event_count',v_event_count),now()
  )
  on conflict(workspace_id,period_start,period_end) do update set
    baseline_summary=excluded.baseline_summary,
    transformation_summary=excluded.transformation_summary,
    outcome_summary=excluded.outcome_summary,
    next_chapter=excluded.next_chapter,
    investment_value=excluded.investment_value,
    realized_value=excluded.realized_value,
    projected_annual_value=excluded.projected_annual_value,
    roi_percent=excluded.roi_percent,
    payback_months=excluded.payback_months,
    executive_score=excluded.executive_score,
    evidence_strength=excluded.evidence_strength,
    recommended_expansion=excluded.recommended_expansion,
    narrative=excluded.narrative,
    status='generated',generated_at=now(),updated_at=now()
  returning id into v_story;

  delete from public.client_value_story_items where story_id=v_story;

  insert into public.client_value_story_items(organization_id,story_id,item_type,title,description,sort_order,confidence)
  values
    (v_workspace.organization_id,v_story,'baseline','Ausgangslage',v_baseline,10,greatest(50,v_evidence)),
    (v_workspace.organization_id,v_story,'measure','Umgesetzte Maßnahmen','Roadmap und Delivery-Aufgaben wurden priorisiert, umgesetzt und dokumentiert.',20,greatest(50,v_evidence)),
    (v_workspace.organization_id,v_story,'outcome','Erzielte Wirkung',v_outcome,40,greatest(50,v_evidence));

  insert into public.client_value_story_items(
    organization_id,story_id,item_type,title,description,metric_name,before_value,after_value,unit,monetary_value,source_type,source_reference,confidence,sort_order
  )
  select v_workspace.organization_id,v_story,'metric',d.name,
    'Entwicklung der Kennzahl im betrachteten Zeitraum.',d.metric_key,
    first_value(m.value) over(partition by d.id order by m.measured_at),
    last_value(m.value) over(partition by d.id order by m.measured_at rows between unbounded preceding and unbounded following),
    d.unit,null,'kpi',d.id::text,80,30
  from public.client_kpi_definitions d
  join public.client_kpi_measurements m on m.kpi_id=d.id
  where d.workspace_id=p_workspace_id and m.measured_at::date between p_period_start and p_period_end
  qualify row_number() over(partition by d.id order by m.measured_at desc)=1;

  -- PostgreSQL has no QUALIFY; the statement above is replaced safely below by deleting duplicate metric rows and reinserting.
  delete from public.client_value_story_items where story_id=v_story and item_type='metric';
  insert into public.client_value_story_items(
    organization_id,story_id,item_type,title,description,metric_name,before_value,after_value,unit,source_type,source_reference,confidence,sort_order
  )
  select v_workspace.organization_id,v_story,'metric',d.name,'Entwicklung der Kennzahl im betrachteten Zeitraum.',d.metric_key,
    (select m1.value from public.client_kpi_measurements m1 where m1.kpi_id=d.id and m1.measured_at::date between p_period_start and p_period_end order by m1.measured_at asc limit 1),
    (select m2.value from public.client_kpi_measurements m2 where m2.kpi_id=d.id and m2.measured_at::date between p_period_start and p_period_end order by m2.measured_at desc limit 1),
    d.unit,'kpi',d.id::text,80,30
  from public.client_kpi_definitions d
  where d.workspace_id=p_workspace_id
    and exists(select 1 from public.client_kpi_measurements mx where mx.kpi_id=d.id and mx.measured_at::date between p_period_start and p_period_end);

  insert into public.client_context_assets(organization_id,workspace_id,asset_type,title,content,source_provider,source_reference,metadata)
  values(v_workspace.organization_id,p_workspace_id,'value_story','Value Story · '||p_period_end,
    v_baseline||E'\n\n'||v_outcome,'nxtgen',v_story::text,jsonb_build_object('period_start',p_period_start,'period_end',p_period_end,'roi_percent',v_roi));

  update public.client_repo_sections set status='ready',updated_at=now()
  where workspace_id=p_workspace_id and section_key='value_story';

  return v_story;
end; $$;
