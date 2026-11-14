begin;

-- DP-CRM-021 assignment smoke test.
-- Uses the controlled CLASSY staging fixture and rolls back all writes.

do $$
declare
  v_workspace uuid := '636b112f-cbc8-4688-8dc6-101402d0ec13';
  v_intake uuid;
  v_owner uuid := '5de09a2c-bc4f-4db1-a4ab-70a54c3ae0fc';
  v_viewer uuid := '771aab66-4023-4fd3-80fb-e46ef3213469';
  v_version integer;
  v_changed boolean;
  v_result_version integer;
  v_assignee uuid;
  v_activity jsonb;
begin
  select id,row_version
    into v_intake,v_version
  from public.intake_requests
  where workspace_id=v_workspace and public_reference='CLA-2026-000004'
  limit 1;

  if v_intake is null then
    raise exception 'fixture_intake_missing';
  end if;

  select changed,row_version,assigned_to
    into v_changed,v_result_version,v_assignee
  from public.assign_intake_request_service(
    v_workspace,v_intake,v_owner,v_version,v_owner,'inbox-smoke-assign-0001'
  );

  if not v_changed or v_assignee <> v_owner or v_result_version <> v_version + 1 then
    raise exception 'assignment_result_unexpected';
  end if;

  select metadata
    into v_activity
  from public.activities
  where workspace_id=v_workspace
    and entity_type='intake_request'
    and entity_id=v_intake
    and type='intake.assigned'
    and metadata->>'request_id'='inbox-smoke-assign-0001'
  order by created_at desc
  limit 1;

  if v_activity is null
     or nullif(v_activity->>'from_user_id','') is not null
     or v_activity->>'to_user_id' <> v_owner::text then
    raise exception 'assignment_activity_snapshot_unexpected';
  end if;

  select changed,row_version,assigned_to
    into v_changed,v_result_version,v_assignee
  from public.assign_intake_request_service(
    v_workspace,v_intake,v_owner,v_version,v_owner,'inbox-smoke-assign-replay'
  );

  if v_changed or v_result_version <> v_version + 1 or v_assignee <> v_owner then
    raise exception 'assignment_replay_not_idempotent';
  end if;

  insert into public.workspace_members(workspace_id,user_id,role,status)
  values(v_workspace,v_viewer,'viewer','active');

  begin
    perform public.assign_intake_request_service(
      v_workspace,v_intake,null,v_result_version,v_viewer,'inbox-smoke-viewer-denied'
    );
    raise exception 'viewer_assignment_should_have_failed';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

rollback;
