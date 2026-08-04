-- NXTGEN Renewal & Expansion Workflow
create table if not exists public.client_expansion_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  value_story_id uuid references public.client_value_stories(id) on delete set null,
  opportunity_id uuid references public.client_opportunities(id) on delete set null,
  cycle_type text not null check (cycle_type in ('renewal','upsell','cross_sell','expansion')),
  title text not null,
  rationale text,
  status text not null default 'draft' check (status in ('draft','review_planned','review_held','proposal_ready','proposal_sent','negotiation','won','lost','paused')),
  recommended_modules jsonb not null default '[]'::jsonb,
  proposed_setup_fee numeric(12,2) not null default 0,
  proposed_monthly_fee numeric(12,2) not null default 0,
  proposed_term_months integer not null default 12,
  estimated_contract_value numeric(14,2) not null default 0,
  review_at timestamptz,
  review_agenda jsonb not null default '[]'::jsonb,
  decision_notes text,
  next_action text,
  commercial_offer_id uuid references public.commercial_offers(id) on delete set null,
  won_at timestamptz,
  lost_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_expansion_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cycle_id uuid not null references public.client_expansion_cycles(id) on delete cascade,
  event_type text not null check (event_type in ('created','review_scheduled','review_held','proposal_created','proposal_sent','status_changed','won','lost','delivery_started','note')),
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.client_expansion_cycles enable row level security;
alter table public.client_expansion_events enable row level security;
create policy client_expansion_cycles_org_access on public.client_expansion_cycles for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy client_expansion_events_org_access on public.client_expansion_events for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create index if not exists idx_expansion_cycles_workspace on public.client_expansion_cycles(workspace_id,status,created_at desc);
create index if not exists idx_expansion_events_cycle on public.client_expansion_events(cycle_id,created_at desc);

create or replace function public.start_expansion_cycle(p_workspace_id uuid,p_opportunity_id uuid default null,p_value_story_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_ws public.client_workspaces; v_op public.client_opportunities; v_story public.client_value_stories; v_id uuid; v_type text; v_title text; v_modules jsonb; v_value numeric;
begin
  select * into v_ws from public.client_workspaces where id=p_workspace_id and public.is_org_member(organization_id);
  if v_ws.id is null then raise exception 'Workspace not found'; end if;
  if p_opportunity_id is not null then select * into v_op from public.client_opportunities where id=p_opportunity_id and workspace_id=p_workspace_id; end if;
  if p_value_story_id is not null then select * into v_story from public.client_value_stories where id=p_value_story_id and workspace_id=p_workspace_id; end if;
  v_type := coalesce(v_op.opportunity_type,'renewal');
  v_title := coalesce(v_op.title,case when v_type='renewal' then 'Verlängerung der Zusammenarbeit' else 'Nächste Wachstumsphase' end);
  v_modules := coalesce(v_op.recommended_modules,'[]'::jsonb);
  v_value := coalesce(v_op.estimated_value,0);
  insert into public.client_expansion_cycles(organization_id,workspace_id,client_id,value_story_id,opportunity_id,cycle_type,title,rationale,recommended_modules,estimated_contract_value,review_agenda,next_action)
  values(v_ws.organization_id,v_ws.id,v_ws.client_id,p_value_story_id,p_opportunity_id,v_type,v_title,coalesce(v_op.rationale,v_story.next_chapter),v_modules,v_value,
    '["Value Story und Ergebnisse","Offene Engpässe","Empfohlene Erweiterung","Investment und erwarteter Wert","Entscheidung und nächste Schritte"]'::jsonb,
    'Kundenreview terminieren') returning id into v_id;
  insert into public.client_expansion_events(organization_id,cycle_id,event_type,message) values(v_ws.organization_id,v_id,'created','Expansion Cycle aus Value Story gestartet.');
  return v_id;
end; $$;

create or replace function public.prepare_expansion_offer(p_cycle_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_cycle public.client_expansion_cycles; v_offer uuid; v_number text;
begin
  select * into v_cycle from public.client_expansion_cycles where id=p_cycle_id and public.is_org_member(organization_id);
  if v_cycle.id is null then raise exception 'Expansion cycle not found'; end if;
  v_number := 'EXP-'||to_char(now(),'YYYYMMDD-HH24MISS');
  insert into public.commercial_offers(organization_id,client_id,offer_number,title,status,setup_fee,recurring_fee,billing_interval,minimum_term_months,scope,selected_modules,custom_variables)
  values(v_cycle.organization_id,v_cycle.client_id,v_number,v_cycle.title,'draft',v_cycle.proposed_setup_fee,v_cycle.proposed_monthly_fee,'monthly',v_cycle.proposed_term_months,
    jsonb_build_array(jsonb_build_object('title',v_cycle.title,'description',v_cycle.rationale)),v_cycle.recommended_modules,
    jsonb_build_object('expansion_cycle_id',v_cycle.id,'estimated_contract_value',v_cycle.estimated_contract_value))
  returning id into v_offer;
  update public.client_expansion_cycles set commercial_offer_id=v_offer,status='proposal_ready',next_action='Angebot prüfen und versenden',updated_at=now() where id=p_cycle_id;
  insert into public.client_expansion_events(organization_id,cycle_id,event_type,message,metadata) values(v_cycle.organization_id,p_cycle_id,'proposal_created','Vorkonfiguriertes Angebot erstellt.',jsonb_build_object('offer_id',v_offer));
  return v_offer;
end; $$;

create or replace function public.win_expansion_cycle(p_cycle_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_cycle public.client_expansion_cycles; v_project uuid;
begin
  select * into v_cycle from public.client_expansion_cycles where id=p_cycle_id and public.is_org_member(organization_id);
  if v_cycle.id is null then raise exception 'Expansion cycle not found'; end if;
  update public.client_expansion_cycles set status='won',won_at=now(),next_action='Neue Delivery-Phase starten',updated_at=now() where id=p_cycle_id;
  update public.client_opportunities set status='won',updated_at=now() where id=v_cycle.opportunity_id;
  update public.client_workspaces set status='delivery',current_phase='roadmap',next_milestone=v_cycle.title,updated_at=now() where id=v_cycle.workspace_id;
  insert into public.client_roadmap_items(organization_id,workspace_id,title,problem,solution,expected_impact,impact,confidence,effort,phase)
  values(v_cycle.organization_id,v_cycle.workspace_id,v_cycle.title,'Nächste Wachstumsphase aus Value Story',coalesce(v_cycle.rationale,'Erweiterung um empfohlene Module'),'Retention, Expansion und zusätzlicher Kundenwert',8,8,4,'phase_2');
  insert into public.client_expansion_events(organization_id,cycle_id,event_type,message) values(v_cycle.organization_id,p_cycle_id,'won','Expansion gewonnen und neue Delivery-Phase angelegt.');
  select id into v_project from public.delivery_projects where workspace_id=v_cycle.workspace_id limit 1;
  return v_project;
end; $$;