-- NXTGEN Sprint 3: Deal-Won → Kunde → Onboarding → Projekt

create table if not exists public.onboarding_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete cascade,
  contract_package_id uuid references public.contract_packages(id) on delete set null,
  status text not null default 'not_started' check (status in ('not_started','invited','collecting','ready_for_kickoff','kickoff_scheduled','in_progress','completed','blocked')),
  progress integer not null default 0 check (progress between 0 and 100),
  kickoff_at timestamptz,
  kickoff_url text,
  target_go_live date,
  owner_user_id uuid references auth.users(id) on delete set null,
  customer_contact_name text,
  customer_contact_email text,
  internal_notes text,
  blocker_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id)
);

create table if not exists public.onboarding_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  onboarding_id uuid not null references public.onboarding_cases(id) on delete cascade,
  requirement_key text not null,
  title text not null,
  category text not null default 'general' check (category in ('company','brand','access','technical','legal','content','billing','general')),
  status text not null default 'open' check (status in ('open','requested','submitted','approved','rejected','not_required')),
  is_required boolean not null default true,
  value_text text,
  file_path text,
  secret_reference text,
  customer_note text,
  internal_note text,
  due_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(onboarding_id, requirement_key)
);

create table if not exists public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  onboarding_id uuid not null references public.onboarding_cases(id) on delete cascade,
  title text not null,
  phase text not null default 'setup' check (phase in ('handoff','data_collection','kickoff','setup','implementation','qa','go_live')),
  status text not null default 'open' check (status in ('open','in_progress','blocked','completed','cancelled')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.onboarding_cases enable row level security;
alter table public.onboarding_requirements enable row level security;
alter table public.onboarding_tasks enable row level security;

create policy onboarding_cases_org_access on public.onboarding_cases for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy onboarding_requirements_org_access on public.onboarding_requirements for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy onboarding_tasks_org_access on public.onboarding_tasks for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_onboarding_org_status on public.onboarding_cases(organization_id,status,created_at desc);
create index if not exists idx_onboarding_requirements_case on public.onboarding_requirements(onboarding_id,status);
create index if not exists idx_onboarding_tasks_case on public.onboarding_tasks(onboarding_id,status,due_at);

create or replace function public.start_customer_onboarding(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_lead public.leads%rowtype;
  v_client_id uuid;
  v_onboarding_id uuid;
begin
  select * into v_lead from public.leads where id=p_lead_id and public.is_org_member(organization_id);
  if not found then raise exception 'Lead nicht gefunden oder kein Zugriff'; end if;
  if v_lead.stage <> 'won' then raise exception 'Onboarding kann erst bei Deal gewonnen gestartet werden'; end if;

  if v_lead.converted_client_id is null then
    insert into public.clients(organization_id,company_name,status,monthly_revenue,metadata)
    values(v_lead.organization_id,v_lead.company_name,'onboarding',0,jsonb_build_object('source_lead_id',v_lead.id))
    returning id into v_client_id;

    insert into public.contacts(client_id,first_name,last_name,email,is_primary)
    values(v_client_id,
      nullif(split_part(coalesce(v_lead.contact_name,''),' ',1),''),
      nullif(trim(substring(coalesce(v_lead.contact_name,'') from position(' ' in coalesce(v_lead.contact_name,''))+1)),''),
      v_lead.email,true);

    update public.leads set converted_client_id=v_client_id,updated_at=now() where id=v_lead.id;
  else
    v_client_id := v_lead.converted_client_id;
  end if;

  insert into public.onboarding_cases(organization_id,lead_id,client_id,status,progress,customer_contact_name,customer_contact_email)
  values(v_lead.organization_id,v_lead.id,v_client_id,'collecting',10,v_lead.contact_name,v_lead.email)
  on conflict (client_id) do update set updated_at=now()
  returning id into v_onboarding_id;

  insert into public.onboarding_requirements(organization_id,onboarding_id,requirement_key,title,category,is_required)
  values
    (v_lead.organization_id,v_onboarding_id,'company_data','Unternehmensdaten','company',true),
    (v_lead.organization_id,v_onboarding_id,'brand_assets','Logo, Farben und Markenunterlagen','brand',true),
    (v_lead.organization_id,v_onboarding_id,'tool_access','Benötigte Tool-Zugänge','access',true),
    (v_lead.organization_id,v_onboarding_id,'technical_context','Technische Systemlandschaft','technical',true),
    (v_lead.organization_id,v_onboarding_id,'legal_documents','AVV und rechtliche Unterlagen','legal',false),
    (v_lead.organization_id,v_onboarding_id,'content_material','Vorhandene Inhalte und Vorlagen','content',false)
  on conflict (onboarding_id,requirement_key) do nothing;

  insert into public.onboarding_tasks(organization_id,onboarding_id,title,phase)
  values
    (v_lead.organization_id,v_onboarding_id,'Sales-Handover prüfen','handoff'),
    (v_lead.organization_id,v_onboarding_id,'Onboarding-Anfrage versenden','data_collection'),
    (v_lead.organization_id,v_onboarding_id,'Kick-off vorbereiten','kickoff'),
    (v_lead.organization_id,v_onboarding_id,'Projektstruktur anlegen','setup'),
    (v_lead.organization_id,v_onboarding_id,'Module und Integrationen bestätigen','setup');

  return v_onboarding_id;
end;
$$;

grant execute on function public.start_customer_onboarding(uuid) to authenticated;
