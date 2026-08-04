-- NXTGEN Meeting Intelligence: Fireflies Notetaker, transcripts and sales handoff

insert into public.integration_catalog
  (code, name, category, auth_type, description, capabilities, status)
values
  ('fireflies', 'Fireflies.ai', 'meeting_intelligence', 'api_key',
   'Notetaker für Erstgespräche mit Transkript, Zusammenfassung und Action Items.',
   '["meeting.transcribed","meeting.summarized","transcript.read","summary.read","action_items.read"]'::jsonb,
   'active')
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  auth_type = excluded.auth_type,
  description = excluded.description,
  capabilities = excluded.capabilities,
  status = excluded.status;

create table if not exists public.meeting_intelligence_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.sales_conversations(id) on delete set null,
  provider text not null default 'fireflies',
  external_meeting_id text not null,
  external_calendar_id text,
  title text,
  organizer_email text,
  participant_emails jsonb not null default '[]'::jsonb,
  speakers jsonb not null default '[]'::jsonb,
  meeting_url text,
  transcript_url text,
  audio_url text,
  video_url text,
  duration_seconds integer,
  started_at timestamptz,
  transcript_status text not null default 'pending' check (transcript_status in ('pending','processing','ready','failed')),
  summary_status text not null default 'pending' check (summary_status in ('pending','processing','ready','failed')),
  raw_transcript jsonb not null default '[]'::jsonb,
  raw_text text,
  summary_overview text,
  short_summary text,
  action_items jsonb not null default '[]'::jsonb,
  topics_discussed jsonb not null default '[]'::jsonb,
  keywords jsonb not null default '[]'::jsonb,
  extracted_pain_points jsonb not null default '[]'::jsonb,
  extracted_goals jsonb not null default '[]'::jsonb,
  extracted_objections jsonb not null default '[]'::jsonb,
  extracted_next_steps jsonb not null default '[]'::jsonb,
  sentiment jsonb not null default '{}'::jsonb,
  provider_payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_meeting_id)
);

alter table public.sales_conversations
  add column if not exists notetaker_provider text,
  add column if not exists external_transcript_id text,
  add column if not exists transcript_status text,
  add column if not exists transcript_url text,
  add column if not exists transcript_imported_at timestamptz;

alter table public.meeting_intelligence_records enable row level security;

create policy meeting_intelligence_org_access on public.meeting_intelligence_records for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_meeting_intelligence_org_created
  on public.meeting_intelligence_records(organization_id, created_at desc);
create index if not exists idx_meeting_intelligence_lead
  on public.meeting_intelligence_records(lead_id, started_at desc);
create index if not exists idx_meeting_intelligence_external
  on public.meeting_intelligence_records(provider, external_meeting_id);

create or replace function public.attach_meeting_intelligence_to_lead(
  p_record_id uuid,
  p_lead_id uuid
) returns public.meeting_intelligence_records
language plpgsql security definer set search_path=public
as $$
declare
  v_record public.meeting_intelligence_records;
  v_lead public.leads;
begin
  select * into v_record from public.meeting_intelligence_records
  where id=p_record_id and public.is_org_member(organization_id);
  if v_record.id is null then raise exception 'Meeting record not found'; end if;

  select * into v_lead from public.leads
  where id=p_lead_id and organization_id=v_record.organization_id;
  if v_lead.id is null then raise exception 'Lead not found'; end if;

  update public.meeting_intelligence_records
  set lead_id=p_lead_id, updated_at=now()
  where id=p_record_id
  returning * into v_record;

  insert into public.sales_activities(
    organization_id, lead_id, activity_type, subject, body, metadata
  ) values (
    v_record.organization_id,
    p_lead_id,
    'meeting',
    'Fireflies-Transkript importiert',
    coalesce(v_record.short_summary, v_record.summary_overview, 'Gesprächstranskript wurde importiert.'),
    jsonb_build_object(
      'provider','fireflies',
      'meeting_record_id',v_record.id,
      'external_meeting_id',v_record.external_meeting_id,
      'transcript_url',v_record.transcript_url,
      'action_items',v_record.action_items
    )
  );

  update public.leads set
    need_summary=coalesce(nullif(v_record.summary_overview,''), need_summary),
    next_step=coalesce(
      nullif(v_record.action_items->>0,''),
      next_step
    ),
    last_contact_at=coalesce(v_record.started_at, now()),
    updated_at=now()
  where id=p_lead_id;

  return v_record;
end;
$$;
