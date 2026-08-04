-- NXTGEN Revenue Engine: Angebote, Verträge, Dokumente, Versand und Signaturen

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  template_type text not null check (template_type in ('offer','contract','avv','terms','appendix')),
  name text not null,
  version text not null default '1.0',
  content_html text,
  source_file_path text,
  variable_schema jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  offer_number text not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','generated','reviewed','sent','viewed','accepted','rejected','expired','cancelled')),
  currency text not null default 'EUR',
  setup_fee numeric(12,2) not null default 0,
  recurring_fee numeric(12,2) not null default 0,
  billing_interval text not null default 'monthly' check (billing_interval in ('one_time','monthly','quarterly','yearly')),
  minimum_term_months integer,
  notice_period_months integer,
  valid_until date,
  scope jsonb not null default '[]'::jsonb,
  selected_products jsonb not null default '[]'::jsonb,
  selected_modules jsonb not null default '[]'::jsonb,
  custom_variables jsonb not null default '{}'::jsonb,
  generated_pdf_path text,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, offer_number)
);

create table if not exists public.contract_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  offer_id uuid references public.commercial_offers(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','generated','sent','viewed','partially_signed','signed','declined','expired','cancelled')),
  package_name text not null,
  signer_name text,
  signer_email text,
  signing_provider text,
  external_envelope_id text,
  signing_url text,
  expires_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  completed_pdf_path text,
  audit_trail_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contract_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  package_id uuid not null references public.contract_packages(id) on delete cascade,
  template_id uuid references public.document_templates(id) on delete set null,
  document_type text not null check (document_type in ('offer','contract','avv','terms','appendix')),
  sort_order integer not null default 0,
  rendered_html text,
  generated_pdf_path text,
  document_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.document_delivery_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  offer_id uuid references public.commercial_offers(id) on delete cascade,
  package_id uuid references public.contract_packages(id) on delete cascade,
  event_type text not null check (event_type in ('generated','reviewed','email_sent','email_delivered','email_bounced','viewed','reminder_sent','signed','declined','expired','payment_triggered')),
  recipient_email text,
  provider_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.document_templates enable row level security;
alter table public.commercial_offers enable row level security;
alter table public.contract_packages enable row level security;
alter table public.contract_documents enable row level security;
alter table public.document_delivery_events enable row level security;

create policy document_templates_org_access on public.document_templates for all
using (organization_id is null or public.is_org_member(organization_id))
with check (organization_id is null or public.is_org_member(organization_id));

create policy commercial_offers_org_access on public.commercial_offers for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy contract_packages_org_access on public.contract_packages for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy contract_documents_org_access on public.contract_documents for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy document_delivery_events_org_access on public.document_delivery_events for select
using (public.is_org_member(organization_id));

create index if not exists idx_offers_client_created on public.commercial_offers(client_id, created_at desc);
create index if not exists idx_contract_packages_client_created on public.contract_packages(client_id, created_at desc);
create index if not exists idx_contract_documents_package on public.contract_documents(package_id, sort_order);
create index if not exists idx_delivery_events_package on public.document_delivery_events(package_id, created_at desc);
