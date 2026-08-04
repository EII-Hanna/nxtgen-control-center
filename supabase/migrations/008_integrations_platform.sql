-- NXTGEN Integration Platform
-- Stores connector metadata and secret references only. Credentials remain in a vault/secret manager.

create table if not exists public.integration_catalog (
  key text primary key,
  name text not null,
  category text not null check (category in ('communication','knowledge','automation','calendar','email','payments','crm','storage','analytics','custom')),
  auth_type text not null check (auth_type in ('oauth2','api_key','webhook','basic','none')),
  description text,
  icon text,
  is_active boolean not null default true,
  capabilities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_key text not null references public.integration_catalog(key),
  name text not null,
  status text not null default 'disconnected' check (status in ('disconnected','pending','connected','error','paused')),
  secret_ref text,
  external_account_id text,
  external_account_name text,
  config jsonb not null default '{}'::jsonb,
  scopes jsonb not null default '[]'::jsonb,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,integration_key,name)
);

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete cascade,
  name text not null,
  direction text not null check (direction in ('inbound','outbound')),
  event_type text not null,
  endpoint_url text,
  signing_secret_ref text,
  is_active boolean not null default true,
  retry_policy jsonb not null default '{"max_attempts":5,"backoff":"exponential"}'::jsonb,
  headers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  webhook_endpoint_id uuid references public.webhook_endpoints(id) on delete set null,
  event_type text not null,
  direction text not null check (direction in ('inbound','outbound','internal')),
  status text not null default 'queued' check (status in ('queued','processing','succeeded','failed','ignored')),
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  response jsonb,
  attempts integer not null default 0,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.event_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  target_type text not null check (target_type in ('webhook','n8n','integration','internal_workflow')),
  target_id uuid,
  filter_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id,event_type,target_type,target_id)
);

alter table public.integration_catalog enable row level security;
alter table public.integration_connections enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.integration_events enable row level security;
alter table public.event_subscriptions enable row level security;

create policy integration_catalog_read on public.integration_catalog for select to authenticated using (is_active=true);
create policy integration_connections_org on public.integration_connections for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy webhook_endpoints_org on public.webhook_endpoints for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy integration_events_org on public.integration_events for select using (public.is_org_member(organization_id));
create policy event_subscriptions_org on public.event_subscriptions for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create index if not exists idx_connections_org_status on public.integration_connections(organization_id,status);
create index if not exists idx_integration_events_org_created on public.integration_events(organization_id,created_at desc);
create index if not exists idx_integration_events_status on public.integration_events(status,created_at);

insert into public.integration_catalog(key,name,category,auth_type,description,icon,capabilities) values
('slack','Slack','communication','oauth2','Interne Benachrichtigungen, Freigaben und Aufgabenübergaben.','S','["messages","channels","approvals"]'),
('notion','Notion','knowledge','oauth2','Wissensdatenbank, SOPs und Dokumentensynchronisation.','N','["pages","databases","knowledge_sync"]'),
('n8n','n8n','automation','api_key','Zentrale Workflow- und Event-Automatisierung.','n8n','["webhooks","workflows","executions"]'),
('google-calendar','Google Calendar','calendar','oauth2','Termine, Erstgespräche, Kick-offs und Reviews.','G','["events","availability","reminders"]'),
('google-mail','Gmail / Google Workspace','email','oauth2','E-Mail-Kommunikation, Follow-ups und Dokumentversand.','G','["send","threads","labels"]'),
('microsoft-365','Microsoft 365','email','oauth2','Outlook, Kalender, Teams und Dokumente.','M','["mail","calendar","teams","files"]'),
('stripe','Stripe','payments','webhook','Zahlungslinks und Zahlungsstatus.','S','["payment_links","payments","webhooks"]'),
('copecart','CopeCart','payments','webhook','Checkout-Links und Zahlungsereignisse.','C','["checkout_links","payments","webhooks"]'),
('supabase','Supabase','storage','api_key','Zentrale Datenbank, Auth und Storage.','S','["database","auth","storage"]'),
('openai','OpenAI','knowledge','api_key','KI-Assistent, Zusammenfassungen und Wissenszugriff.','AI','["chat","embeddings","analysis"]'),
('custom-webhook','Custom Webhook','custom','webhook','Beliebige externe Systeme über signierte Webhooks anbinden.','W','["inbound","outbound"]')
on conflict (key) do update set name=excluded.name,category=excluded.category,auth_type=excluded.auth_type,description=excluded.description,capabilities=excluded.capabilities,is_active=true;
