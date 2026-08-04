create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  type text not null default 'client' check (type in ('internal','client','partner')),
  status text not null default 'active' check (status in ('active','setup','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','consultant','delivery','sales','member','client')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_name text not null,
  industry text,
  website text,
  status text not null default 'lead' check (status in ('lead','qualified','proposal','won','onboarding','active','paused','lost')),
  monthly_revenue numeric(12,2) not null default 0,
  owner_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  role text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  description text,
  status text not null default 'active' check (status in ('draft','active','paused','archived')),
  base_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  code text not null unique,
  name text not null,
  description text,
  provisioning_type text not null default 'feature_flag' check (provisioning_type in ('feature_flag','external_tenant','workflow','manual')),
  monthly_price numeric(12,2) not null default 0,
  config_schema jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('draft','active','paused','archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  product_id uuid not null references public.products(id),
  status text not null default 'active' check (status in ('trial','active','paused','cancelled','expired')),
  monthly_price numeric(12,2) not null default 0,
  starts_at date not null default current_date,
  ends_at date,
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.license_entitlements (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  module_id uuid not null references public.modules(id),
  enabled boolean not null default true,
  seats integer not null default 1,
  config jsonb not null default '{}'::jsonb,
  provision_status text not null default 'pending' check (provision_status in ('pending','processing','active','failed','revoked')),
  external_tenant_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subscription_id,module_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  product_id uuid references public.products(id),
  name text not null,
  status text not null default 'planning' check (status in ('planning','briefing','build','review','live','paused','completed')),
  progress integer not null default 0 check (progress between 0 and 100),
  owner_user_id uuid references auth.users(id) on delete set null,
  target_go_live date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  name text not null,
  description text,
  steps jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  template_id uuid references public.workflow_templates(id),
  status text not null default 'queued' check (status in ('queued','running','waiting_approval','completed','failed','cancelled')),
  current_step integer not null default 0,
  runtime_state jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.organization_members m where m.organization_id=target_org and m.user_id=auth.uid()); $$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.clients enable row level security;
alter table public.contacts enable row level security;
alter table public.products enable row level security;
alter table public.modules enable row level security;
alter table public.subscriptions enable row level security;
alter table public.license_entitlements enable row level security;
alter table public.projects enable row level security;
alter table public.workflow_templates enable row level security;
alter table public.workflow_runs enable row level security;

create policy organizations_member_select on public.organizations for select using (public.is_org_member(id));
create policy profiles_self on public.profiles for all using (id=auth.uid()) with check (id=auth.uid());
create policy members_org_select on public.organization_members for select using (public.is_org_member(organization_id));
create policy clients_org_access on public.clients for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy contacts_via_client on public.contacts for all using (exists(select 1 from public.clients c where c.id=client_id and public.is_org_member(c.organization_id))) with check (exists(select 1 from public.clients c where c.id=client_id and public.is_org_member(c.organization_id)));
create policy products_authenticated_select on public.products for select to authenticated using (true);
create policy modules_authenticated_select on public.modules for select to authenticated using (true);
create policy subscriptions_via_client on public.subscriptions for all using (exists(select 1 from public.clients c where c.id=client_id and public.is_org_member(c.organization_id))) with check (exists(select 1 from public.clients c where c.id=client_id and public.is_org_member(c.organization_id)));
create policy entitlements_via_subscription on public.license_entitlements for all using (exists(select 1 from public.subscriptions s join public.clients c on c.id=s.client_id where s.id=subscription_id and public.is_org_member(c.organization_id))) with check (exists(select 1 from public.subscriptions s join public.clients c on c.id=s.client_id where s.id=subscription_id and public.is_org_member(c.organization_id)));
create policy projects_via_client on public.projects for all using (exists(select 1 from public.clients c where c.id=client_id and public.is_org_member(c.organization_id))) with check (exists(select 1 from public.clients c where c.id=client_id and public.is_org_member(c.organization_id)));
create policy workflow_templates_authenticated_select on public.workflow_templates for select to authenticated using (true);
create policy workflow_runs_via_project on public.workflow_runs for all using (exists(select 1 from public.projects p join public.clients c on c.id=p.client_id where p.id=project_id and public.is_org_member(c.organization_id))) with check (exists(select 1 from public.projects p join public.clients c on c.id=p.client_id where p.id=project_id and public.is_org_member(c.organization_id)));

insert into public.products(code,name,category,description,base_price) values
('recruiting-os','RecruitingOS','Vertical OS','KI-Betriebssystem für Personalberater',1490),
('recruiting-ads','Recruiting Ads','Growth','KI-gestützter Meta-Kampagnenlaunch',990),
('voice-ai','Voice AI','AI Workforce','Telefonagenten für Inbound und Qualifizierung',1290),
('fulfillment-os','Fulfillment OS','Delivery','Onboarding, Delivery und Projektsteuerung',1490)
on conflict (code) do nothing;
