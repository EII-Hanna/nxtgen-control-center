-- NXTGEN Revenue Engine: offer numbering, immutable snapshots and package preparation

alter table public.commercial_offers
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists client_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists provider_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists total_contract_value numeric(12,2) not null default 0,
  add column if not exists generated_html text;

alter table public.contract_packages
  add column if not exists offer_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists generation_status text not null default 'pending'
    check (generation_status in ('pending','processing','completed','failed')),
  add column if not exists generation_error text;

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  provider_name text not null default 'NXTGENdigital',
  provider_legal_form text,
  provider_street text,
  provider_postal_code text,
  provider_city text,
  provider_email text,
  provider_website text,
  offer_prefix text not null default 'ANG',
  next_offer_number bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_settings enable row level security;

create policy organization_settings_org_access on public.organization_settings for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create or replace function public.next_offer_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_number bigint;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'Not authorized';
  end if;

  insert into public.organization_settings (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  update public.organization_settings
  set next_offer_number = next_offer_number + 1,
      updated_at = now()
  where organization_id = p_organization_id
  returning offer_prefix, next_offer_number - 1 into v_prefix, v_number;

  return v_prefix || '-' || to_char(current_date, 'YYYY') || '-' || lpad(v_number::text, 5, '0');
end;
$$;

grant execute on function public.next_offer_number(uuid) to authenticated;

create index if not exists idx_commercial_offers_org_status
  on public.commercial_offers(organization_id, status, created_at desc);
