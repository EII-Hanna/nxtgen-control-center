-- NXTGEN Backoffice: contracts, billing, receivables, reminders, approvals, time and capacity

create table if not exists public.backoffice_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  commercial_offer_id uuid references public.commercial_offers(id) on delete set null,
  contract_package_id uuid references public.contract_packages(id) on delete set null,
  contract_number text not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','active','paused','terminated','expired')),
  start_date date,
  end_date date,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('one_time','monthly','quarterly','yearly','custom')),
  setup_fee numeric(14,2) not null default 0,
  recurring_fee numeric(14,2) not null default 0,
  currency text not null default 'EUR',
  payment_terms_days integer not null default 14,
  auto_renew boolean not null default true,
  next_billing_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,contract_number)
);

create table if not exists public.backoffice_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  contract_id uuid references public.backoffice_contracts(id) on delete set null,
  invoice_number text not null,
  status text not null default 'draft' check (status in ('draft','approved','sent','partially_paid','paid','overdue','cancelled','written_off')),
  issue_date date not null default current_date,
  due_date date not null,
  subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  currency text not null default 'EUR',
  provider text,
  provider_reference text,
  payment_link text,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,invoice_number)
);

create table if not exists public.backoffice_invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.backoffice_invoices(id) on delete cascade,
  title text not null,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  tax_rate numeric(6,2) not null default 19,
  line_total numeric(14,2) generated always as (quantity*unit_price) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.backoffice_payment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.backoffice_invoices(id) on delete cascade,
  event_type text not null check (event_type in ('payment_link_created','payment_received','payment_failed','refund','chargeback','manual_adjustment')),
  amount numeric(14,2),
  provider text,
  external_reference text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.backoffice_dunning_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.backoffice_invoices(id) on delete cascade,
  level integer not null default 0 check (level between 0 and 4),
  status text not null default 'open' check (status in ('open','scheduled','sent','paused','resolved','escalated')),
  next_action_at timestamptz,
  last_sent_at timestamptz,
  fee_amount numeric(12,2) not null default 0,
  owner_role text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(invoice_id)
);

