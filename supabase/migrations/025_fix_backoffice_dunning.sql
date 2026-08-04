-- Correct dunning levels from actual overdue days
create or replace function public.refresh_backoffice_dunning()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0;
begin
  update public.backoffice_invoices i
  set status='overdue',updated_at=now()
  where i.due_date<current_date
    and i.status in ('approved','sent','partially_paid')
    and public.is_org_member(i.organization_id);

  insert into public.backoffice_dunning_cases(
    organization_id,invoice_id,level,status,next_action_at,owner_role
  )
  select i.organization_id,i.id,
    case
      when current_date-i.due_date>=30 then 4
      when current_date-i.due_date>=14 then 3
      when current_date-i.due_date>=7 then 2
      when current_date-i.due_date>=1 then 1
      else 0
    end,
    case when current_date-i.due_date>=30 then 'escalated' else 'scheduled' end,
    now(),'Finance'
  from public.backoffice_invoices i
  where i.status='overdue' and public.is_org_member(i.organization_id)
  on conflict(invoice_id) do update set
    level=excluded.level,
    status=case when public.backoffice_dunning_cases.status='resolved' then 'resolved' else excluded.status end,
    next_action_at=excluded.next_action_at,
    updated_at=now();

  get diagnostics v_count = row_count;
  return v_count;
end; $$;
