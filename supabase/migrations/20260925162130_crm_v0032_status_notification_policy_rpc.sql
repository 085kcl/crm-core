-- CRM Core v0.03.2 — safe member-visible status notification policy.

create or replace function public.get_intake_status_notification_policy(
  p_workspace_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := false;
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'workspace_membership_required' using errcode = '42501';
  end if;

  select coalesce(status_notifications_enabled, false)
  into v_enabled
  from public.notification_settings
  where workspace_id = p_workspace_id;

  return coalesce(v_enabled, false);
end;
$$;

revoke all on function public.get_intake_status_notification_policy(uuid)
from public, anon;
grant execute on function public.get_intake_status_notification_policy(uuid)
to authenticated, service_role;
