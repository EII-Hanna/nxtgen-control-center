-- Automatically bootstrap the single internal NXTGEN organization for the first authenticated admin.

create or replace function public.ensure_internal_organization()
returns table(organization_id uuid, organization_name text, member_role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_role text;
begin
  if v_user_id is null then
    raise exception 'Nicht angemeldet';
  end if;

  select om.organization_id, om.role
    into v_org_id, v_role
  from public.organization_members om
  where om.user_id = v_user_id
  order by om.created_at
  limit 1;

  if v_org_id is null then
    select o.id into v_org_id
    from public.organizations o
    where o.type = 'internal' and o.slug = 'nxtgen'
    limit 1;

    if v_org_id is null then
      insert into public.organizations(name, slug, type, status)
      values ('NXTGEN', 'nxtgen', 'internal', 'active')
      returning id into v_org_id;
      v_role := 'owner';
    else
      v_role := case
        when exists(select 1 from public.organization_members where organization_id = v_org_id) then 'admin'
        else 'owner'
      end;
    end if;

    insert into public.organization_members(organization_id, user_id, role)
    values (v_org_id, v_user_id, v_role)
    on conflict (organization_id, user_id) do nothing;
  end if;

  insert into public.profiles(id, full_name)
  values (
    v_user_id,
    coalesce(auth.jwt()->'user_metadata'->>'full_name', auth.jwt()->>'email', 'Administrator')
  )
  on conflict (id) do update
    set full_name = coalesce(public.profiles.full_name, excluded.full_name),
        updated_at = now();

  return query
  select o.id, o.name, om.role
  from public.organizations o
  join public.organization_members om on om.organization_id = o.id
  where o.id = v_org_id and om.user_id = v_user_id;
end;
$$;

grant execute on function public.ensure_internal_organization() to authenticated;
