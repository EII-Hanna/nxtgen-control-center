-- NXTGEN commercial-to-finance: signed contract -> billing -> payment gate -> activation

alter table public.backoffice_contracts
  add column if not exists source_package_id uuid references public.contract_packages(id) on delete set null;

create unique index if not exists uq_backoffice_contract_source_package
  on public.backoffice_contracts(source_package_id)
  where source_package_id is not null;

create table if not exists public.backoffice_billing_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  contract_id uuid not null references public.backoffice_contracts(id) on delete cascade,
  status text not null default 'active' check (status in ('draft','active','paused','completed','cancelled')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','quarterly','yearly','custom')),
  recurring_amount numeric(14,2) not null default 0,
  tax_rate numeric(6,2) not null default 19,
  next_run_date date,
  final_run_date date,
  runs_created integer not null default 0,
  provider text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(contract_id)
);

create table if not exists public.backoffice_activation_gates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  contract_id uuid not null references public.backoffice_contracts(id) on delete cascade,
  setup_invoice_id uuid references public.backoffice_invoices(id) on delete set null,
  gate_type text not null default 'onboarding' check (gate_type in ('onboarding','delivery','module_activation')),
  status text not null default 'waiting_payment' check (status in ('waiting_payment','payment_received','ready','released','blocked','cancelled')),
  payment_required boolean not null default true,
  payment_received_at timestamptz,
  released_at timestamptz,
  released_by uuid references auth.users(id) on delete set null,
  blocking_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(contract_id,gate_type)
);

alter table public.backoffice_billing_plans enable row level security;
alter table public.backoffice_activation_gates enable row level security;

create policy backoffice_billing_plans_org_access on public.backoffice_billing_plans for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy backoffice_activation_gates_org_access on public.backoffice_activation_gates for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create index if not exists idx_billing_plans_next_run on public.backoffice_billing_plans(organization_id,status,next_run_date);
create index if not exists idx_activation_gates_status on public.backoffice_activation_gates(organization_id,status,created_at desc);

