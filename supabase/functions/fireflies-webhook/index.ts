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

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => String(v)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function fallbackIntelligence(transcript: any) {
  const summary = transcript.summary ?? {};
  const topics = asStringArray(summary.topics_discussed);
  const actions = asStringArray(summary.action_items);
  const keywords = asStringArray(summary.keywords);
  const combined = `${summary.overview ?? ''} ${summary.short_summary ?? ''} ${topics.join(' ')} ${keywords.join(' ')}`.toLowerCase();

  const moduleRules = [
    { product_code:'recruiting-os', title:'RecruitingOS', terms:['recruiting','kandidat','bewerber','vakanz','placement'], expected_outcome:'Recruiting-Prozesse, Kandidaten und Kunden zentral steuern.', setup_fee:5000, monthly_fee:1490 },
    { product_code:'sales-cockpit', title:'Sales Cockpit', terms:['vertrieb','lead','pipeline','follow-up','angebot','closing','crm'], expected_outcome:'Leads, Follow-ups und Umsatzchancen transparent steuern.', setup_fee:4000, monthly_fee:990 },
    { product_code:'fulfillment-os', title:'Fulfillment OS', terms:['delivery','onboarding','projekt','kundenbetreuung','übergabe','account management'], expected_outcome:'Onboarding und Delivery als geführten Prozess standardisieren.', setup_fee:5000, monthly_fee:1490 },
    { product_code:'automation-layer', title:'Automation Layer', terms:['manuell','workflow','automatisierung','schnittstelle','api','datenübertragung'], expected_outcome:'Manuelle Arbeit und Medienbrüche durch Workflows reduzieren.', setup_fee:4500, monthly_fee:790 },
    { product_code:'voice-ai', title:'Voice AI', terms:['telefon','anruf','qualifizierung','erreichbarkeit','rezeption'], expected_outcome:'Anrufe und Vorqualifizierung automatisieren.', setup_fee:4500, monthly_fee:1290 },
    { product_code:'knowledge-ai', title:'Knowledge & Client AI', terms:['wissen','support','fragen','dokumente','assistent','knowledge'], expected_outcome:'Kunden- und Teamwissen kontextbezogen verfügbar machen.', setup_fee:3000, monthly_fee:690 },
  ];

  const recommended = moduleRules.map(rule => {
    const hits = rule.terms.filter(t => combined.includes(t));
    return {
      ...rule,
      type: 'add_on',
      pain_match: hits,
      rationale: hits.length ? `Im Gespräch erkannt: ${hits.join(', ')}.` : '',
      score: Math.min(92, 55 + hits.length * 12),
      phase: hits.length >= 2 ? 'quick_win' : 'phase_2',
      term_months: 12,
    };
  }).filter(x => x.pain_match.length).sort((a,b) => b.score-a.score).slice(0,4);
  if (recommended[0]) recommended[0].type = 'primary';

  return {
    pain_points: topics,
    goals: [],
    objections: [],
    constraints: [],
    next_steps: actions,
    auto_briefing: [summary.short_summary, summary.overview, actions.length ? `Nächste Schritte: ${actions.join('; ')}` : ''].filter(Boolean).join('\n\n'),
    qualification: { score: 65, confidence: 60, decision_maker: null, budget_signal: null, urgency: null },
    recommended_modules: recommended,
  };
}

