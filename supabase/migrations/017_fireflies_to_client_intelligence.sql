-- NXTGEN: Fireflies transcript -> structured intelligence -> client workspace

alter table public.meeting_intelligence_records
  add column if not exists analysis_status text not null default 'pending'
    check (analysis_status in ('pending','processing','ready','failed')),
  add column if not exists analysis_model text,
  add column if not exists analysis_error text,
  add column if not exists auto_briefing text,
  add column if not exists detected_constraints jsonb not null default '[]'::jsonb,
  add column if not exists qualification_signals jsonb not null default '{}'::jsonb,
  add column if not exists recommended_modules jsonb not null default '[]'::jsonb,
  add column if not exists analyzed_at timestamptz;

create index if not exists idx_meeting_intelligence_analysis
  on public.meeting_intelligence_records(organization_id, analysis_status, analyzed_at desc);

create or replace function public.materialize_fireflies_intelligence(p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_record public.meeting_intelligence_records;
  v_lead public.leads;
  v_workspace public.client_workspaces;
  v_snapshot public.client_intelligence_snapshots;
  v_client_id uuid;
  v_briefing text;
  v_pains jsonb;
  v_goals jsonb;
  v_constraints jsonb;
  v_modules jsonb;
  v_item jsonb;
  v_title text;
  v_code text;
  v_score int;
  v_setup numeric;
  v_monthly numeric;
  v_phase text;
begin
  select * into v_record
  from public.meeting_intelligence_records
  where id = p_record_id;

  if v_record.id is null then
    raise exception 'Meeting intelligence record not found';
  end if;

  if v_record.lead_id is not null then
    select * into v_lead from public.leads where id=v_record.lead_id;
    v_client_id := v_lead.converted_client_id;
  end if;

  if v_client_id is null and jsonb_array_length(coalesce(v_record.participant_emails,'[]'::jsonb)) > 0 then
    select c.client_id into v_client_id
    from public.contacts c
    join public.clients cl on cl.id=c.client_id
    where cl.organization_id=v_record.organization_id
      and lower(c.email) in (
        select lower(value) from jsonb_array_elements_text(v_record.participant_emails)
      )
    order by c.is_primary desc nulls last
    limit 1;
  end if;

  if v_client_id is null then
    return jsonb_build_object(
      'materialized', false,
      'reason', 'No converted client found yet',
      'record_id', v_record.id,
      'lead_id', v_record.lead_id
    );
  end if;

  insert into public.client_workspaces(
    organization_id, client_id, status, current_phase, strategic_goal
  ) values (
    v_record.organization_id, v_client_id, 'onboarding', 'sales',
    coalesce(nullif(v_record.summary_overview,''),'Vom Gespräch zur messbaren Umsetzung')
  )
  on conflict(organization_id,client_id) do update set
    updated_at=now()
  returning * into v_workspace;

  perform public.initialize_client_repo(v_workspace.id);

  v_briefing := coalesce(
    nullif(v_record.auto_briefing,''),
    concat_ws(E'\n\n',
      v_record.short_summary,
      v_record.summary_overview,
      case when jsonb_array_length(coalesce(v_record.action_items,'[]'::jsonb)) > 0
        then 'Nächste Schritte: ' || array_to_string(array(select jsonb_array_elements_text(v_record.action_items)), '; ')
      end
    )
  );

  v_pains := case
    when jsonb_array_length(coalesce(v_record.extracted_pain_points,'[]'::jsonb)) > 0 then v_record.extracted_pain_points
    else coalesce(v_record.topics_discussed,'[]'::jsonb)
  end;
  v_goals := coalesce(v_record.extracted_goals,'[]'::jsonb);
  v_constraints := coalesce(v_record.detected_constraints,'[]'::jsonb);
  v_modules := coalesce(v_record.recommended_modules,'[]'::jsonb);

  insert into public.client_context_assets(
    organization_id, workspace_id, asset_type, title, content,
    source_provider, source_reference, metadata
  ) values (
    v_record.organization_id, v_workspace.id, 'sales_transcript',
    coalesce(v_record.title,'Fireflies Erstgespräch'),
    coalesce(v_record.raw_text,v_record.summary_overview,v_record.short_summary),
    'fireflies', v_record.external_meeting_id,
    jsonb_build_object(
      'meeting_record_id',v_record.id,
      'transcript_url',v_record.transcript_url,
      'participants',v_record.participant_emails,
      'started_at',v_record.started_at
    )
  )
  on conflict do nothing;

  if v_briefing is not null and length(v_briefing) > 0 then
    insert into public.client_context_assets(
      organization_id, workspace_id, asset_type, title, content,
      source_provider, source_reference, metadata
    ) values (
      v_record.organization_id, v_workspace.id, 'auto_briefing',
      'Auto-Briefing aus Erstgespräch', v_briefing,
      coalesce(v_record.analysis_model,'fireflies'), v_record.external_meeting_id,
      jsonb_build_object(
        'pain_points',v_pains,
        'goals',v_goals,
        'constraints',v_constraints,
        'objections',v_record.extracted_objections,
        'next_steps',v_record.extracted_next_steps,
        'qualification_signals',v_record.qualification_signals
      )
    )
    on conflict do nothing;
  end if;

  update public.client_intelligence_snapshots
  set status='superseded'
  where workspace_id=v_workspace.id and status in ('generated','reviewed');

  insert into public.client_intelligence_snapshots(
    organization_id,workspace_id,source_summary,detected_pains,
    detected_goals,detected_constraints,qualification_score,
    confidence,model_provider,model_name,status
  ) values (
    v_record.organization_id,v_workspace.id,
    'Automatisch aus Fireflies-Erstgespräch und NXTGEN-Kundenkontext erzeugt.',
    v_pains,v_goals,v_constraints,
    greatest(0,least(100,coalesce((v_record.qualification_signals->>'score')::int,65))),
    greatest(0,least(100,coalesce((v_record.qualification_signals->>'confidence')::int,75))),
    case when v_record.analysis_model is null then 'fireflies' else 'openai' end,
    coalesce(v_record.analysis_model,'fireflies-summary'),
    'generated'
  ) returning * into v_snapshot;

  for v_item in select value from jsonb_array_elements(v_modules)
  loop
    v_code := coalesce(v_item->>'product_code',v_item->>'code');
    v_title := coalesce(v_item->>'title',v_code);
    v_score := greatest(0,least(100,coalesce((v_item->>'score')::int,70)));
    v_setup := coalesce((v_item->>'setup_fee')::numeric,0);
    v_monthly := coalesce((v_item->>'monthly_fee')::numeric,0);
    v_phase := case
      when v_item->>'phase' in ('quick_win','phase_2','phase_3','later') then v_item->>'phase'
      else 'quick_win'
    end;

    if v_code is not null then
      insert into public.client_module_recommendations(
        organization_id,workspace_id,snapshot_id,product_code,
        recommendation_type,title,rationale,pain_match,expected_outcome,
        suggested_phase,score,suggested_setup_fee,suggested_monthly_fee,
        suggested_term_months,status
      ) values (
        v_record.organization_id,v_workspace.id,v_snapshot.id,v_code,
        case when coalesce(v_item->>'type','primary') in ('primary','add_on','later','exclude')
          then coalesce(v_item->>'type','primary') else 'primary' end,
        v_title,v_item->>'rationale',coalesce(v_item->'pain_match','[]'::jsonb),
        v_item->>'expected_outcome',v_phase,v_score,v_setup,v_monthly,
        coalesce((v_item->>'term_months')::int,12),'recommended'
      ) on conflict do nothing;
    end if;
  end loop;

  update public.client_repo_sections
  set status='ready',updated_at=now()
  where workspace_id=v_workspace.id and section_key in ('sales','briefing');

  update public.client_workspaces
  set current_phase='briefing',
      strategic_goal=coalesce(nullif((v_goals->>0),''),strategic_goal),
      next_milestone=coalesce(nullif((v_record.extracted_next_steps->>0),''),next_milestone),
      updated_at=now()
  where id=v_workspace.id;

  return jsonb_build_object(
    'materialized',true,
    'workspace_id',v_workspace.id,
    'snapshot_id',v_snapshot.id,
    'recommendations',jsonb_array_length(v_modules)
  );
end;
$$;

revoke all on function public.materialize_fireflies_intelligence(uuid) from public;
revoke all on function public.materialize_fireflies_intelligence(uuid) from anon;
revoke all on function public.materialize_fireflies_intelligence(uuid) from authenticated;
grant execute on function public.materialize_fireflies_intelligence(uuid) to service_role;
