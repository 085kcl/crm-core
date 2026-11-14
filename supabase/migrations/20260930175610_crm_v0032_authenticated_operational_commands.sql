-- CRM Core v0.03.2 — authenticated operational command wrappers.
-- Removes the CRM Site dependency on a service-role secret for user-driven
-- assignment and notification retry while keeping the privileged service RPCs private.

create or replace function public.assign_intake_request(
  p_workspace_id uuid,
  p_intake_id uuid,
  p_assigned_to uuid,
  p_expected_version integer,
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
  v_actor_user_id uuid := auth.uid();
begin
  if v_actor_user_id is null then
    raise exception 'intake_assignment_not_authenticated' using errcode = '42501';
  end if;

  return query
  select *
  from public.assign_intake_request_service(
    p_workspace_id,
    p_intake_id,
    p_assigned_to,
    p_expected_version,
    v_actor_user_id,
    p_request_id
  );
end;
$$;

revoke all on function public.assign_intake_request(uuid,uuid,uuid,integer,text)
from public, anon, authenticated;
grant execute on function public.assign_intake_request(uuid,uuid,uuid,integer,text)
to authenticated;

create or replace function public.request_notification_retry_authenticated(
  p_workspace_id uuid,
  p_delivery_id uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
begin
  if v_actor_user_id is null then
    raise exception 'retry_not_authenticated' using errcode = '42501';
  end if;

  return public.request_notification_retry(
    p_workspace_id,
    p_delivery_id,
    v_actor_user_id,
    p_reason
  );
end;
$$;

revoke all on function public.request_notification_retry_authenticated(uuid,uuid,text)
from public, anon, authenticated;
grant execute on function public.request_notification_retry_authenticated(uuid,uuid,text)
to authenticated;
