-- NXTGEN Sales-to-Cash: externe Zahlungslinks (CopeCart / Stripe)

alter table public.commercial_offers
  add column if not exists payment_provider text
    check (payment_provider in ('copecart','stripe','other')),
  add column if not exists payment_link text,
  add column if not exists payment_status text not null default 'not_sent'
    check (payment_status in ('not_sent','sent','opened','paid','failed','refunded','cancelled')),
  add column if not exists payment_sent_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists external_payment_reference text;

alter table public.contract_packages
  add column if not exists payment_provider text
    check (payment_provider in ('copecart','stripe','other')),
  add column if not exists payment_link text,
  add column if not exists payment_status text not null default 'not_sent'
    check (payment_status in ('not_sent','sent','opened','paid','failed','refunded','cancelled')),
  add column if not exists paid_at timestamptz,
  add column if not exists external_payment_reference text;

create index if not exists idx_commercial_offers_payment_status
  on public.commercial_offers(organization_id, payment_status, created_at desc);

create index if not exists idx_contract_packages_payment_status
  on public.contract_packages(organization_id, payment_status, created_at desc);

create or replace function public.mark_offer_payment_sent(
  p_offer_id uuid,
  p_provider text,
  p_payment_link text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.commercial_offers
  set payment_provider = p_provider,
      payment_link = p_payment_link,
      payment_status = 'sent',
      payment_sent_at = now(),
      updated_at = now()
  where id = p_offer_id
    and public.is_org_member(organization_id);

  if not found then
    raise exception 'Offer not found or access denied';
  end if;
end;
$$;

create or replace function public.mark_offer_paid(
  p_offer_id uuid,
  p_external_reference text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.commercial_offers
  set payment_status = 'paid',
      paid_at = now(),
      external_payment_reference = coalesce(p_external_reference, external_payment_reference),
      status = case when status in ('accepted','sent','viewed','generated','reviewed') then 'accepted' else status end,
      updated_at = now()
  where id = p_offer_id
    and public.is_org_member(organization_id);

  if not found then
    raise exception 'Offer not found or access denied';
  end if;

  insert into public.document_delivery_events (
    organization_id,
    client_id,
    offer_id,
    event_type,
    metadata
  )
  select organization_id,
         client_id,
         id,
         'payment_triggered',
         jsonb_build_object('payment_status','paid','external_reference',p_external_reference)
  from public.commercial_offers
  where id = p_offer_id;
end;
$$;
