-- CRM Core v0.03.2 — remove temporary authenticated SECURITY DEFINER wrappers.
-- User-driven commands are now mediated by the JWT-protected Edge Function
-- crm-intake-operator-command, which binds actor identity to the verified JWT.

drop function if exists public.assign_intake_request(uuid,uuid,uuid,integer,text);
drop function if exists public.request_notification_retry_authenticated(uuid,uuid,text);
