-- NXTGEN Sprint 2: Erstgespräch, Bedarfsanalyse und Lösungskonfiguration

create table if not exists public.discovery_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  conversation_id uuid references public.sales_conversations(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','completed','approved')),
  current_process text,
  core_problem text,
  desired_outcome text,
  urgency text check (urgency in ('low','medium','high','critical')),
  budget_range text,
  decision_maker text,
  decision_process text,
  target_start date,
  team_size integer,
  monthly_volume numeric(12,2),
  pain_points jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  objections jsonb not null default '[]'::jsonb,
  qualification_score integer not null default 0 check (qualification_score between 0 and 100),
  summary text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lead_id)
);

create table if not exists public.solution_configurations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  assessment_id uuid references public.discovery_assessments(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','recommended','approved','offered')),
  package_name text not null default 'Individuelles Angebot',
  selected_products jsonb not null default '[]'::jsonb,
  selected_modules jsonb not null default '[]'::jsonb,
  scope_items jsonb not null default '[]'::jsonb,
  setup_fee numeric(12,2) not null default 0,
  monthly_fee numeric(12,2) not null default 0,
  term_months integer not null default 12 check (term_months > 0),
  rationale text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lead_id)
);

alter table public.discovery_assessments enable row level security;
alter table public.solution_configurations enable row level security;

create policy discovery_assessments_org_access on public.discovery_assessments for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy solution_configurations_org_access on public.solution_configurations for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_discovery_assessments_org on public.discovery_assessments(organization_id, updated_at desc);
create index if not exists idx_solution_configurations_org on public.solution_configurations(organization_id, updated_at desc);

create or replace function public.calculate_discovery_score(
  p_core_problem text,
  p_desired_outcome text,
  p_urgency text,
  p_budget_range text,
  p_decision_maker text,
  p_target_start date
) returns integer
language plpgsql immutable as $$
declare v_score integer := 0;
begin
  if coalesce(length(trim(p_core_problem)),0) > 10 then v_score := v_score + 20; end if;
  if coalesce(length(trim(p_desired_outcome)),0) > 10 then v_score := v_score + 20; end if;
  if p_urgency in ('high','critical') then v_score := v_score + 20;
  elsif p_urgency = 'medium' then v_score := v_score + 10; end if;
  if coalesce(length(trim(p_budget_range)),0) > 0 then v_score := v_score + 15; end if;
  if coalesce(length(trim(p_decision_maker)),0) > 0 then v_score := v_score + 15; end if;
  if p_target_start is not null then v_score := v_score + 10; end if;
  return least(v_score,100);
end $$;
