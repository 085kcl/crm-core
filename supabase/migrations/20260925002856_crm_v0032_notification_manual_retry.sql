-- CRM Core v0.03.2 — authorized manual notification retry

create or replace function public.request_notification_retry(
  p_workspace_id uuid,
  p_delivery_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.notification_deliveries%rowtype;
  v_settings public.notification_settings%rowtype;
  v_role public.workspace_role;
  v_reason text := nullif(trim(p_reason), '');
begin
  if p_workspace_id is null or p_delivery_id is null or p_actor_user_id is null then
    raise exception 'retry_context_required' using errcode = '22023';
  end if;

  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'retry_reason_invalid' using errcode = '22023';
  end if;

  select wm.role
  into v_role
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = p_actor_user_id
    and wm.status = 'active';

  if not found or v_role not in ('owner','admin','manager') then
    raise exception 'retry_not_authorized' using errcode = '42501';
  end if;

  select *
  into v_delivery
  from public.notification_deliveries
  where workspace_id = p_workspace_id
    and id = p_delivery_id
  for update;

  if not found then
    raise exception 'notification_delivery_not_found' using errcode = 'P0002';
  end if;

  select *
  into v_settings
  from public.notification_settings
  where workspace_id = p_workspace_id;

  if not found then
    raise exception 'notification_settings_missing' using errcode = '23514';
  end if;

  if v_delivery.status <> 'failed' then
    raise exception 'notification_retry_requires_failed_state' using errcode = '23514';
  end if;

  if v_delivery.reconciliation_required then
    raise exception 'notification_retry_requires_reconciliation' using errcode = '23514';
  end if;

  if v_delivery.attempt_count >= v_settings.max_attempts then
    raise exception 'notification_retry_attempts_exhausted' using errcode = '23514';
  end if;

  update public.notification_deliveries
  set retryable = true,
      next_attempt_at = now(),
      last_error = coalesce(last_error, 'manual_retry_requested')
  where id = v_delivery.id;

  insert into public.audit_logs(
    workspace_id,
    user_id,
    action,
    resource_type,
    resource_id,
    before_data,
    after_data
  ) values (
    p_workspace_id,
    p_actor_user_id,
    'notification.retry_requested',
    'notification_delivery',
    p_delivery_id,
    jsonb_build_object(
      'status', v_delivery.status,
      'attempt_count', v_delivery.attempt_count,
      'retryable', v_delivery.retryable,
      'reconciliation_required', v_delivery.reconciliation_required
    ),
    jsonb_build_object(
      'status', v_delivery.status,
      'attempt_count', v_delivery.attempt_count,
      'retryable', true,
      'reason', v_reason
    )
  );

  return 'retry_scheduled';
end;
$$;

revoke all on function public.request_notification_retry(uuid,uuid,uuid,text)
from public, anon, authenticated;
grant execute on function public.request_notification_retry(uuid,uuid,uuid,text)
to service_role;
