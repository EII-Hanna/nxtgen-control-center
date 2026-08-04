import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const n8nWebhookUrl = Deno.env.get('N8N_DELIVERY_WEBHOOK_URL') ?? '';
  const slackWebhookUrl = Deno.env.get('SLACK_DELIVERY_WEBHOOK_URL') ?? '';
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const body = await req.json().catch(() => ({}));
  const jobId = body?.job_id as string | undefined;
  if (!jobId) return new Response('job_id is required', { status: 400, headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

  const { data: userData } = await supabase.auth.getUser(jwt);
  if (!userData?.user) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

  const { data: job, error: jobError } = await supabase
    .from('delivery_automation_jobs')
    .select('*')
    .eq('id', jobId)
    .single();
  if (jobError || !job) return new Response('Job not found', { status: 404, headers: corsHeaders });

  const { data: membership } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', job.organization_id)
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return new Response('Forbidden', { status: 403, headers: corsHeaders });

  if (!n8nWebhookUrl) {
    await supabase.rpc('complete_delivery_automation', {
      p_callback_token: job.callback_token,
      p_status: 'failed',
      p_result: {},
      p_error: 'N8N_DELIVERY_WEBHOOK_URL is not configured',
      p_external_execution_id: null,
    });
    return new Response('n8n webhook not configured', { status: 500, headers: corsHeaders });
  }

  await supabase.from('delivery_automation_jobs').update({
    status: 'dispatching',
    attempts: Number(job.attempts ?? 0) + 1,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', job.id);

  const callbackUrl = `${supabaseUrl}/functions/v1/delivery-automation-callback`;
  const dispatchPayload = {
    ...job.payload,
    job_id: job.id,
    callback_url: callbackUrl,
    callback_token: job.callback_token,
  };

  try {
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dispatchPayload),
    });
    const text = await response.text();
    let result: Record<string, unknown> = {};
    try { result = text ? JSON.parse(text) : {}; } catch { result = { response_text: text }; }

    if (!response.ok) throw new Error(`n8n HTTP ${response.status}: ${text.slice(0, 300)}`);

    const externalExecutionId = String(result.execution_id ?? result.executionId ?? result.id ?? '');
    await supabase.rpc('complete_delivery_automation', {
      p_callback_token: job.callback_token,
      p_status: 'running',
      p_result: result,
      p_error: null,
      p_external_execution_id: externalExecutionId || null,
    });

    return new Response(JSON.stringify({ ok: true, job_id: job.id, status: 'running' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.rpc('complete_delivery_automation', {
      p_callback_token: job.callback_token,
      p_status: 'failed',
      p_result: {},
      p_error: message,
      p_external_execution_id: null,
    });

    if (slackWebhookUrl) {
      await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🚨 NXTGEN Delivery-Automation fehlgeschlagen\nJob: ${job.id}\nAutomation: ${job.automation_key}\nFehler: ${message}` }),
      }).catch(() => undefined);
    }

    return new Response(message, { status: 502, headers: corsHeaders });
  }
});
