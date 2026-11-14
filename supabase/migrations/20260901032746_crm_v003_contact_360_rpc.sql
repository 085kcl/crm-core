create or replace function public.get_contact_360(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_activity_limit integer default 50
)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select jsonb_build_object(
    'contact', to_jsonb(s) - 'workspace_id',
    'owner', case when c.owner_id is null then null else jsonb_build_object(
      'id', c.owner_id,
      'display_name', op.display_name,
      'avatar_url', op.avatar_url
    ) end,
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cp.id,
        'trade_name', cp.trade_name,
        'legal_name', cp.legal_name,
        'tax_id', cp.tax_id,
        'segment', cp.segment,
        'relationship_title', cc.relationship_title,
        'is_primary', cc.is_primary
      ) order by cc.is_primary desc, cp.trade_name)
      from public.contact_companies cc
      join public.companies cp
        on cp.workspace_id = cc.workspace_id and cp.id = cc.company_id
      where cc.workspace_id = c.workspace_id and cc.contact_id = c.id
    ), '[]'::jsonb),
    'leads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'source', l.source,
        'score', l.score,
        'status', l.status,
        'qualification', l.qualification,
        'converted_at', l.converted_at,
        'owner_id', l.owner_id,
        'owner_name', lp.display_name,
        'created_at', l.created_at,
        'updated_at', l.updated_at
      ) order by l.created_at desc)
      from public.leads l
      left join public.profiles lp on lp.id = l.owner_id
      where l.workspace_id = c.workspace_id and l.contact_id = c.id
    ), '[]'::jsonb),
    'deals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'title', d.title,
        'amount', d.amount,
        'currency', d.currency,
        'state', d.state,
        'pipeline_id', d.pipeline_id,
        'pipeline_name', pl.name,
        'stage_id', d.stage_id,
        'stage_name', ps.name,
        'probability', ps.probability,
        'expected_close_date', d.expected_close_date,
        'closed_at', d.closed_at,
        'lost_reason', d.lost_reason,
        'owner_id', d.owner_id,
        'owner_name', dp.display_name,
        'created_at', d.created_at,
        'updated_at', d.updated_at
      ) order by d.created_at desc)
      from public.deals d
      join public.pipelines pl on pl.workspace_id=d.workspace_id and pl.id=d.pipeline_id
      join public.pipeline_stages ps on ps.workspace_id=d.workspace_id and ps.pipeline_id=d.pipeline_id and ps.id=d.stage_id
      left join public.profiles dp on dp.id=d.owner_id
      where d.workspace_id = c.workspace_id and d.contact_id = c.id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'description', t.description,
        'priority', t.priority,
        'status', t.status,
        'due_at', t.due_at,
        'completed_at', t.completed_at,
        'assignee_id', t.assignee_id,
        'assignee_name', ap.display_name,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) order by (t.status='completed'), t.due_at nulls last, t.created_at desc)
      from public.tasks t
      left join public.profiles ap on ap.id=t.assignee_id
      where t.workspace_id=c.workspace_id and t.entity_type='contact' and t.entity_id=c.id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'body', n.body,
        'created_by', n.created_by,
        'created_by_name', np.display_name,
        'created_at', n.created_at,
        'updated_at', n.updated_at
      ) order by n.created_at desc)
      from public.notes n
      left join public.profiles np on np.id=n.created_by
      where n.workspace_id=c.workspace_id and n.entity_type='contact' and n.entity_id=c.id
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(a.row_json order by a.created_at desc)
      from (
        select jsonb_build_object(
          'id', ac.id,
          'type', ac.type,
          'metadata', ac.metadata,
          'actor_id', ac.actor_id,
          'actor_name', actp.display_name,
          'created_at', ac.created_at
        ) as row_json,
        ac.created_at
        from public.activities ac
        left join public.profiles actp on actp.id=ac.actor_id
        where ac.workspace_id=c.workspace_id and ac.entity_type='contact' and ac.entity_id=c.id
        order by ac.created_at desc
        limit greatest(1, least(coalesce(p_activity_limit,50),200))
      ) a
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tg.id,
        'name', tg.name,
        'slug', tg.slug,
        'description', tg.description
      ) order by tg.name)
      from public.entity_tags et
      join public.tags tg on tg.workspace_id=et.workspace_id and tg.id=et.tag_id
      where et.workspace_id=c.workspace_id and et.entity_type='contact' and et.entity_id=c.id
    ), '[]'::jsonb),
    'custom_fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'definition_id', dfn.id,
        'key', dfn.key,
        'label', dfn.label,
        'field_type', dfn.field_type,
        'options', dfn.options,
        'is_required', dfn.is_required,
        'position', dfn.position,
        'value_id', cfv.id,
        'value', cfv.value
      ) order by dfn.position, dfn.label)
      from public.custom_field_definitions dfn
      left join public.custom_field_values cfv
        on cfv.workspace_id=dfn.workspace_id
       and cfv.definition_id=dfn.id
       and cfv.entity_type='contact'
       and cfv.entity_id=c.id
      where dfn.workspace_id=c.workspace_id
        and dfn.entity_type='contact'
        and dfn.status='active'
    ), '[]'::jsonb)
  )
  from public.contacts c
  join public.contact_360_summary s on s.workspace_id=c.workspace_id and s.id=c.id
  left join public.profiles op on op.id=c.owner_id
  where c.workspace_id=p_workspace_id
    and c.id=p_contact_id
    and private.is_workspace_member(p_workspace_id);
$function$;

revoke all on function public.get_contact_360(uuid,uuid,integer) from public;
revoke all on function public.get_contact_360(uuid,uuid,integer) from anon;
grant execute on function public.get_contact_360(uuid,uuid,integer) to authenticated;
