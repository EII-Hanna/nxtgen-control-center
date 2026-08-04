import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,stripe-signature,x-copecart-signature,x-webhook-secret',
};

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function verifyStripe(rawBody: string, signatureHeader: string, secret: string) {
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || !signatures.length) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = await hmac(secret, `${timestamp}.${rawBody}`);
  return signatures.some((signature) => safeEqual(signature, expected));
}

async function verifyGeneric(rawBody: string, supplied: string, secret: string) {
  if (!secret) return false;
  const normalized = supplied.replace(/^sha256=/i, '');
  return safeEqual(normalized, await hmac(secret, rawBody));
}

function stripeFields(payload: any) {
  const object = payload?.data?.object ?? {};
  const metadata = object.metadata ?? {};
  return {
    externalEventId: String(payload.id ?? crypto.randomUUID()),
    eventType: String(payload.type ?? 'unknown'),
    providerReference: String(object.payment_intent ?? object.id ?? payload.id ?? ''),
    invoiceId: metadata.nxtgen_invoice_id ?? metadata.invoice_id ?? null,
    amount: object.amount_received != null ? Number(object.amount_received) / 100
      : object.amount_total != null ? Number(object.amount_total) / 100
      : object.amount_paid != null ? Number(object.amount_paid) / 100
      : null,
    currency: String(object.currency ?? 'EUR').toUpperCase(),
    sourcePackageId: metadata.source_package_id ?? null,
  };
}

function copecartFields(payload: any) {
  const data = payload?.data ?? payload?.order ?? payload;
  const eventType = payload?.event ?? payload?.event_type ?? payload?.type ?? data?.status ?? 'unknown';
  return {
    externalEventId: String(payload?.id ?? payload?.event_id ?? data?.transaction_id ?? data?.order_id ?? crypto.randomUUID()),
    eventType: String(eventType),
    providerReference: String(data?.transaction_id ?? data?.order_id ?? data?.id ?? ''),
    invoiceId: data?.nxtgen_invoice_id ?? data?.invoice_id ?? payload?.nxtgen_invoice_id ?? null,
    amount: data?.amount != null ? Number(data.amount) : data?.total != null ? Number(data.total) : null,
    currency: String(data?.currency ?? 'EUR').toUpperCase(),
    sourcePackageId: data?.source_package_id ?? payload?.source_package_id ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const provider = (new URL(req.url).searchParams.get('provider') ?? '').toLowerCase();
  if (!['stripe', 'copecart'].includes(provider)) {
    return new Response('Unsupported provider', { status: 400, headers: corsHeaders });
  }

  const rawBody = await req.text();
  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch { return new Response('Invalid JSON', { status: 400, headers: corsHeaders }); }

  let verified = false;
  if (provider === 'stripe') {
    const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
    verified = Boolean(secret) && await verifyStripe(rawBody, req.headers.get('stripe-signature') ?? '', secret);
  } else {
    const secret = Deno.env.get('COPECART_WEBHOOK_SECRET') ?? '';
    const supplied = req.headers.get('x-copecart-signature') ?? req.headers.get('x-webhook-secret') ?? '';
    verified = await verifyGeneric(rawBody, supplied, secret);
  }

  if (!verified) return new Response('Invalid webhook signature', { status: 401, headers: corsHeaders });

  const fields = provider === 'stripe' ? stripeFields(payload) : copecartFields(payload);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const enrichedPayload = { ...payload, source_package_id: fields.sourcePackageId };

  const { data, error } = await supabase.rpc('process_backoffice_payment_webhook', {
    p_provider: provider,
    p_external_event_id: fields.externalEventId,
    p_event_type: fields.eventType,
    p_provider_reference: fields.providerReference || null,
    p_invoice_id: fields.invoiceId || null,
    p_amount: fields.amount,
    p_currency: fields.currency,
    p_payload: enrichedPayload,
  });

  if (error) {
    console.error('payment-webhook processing failed', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, provider, result: data }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
