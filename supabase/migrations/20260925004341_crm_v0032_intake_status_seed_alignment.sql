-- CRM Core v0.03.2 — align initial intake status seeds with DP-CRM-020 frozen workflow.

update public.intake_statuses s
set inbox_bucket='in_progress'
from public.workspaces w
where s.workspace_id=w.id
  and w.slug in ('classy','fernandes')
  and s.key='awaiting_documents'
  and s.inbox_bucket is distinct from 'in_progress';

update public.intake_statuses s
set is_terminal=false,
    inbox_bucket='in_progress'
from public.workspaces w
where s.workspace_id=w.id
  and w.slug='fernandes'
  and s.key='contracted'
  and (s.is_terminal or s.inbox_bucket is distinct from 'in_progress');
