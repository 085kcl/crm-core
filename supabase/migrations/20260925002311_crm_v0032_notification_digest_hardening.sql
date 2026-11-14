-- CRM Core v0.03.2 notification hardening
-- pgcrypto lives in the extensions schema while privileged functions keep search_path empty.

create or replace function public.materialize_intake_created_notifications(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.outbox_events%rowtype;
  v_intake public.intake_requests%rowtype;
  v_settings public.notification_settings%rowtype;
  v_recipient text;
  v_template text;
  v_template_version text;
  v_delivery_key text;
  v_inserted integer := 0;
  v_row_count integer := 0;
  v_contact text;
  v_crm_link text;
begin
  select * into v_event
  from public.outbox_events
  where id = p_event_id
  for update;

  if not found
     or v_event.event_type <> 'intake.created'
     or v_event.aggregate_type <> 'intake_request' then
    return 0;
  end if;

  if v_event.processed_at is not null then
    return 0;
  end if;

  select * into v_intake
  from public.intake_requests
  where workspace_id = v_event.workspace_id
    and id = v_event.aggregate_id;

  if not found then
    update public.outbox_events
    set last_error = 'notification_intake_missing',
        attempts = attempts + 1,
        available_at = now() + interval '5 minutes'
    where id = v_event.id;
    return 0;
  end if;

  select * into v_settings
  from public.notification_settings
  where workspace_id = v_event.workspace_id;

  if not found then
    update public.outbox_events
    set last_error = 'notification_settings_missing',
        attempts = attempts + 1,
        available_at = now() + interval '5 minutes'
    where id = v_event.id;
    return 0;
  end if;

  if not v_settings.company_notification_enabled
     and not v_settings.customer_confirmation_enabled then
    update public.outbox_events
    set processed_at = now(),
        last_error = 'notification_intents_suppressed_by_configuration'
    where id = v_event.id;
    return 0;
  end if;

  if v_settings.sender_email is null then
    update public.outbox_events
    set last_error = 'notification_sender_not_configured',
        attempts = attempts + 1,
        available_at = now() + interval '5 minutes'
    where id = v_event.id;
    return 0;
  end if;

  if v_settings.company_notification_enabled
     and cardinality(v_settings.new_request_recipients) = 0 then
    update public.outbox_events
    set last_error = 'notification_internal_recipients_missing',
        attempts = attempts + 1,
        available_at = now() + interval '5 minutes'
    where id = v_event.id;
    return 0;
  end if;

  v_template_version := coalesce(v_settings.template_map ->> 'template_version', 'v1');
  v_contact := v_intake.customer_email ||
    case when v_intake.customer_phone is null then ''
         else ' · ' || v_intake.customer_phone end;
  v_crm_link := coalesce(v_settings.crm_base_url, '') ||
    '?intake=' || v_intake.id::text;

  if v_settings.company_notification_enabled then
    v_template := nullif(v_settings.template_map ->> 'intake_internal', '');
    if v_template is null then
      update public.outbox_events
      set last_error = 'notification_internal_template_missing',
          attempts = attempts + 1,
          available_at = now() + interval '5 minutes'
      where id = v_event.id;
      return 0;
    end if;

    foreach v_recipient in array v_settings.new_request_recipients
    loop
      v_delivery_key := encode(
        extensions.digest(
          v_event.workspace_id::text || ':' || v_event.id::text ||
          ':company_internal:' || lower(v_recipient) || ':email',
          'sha256'
        ),
        'hex'
      );

      insert into public.notification_deliveries(
        workspace_id, intake_request_id, outbox_event_id, event_type,
        intent_key, recipient, template_key, template_variables,
        from_snapshot, reply_to_snapshot, provider, delivery_key,
        template_version, configuration_version
      ) values (
        v_event.workspace_id,
        v_intake.id,
        v_event.id,
        v_event.event_type,
        'company_internal',
        lower(v_recipient),
        v_template,
        jsonb_build_object(
          'REFERENCE', v_intake.public_reference,
          'CUSTOMER_NAME', v_intake.customer_name,
          'CUSTOMER_CONTACT', v_contact,
          'CRM_LINK', v_crm_link
        ),
        v_settings.sender_name || ' <' || v_settings.sender_email || '>',
        v_settings.reply_to,
        v_settings.provider,
        v_delivery_key,
        v_template_version,
        v_settings.configuration_version
      )
      on conflict (delivery_key) do nothing;

      get diagnostics v_row_count = row_count;
      v_inserted := v_inserted + v_row_count;
    end loop;
  end if;

  if v_settings.customer_confirmation_enabled then
    v_template := nullif(v_settings.template_map ->> 'intake_received_neutral', '');
    if v_template is null then
      update public.outbox_events
      set last_error = 'notification_customer_template_missing',
          attempts = attempts + 1,
          available_at = now() + interval '5 minutes'
      where id = v_event.id;
      return v_inserted;
    end if;

    v_delivery_key := encode(
      extensions.digest(
        v_event.workspace_id::text || ':' || v_event.id::text ||
        ':customer_receipt:' || lower(v_intake.customer_email) || ':email',
        'sha256'
      ),
      'hex'
    );

    insert into public.notification_deliveries(
      workspace_id, intake_request_id, outbox_event_id, event_type,
      intent_key, recipient, template_key, template_variables,
      from_snapshot, reply_to_snapshot, provider, delivery_key,
      template_version, configuration_version
    ) values (
      v_event.workspace_id,
      v_intake.id,
      v_event.id,
      v_event.event_type,
      'customer_receipt',
      lower(v_intake.customer_email),
      v_template,
      jsonb_build_object(
        'CUSTOMER_NAME', v_intake.customer_name,
        'REFERENCE', v_intake.public_reference
      ),
      v_settings.sender_name || ' <' || v_settings.sender_email || '>',
      v_settings.reply_to,
      v_settings.provider,
      v_delivery_key,
      v_template_version,
      v_settings.configuration_version
    )
    on conflict (delivery_key) do nothing;

    get diagnostics v_row_count = row_count;
    v_inserted := v_inserted + v_row_count;
  end if;

  update public.outbox_events
  set processed_at = now(),
      last_error = null
  where id = v_event.id;

  return v_inserted;
end;
$$;
