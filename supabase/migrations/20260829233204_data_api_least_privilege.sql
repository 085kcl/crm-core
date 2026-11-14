-- CRM Core v0.02 hardening IV
-- Explicit Data API privileges for signed-in clients.
-- RLS still decides which rows each authenticated user can access.

-- Do not rely on Supabase's project-level default grants. Keep the exposed
-- public schema discoverable, but remove object access inherited by anon.
revoke all on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Prevent future migrations owned by postgres from exposing new objects
-- automatically. Each new table/RPC must opt in with an explicit grant.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- User profile lifecycle.
grant select, insert, update on table public.profiles to authenticated;

-- Workspace creation is RPC-only; membership changes remain RLS-protected.
grant select, update on table public.workspaces to authenticated;
grant select, insert, update, delete on table public.workspace_members to authenticated;

-- Operational CRM records. RLS enforces tenant membership and coarse roles.
grant select, insert, update, delete on table
  public.contacts,
  public.companies,
  public.contact_companies,
  public.leads,
  public.pipelines,
  public.pipeline_stages,
  public.deals,
  public.tasks,
  public.notes
to authenticated;

-- Activities are append-only to authenticated clients. Audit logs are
-- database-generated and admin-readable. Outbox events remain worker-only.
grant select, insert on table public.activities to authenticated;
grant select on table public.audit_logs to authenticated;

-- The sole public RPC intentionally callable from the Data API.
grant execute on function public.create_workspace(text, text) to authenticated;
