import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-nxtgen-callback-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const expectedSecret = Deno.env.get('NXTGEN_AUTOMATION_CALLBACK_SECRET') ?? '';
  const suppliedSecret = req.headers.get('x-nxtgen-callback-secret') ?? '';
  if (expectedSecret && suppliedSecret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => ({}));
  const callbackToken = body?.callback_token as string | undefined;
  const status = body?.status as string | undefined;
  if (!callbackToken || !['running', 'succeeded', 'failed'].includes(status ?? '')) {
    return new Response('callback_token and valid status are required', { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase.rpc('complete_delivery_automation', {
    p_callback_token: callbackToken,
    p_status: status,
    p_result: body?.result ?? {},
    p_error: body?.error ?? null,
    p_external_execution_id: body?.external_execution_id ?? body?.execution_id ?? null,
  });

  if (error) return new Response(error.message, { status: 500, headers: corsHeaders });
  return new Response(JSON.stringify({ ok: true, job: data }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