async function analyzeWithOpenAI(rawText: string, transcript: any) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return { ...fallbackIntelligence(transcript), model: 'fireflies-fallback' };

  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
  const prompt = `Du analysierst ein B2B-Erstgespräch für NXTGEN. Extrahiere ausschließlich Informationen, die im Gespräch belegt sind. Antworte als valides JSON mit exakt diesen Feldern:
{
  "pain_points": ["..."],
  "goals": ["..."],
  "objections": ["..."],
  "constraints": ["..."],
  "next_steps": ["..."],
  "auto_briefing": "Kompaktes Briefing für Account Manager mit Kundensnapshot, wichtigstem Kontext, Persona-Hinweisen und offenen Fragen.",
  "qualification": {"score": 0, "confidence": 0, "decision_maker": "", "budget_signal": "", "urgency": ""},
  "recommended_modules": [
    {"product_code":"sales-cockpit|recruiting-os|recruiting-ads|fulfillment-os|automation-layer|voice-ai|knowledge-ai","title":"...","type":"primary|add_on|later","rationale":"...","pain_match":["..."],"expected_outcome":"...","phase":"quick_win|phase_2|phase_3|later","score":0,"setup_fee":0,"monthly_fee":0,"term_months":12}
  ]
}

Regeln:
- Keine erfundenen Kundenzahlen oder Aussagen.
- Maximal vier Module empfehlen.
- Das stärkste Einstiegsmodul ist primary.
- Preise nur aus dieser Liste verwenden:
  sales-cockpit 4000/990, recruiting-os 5000/1490, recruiting-ads 3500/990, fulfillment-os 5000/1490, automation-layer 4500/790, voice-ai 4500/1290, knowledge-ai 3000/690.
- Menschliche Freigabe bleibt erforderlich.

TRANSKRIPT:\n${rawText.slice(0, 60000)}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Du bist ein präziser B2B-Conversation-Analyst. Erfinde nichts.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  const json = await response.json();
  if (!response.ok) throw new Error(json?.error?.message ?? 'OpenAI analysis failed');
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no analysis');
  return { ...JSON.parse(content), model };
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

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch { return new Response('Invalid JSON', { status: 400, headers: corsHeaders }); }

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
      analysis_status: 'failed',
      analysis_error: 'FIREFLIES_API_KEY missing',
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
      analysis_status: 'failed',
      analysis_error: 'Transcript fetch failed',
      provider_payload: { webhook: payload, fireflies: ffJson },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,provider,external_meeting_id' });
    return new Response('Transcript fetch failed', { status: 502, headers: corsHeaders });
  }

  const rawText = (transcript.sentences ?? [])
    .map((s: any) => `${s.speaker_name ?? 'Unbekannt'}: ${s.text ?? ''}`)
    .join('\n');

  const baseRecord = {
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
    analysis_status: 'processing',
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
    .upsert(baseRecord, { onConflict: 'organization_id,provider,external_meeting_id' })
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

  let analysis: any;
  let analysisError: string | null = null;
  try {
    analysis = await analyzeWithOpenAI(rawText, transcript);
  } catch (err) {
    analysisError = err instanceof Error ? err.message : String(err);
    analysis = { ...fallbackIntelligence(transcript), model: 'fireflies-fallback' };
  }

  const qualification = analysis.qualification ?? {};
  const { error: updateError } = await supabase
    .from('meeting_intelligence_records')
    .update({
      extracted_pain_points: asStringArray(analysis.pain_points),
      extracted_goals: asStringArray(analysis.goals),
      extracted_objections: asStringArray(analysis.objections),
      extracted_next_steps: asStringArray(analysis.next_steps),
      detected_constraints: asStringArray(analysis.constraints),
      auto_briefing: analysis.auto_briefing ?? null,
      qualification_signals: {
        score: Number(qualification.score ?? 65),
        confidence: Number(qualification.confidence ?? 60),
        decision_maker: qualification.decision_maker ?? null,
        budget_signal: qualification.budget_signal ?? null,
        urgency: qualification.urgency ?? null,
      },
      recommended_modules: Array.isArray(analysis.recommended_modules) ? analysis.recommended_modules : [],
      analysis_status: 'ready',
      analysis_model: analysis.model ?? 'fireflies-fallback',
      analysis_error: analysisError,
      analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', saved.id);

  if (updateError) return new Response(updateError.message, { status: 500, headers: corsHeaders });

  const { data: materialized, error: materializeError } = await supabase.rpc(
    'materialize_fireflies_intelligence',
    { p_record_id: saved.id },
  );

  if (materializeError) {
    await supabase.from('meeting_intelligence_records').update({
      analysis_error: [analysisError, materializeError.message].filter(Boolean).join(' | '),
      updated_at: new Date().toISOString(),
    }).eq('id', saved.id);
  }

  return new Response(JSON.stringify({
    ok: true,
    meeting_id: meetingId,
    analysis_model: analysis.model,
    used_fallback: Boolean(analysisError),
    materialized: materialized ?? null,
    materialize_error: materializeError?.message ?? null,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
