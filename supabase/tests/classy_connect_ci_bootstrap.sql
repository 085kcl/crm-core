-- TEST-ONLY bootstrap for isolated PostgreSQL 17 in GitHub Actions.
-- This is not a Supabase migration. Never apply to production.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create schema private;
grant usage on schema public, auth, private to authenticated, service_role;
grant usage on schema public to anon;

create or replace function auth.uid() returns uuid
language sql stable set search_path = ''
as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

create table public.workspaces (
  id uuid primary key,
  name text not null
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null,
  role text not null,
  status text not null,
  primary key(workspace_id,user_id)
);
create table public.contacts (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  unique(workspace_id,id)
);
create table public.leads (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  unique(workspace_id,id)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()
      and wm.status = 'active'
  );
$$;

create or replace function private.current_workspace_role(p_workspace_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select wm.role from public.workspace_members wm
  where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()
    and wm.status = 'active'
  limit 1;
$$;

grant execute on function auth.uid() to authenticated, service_role;
grant execute on function private.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function private.current_workspace_role(uuid) to authenticated, service_role;

insert into public.workspaces (id,name) values
('11111111-1111-4111-8111-111111111111','A'),
('22222222-2222-4222-8222-222222222222','B');

insert into public.workspace_members (workspace_id,user_id,role,status) values
('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','sales','active'),
('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','sales','active'),
('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','viewer','active'),
('11111111-1111-4111-8111-111111111111','66666666-6666-4666-8666-666666666666','manager','active'),
('22222222-2222-4222-8222-222222222222','77777777-7777-4777-8777-777777777777','sales','active');

insert into public.contacts(id,workspace_id) values
('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111'),
('99999999-9999-4999-8999-999999999999','22222222-2222-4222-8222-222222222222');
