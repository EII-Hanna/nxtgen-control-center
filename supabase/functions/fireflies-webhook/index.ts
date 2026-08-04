import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature',
};

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const rawBody = await req.text();
  const signingSecret = Deno.env.get('FIREFLIES_WEBHOOK_SECRET') ?? '';
  const suppliedSignature = req.headers.get('x-hub-signature') ?? '';

  if (signingSecret) {
    const expected = `sha256=${await hmacHex(signingSecret, rawBody)}`;
    if (expected !== suppliedSignature) {
      return new Response('Invalid signature', { status: 401, headers: corsHeaders });
    }
  }

  const payload = JSON.parse(rawBody);
  const meetingId = payload.meeting_id ?? payload.meetingId;
  const eventName = payload.event ?? payload.eventType;
  const organizationId = new URL(req.url).searchParams.get('organization_id');

  if (!meetingId || !organizationId) {
    return new Response('meeting_id and organization_id are required', { status: 400, headers: corsHeaders });
  }

  const apiKey = Deno.env.get('FIREFLIES_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  if (!apiKey) {
    await supabase.from('meeting_intelligence_records').upsert({
      organization_id: organizationId,
      provider: 'fireflies',
      external_meeting_id: meetingId,
      transcript_status: 'failed',
      summary_status: 'failed',
      provider_payload: { webhook: payload, error: 'FIREFLIES_API_KEY missing' },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,provider,external_meeting_id' });
    return new Response('Fireflies API key missing', { status: 500, headers: corsHeaders });
  }

  const query = `query Transcript($id: String!) {
    transcript(id: $id) {
      id title organizer_email participants date duration transcript_url audio_url video_url meeting_link cal_id
      speakers { id name }
      sentences { speaker_name text start_time end_time }
      summary { overview short_summary action_items topics_discussed keywords }
      analytics { sentiments categories speakers { name duration word_count } }
    }
  }`;

  const ffResponse = await fetch('https://api.fireflies.ai/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ query, variables: { id: meetingId } }),
  });
  const ffJson = await ffResponse.json();
  const transcript = ffJson?.data?.transcript;

  if (!ffResponse.ok || !transcript) {
    await supabase.from('meeting_intelligence_records').upsert({
      organization_id: organizationId,
      provider: 'fireflies',
      external_meeting_id: meetingId,
      transcript_status: 'failed',
      summary_status: 'failed',
      provider_payload: { webhook: payload, fireflies: ffJson },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,provider,external_meeting_id' });
    return new Response('Transcript fetch failed', { status: 502, headers: corsHeaders });
  }

  const rawText = (transcript.sentences ?? [])
    .map((s: any) => `${s.speaker_name ?? 'Unbekannt'}: ${s.text ?? ''}`)
    .join('\n');

  const record = {
    organization_id: organizationId,
    provider: 'fireflies',
    external_meeting_id: transcript.id,
    external_calendar_id: transcript.cal_id,
    title: transcript.title,
    organizer_email: transcript.organizer_email,
    participant_emails: transcript.participants ?? [],
    speakers: transcript.speakers ?? [],
    meeting_url: transcript.meeting_link,
    transcript_url: transcript.transcript_url,
    audio_url: transcript.audio_url,
    video_url: transcript.video_url,
    duration_seconds: transcript.duration ? Math.round(Number(transcript.duration)) : null,
    started_at: transcript.date ? new Date(Number(transcript.date)).toISOString() : null,
    transcript_status: 'ready',
    summary_status: transcript.summary ? 'ready' : 'processing',
    raw_transcript: transcript.sentences ?? [],
    raw_text: rawText,
    summary_overview: transcript.summary?.overview ?? null,
    short_summary: transcript.summary?.short_summary ?? null,
    action_items: transcript.summary?.action_items ?? [],
    topics_discussed: transcript.summary?.topics_discussed ?? [],
    keywords: transcript.summary?.keywords ?? [],
    sentiment: transcript.analytics?.sentiments ?? {},
    provider_payload: { webhook: payload, event: eventName, fireflies: transcript },
    processed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await supabase
    .from('meeting_intelligence_records')
    .upsert(record, { onConflict: 'organization_id,provider,external_meeting_id' })
    .select('*')
    .single();

  if (error) return new Response(error.message, { status: 500, headers: corsHeaders });

  const participantEmails = (transcript.participants ?? []).filter(Boolean);
  if (participantEmails.length) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id,email')
      .eq('organization_id', organizationId)
      .in('email', participantEmails)
      .limit(1);
    if (leads?.[0]?.id) {
      await supabase.rpc('attach_meeting_intelligence_to_lead', {
        p_record_id: saved.id,
        p_lead_id: leads[0].id,
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, meeting_id: meetingId }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