create table if not exists public.backoffice_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  approval_type text not null check (approval_type in ('invoice','credit_note','expense','contract','discount','write_off','time_off')),
  reference_id uuid,
  title text not null,
  description text,
  requested_by uuid references auth.users(id) on delete set null,
  assigned_role text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  amount numeric(14,2),
  decision_note text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  role_name text,
  weekly_capacity_hours numeric(6,2) not null default 40,
  hourly_cost numeric(10,2) not null default 0,
  status text not null default 'active' check (status in ('active','inactive','contractor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.delivery_projects(id) on delete set null,
  task_id uuid references public.delivery_project_tasks(id) on delete set null,
  work_date date not null default current_date,
  hours numeric(6,2) not null check (hours > 0 and hours <= 24),
  billable boolean not null default true,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.team_time_off (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  leave_type text not null default 'vacation' check (leave_type in ('vacation','sick','unpaid','other')),
  start_date date not null,
  end_date date not null,
  status text not null default 'requested' check (status in ('requested','approved','rejected','cancelled')),
  note text,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

alter table public.backoffice_contracts enable row level security;
alter table public.backoffice_invoices enable row level security;
alter table public.backoffice_invoice_items enable row level security;
alter table public.backoffice_payment_events enable row level security;
alter table public.backoffice_dunning_cases enable row level security;
alter table public.backoffice_approvals enable row level security;
alter table public.team_members enable row level security;
alter table public.team_time_entries enable row level security;
alter table public.team_time_off enable row level security;

create policy backoffice_contracts_org_access on public.backoffice_contracts for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy backoffice_invoices_org_access on public.backoffice_invoices for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy backoffice_invoice_items_org_access on public.backoffice_invoice_items for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy backoffice_payment_events_org_access on public.backoffice_payment_events for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy backoffice_dunning_org_access on public.backoffice_dunning_cases for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy backoffice_approvals_org_access on public.backoffice_approvals for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy team_members_org_access on public.team_members for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy team_time_entries_org_access on public.team_time_entries for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy team_time_off_org_access on public.team_time_off for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create index if not exists idx_backoffice_contracts_client on public.backoffice_contracts(client_id,status,next_billing_date);
create index if not exists idx_backoffice_invoices_org_status on public.backoffice_invoices(organization_id,status,due_date);
create index if not exists idx_backoffice_dunning_next on public.backoffice_dunning_cases(organization_id,status,next_action_at);
create index if not exists idx_backoffice_approvals_status on public.backoffice_approvals(organization_id,status,created_at desc);
create index if not exists idx_team_time_entries_member_date on public.team_time_entries(team_member_id,work_date desc);

create or replace function public.recalculate_backoffice_invoice(p_invoice_id uuid)
returns public.backoffice_invoices language plpgsql security definer set search_path=public as $$
declare v_invoice public.backoffice_invoices; v_sub numeric; v_tax numeric;
begin
  select * into v_invoice from public.backoffice_invoices where id=p_invoice_id and public.is_org_member(organization_id);
  if v_invoice.id is null then raise exception 'Invoice not found'; end if;
  select coalesce(sum(line_total),0),coalesce(sum(line_total*tax_rate/100),0) into v_sub,v_tax from public.backoffice_invoice_items where invoice_id=p_invoice_id;
  update public.backoffice_invoices set subtotal=v_sub,tax_amount=v_tax,total_amount=v_sub+v_tax,updated_at=now() where id=p_invoice_id returning * into v_invoice;
  return v_invoice;
end; $$;

create or replace function public.mark_backoffice_invoice_paid(p_invoice_id uuid,p_amount numeric default null,p_provider text default 'manual',p_reference text default null)
returns public.backoffice_invoices language plpgsql security definer set search_path=public as $$
declare v_invoice public.backoffice_invoices; v_amount numeric;
begin
  select * into v_invoice from public.backoffice_invoices where id=p_invoice_id and public.is_org_member(organization_id);
  if v_invoice.id is null then raise exception 'Invoice not found'; end if;
  v_amount:=coalesce(p_amount,v_invoice.total_amount-v_invoice.paid_amount);
  insert into public.backoffice_payment_events(organization_id,invoice_id,event_type,amount,provider,external_reference) values(v_invoice.organization_id,v_invoice.id,'payment_received',v_amount,p_provider,p_reference);
  update public.backoffice_invoices set paid_amount=least(total_amount,paid_amount+v_amount),status=case when paid_amount+v_amount>=total_amount then 'paid' else 'partially_paid' end,paid_at=case when paid_amount+v_amount>=total_amount then now() else paid_at end,updated_at=now() where id=p_invoice_id returning * into v_invoice;
  update public.backoffice_dunning_cases set status='resolved',updated_at=now() where invoice_id=p_invoice_id;
  return v_invoice;
end; $$;

create or replace function public.refresh_backoffice_dunning()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0;
begin
  update public.backoffice_invoices i set status='overdue',updated_at=now()
  where i.due_date<current_date and i.status in ('approved','sent','partially_paid') and public.is_org_member(i.organization_id);

  insert into public.backoffice_dunning_cases(organization_id,invoice_id,level,status,next_action_at,owner_role)
  select i.organization_id,i.id,0,'scheduled',now(),'Finance'
  from public.backoffice_invoices i
  where i.status='overdue' and public.is_org_member(i.organization_id)
  on conflict(invoice_id) do update set
    level=least(4,case
      when current_date-excluded.invoice_id::text::date >= 0 then public.backoffice_dunning_cases.level
      else public.backoffice_dunning_cases.level end),
    status=case when public.backoffice_dunning_cases.status='resolved' then 'resolved' else 'scheduled' end,
    updated_at=now();
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

create or replace function public.decide_backoffice_approval(p_approval_id uuid,p_decision text,p_note text default null)
returns public.backoffice_approvals language plpgsql security definer set search_path=public as $$
declare v_item public.backoffice_approvals;
begin
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  update public.backoffice_approvals set status=p_decision,decision_note=p_note,decided_by=auth.uid(),decided_at=now(),updated_at=now()
  where id=p_approval_id and public.is_org_member(organization_id) returning * into v_item;
  if v_item.id is null then raise exception 'Approval not found'; end if;
  return v_item;
end; $$;
