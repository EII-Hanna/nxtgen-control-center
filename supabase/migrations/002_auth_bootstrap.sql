create or replace function public.my_organizations()
returns table(organization_id uuid, organization_name text, member_role text)
language sql security definer set search_path=public as $$
  select o.id,o.name,om.role
  from public.organization_members om
  join public.organizations o on o.id=om.organization_id
  where om.user_id=auth.uid();
$$;
grant execute on function public.my_organizations() to authenticated;

create or replace function public.create_internal_organization(p_name text,p_slug text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if exists(select 1 from public.organization_members where user_id=auth.uid()) then raise exception 'Benutzer besitzt bereits eine Organisation'; end if;
  insert into public.organizations(name,slug,type,status) values(p_name,p_slug,'internal','active') returning id into v_id;
  insert into public.organization_members(organization_id,user_id,role) values(v_id,auth.uid(),'owner');
  insert into public.profiles(id,full_name) values(auth.uid(),coalesce(auth.jwt()->'user_metadata'->>'full_name','Administrator')) on conflict(id) do nothing;
  return v_id;
end $$;
grant execute on function public.create_internal_organization(text,text) to authenticated;