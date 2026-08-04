-- Sprint 2: Dokumentversand, Signatur und Payment-Handoff

alter table public.commercial_offers add column if not exists contact_name text;
alter table public.commercial_offers add column if not exists contact_email text;
alter table public.commercial_offers add column if not exists total_contract_value numeric(12,2) not null default 0;
alter table public.commercial_offers add column if not exists client_snapshot jsonb not null default '{}'::jsonb;
alter table public.commercial_offers add column if not exists provider_snapshot jsonb not null default '{}'::jsonb;
alter table public.commercial_offers add column if not exists generated_html text;

alter table public.contract_packages add column if not exists generation_status text not null default 'pending';
alter table public.contract_packages add column if not exists offer_snapshot jsonb not null default '{}'::jsonb;
alter table public.contract_packages add column if not exists payment_provider text;
alter table public.contract_packages add column if not exists payment_url text;
alter table public.contract_packages add column if not exists payment_status text not null default 'not_requested';
alter table public.contract_packages add column if not exists payment_sent_at timestamptz;
alter table public.contract_packages add column if not exists paid_at timestamptz;

create table if not exists public.document_dispatch_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  package_id uuid not null references public.contract_packages(id) on delete cascade,
  channel text not null default 'email' check (channel in ('email','manual','webhook')),
  recipient_email text not null,
  subject text not null,
  message_body text,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','cancelled')),
  provider text,
  provider_message_id text,
  error_message text,
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.document_dispatch_jobs enable row level security;
create policy document_dispatch_jobs_org_access on public.document_dispatch_jobs for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create or replace function public.queue_contract_package_email(p_package_id uuid, p_subject text, p_message text)
returns uuid language plpgsql security definer set search_path=public as $$
declare p public.contract_packages; v_job uuid;
begin
  select * into p from public.contract_packages where id=p_package_id;
  if p.id is null or not public.is_org_member(p.organization_id) then raise exception 'Paket nicht gefunden'; end if;
  if coalesce(p.signer_email,'')='' then raise exception 'Empfänger-E-Mail fehlt'; end if;
  insert into public.document_dispatch_jobs(organization_id,package_id,recipient_email,subject,message_body,created_by)
  values(p.organization_id,p.id,p.signer_email,p_subject,p_message,auth.uid()) returning id into v_job;
  update public.contract_packages set status='sent',sent_at=now(),updated_at=now() where id=p.id;
  update public.commercial_offers set status='sent',sent_at=now(),updated_at=now() where id=p.offer_id;
  insert into public.document_delivery_events(organization_id,client_id,offer_id,package_id,event_type,recipient_email,metadata)
  values(p.organization_id,p.client_id,p.offer_id,p.id,'email_sent',p.signer_email,jsonb_build_object('dispatch_job_id',v_job,'state','queued'));
  return v_job;
end $$;
grant execute on function public.queue_contract_package_email(uuid,text,text) to authenticated;

create or replace function public.mark_contract_signed(p_package_id uuid, p_signing_url text default null)
returns void language plpgsql security definer set search_path=public as $$
declare p public.contract_packages;
begin
  select * into p from public.contract_packages where id=p_package_id;
  if p.id is null or not public.is_org_member(p.organization_id) then raise exception 'Paket nicht gefunden'; end if;
  update public.contract_packages set status='signed',signed_at=now(),signing_url=coalesce(p_signing_url,signing_url),updated_at=now() where id=p.id;
  update public.commercial_offers set status='accepted',accepted_at=now(),updated_at=now() where id=p.offer_id;
  insert into public.document_delivery_events(organization_id,client_id,offer_id,package_id,event_type,recipient_email)
  values(p.organization_id,p.client_id,p.offer_id,p.id,'signed',p.signer_email);
end $$;
grant execute on function public.mark_contract_signed(uuid,text) to authenticated;

create index if not exists idx_dispatch_jobs_status on public.document_dispatch_jobs(organization_id,status,scheduled_at);
