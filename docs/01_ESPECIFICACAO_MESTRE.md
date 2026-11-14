# Especificação Mestre — CRM Core v0.01

## 1. Propósito

Criar um CRM proprietário, multiempresa e API-first, cujo frontend inicial pode ser desenvolvido e hospedado via ChatGPT Work/Sites, mantendo o backend e os dados canônicos independentes.

## 2. Objetivos do produto

- substituir progressivamente CRMs SaaS generalistas nas funções essenciais;
- centralizar contatos, empresas, leads, negócios, tarefas e histórico;
- permitir múltiplos workspaces;
- suportar negócios distintos sem regras hardcoded;
- permitir integração futura com sites, formulários, WhatsApp, e-mail, automação e IA;
- permitir migração futura de interface sem migrar o núcleo de dados.

## 3. Não objetivos da v0.01

- automação visual completa;
- campanhas de marketing;
- omnichannel;
- billing SaaS;
- marketplace;
- IA de scoring;
- aplicativo Android nativo;
- data warehouse dedicado.

## 4. Arquitetura

Arquitetura preferencial: monólito modular na camada de aplicação + PostgreSQL compartilhado com isolamento por tenant.

Fluxo:

```text
ChatGPT Work/Sites
       |
       v
UI + camada de serviços
       |
       v
Supabase Auth / API
       |
       v
PostgreSQL + RLS
       |
       +--> Storage
       +--> Outbox
       +--> Workers/n8n (futuro)
```

## 5. Tenancy

O tenant operacional é `workspace`.

Toda tabela de negócio deve possuir `workspace_id NOT NULL`.

O isolamento primário é feito por RLS. O aplicativo também deve verificar membership e papel antes de permitir ações.

## 6. Identidade e autorização

- identidade de login: `auth.users` do Supabase;
- perfil da aplicação: `profiles`;
- associação a empresa: `workspace_members`;
- papéis básicos v0.01: owner, admin, manager, sales, marketing, finance, support, viewer;
- autorização fina permanece na camada de aplicação nesta versão;
- RLS garante isolamento de tenant independentemente da UI.

## 7. Domínios funcionais

### Foundation
Auth, profiles, workspaces, members, tenancy, audit, outbox.

### CRM
Contacts, companies, leads, deals.

### Sales
Pipelines, stages, Kanban.

### Operations
Tasks, notes, activities.

### Platform
Settings, search, API, webhooks futuros.

## 8. Regras de domínio

1. Contato é a entidade pessoa; lead é um processo de entrada/qualificação.
2. Um contato pode possuir vários leads históricos.
3. Um negócio pertence a exatamente um pipeline e uma etapa.
4. Etapas são ordenadas dentro do pipeline.
5. Pipelines não podem ser específicos de uma empresa no código; são dados configuráveis.
6. Alterar etapa de negócio deve registrar atividade.
7. Alterações sensíveis devem ser auditáveis.
8. Exclusão física deve ser evitada para entidades comerciais relevantes; preferir arquivamento/soft delete em versões posteriores.
9. Valores monetários usam `numeric`, nunca float.
10. Datas são persistidas em UTC.

## 9. API-first

Toda funcionalidade importante deve poder ser exposta futuramente sob `/api/v1`, mesmo que a v0.01 utilize diretamente SDK/queries server-side.

Recursos planejados:
- contacts;
- companies;
- leads;
- deals;
- pipelines;
- tasks;
- activities.

## 10. Observabilidade

Desde o início:
- erros de aplicação estruturados;
- audit log para ações administrativas/sensíveis;
- activity log para histórico comercial;
- outbox para eventos de integração;
- correlation/request id quando API própria for adicionada.

## 11. Privacidade e segurança

- princípio do menor privilégio;
- RLS em todas as tabelas multi-tenant;
- segredos apenas no servidor;
- service-role jamais no cliente;
- validação de entrada;
- proteção contra enumeração entre tenants;
- logs não devem armazenar senhas/tokens;
- exportação e retenção de dados devem ser planejadas para LGPD.

## 12. Portabilidade

O frontend não é fonte canônica. A aplicação deve poder migrar de ChatGPT Sites para outro frontend sem alteração semântica das tabelas principais.
