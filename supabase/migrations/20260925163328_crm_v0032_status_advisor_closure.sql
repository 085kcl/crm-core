-- CRM Core v0.03.2 — DP-CRM-020 advisor closure.
-- The server route reads the safe boolean only after a user-scoped intake lookup;
-- no authenticated SECURITY DEFINER RPC is needed.

revoke all on function public.get_intake_status_notification_policy(uuid)
from public, anon, authenticated, service_role;

drop function public.get_intake_status_notification_policy(uuid);

create index if not exists idx_intake_status_commands_actor
  on public.intake_status_commands(actor_user_id);

create index if not exists idx_intake_status_commands_history
  on public.intake_status_commands(history_id)
  where history_id is not null;

create index if not exists idx_intake_status_commands_target
  on public.intake_status_commands(workspace_id, target_status_id);

create index if not exists idx_intake_status_commands_status
  on public.intake_status_commands(workspace_id, status_id);
