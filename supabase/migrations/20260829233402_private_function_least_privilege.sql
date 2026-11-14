-- CRM Core v0.02 hardening V
-- Remove default EXECUTE grants inherited by internal functions before they
-- were moved from public to the non-exposed private schema.

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

revoke execute on all functions in schema private
from public, anon, authenticated;

-- These helpers are referenced by authenticated RLS policies. Every helper
-- validates auth.uid() internally and uses a fixed, empty search_path.
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.current_workspace_role(uuid) to authenticated;
grant execute on function private.can_write_workspace(uuid) to authenticated;
grant execute on function private.can_delete_workspace_data(uuid) to authenticated;
grant execute on function private.shares_active_workspace(uuid) to authenticated;

alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated;
