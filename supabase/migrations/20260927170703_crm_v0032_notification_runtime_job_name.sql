-- CRM Core v0.03.2 — use an environment-neutral notification cron job name.

select cron.schedule(
  'crm-notification-dispatch',
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

do $$
begin
  if exists (select 1 from cron.job where jobname = 'crm-notification-dispatch-staging') then
    perform cron.unschedule('crm-notification-dispatch-staging');
  end if;
end
$$;
