create or replace function public.assign_intake_request_service(
  p_workspace_id uuid,
  p_intake_id uuid,
  p_assigned_to uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_request_id text
)
returns table(
  changed boolean,
  row_version integer,
  assigned_to uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_previous_assignee uuid;
  v_result_assignee uuid;
  v_current_version integer;
begin
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'invalid_expected_version' using errcode = '22023';
  end if;

  if p_request_id is null or length(trim(p_request_id)) < 8 or length(p_request_id) > 200 then
    raise exception 'invalid_request_id' using errcode = '22023';
  end if;

  select wm.role::text
    into v_role
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = p_actor_user_id
    and wm.status::text = 'active'
  limit 1;

  if v_role is null or v_role = 'viewer' then
    raise exception 'intake_assignment_not_authorized' using errcode = '42501';
  end if;

  if p_assigned_to is not null and not exists (
    select 1
    from public.workspace_members target
    where target.workspace_id = p_workspace_id
      and target.user_id = p_assigned_to
      and target.status::text = 'active'
      and target.role::text <> 'viewer'
  ) then
    raise exception 'intake_assignee_unavailable' using errcode = 'P0002';
  end if;

  select i.assigned_to, i.row_version
    into v_previous_assignee, v_current_version
  from public.intake_requests i
  where i.workspace_id = p_workspace_id
    and i.id = p_intake_id
  for update;

  if not found then
    raise exception 'intake_not_found' using errcode = 'P0002';
  end if;

  if v_previous_assignee is not distinct from p_assigned_to then
    return query
      select false, v_current_version, v_previous_assignee;
    return;
  end if;

  if v_current_version <> p_expected_version then
    raise exception 'intake_version_conflict' using errcode = '40001';
  end if;

  update public.intake_requests
  set assigned_to = p_assigned_to,
      row_version = row_version + 1,
      updated_at = now()
  where workspace_id = p_workspace_id
    and id = p_intake_id
  returning intake_requests.row_version, intake_requests.assigned_to
    into v_current_version, v_result_assignee;

  insert into public.activities (
    workspace_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_workspace_id,
    p_actor_user_id,
    'intake.assigned',
    'intake_request',
    p_intake_id,
    jsonb_build_object(
      'from_user_id', v_previous_assignee,
      'to_user_id', p_assigned_to,
      'request_id', p_request_id,
      'resulting_version', v_current_version
    )
  );

  return query
    select true, v_current_version, v_result_assignee;
end;
$$;
