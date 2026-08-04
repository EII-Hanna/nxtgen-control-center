-- NXTGEN hidden commercial orchestration: Fireflies approval -> offer draft -> human approval -> contract package

create table if not exists public.ai_commercial_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  meeting_record_id uuid references public.meeting_intelligence_records(id) on delete set null,
  assessment_id uuid references public.discovery_assessments(id) on delete set null,
  solution_id uuid references public.solution_configurations(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  offer_id uuid references public.commercial_offers(id) on delete set null,
  package_id uuid references public.contract_packages(id) on delete set null,
  status text not null default 'draft_generated' check (status in (
    'draft_generated','awaiting_approval','approved','package_ready','failed','cancelled'
  )),
  package_name text not null default 'KI-empfohlene Lösung',
  scope_items jsonb not null default '[]'::jsonb,
  rationale text,
  setup_fee numeric(14,2),
  monthly_fee numeric(14,2),
  term_months integer,
  approval_note text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_commercial_runs enable row level security;

create policy ai_commercial_runs_org_access on public.ai_commercial_runs for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create unique index if not exists uq_ai_commercial_active_lead
  on public.ai_commercial_runs(lead_id)
  where status not in ('cancelled','failed');
create index if not exists idx_ai_commercial_org_status
  on public.ai_commercial_runs(organization_id,status,updated_at desc);

create or replace function public.prepare_ai_commercial_run(p_lead_id uuid)
returns public.ai_commercial_runs
language plpgsql security definer set search_path=public as $$
declare
  v_lead public.leads;
  v_meeting public.meeting_intelligence_records;
  v_assessment public.discovery_assessments;
  v_solution public.solution_configurations;
  v_run public.ai_commercial_runs;
  v_package_name text;
  v_scope jsonb := '[]'::jsonb;
  v_rationale text;
begin
  select * into v_lead from public.leads
  where id=p_lead_id and public.is_org_member(organization_id);
  if v_lead.id is null then raise exception 'Lead not found'; end if;

  select * into v_meeting from public.meeting_intelligence_records
  where lead_id=p_lead_id and organization_id=v_lead.organization_id
  order by started_at desc nulls last, created_at desc limit 1;

  select * into v_assessment from public.discovery_assessments
  where lead_id=p_lead_id order by updated_at desc limit 1;

  select * into v_solution from public.solution_configurations
  where lead_id=p_lead_id order by updated_at desc limit 1;

  v_package_name := coalesce(nullif(v_solution.package_name,''),'KI-empfohlene Lösung');
  v_scope := coalesce(v_solution.scope_items,'[]'::jsonb);
  if jsonb_array_length(v_scope)=0 then
    v_scope := coalesce(v_meeting.extracted_goals,'[]'::jsonb);
  end if;
  v_rationale := coalesce(
    nullif(v_solution.rationale,''),
    'Automatisch aus Fireflies Meeting Intelligence und der freigegebenen Gesprächsakte erzeugt.'
  );

  insert into public.ai_commercial_runs(
    organization_id,lead_id,meeting_record_id,assessment_id,solution_id,status,
    package_name,scope_items,rationale,setup_fee,monthly_fee,term_months,metadata
  ) values (
    v_lead.organization_id,v_lead.id,v_meeting.id,v_assessment.id,v_solution.id,'awaiting_approval',
    v_package_name,v_scope,v_rationale,v_solution.setup_fee,v_solution.monthly_fee,v_solution.term_months,
    jsonb_build_object(
      'company_name',v_lead.company_name,
      'contact_name',v_lead.contact_name,
      'contact_email',v_lead.email,
      'qualification_score',coalesce(v_assessment.qualification_score,0),
      'source','fireflies_discovery'
    )
  )
  on conflict(lead_id) where status not in ('cancelled','failed') do update set
    meeting_record_id=excluded.meeting_record_id,
    assessment_id=excluded.assessment_id,
    solution_id=excluded.solution_id,
    package_name=excluded.package_name,
    scope_items=excluded.scope_items,
    rationale=excluded.rationale,
    setup_fee=coalesce(public.ai_commercial_runs.setup_fee,excluded.setup_fee),
    monthly_fee=coalesce(public.ai_commercial_runs.monthly_fee,excluded.monthly_fee),
    term_months=coalesce(public.ai_commercial_runs.term_months,excluded.term_months),
    status=case when public.ai_commercial_runs.package_id is not null then public.ai_commercial_runs.status else 'awaiting_approval' end,
    metadata=excluded.metadata,
    updated_at=now()
  returning * into v_run;

  return v_run;
end; $$;

grant execute on function public.prepare_ai_commercial_run(uuid) to authenticated;

create or replace function public.approve_ai_commercial_run(
  p_run_id uuid,
  p_setup_fee numeric,
  p_monthly_fee numeric,
  p_term_months integer,
  p_approval_note text default null
) returns public.ai_commercial_runs
language plpgsql security definer set search_path=public as $$
declare
  v_run public.ai_commercial_runs;
  v_lead public.leads;
  v_client public.clients;
  v_offer_id uuid;
  v_package_id uuid;
  v_offer_number text;
  v_total numeric;
  v_valid_until date := current_date + 30;
  v_scope text[];
  v_offer_html text;
begin
  if coalesce(p_setup_fee,0)<0 or coalesce(p_monthly_fee,0)<0 then
    raise exception 'Pricing cannot be negative';
  end if;
  if coalesce(p_term_months,0)<1 then raise exception 'Term must be at least one month'; end if;

  select * into v_run from public.ai_commercial_runs
  where id=p_run_id and public.is_org_member(organization_id);
  if v_run.id is null then raise exception 'Commercial run not found'; end if;
  if v_run.package_id is not null then return v_run; end if;

  select * into v_lead from public.leads where id=v_run.lead_id;
  if v_lead.id is null then raise exception 'Lead not found'; end if;

  select * into v_client from public.clients
  where organization_id=v_run.organization_id and lower(company_name)=lower(v_lead.company_name)
  order by created_at asc limit 1;

  if v_client.id is null then
    insert into public.clients(organization_id,company_name,status,metadata)
    values(v_run.organization_id,v_lead.company_name,'proposal',jsonb_build_object('source_lead_id',v_lead.id))
    returning * into v_client;
  else
    update public.clients set status=case when status='lead' then 'proposal' else status end,updated_at=now()
    where id=v_client.id returning * into v_client;
  end if;

  if coalesce(v_lead.email,'')<>'' and not exists(
    select 1 from public.contacts where client_id=v_client.id and lower(email)=lower(v_lead.email)
  ) then
    insert into public.contacts(client_id,first_name,last_name,email,role,is_primary)
    values(
      v_client.id,
      nullif(split_part(coalesce(v_lead.contact_name,''),' ',1),''),
      nullif(trim(substr(coalesce(v_lead.contact_name,''),length(split_part(coalesce(v_lead.contact_name,''),' ',1))+1)),''),
      v_lead.email,'Entscheider',true
    );
  end if;

  select public.next_offer_number(v_run.organization_id) into v_offer_number;
  v_total := coalesce(p_setup_fee,0)+(coalesce(p_monthly_fee,0)*p_term_months);
  select coalesce(array_agg(value),array[]::text[]) into v_scope
  from jsonb_array_elements_text(coalesce(v_run.scope_items,'[]'::jsonb));

  v_offer_html := '<article style="font-family:Arial,sans-serif;max-width:850px;margin:auto;padding:40px">'
    ||'<h1>NXTGENdigital · '||coalesce(v_run.package_name,'Individuelles Angebot')||'</h1>'
    ||'<p><strong>Kunde:</strong> '||coalesce(v_lead.company_name,'')||'</p>'
    ||'<p><strong>Setup:</strong> '||to_char(coalesce(p_setup_fee,0),'FM999G999G990D00')||' EUR netto</p>'
    ||'<p><strong>Monatlich:</strong> '||to_char(coalesce(p_monthly_fee,0),'FM999G999G990D00')||' EUR netto</p>'
    ||'<p><strong>Laufzeit:</strong> '||p_term_months||' Monate</p>'
    ||'<p><strong>Gesamtvolumen:</strong> '||to_char(v_total,'FM999G999G990D00')||' EUR netto</p>'
    ||'<p>Zahlungsbedingungen: Setup bei Beauftragung, laufende Vergütung monatlich im Voraus.</p>'
    ||'</article>';

  insert into public.commercial_offers(
    organization_id,client_id,offer_number,title,status,setup_fee,recurring_fee,
    billing_interval,minimum_term_months,valid_until,scope,contact_name,contact_email,
    total_contract_value,client_snapshot,provider_snapshot,custom_variables,generated_html
  ) values (
    v_run.organization_id,v_client.id,v_offer_number,v_run.package_name,'generated',
    coalesce(p_setup_fee,0),coalesce(p_monthly_fee,0),'monthly',p_term_months,v_valid_until,
    v_scope,v_lead.contact_name,v_lead.email,v_total,
    jsonb_build_object('id',v_client.id,'company_name',v_client.company_name,'contact_name',v_lead.contact_name,'contact_email',v_lead.email),
    jsonb_build_object('name','NXTGENdigital','email','kontakt@nxtgendigital.de','website','nxtgendigital.de'),
    jsonb_build_object('source','ai_commercial_run','run_id',v_run.id,'approval_note',p_approval_note),
    v_offer_html
  ) returning id into v_offer_id;

  insert into public.contract_packages(
    organization_id,client_id,offer_id,status,package_name,signer_name,signer_email,
    generation_status,offer_snapshot
  ) values (
    v_run.organization_id,v_client.id,v_offer_id,'draft',
    v_run.package_name||' · '||v_client.company_name,v_lead.contact_name,v_lead.email,
    'completed',jsonb_build_object(
      'offer_number',v_offer_number,'package_name',v_run.package_name,
      'client_name',v_client.company_name,'contact_name',v_lead.contact_name,'contact_email',v_lead.email,
      'setup_fee',coalesce(p_setup_fee,0),'recurring_fee',coalesce(p_monthly_fee,0),
      'minimum_term_months',p_term_months,'total_contract_value',v_total,'scope',coalesce(v_run.scope_items,'[]'::jsonb)
    )
  ) returning id into v_package_id;

  insert into public.contract_documents(organization_id,package_id,document_type,sort_order,rendered_html)
  values
    (v_run.organization_id,v_package_id,'offer',10,v_offer_html),
    (v_run.organization_id,v_package_id,'contract',20,null),
    (v_run.organization_id,v_package_id,'avv',30,null),
    (v_run.organization_id,v_package_id,'terms',40,null);

  update public.ai_commercial_runs set
    client_id=v_client.id,offer_id=v_offer_id,package_id=v_package_id,status='package_ready',
    setup_fee=p_setup_fee,monthly_fee=p_monthly_fee,term_months=p_term_months,
    approval_note=p_approval_note,approved_by=auth.uid(),approved_at=now(),updated_at=now()
  where id=v_run.id returning * into v_run;

  update public.leads set stage='offer_open',updated_at=now() where id=v_lead.id;
  return v_run;
exception when others then
  update public.ai_commercial_runs set status='failed',error_message=sqlerrm,updated_at=now()
  where id=p_run_id;
  raise;
end; $$;

grant execute on function public.approve_ai_commercial_run(uuid,numeric,numeric,integer,text) to authenticated;
