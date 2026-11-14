-- CRM Core v0.03.2 — make notification dispatcher target environment-specific.
-- Provision crm_notification_dispatch_url in Supabase Vault before applying.

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'crm_notification_dispatch_url'
      and decrypted_secret is not null
      and decrypted_secret <> ''
  ) then
    raise exception 'crm_notification_dispatch_url_secret_required';
  end if;
end
$$;

select cron.schedule(
  'crm-notification-dispatch-staging',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'crm_notification_dispatch_url'
      limit 1
    ),
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
