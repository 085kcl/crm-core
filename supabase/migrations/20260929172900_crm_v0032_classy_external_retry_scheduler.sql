-- CRM Core v0.03.2 — external scheduler for CLASSY site CRM retry.
-- Keeps site retry independent from ChatGPT Sites Cron provisioning.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'pg_net_extension_required';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron_extension_required';
  end if;
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'crm_classy_bridge_token'
      and decrypted_secret is not null
      and decrypted_secret <> ''
  ) then
    raise exception 'crm_classy_bridge_token_secret_required';
  end if;
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'classy_crm_retry_url'
      and decrypted_secret is not null
      and decrypted_secret <> ''
  ) then
    raise exception 'classy_crm_retry_url_secret_required';
  end if;
end
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'classy-site-crm-retry') then
    perform cron.unschedule('classy-site-crm-retry');
  end if;
end
$$;

select cron.schedule(
  'classy-site-crm-retry',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'classy_crm_retry_url'
      limit 1
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'crm_classy_bridge_token'
        limit 1
      )
    ),
    body := jsonb_build_object(
      'source', 'supabase_pg_cron',
      'limit', 20,
      'requested_at', now()
    ),
    timeout_milliseconds := 15000
  ) as request_id;
  $cron$
);
