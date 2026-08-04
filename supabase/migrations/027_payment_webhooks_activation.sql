-- NXTGEN payment automation: provider webhook -> invoice -> gate -> onboarding signal

create table if not exists public.backoffice_payment_webhooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('stripe','copecart','manual')),
  external_event_id text not null,
  event_type text not null,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  invoice_id uuid references public.backoffice_invoices(id) on delete set null,
  contract_id uuid references public.backoffice_contracts(id) on delete set null,
  amount numeric(14,2),
  currency text,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider,external_event_id)
);

alter table public.backoffice_payment_webhooks enable row level security;
create policy backoffice_payment_webhooks_org_access on public.backoffice_payment_webhooks for select
using (organization_id is not null and public.is_org_member(organization_id));
create index if not exists idx_payment_webhooks_org_created on public.backoffice_payment_webhooks(organization_id,created_at desc);
create index if not exists idx_payment_webhooks_status on public.backoffice_payment_webhooks(status,created_at);

create or replace function public.process_backoffice_payment_webhook(
  p_provider text,
  p_external_event_id text,
  p_event_type text,
  p_provider_reference text default null,
  p_invoice_id uuid default null,
  p_amount numeric default null,
  p_currency text default 'EUR',
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.backoffice_invoices;
  v_webhook_id uuid;
  v_gate public.backoffice_activation_gates;
  v_contract public.backoffice_contracts;
  v_package public.contract_packages;
  v_event_type text;
  v_is_paid boolean := false;
  v_result jsonb;
begin
  v_event_type := lower(coalesce(p_event_type,''));
  v_is_paid := v_event_type in (
    'payment_intent.succeeded','checkout.session.completed','invoice.paid',
    'payment.succeeded','purchase','payment_completed','order.completed'
  );

  insert into public.backoffice_payment_webhooks(provider,external_event_id,event_type,amount,currency,payload)
  values(lower(p_provider),p_external_event_id,p_event_type,p_amount,upper(coalesce(p_currency,'EUR')),coalesce(p_payload,'{}'::jsonb))
  on conflict(provider,external_event_id) do update set payload=excluded.payload
  returning id into v_webhook_id;

  if p_invoice_id is not null then
    select * into v_invoice from public.backoffice_invoices where id=p_invoice_id;
  end if;

  if v_invoice.id is null and p_provider_reference is not null then
    select * into v_invoice from public.backoffice_invoices
    where provider_reference=p_provider_reference
       or metadata->>'payment_reference'=p_provider_reference
       or metadata->>'checkout_session_id'=p_provider_reference
    order by created_at desc limit 1;
  end if;

  if v_invoice.id is null then
    select i.* into v_invoice
    from public.backoffice_invoices i
    join public.backoffice_contracts c on c.id=i.contract_id
    where c.metadata->>'source'= 'contract_package'
      and (c.metadata->>'source_package_id'=coalesce(p_payload->>'source_package_id','')
           or i.metadata->>'source_package_id'=coalesce(p_payload->>'source_package_id',''))
    order by i.created_at desc limit 1;
  end if;

  if v_invoice.id is null then
    update public.backoffice_payment_webhooks set status='ignored',error_message='Invoice not resolved',processed_at=now()
    where id=v_webhook_id;
    return jsonb_build_object('status','ignored','reason','invoice_not_found','webhook_id',v_webhook_id);
  end if;

  update public.backoffice_payment_webhooks set
    organization_id=v_invoice.organization_id,
    invoice_id=v_invoice.id,
    contract_id=v_invoice.contract_id
  where id=v_webhook_id;

  if not v_is_paid then
    update public.backoffice_payment_webhooks set status='ignored',processed_at=now() where id=v_webhook_id;
    return jsonb_build_object('status','ignored','reason','event_not_payment_success','invoice_id',v_invoice.id);
  end if;

  perform public.mark_backoffice_invoice_paid(
    v_invoice.id,
    coalesce(p_amount,v_invoice.total_amount-v_invoice.paid_amount),
    lower(p_provider),
    p_provider_reference
  );

  select * into v_gate from public.refresh_activation_gate_for_invoice(v_invoice.id);
  select * into v_contract from public.backoffice_contracts where id=v_invoice.contract_id;
  if v_contract.contract_package_id is not null then
    update public.contract_packages set payment_status='paid',updated_at=now()
    where id=v_contract.contract_package_id returning * into v_package;
  end if;

  insert into public.delivery_notifications(
    organization_id,project_id,task_id,notification_type,severity,title,message,metadata
  )
  select v_invoice.organization_id,null,null,'payment_received','info',
    'Zahlung eingegangen',
    'Rechnung '||v_invoice.invoice_number||' wurde über '||lower(p_provider)||' bezahlt.',
    jsonb_build_object('invoice_id',v_invoice.id,'contract_id',v_invoice.contract_id,'activation_gate_id',v_gate.id,'provider',lower(p_provider))
  where exists(select 1 from information_schema.tables where table_schema='public' and table_name='delivery_notifications');

  update public.backoffice_payment_webhooks set status='processed',processed_at=now() where id=v_webhook_id;

  v_result := jsonb_build_object(
    'status','processed',
    'invoice_id',v_invoice.id,
    'invoice_number',v_invoice.invoice_number,
    'activation_gate_id',v_gate.id,
    'activation_status',v_gate.status,
    'webhook_id',v_webhook_id
  );
  return v_result;
exception when others then
  update public.backoffice_payment_webhooks set status='failed',error_message=sqlerrm,processed_at=now()
  where provider=lower(p_provider) and external_event_id=p_external_event_id;
  raise;
end; $$;

create or replace function public.release_commercial_activation(p_gate_id uuid)
returns public.backoffice_activation_gates language plpgsql security definer set search_path=public as $$
declare v_gate public.backoffice_activation_gates; v_workspace public.client_workspaces;
begin
  select * into v_gate from public.backoffice_activation_gates where id=p_gate_id and public.is_org_member(organization_id);
  if v_gate.id is null then raise exception 'Activation gate not found'; end if;
  if v_gate.status not in ('ready','payment_received') then raise exception 'Activation gate is not ready'; end if;

  update public.backoffice_activation_gates set status='released',released_at=now(),released_by=auth.uid(),updated_at=now()
  where id=p_gate_id returning * into v_gate;

  update public.clients set status='active',updated_at=now() where id=v_gate.client_id;

  select * into v_workspace from public.client_workspaces
  where client_id=v_gate.client_id and organization_id=v_gate.organization_id limit 1;

  if v_workspace.id is null then
    insert into public.client_workspaces(organization_id,client_id,status,current_phase,strategic_goal,next_milestone)
    values(v_gate.organization_id,v_gate.client_id,'onboarding','onboarding','Erfolgreicher Start des Kundenprojekts','Onboarding starten')
    returning * into v_workspace;
  else
    update public.client_workspaces set status='onboarding',current_phase='onboarding',next_milestone='Onboarding starten',updated_at=now()
    where id=v_workspace.id returning * into v_workspace;
  end if;

  perform public.initialize_client_repo(v_workspace.id);
  update public.client_repo_sections set status='active',updated_at=now()
  where workspace_id=v_workspace.id and section_key='onboarding';

  insert into public.client_context_assets(organization_id,workspace_id,asset_type,title,content,source_provider,source_reference,metadata)
  values(v_gate.organization_id,v_workspace.id,'onboarding_agenda','Payment Gate freigegeben',
    'Setup-Zahlung wurde bestätigt. Onboarding und operative Vorbereitung können starten.',
    'nxtgen-finance',v_gate.id::text,jsonb_build_object('contract_id',v_gate.contract_id,'setup_invoice_id',v_gate.setup_invoice_id));

  return v_gate;
end; $$;
