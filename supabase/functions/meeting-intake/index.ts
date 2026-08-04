import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok:false, error:'Method not allowed' }), { status:405, headers });

  const token = new URL(req.url).searchParams.get('token');
  if (!token) return new Response(JSON.stringify({ ok:false, error:'Missing token' }), { status:401, headers });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: connection, error: connectionError } = await supabase.from('automation_connections')
    .select('*').eq('endpoint_token', token).eq('connection_key', 'meeting-intake').eq('status', 'active').maybeSingle();
  if (connectionError || !connection) return new Response(JSON.stringify({ ok:false, error:'Invalid or inactive connection' }), { status:401, headers });

  let payload: any;
  try { payload = await req.json(); }
  catch { return new Response(JSON.stringify({ ok:false, error:'Invalid JSON' }), { status:400, headers }); }

  const provider = String(payload.provider || 'zoom').toLowerCase();
  const externalId = String(payload.external_meeting_id || payload.meeting_id || payload.object?.uuid || payload.object?.id || '');
  if (!externalId) return new Response(JSON.stringify({ ok:false, error:'external_meeting_id is required' }), { status:400, headers });

  const emails = Array.isArray(payload.participant_emails) ? payload.participant_emails.filter(Boolean) : [];
  let leadId = payload.lead_id || null;
  if (!leadId && emails.length) {
    const { data: lead } = await supabase.from('leads').select('id').eq('organization_id', connection.organization_id).in('email', emails).limit(1).maybeSingle();
    leadId = lead?.id || null;
  }

  const record = {
    organization_id: connection.organization_id,
    lead_id: leadId,
    provider,
    external_meeting_id: externalId,
    title: payload.title || payload.topic || 'Zoom Gespräch',
    participant_emails: emails,
    recording_url: payload.recording_url || payload.download_url || null,
    transcript_url: payload.transcript_url || null,
    transcript_text: payload.transcript_text || null,
    transcript_status: payload.transcript_text ? 'ready' : 'queued',
    analysis_status: 'queued',
    started_at: payload.started_at || null,
    completed_at: payload.completed_at || new Date().toISOString(),
    provider_payload: payload,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await supabase.from('meeting_records')
    .upsert(record, { onConflict:'organization_id,provider,external_meeting_id' }).select('*').single();
  if (error) return new Response(JSON.stringify({ ok:false, error:error.message }), { status:500, headers });

  await supabase.from('automation_run_log').insert({
    organization_id: connection.organization_id,
    connection_id: connection.id,
    workflow_key: 'meeting-intake',
    status: 'processed',
    external_reference: externalId,
    lead_id: leadId,
    input_payload: payload,
    result_payload: { meeting_record_id:saved.id, analysis_status:'queued' },
    completed_at: new Date().toISOString(),
  });

  await supabase.from('automation_connections').update({ last_run_at:new Date().toISOString(), last_error:null, updated_at:new Date().toISOString() }).eq('id', connection.id);

  return new Response(JSON.stringify({ ok:true, meeting_record_id:saved.id, lead_id:leadId, next:'transcription-and-ai-analysis' }), { status:200, headers });
});