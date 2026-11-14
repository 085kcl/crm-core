# Arquitetura Técnica — v0.01

## Estilo

Monólito modular + banco PostgreSQL compartilhado multi-tenant.

## Camadas

```text
[Presentation]
ChatGPT Site

[Application]
Auth context
Workspace context
Services
Validation
Authorization

[Data]
Supabase client/server
PostgreSQL
RLS

[Async - posterior]
Outbox -> Worker/n8n -> Providers
```

## Fronteiras dos módulos

- identity
- tenancy
- contacts
- companies
- leads
- pipelines
- deals
- tasks
- notes
- activities
- audit
- integrations

Nenhum módulo deve acessar tabelas de outro módulo de forma arbitrária; regras cruzadas devem passar por serviços de aplicação.

## Estratégia de multi-tenancy

Pool model: mesmas tabelas, registros separados por `workspace_id`.

### Defesa em profundidade

1. usuário autenticado;
2. workspace selecionado pertence ao usuário;
3. ação permitida pelo papel;
4. query é filtrada por `workspace_id`;
5. RLS valida novamente o tenant no banco.

## Decisão de segurança RLS

RLS v0.01 protege isolamento por workspace. Permissões granulares por ação são verificadas na camada de aplicação. Não incorporar regras comerciais complexas às policies nesta fase para evitar policies frágeis e de difícil manutenção.

## Chaves e segredos

No cliente:
- URL pública Supabase;
- anon/publishable key.

Somente servidor seguro:
- service-role;
- secrets de webhooks;
- credenciais SMTP/Meta;
- chaves de IA.

## Dados assíncronos

Eventos externos futuros não devem ser disparados dentro da transação principal. A transação grava o estado e um `outbox_event`; worker processa o evento depois.

## Estratégia de migração de frontend

O frontend pode ser substituído por Next.js, app Android ou outra aplicação, desde que consuma o mesmo modelo de dados/API.
