-- CRM Core v0.03.2 — DP-CRM-020 direct-write hardening
-- Intake mutations must pass through controlled service operations so status/history/outbox remain atomic.

revoke update on public.intake_requests from authenticated;
grant select on public.intake_requests to authenticated;
grant all on public.intake_requests to service_role;
