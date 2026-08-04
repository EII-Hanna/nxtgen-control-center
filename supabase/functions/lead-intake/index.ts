import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-nxtgen-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const token = req.headers.get('x-nxtgen-token') || new URL(req.url).searchParams.get('token');
  if (!token) return json({ ok: false, error: 'Webhook token missing' }, 401);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON payload' }, 400); }

  const companyName = clean(payload.company_name || payload.company || payload.unternehmen);
  const contactName = clean(payload.contact_name || payload.name || payload.ansprechpartner);
  const email = clean(payload.email).toLowerCase();
  const phone = clean(payload.phone || payload.telefon);
  const need = clean(payload.need_summary || payload.message || payload.nachricht || payload.bedarf);
  const source = clean(payload.source) || 'website';
  const externalReference = clean(payload.external_reference || payload.submission_id || payload.id);

  if (!companyName && !email) {
    return json({ ok: false, error: 'company_name or email is required' }, 422);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, error: 'Server configuration missing' }, 500);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: connection, error: connectionError } = await db
    .from('automation_connections')
    .select('*')
    .eq('endpoint_token', token)
    .eq('connection_key', 'lead-intake')
    .eq('status', 'active')
    .maybeSingle();

  if (connectionError || !connection) return json({ ok: false, error: 'Invalid or inactive webhook token' }, 401);

  const runBase = {
    organization_id: connection.organization_id,
    connection_id: connection.id,
    workflow_key: 'lead-intake',
    external_reference: externalReference || null,
    input_payload: payload,
  };

  try {
    let duplicateQuery = db.from('leads').select('*').eq('organization_id', connection.organization_id).limit(1);
    duplicateQuery = email
      ? duplicateQuery.ilike('email', email)
      : duplicateQuery.ilike('company_name', companyName);
    const { data: duplicates, error: duplicateError } = await duplicateQuery;
    if (duplicateError) throw duplicateError;

    if (duplicates?.[0]) {
      const lead = duplicates[0];
      await db.from('automation_run_log').insert({
        ...runBase,
        status: 'duplicate',
        lead_id: lead.id,
        result_payload: { duplicate: true, lead_id: lead.id },
        completed_at: new Date().toISOString(),
      });
      await db.from('automation_connections').update({
        last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
      }).eq('id', connection.id);
      return json({ ok: true, duplicate: true, lead_id: lead.id });
    }

    const nextFollowUp = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const leadPayload = {
      organization_id: connection.organization_id,
      company_name: companyName || email.split('@')[0],
      contact_name: contactName || null,
      email: email || null,
      phone: phone || null,
      source,
      stage: 'new',
      estimated_value: 0,
      need_summary: need || null,
      next_step: 'Neuen Formulareingang prüfen und kontaktieren',
      next_follow_up_at: nextFollowUp,
    };

    const { data: lead, error: leadError } = await db.from('leads').insert(leadPayload).select('*').single();
    if (leadError) throw leadError;

    const { error: taskError } = await db.from('sales_tasks').insert({
      organization_id: connection.organization_id,
      lead_id: lead.id,
      task_type: 'follow_up',
      title: `Neuen Lead prüfen: ${lead.company_name}`,
      description: need || 'Formulareingang prüfen und Erstkontakt durchführen.',
      due_at: nextFollowUp,
      status: 'open',
      priority: 'high',
      channel: 'manual',
      automation_key: `lead-intake-${lead.id}`,
      metadata: { source, external_reference: externalReference || null },
    });
    if (taskError) throw taskError;

    await db.from('sales_activities').insert({
      organization_id: connection.organization_id,
      lead_id: lead.id,
      activity_type: 'note',
      subject: 'Lead automatisch eingegangen',
      body: `Quelle: ${source}. Der Lead wurde über den NXTGEN Lead-Intake-Workflow angelegt.`,
      metadata: { automation: 'lead-intake', external_reference: externalReference || null },
    });

    await db.from('automation_run_log').insert({
      ...runBase,
      status: 'processed',
      lead_id: lead.id,
      result_payload: { lead_id: lead.id, task_created: true },
      completed_at: new Date().toISOString(),
    });

    await db.from('automation_connections').update({
      last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }).eq('id', connection.id);

    return json({ ok: true, duplicate: false, lead_id: lead.id, task_created: true }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from('automation_run_log').insert({
      ...runBase,
      status: 'failed',
      error_message: message,
      completed_at: new Date().toISOString(),
    });
    await db.from('automation_connections').update({
      last_run_at: new Date().toISOString(), last_error: message, updated_at: new Date().toISOString(),
    }).eq('id', connection.id);
    return json({ ok: false, error: message }, 500);
  }
});
