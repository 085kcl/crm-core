create or replace function public.create_workspace_service(
  p_name text,
  p_slug text,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if p_actor_user_id is null then
    raise exception 'workspace_actor_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_user_id
  ) then
    raise exception 'workspace_actor_not_found' using errcode = '42501';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'workspace_name_invalid' using errcode = '22023';
  end if;

  if char_length(v_slug) < 3
     or char_length(v_slug) > 64
     or v_slug !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' then
    raise exception 'workspace_slug_invalid' using errcode = '22023';
  end if;

  insert into public.workspaces(name, slug, created_by)
  values (v_name, v_slug, p_actor_user_id)
  returning id into v_workspace_id;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace_id, p_actor_user_id, 'owner');

  return v_workspace_id;
end;
$$;

revoke all on function public.create_workspace_service(text, text, uuid) from public;
revoke all on function public.create_workspace_service(text, text, uuid) from anon;
revoke all on function public.create_workspace_service(text, text, uuid) from authenticated;
grant execute on function public.create_workspace_service(text, text, uuid) to service_role;
