-- NXTGEN Sprint 1: Lead-Detailakte, Terminlogik und Closing-Handoff

alter table public.leads drop constraint if exists leads_stage_check;
alter table public.leads add constraint leads_stage_check check (stage in (
  'new','contacted','responded','replied','qualified','meeting_offered','meeting_booked',
  'meeting_prepared','meeting_completed','need_confirmed','solution_configured',
  'offer_open','negotiation','contract_sent','won','lost'
));

alter table public.leads
  add column if not exists meeting_at timestamptz,
  add column if not exists meeting_url text,
  add column if not exists meeting_provider text,
  add column if not exists meeting_status text not null default 'none',
  add column if not exists last_contact_at timestamptz,
  add column if not exists closing_started_at timestamptz;

alter table public.leads drop constraint if exists leads_meeting_status_check;
alter table public.leads add constraint leads_meeting_status_check
  check (meeting_status in ('none','offered','booked','completed','cancelled','no_show'));

alter table public.sales_conversations
  add column if not exists external_event_id text,
  add column if not exists meeting_url text,
  add column if not exists provider text,
  add column if not exists attendee_email text;

create or replace function public.advance_lead_stage(
  p_lead_id uuid,
  p_stage text
) returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
  v_old_stage text;
begin
  select * into v_lead
  from public.leads
  where id = p_lead_id
    and public.is_org_member(organization_id)
  for update;

  if v_lead.id is null then
    raise exception 'Lead nicht gefunden oder kein Zugriff';
  end if;

  v_old_stage := v_lead.stage;

  update public.leads
  set stage = p_stage,
      meeting_status = case
        when p_stage = 'meeting_offered' then 'offered'
        when p_stage = 'meeting_booked' then 'booked'
        when p_stage = 'meeting_completed' then 'completed'
        else meeting_status
      end,
      closing_started_at = case
        when p_stage = 'meeting_booked' and closing_started_at is null then now()
        else closing_started_at
      end,
      updated_at = now()
  where id = p_lead_id
  returning * into v_lead;

  insert into public.sales_activities(
    organization_id, lead_id, activity_type, subject, body, metadata, created_by
  ) values (
    v_lead.organization_id,
    v_lead.id,
    'stage_change',
    'Pipeline-Status geändert',
    coalesce(v_old_stage,'') || ' → ' || p_stage,
    jsonb_build_object('from',v_old_stage,'to',p_stage),
    auth.uid()
  );

  return v_lead;
end;
$$;

grant execute on function public.advance_lead_stage(uuid,text) to authenticated;

create index if not exists idx_leads_meeting_at
  on public.leads(organization_id, meeting_at)
  where meeting_at is not null;
