# Contratos de API e RPC

## Regras gerais

- autenticação obrigatória por JWT;
- enviar `p_workspace_id` explicitamente;
- resposta cross-tenant deve ser vazia/genérica;
- não usar `service_role` no frontend;
- mudança incompatível exige nova versão/ADR e atualização dos consumidores.

## `public.create_workspace`

```text
create_workspace(p_name text, p_slug text) → uuid
```

Cria workspace e membership `owner` do usuário autenticado em uma operação. `SECURITY DEFINER`, `search_path=''`, `anon` sem EXECUTE, `authenticated` com EXECUTE. Erros esperados incluem autenticação ausente, slug inválido/duplicado e constraints de nome.

## `public.search_crm`

```text
search_crm(p_workspace_id uuid, p_query text, p_limit integer = 20)
→ table(entity_type text, entity_id uuid, title text, subtitle text, rank real)
```

Entidades: `contact`, `company`, `lead`, `deal`. Usa `websearch_to_tsquery('simple', ...)`, ranking FTS e fallbacks. `p_limit` é limitado entre 1 e 100. Query vazia retorna lista vazia. Exige membership ativa no workspace.

Exemplo de chamada:

```ts
supabase.rpc('search_crm', {
  p_workspace_id: activeWorkspaceId,
  p_query: query,
  p_limit: 20,
})
```

## `public.get_contact_360`

```text
get_contact_360(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_activity_limit integer = 50
) → jsonb
```

Retorna:

```text
{
  contact,
  owner,
  companies[],
  leads[],
  deals[],
  tasks[],
  notes[],
  activities[],
  tags[],
  custom_fields[]
}
```

`contact` inclui métricas da view: `company_count`, `lead_count`, `open_deal_count`, `won_deal_count`, `lost_deal_count`, `open_pipeline_value`, `open_task_count`, `overdue_task_count`, `tag_count`, `custom_field_count`, `last_activity_at`. `p_activity_limit` é limitado a 1–200. Contato ausente ou externo retorna `null`.

## Rotas frontend/server-side já registradas na v0.02

- `POST /api/auth/login`;
- `POST /api/auth/logout`;
- `POST /api/auth/recover`;
- `POST /api/auth/refresh`;
- `GET/POST /api/workspaces`;
- `GET/PATCH /api/workspaces/current`;
- `POST /api/workspaces/select`.

O contrato HTTP detalhado deve ser gerado do código Git corrente antes de alteração. O banco continua sendo a autoridade de autorização.

