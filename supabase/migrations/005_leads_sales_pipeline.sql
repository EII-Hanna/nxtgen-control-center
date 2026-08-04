-- NXTGEN Sprint 1: Interessenten, Gespräche und Sales-Pipeline

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  website text,
  industry text,
  source text not null default 'manual' check (source in ('linkedin','email','website','whatsapp','referral','manual','other')),
  stage text not null default 'new' check (stage in ('new','contacted','replied','qualified','meeting_booked','meeting_completed','offer_open','won','lost')),
  estimated_value numeric(12,2) not null default 0,
  probability integer not null default 10 check (probability between 0 and 100),
  need_summary text,
  next_step text,
  next_follow_up_at timestamptz,
  owner_user_id uuid references auth.users(id) on delete set null,
  converted_client_id uuid references public.clients(id) on delete set null,
  lost_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  conversation_type text not null default 'sales_call' check (conversation_type in ('discovery','sales_call','follow_up','demo','negotiation')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  status text not null default 'planned' check (status in ('planned','completed','cancelled','no_show')),
  summary text,
  pain_points jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  objections jsonb not null default '[]'::jsonb,
  recommended_products jsonb not null default '[]'::jsonb,
  next_action text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  activity_type text not null check (activity_type in ('note','email','call','whatsapp','linkedin','meeting','task','stage_change')),
  subject text,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  due_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;
alter table public.sales_conversations enable row level security;
alter table public.sales_activities enable row level security;

create policy leads_org_access on public.leads for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy sales_conversations_org_access on public.sales_conversations for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy sales_activities_org_access on public.sales_activities for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_leads_org_stage on public.leads(organization_id, stage, created_at desc);
create index if not exists idx_leads_follow_up on public.leads(organization_id, next_follow_up_at) where next_follow_up_at is not null;
create index if not exists idx_sales_conversations_lead on public.sales_conversations(lead_id, scheduled_at desc);
create index if not exists idx_sales_activities_lead on public.sales_activities(lead_id, created_at desc);