create or replace function public.provision_finance_from_contract(p_package_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_package public.contract_packages;
  v_offer public.commercial_offers;
  v_contract_id uuid;
  v_invoice_id uuid;
  v_plan_id uuid;
  v_gate_id uuid;
  v_setup numeric := 0;
  v_recurring numeric := 0;
  v_term integer := 12;
  v_title text;
  v_contract_number text;
  v_invoice_number text;
  v_tax numeric := 19;
  v_start date := current_date;
begin
  select * into v_package from public.contract_packages
  where id=p_package_id and public.is_org_member(organization_id);
  if v_package.id is null then raise exception 'Contract package not found'; end if;
  if v_package.signed_at is null then raise exception 'Contract package is not signed'; end if;

  select * into v_offer from public.commercial_offers where id=v_package.offer_id;
  v_setup := coalesce(v_offer.setup_fee, nullif(v_package.offer_snapshot->>'setup_fee','')::numeric, 0);
  v_recurring := coalesce(v_offer.recurring_fee, nullif(v_package.offer_snapshot->>'recurring_fee','')::numeric, 0);
  v_term := coalesce(v_offer.minimum_term_months, nullif(v_package.offer_snapshot->>'minimum_term_months','')::integer, 12);
  v_title := coalesce(v_offer.title, v_package.package_name, 'NXTGEN Vertrag');
  v_contract_number := 'CTR-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(p_package_id::text,'-',''),1,8));

  insert into public.backoffice_contracts(
    organization_id,client_id,commercial_offer_id,contract_package_id,source_package_id,
    contract_number,title,status,start_date,end_date,billing_cycle,setup_fee,recurring_fee,
    payment_terms_days,auto_renew,next_billing_date,metadata
  ) values (
    v_package.organization_id,v_package.client_id,v_package.offer_id,v_package.id,v_package.id,
    v_contract_number,v_title,'active',v_start,(v_start + (v_term||' months')::interval)::date,
    'monthly',v_setup,v_recurring,14,true,(v_start + interval '1 month')::date,
    jsonb_build_object('source','contract_package','signed_at',v_package.signed_at,'term_months',v_term)
  ) on conflict(source_package_id) where source_package_id is not null do update set
    title=excluded.title,status='active',setup_fee=excluded.setup_fee,recurring_fee=excluded.recurring_fee,
    end_date=excluded.end_date,updated_at=now()
  returning id into v_contract_id;

  if v_setup > 0 then
    v_invoice_number := 'INV-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(v_contract_id::text,'-',''),1,8));
    insert into public.backoffice_invoices(
      organization_id,client_id,contract_id,invoice_number,status,issue_date,due_date,
      subtotal,tax_amount,total_amount,currency,provider,payment_link,metadata
    ) values (
      v_package.organization_id,v_package.client_id,v_contract_id,v_invoice_number,'approved',current_date,current_date+14,
      v_setup,round(v_setup*v_tax/100,2),round(v_setup*(1+v_tax/100),2),'EUR',v_package.payment_provider,v_package.payment_url,
      jsonb_build_object('invoice_type','setup','source_package_id',v_package.id)
    ) on conflict(organization_id,invoice_number) do update set
      payment_link=coalesce(excluded.payment_link,public.backoffice_invoices.payment_link),updated_at=now()
    returning id into v_invoice_id;

    insert into public.backoffice_invoice_items(organization_id,invoice_id,title,description,quantity,unit_price,tax_rate,sort_order)
    select v_package.organization_id,v_invoice_id,'Einmaliges Setup',v_title,1,v_setup,v_tax,10
    where not exists(select 1 from public.backoffice_invoice_items where invoice_id=v_invoice_id);
  end if;

  if v_recurring > 0 then
    insert into public.backoffice_billing_plans(
      organization_id,client_id,contract_id,status,billing_cycle,recurring_amount,tax_rate,next_run_date,final_run_date,provider,metadata
    ) values (
      v_package.organization_id,v_package.client_id,v_contract_id,'active','monthly',v_recurring,v_tax,
      (v_start+interval '1 month')::date,(v_start+(v_term||' months')::interval)::date,v_package.payment_provider,
      jsonb_build_object('source_package_id',v_package.id,'term_months',v_term)
    ) on conflict(contract_id) do update set recurring_amount=excluded.recurring_amount,status='active',updated_at=now()
    returning id into v_plan_id;
  end if;

  insert into public.backoffice_activation_gates(
    organization_id,client_id,contract_id,setup_invoice_id,gate_type,status,payment_required,metadata
  ) values (
    v_package.organization_id,v_package.client_id,v_contract_id,v_invoice_id,'onboarding',
    case when v_setup>0 then 'waiting_payment' else 'ready' end,v_setup>0,
    jsonb_build_object('source_package_id',v_package.id)
  ) on conflict(contract_id,gate_type) do update set
    setup_invoice_id=excluded.setup_invoice_id,
    status=case when public.backoffice_activation_gates.status='released' then 'released' else excluded.status end,
    updated_at=now()
  returning id into v_gate_id;

  update public.contract_packages set payment_status=case when v_setup>0 then coalesce(payment_status,'ready') else 'not_required' end,updated_at=now()
  where id=v_package.id;

  return jsonb_build_object('contract_id',v_contract_id,'setup_invoice_id',v_invoice_id,'billing_plan_id',v_plan_id,'activation_gate_id',v_gate_id);
end; $$;

create or replace function public.refresh_activation_gate_for_invoice(p_invoice_id uuid)
returns public.backoffice_activation_gates language plpgsql security definer set search_path=public as $$
declare v_invoice public.backoffice_invoices; v_gate public.backoffice_activation_gates;
begin
  select * into v_invoice from public.backoffice_invoices where id=p_invoice_id and public.is_org_member(organization_id);
  if v_invoice.id is null then raise exception 'Invoice not found'; end if;
  update public.backoffice_activation_gates set
    status=case when v_invoice.status='paid' then 'ready' else status end,
    payment_received_at=case when v_invoice.status='paid' then coalesce(payment_received_at,now()) else payment_received_at end,
    updated_at=now()
  where setup_invoice_id=p_invoice_id returning * into v_gate;
  return v_gate;
end; $$;

create or replace function public.release_commercial_activation(p_gate_id uuid)
returns public.backoffice_activation_gates language plpgsql security definer set search_path=public as $$
declare v_gate public.backoffice_activation_gates;
begin
  select * into v_gate from public.backoffice_activation_gates where id=p_gate_id and public.is_org_member(organization_id);
  if v_gate.id is null then raise exception 'Activation gate not found'; end if;
  if v_gate.status not in ('ready','payment_received') then raise exception 'Activation gate is not ready'; end if;

  update public.backoffice_activation_gates set status='released',released_at=now(),released_by=auth.uid(),updated_at=now()
  where id=p_gate_id returning * into v_gate;

  update public.clients set status='active',updated_at=now() where id=v_gate.client_id;
  update public.client_workspaces set status='onboarding',current_phase='onboarding',next_milestone='Onboarding starten',updated_at=now()
  where client_id=v_gate.client_id and organization_id=v_gate.organization_id;

  return v_gate;
end; $$;

create or replace function public.generate_due_recurring_invoices(p_run_date date default current_date)
returns integer language plpgsql security definer set search_path=public as $$
declare v_plan record; v_invoice_id uuid; v_number text; v_count integer:=0;
begin
  for v_plan in
    select * from public.backoffice_billing_plans
    where status='active' and next_run_date<=p_run_date and public.is_org_member(organization_id)
  loop
    v_number := 'INV-'||to_char(p_run_date,'YYYYMMDD')||'-'||upper(substr(replace(v_plan.id::text,'-',''),1,8))||'-'||lpad((v_plan.runs_created+1)::text,2,'0');
    insert into public.backoffice_invoices(
      organization_id,client_id,contract_id,invoice_number,status,issue_date,due_date,
      subtotal,tax_amount,total_amount,currency,provider,metadata
    ) values (
      v_plan.organization_id,v_plan.client_id,v_plan.contract_id,v_number,'approved',p_run_date,p_run_date+14,
      v_plan.recurring_amount,round(v_plan.recurring_amount*v_plan.tax_rate/100,2),round(v_plan.recurring_amount*(1+v_plan.tax_rate/100),2),
      'EUR',v_plan.provider,jsonb_build_object('invoice_type','recurring','billing_plan_id',v_plan.id,'run_number',v_plan.runs_created+1)
    ) on conflict(organization_id,invoice_number) do nothing returning id into v_invoice_id;
    if v_invoice_id is not null then
      insert into public.backoffice_invoice_items(organization_id,invoice_id,title,description,quantity,unit_price,tax_rate,sort_order)
      values(v_plan.organization_id,v_invoice_id,'Monatlicher Retainer','Wiederkehrende Leistung gemäß Vertrag',1,v_plan.recurring_amount,v_plan.tax_rate,10);
      update public.backoffice_billing_plans set runs_created=runs_created+1,next_run_date=(next_run_date+interval '1 month')::date,updated_at=now()
      where id=v_plan.id;
      v_count:=v_count+1;
    end if;
    v_invoice_id:=null;
  end loop;
  return v_count;
end; $$;
