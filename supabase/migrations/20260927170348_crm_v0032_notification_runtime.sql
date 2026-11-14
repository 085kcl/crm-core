-- CRM Core v0.03.2 — staging notification runtime
-- Platform prerequisites: pg_net and pg_cron must be enabled in the target Supabase project.
-- Secrets are provisioned operationally in Supabase Vault and are intentionally not committed.

do $$
begin
  if not exists (select 1 from pg_extension where extname='pg_net') then
    raise exception 'pg_net_extension_required';
  end if;
  if not exists (select 1 from pg_extension where extname='pg_cron') then
    raise exception 'pg_cron_extension_required';
  end if;
end
$$;

create or replace function public.get_notification_runtime_secret(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if p_name not in ('resend_api_key', 'crm_notification_worker_token', 'resend_webhook_secret') then
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

select cron.schedule(
  'crm-notification-dispatch-staging',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://fnzcmoydjlarelotnmon.supabase.co/functions/v1/crm-notification-dispatch?limit=25',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'crm_notification_worker_token'
        limit 1
      )
    ),
    body := jsonb_build_object('source', 'pg_cron', 'requested_at', now()),
    timeout_milliseconds := 15000
  ) as request_id;
  $cron$
);
