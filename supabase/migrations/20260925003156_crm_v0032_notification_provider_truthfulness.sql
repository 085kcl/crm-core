-- CRM Core v0.03.2 — provider configuration truthfulness
-- Do not report Resend as configured until a server-side credential is actually installed.

update public.notification_settings
set provider_configuration_ref = null
where provider = 'resend'
  and provider_configuration_ref = 'resend/default'
  and sender_email is null
  and not customer_confirmation_enabled
  and not company_notification_enabled
  and not status_notifications_enabled;
