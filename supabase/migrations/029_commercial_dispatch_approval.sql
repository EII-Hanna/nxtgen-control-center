-- NXTGEN commercial dispatch approval: package ready -> internal send approval -> queued dispatch -> signature/payment handoff

alter table public.ai_commercial_runs
  add column if not exists dispatch_status text not null default 'not_requested'
    check (dispatch_status in ('not_requested','awaiting_send_approval','queued','sent','failed','cancelled')),
  add column if not exists dispatch_job_id uuid references public.document_dispatch_jobs(id) on delete set null,
  add column if not exists send_approved_by uuid references auth.users(id) on delete set null,
  add column if not exists send_approved_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists dispatch_error text;

create table if not exists public.commercial_dispatch_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.ai_commercial_runs(id) on delete cascade,
  package_id uuid references public.contract_packages(id) on delete set null,
  dispatch_job_id uuid references public.document_dispatch_jobs(id) on delete set null,
  event_type text not null check (event_type in ('approval_requested','approved','queued','sent','failed','cancelled','signed','payment_ready')),
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.commercial_dispatch_events enable row level security;
create policy commercial_dispatch_events_org_access on public.commercial_dispatch_events for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create index if not exists idx_commercial_dispatch_events_run on public.commercial_dispatch_events(run_id,created_at desc);

create or replace function public.request_commercial_send_approval(p_run_id uuid)
returns public.ai_commercial_runs
language plpgsql security definer set search_path=public as $$
declare v_run public.ai_commercial_runs;
begin
  select * into v_run from public.ai_commercial_runs
  where id=p_run_id and public.is_org_member(organization_id);
  if v_run.id is null then raise exception 'Commercial run not found'; end if;
  if v_run.status<>'package_ready' or v_run.package_id is null then raise exception 'Contract package is not ready'; end if;
  update public.ai_commercial_runs set dispatch_status='awaiting_send_approval',updated_at=now()
  where id=v_run.id returning * into v_run;
  insert into public.commercial_dispatch_events(organization_id,run_id,package_id,event_type,message,created_by)
  values(v_run.organization_id,v_run.id,v_run.package_id,'approval_requested','Interne Versandfreigabe angefordert.',auth.uid());
  return v_run;
end; $$;

grant execute on function public.request_commercial_send_approval(uuid) to authenticated;

create or replace function public.approve_and_queue_commercial_dispatch(
  p_run_id uuid,
  p_subject text default 'Ihr Angebot und Vertragspaket von NXTGENdigital',
  p_message text default null
) returns public.ai_commercial_runs
language plpgsql security definer set search_path=public as $$
declare
  v_run public.ai_commercial_runs;
  v_package public.contract_packages;
  v_job uuid;
  v_body text;
begin
  select * into v_run from public.ai_commercial_runs
  where id=p_run_id and public.is_org_member(organization_id);
  if v_run.id is null then raise exception 'Commercial run not found'; end if;
  if v_run.package_id is null or v_run.status<>'package_ready' then raise exception 'Contract package is not ready'; end if;
  if v_run.dispatch_status not in ('not_requested','awaiting_send_approval','failed') then return v_run; end if;

  select * into v_package from public.contract_packages where id=v_run.package_id;
  if coalesce(v_package.signer_email,'')='' then raise exception 'Signer email is missing'; end if;
  v_body:=coalesce(p_message,'Hallo '||coalesce(v_package.signer_name,'')||E',\n\nanbei erhalten Sie Ihr Angebot inklusive Vertragsunterlagen zur Prüfung und Online-Unterzeichnung.\n\nBeste Grüße\nNXTGENdigital');

  select public.queue_contract_package_email(v_package.id,p_subject,v_body) into v_job;

  update public.ai_commercial_runs set
    dispatch_status='queued',dispatch_job_id=v_job,send_approved_by=auth.uid(),send_approved_at=now(),dispatch_error=null,updated_at=now()
  where id=v_run.id returning * into v_run;

  insert into public.commercial_dispatch_events(organization_id,run_id,package_id,dispatch_job_id,event_type,message,created_by)
  values(v_run.organization_id,v_run.id,v_run.package_id,v_job,'queued','Versandauftrag wurde freigegeben und eingeplant.',auth.uid());
  return v_run;
exception when others then
  update public.ai_commercial_runs set dispatch_status='failed',dispatch_error=sqlerrm,updated_at=now() where id=p_run_id;
  raise;
end; $$;

grant execute on function public.approve_and_queue_commercial_dispatch(uuid,text,text) to authenticated;

create or replace function public.sync_commercial_dispatch_status(p_run_id uuid)
returns public.ai_commercial_runs
language plpgsql security definer set search_path=public as $$
declare v_run public.ai_commercial_runs; v_job public.document_dispatch_jobs; v_package public.contract_packages;
begin
  select * into v_run from public.ai_commercial_runs where id=p_run_id and public.is_org_member(organization_id);
  if v_run.id is null then raise exception 'Commercial run not found'; end if;
  if v_run.dispatch_job_id is not null then select * into v_job from public.document_dispatch_jobs where id=v_run.dispatch_job_id; end if;
  if v_run.package_id is not null then select * into v_package from public.contract_packages where id=v_run.package_id; end if;

  update public.ai_commercial_runs set
    dispatch_status=case
      when v_package.status='signed' then 'sent'
      when v_job.status='sent' then 'sent'
      when v_job.status='failed' then 'failed'
      else dispatch_status end,
    sent_at=case when v_job.status='sent' then coalesce(sent_at,v_job.sent_at,now()) else sent_at end,
    dispatch_error=case when v_job.status='failed' then v_job.error_message else dispatch_error end,
    updated_at=now()
  where id=v_run.id returning * into v_run;
  return v_run;
end; $$;

grant execute on function public.sync_commercial_dispatch_status(uuid) to authenticated;
