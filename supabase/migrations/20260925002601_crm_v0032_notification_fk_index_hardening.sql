-- CRM Core v0.03.2 — FK index hardening for Intake/Notifications

create index if not exists idx_intake_requests_workspace_assignee
  on public.intake_requests(workspace_id, assigned_to)
  where assigned_to is not null;

create index if not exists idx_intake_status_history_actor
  on public.intake_status_history(actor_user_id)
  where actor_user_id is not null;

create index if not exists idx_intake_status_history_from_status
  on public.intake_status_history(workspace_id, from_status_id)
  where from_status_id is not null;

create index if not exists idx_intake_status_history_to_status
  on public.intake_status_history(workspace_id, to_status_id);

create index if not exists idx_notification_provider_events_workspace
  on public.notification_provider_events(workspace_id)
  where workspace_id is not null;

create index if not exists idx_notification_provider_events_workspace_delivery
  on public.notification_provider_events(workspace_id, delivery_id)
  where workspace_id is not null and delivery_id is not null;
