create or replace function public.get_notification_runtime_secret(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if p_name not in (
    'resend_api_key',
    'crm_notification_worker_token',
    'resend_webhook_secret',
    'crm_classy_bridge_token'
  ) then
    raise exception 'notification_runtime_secret_not_allowed' using errcode = '42501';
  end if;

  select decrypted_secret
  into v_secret
  from vault.decrypted_secrets
  where name = p_name
  limit 1;

  if v_secret is null or v_secret = '' then
    raise exception 'notification_runtime_secret_missing' using errcode = 'P0002';
  end if;

  return v_secret;
end;
$$;

revoke all on function public.get_notification_runtime_secret(text) from public;
revoke all on function public.get_notification_runtime_secret(text) from anon;
revoke all on function public.get_notification_runtime_secret(text) from authenticated;
grant execute on function public.get_notification_runtime_secret(text) to service_role;
