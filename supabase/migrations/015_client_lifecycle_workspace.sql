-- NXTGEN unified client lifecycle: Delivery + Customer Success + Upsell
create table if not exists public.client_workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  onboarding_case_id uuid references public.onboarding_cases(id) on delete set null,
  status text not null default 'onboarding' check (status in ('onboarding','kickoff','delivery','success','renewal','paused','completed')),
  current_phase text not null default 'context',
  health_score integer not null default 70 check (health_score between 0 and 100),
  baseline_metrics jsonb not null default '{}'::jsonb,
  current_metrics jsonb not null default '{}'::jsonb,
  strategic_goal text,
  next_milestone text,
  next_review_at timestamptz,
  renewal_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, client_id)
);

create table if not exists public.client_context_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  asset_type text not null check (asset_type in ('company_context','sales_transcript','closer_note','auto_briefing','onboarding_agenda','kickoff_notes','roadmap','weekly_summary','knowledge','deliverable','value_story')),
  title text not null,
  content text,
  source_provider text,
  source_reference text,
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_roadmap_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  title text not null,
  problem text,
  solution text,
  expected_impact text,
  impact integer not null default 5 check (impact between 1 and 10),
  confidence integer not null default 5 check (confidence between 1 and 10),
  effort integer not null default 5 check (effort between 1 and 10),
  priority_score numeric generated always as ((impact * confidence)::numeric / greatest(effort,1)) stored,
  phase text not null default 'backlog' check (phase in ('backlog','quick_win','phase_2','phase_3','active','done')),
  owner_user_id uuid references auth.users(id) on delete set null,
  due_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  meeting_record_id uuid references public.meeting_intelligence_records(id) on delete set null,
  period_start date not null,
  summary text,
  wins jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  decisions jsonb not null default '[]'::jsonb,
  next_actions jsonb not null default '[]'::jsonb,
  metric_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.client_value_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  event_type text not null check (event_type in ('baseline','milestone','metric_improvement','deliverable','testimonial','risk','upsell_signal','renewal')),
  title text not null,
  description text,
  metric_name text,
  before_value numeric,
  after_value numeric,
  monetary_value numeric,
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.client_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  opportunity_type text not null default 'upsell' check (opportunity_type in ('upsell','cross_sell','renewal','expansion')),
  title text not null,
  rationale text,
  recommended_modules jsonb not null default '[]'::jsonb,
  estimated_value numeric(12,2) not null default 0,
  confidence integer not null default 50 check (confidence between 0 and 100),
  status text not null default 'detected' check (status in ('detected','qualified','proposed','won','lost','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_workspaces enable row level security;
alter table public.client_context_assets enable row level security;
alter table public.client_roadmap_items enable row level security;
alter table public.client_weekly_checkins enable row level security;
alter table public.client_value_events enable row level security;
alter table public.client_opportunities enable row level security;

create policy client_workspaces_org_access on public.client_workspaces for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy client_context_assets_org_access on public.client_context_assets for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy client_roadmap_items_org_access on public.client_roadmap_items for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy client_weekly_checkins_org_access on public.client_weekly_checkins for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy client_value_events_org_access on public.client_value_events for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy client_opportunities_org_access on public.client_opportunities for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create index if not exists idx_client_workspaces_org_status on public.client_workspaces(organization_id,status);
create index if not exists idx_client_context_workspace_type on public.client_context_assets(workspace_id,asset_type,created_at desc);
create index if not exists idx_client_roadmap_workspace_phase on public.client_roadmap_items(workspace_id,phase,priority_score desc);
create index if not exists idx_client_value_workspace_date on public.client_value_events(workspace_id,occurred_at desc);
create index if not exists idx_client_opportunities_workspace_status on public.client_opportunities(workspace_id,status);
