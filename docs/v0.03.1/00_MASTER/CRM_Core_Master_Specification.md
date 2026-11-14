# CRM Core — Especificação Mestre

**Versão:** v0.03.1  
**Data-base:** 04/09/2026  
**Status:** baseline documental oficial

## 1. Propósito

O CRM Core é uma plataforma proprietária, multiempresa e API-first para administrar o ciclo comercial de contatos, empresas, leads, pipelines, negócios, tarefas, notas e atividades. O produto deve permanecer portável: a interface pode evoluir ou ser substituída, enquanto dados, autorização, integridade, auditoria e contratos críticos permanecem no Supabase/PostgreSQL e no histórico versionado do Git.

## 2. Objetivos

- centralizar informação comercial sem dependência de CRMs terceiros;
- permitir múltiplos workspaces isolados no mesmo banco;
- executar o fluxo contato → lead → negócio → pipeline → fechamento;
- oferecer visão 360° do contato e busca global;
- permitir extensão por tags e campos customizados sem alterar tabelas a cada requisito;
- manter rastreabilidade técnica e histórica;
- preparar integrações assíncronas, automações, analytics e IA sem acoplá-las à transação principal.

## 3. Escopo funcional atual

### Fundação

Autenticação Supabase, perfil, workspace, membership, papéis, seleção de workspace, criação de workspace, sessão server-side, dashboard inicial, auditoria e outbox.

### CRM

Contatos, empresas, vínculo contato-empresa, leads, pipelines, estágios, negócios, tarefas, notas e atividades.

### v0.03

Tags multi-entidade, custom fields tipados, busca global PostgreSQL FTS, view `contact_360_summary`, RPC `search_crm`, RPC `get_contact_360` e interface de Contato 360°/Busca Global publicada no Site.

## 4. Limites atuais

- staging ainda sem carga operacional representativa;
- v0.03 não introduz tabelas além das quatro previstas para tags/custom fields;
- integrações de WhatsApp/e-mail, automação externa e IA permanecem fora do baseline atual;
- analytics avançado, billing, white-label e administração global permanecem em roadmap;
- autorização por domínio/ação é uma evolução futura; o baseline usa RBAC por papel e helpers de capacidade.

## 5. Arquitetura oficial

| Camada | Responsabilidade |
|---|---|
| ChatGPT Sites/Work | frontend inicial, UX, publicação e iteração |
| Rotas server-side | sessão, cookies, seleção de workspace, chamadas seguras |
| Supabase Auth | identidade e JWT |
| Data API/RPC | contratos de acesso ao banco |
| PostgreSQL | dados canônicos, integridade, FTS, views, triggers |
| RLS + RBAC | isolamento do tenant e autorização |
| `activities` | histórico comercial visível ao usuário |
| `audit_logs` | trilha técnica/administrativa sensível |
| `outbox_events` | fila privada para integrações futuras |

## 6. Tenancy e autorização

O tenant operacional é o `workspace`. Todas as tabelas de negócio possuem `workspace_id NOT NULL`. Consultas e relações devem carregar o workspace explicitamente. O frontend nunca é fonte de autorização: o banco valida membership ativo, papel, RLS e integridade cross-tenant.

Papéis atuais: `owner`, `admin`, `manager`, `sales`, `marketing`, `finance`, `support`, `viewer`.

Capacidades atuais:

- leitura: membro ativo;
- escrita operacional: todos os papéis, exceto `viewer`;
- configuração e exclusão: `owner`, `admin`, `manager`;
- auditoria: papéis administrativos autorizados pelas policies;
- gestão de membros: owner/admin conforme policy e invariantes;
- último owner ativo não pode ser removido, inativado ou rebaixado.

## 7. Modelo de dados consolidado

O schema público contém 19 tabelas com RLS: `profiles`, `workspaces`, `workspace_members`, `contacts`, `companies`, `contact_companies`, `leads`, `pipelines`, `pipeline_stages`, `deals`, `tasks`, `notes`, `activities`, `audit_logs`, `outbox_events`, `tags`, `entity_tags`, `custom_field_definitions` e `custom_field_values`.

A view `public.contact_360_summary` usa `security_invoker=true`. Campos `search_document` do tipo `tsvector` existem em contatos, empresas, leads e negócios.

## 8. Regras de domínio essenciais

1. Um registro de negócio pertence a exatamente um workspace.
2. Nenhuma FK lógica ou física pode atravessar workspaces.
3. Owner/assignee precisa ser membro ativo do mesmo workspace.
4. Um workspace deve manter ao menos um owner ativo.
5. Um contato pode se relacionar a várias empresas, com no máximo uma principal.
6. Um workspace pode ter no máximo um pipeline padrão ativo.
7. O estado do negócio é sincronizado com o estado do estágio.
8. Mudança de estágio gera `deal.stage_changed` em `activities`.
9. Conclusão de tarefa e conversão de lead mantêm timestamps coerentes.
10. Tags e custom fields validam que a entidade referenciada pertence ao mesmo workspace.
11. Custom fields aceitam apenas valor compatível com seu tipo e opções.
12. Alterações sensíveis devem ser auditáveis.
13. Integrações externas futuras usam outbox e idempotência; não executam dentro da transação principal.

## 9. Contratos públicos atuais

- `public.create_workspace(p_name text, p_slug text) returns uuid`;
- `public.search_crm(p_workspace_id uuid, p_query text, p_limit integer default 20)`;
- `public.get_contact_360(p_workspace_id uuid, p_contact_id uuid, p_activity_limit integer default 50) returns jsonb`.

Todos negam execução a `anon`. `search_crm` e `get_contact_360` são invoker, estáveis e verificam membership. `create_workspace` é `SECURITY DEFINER` deliberada, restrita a `authenticated`, com `search_path=''` e checagem de `auth.uid()`.

## 10. Segurança obrigatória

- somente URL e publishable key podem chegar ao cliente;
- `service_role`, secret keys, senhas de banco e tokens administrativos nunca entram no frontend ou no repositório;
- RLS permanece ativa em toda tabela exposta;
- views expostas usam `security_invoker=true`;
- funções privileged ficam no schema `private`, com `search_path` fixo e execução mínima;
- `outbox_events` permanece sem policies públicas, acessível apenas a worker/backend autorizado;
- erros cross-tenant não revelam existência de UUID externo;
- alterações de schema ocorrem apenas por migration versionada;
- produção não recebe seeds, resets ou DDL exploratório.

## 11. Estado validado

- Site `CRM Core`: publicado em `https://crm-core.nicolauflamel.chatgpt.site`, versão 5;
- Supabase FERNANDES: ativo e saudável, PostgreSQL 17;
- 13 migrations aplicadas;
- 19 tabelas públicas com RLS habilitado;
- RPCs e view v0.03 presentes;
- validação anterior: 8/8 testes da v0.03 aprovados, inclusive isolamento e rollback;
- CLASSY permaneceu sem alterações durante a validação v0.03.

## 12. Critério de conclusão de uma mudança

Uma mudança só está concluída quando: requisito e ADR/packet foram aprovados; código e migration estão no Git; testes locais e de staging passaram; advisors foram revisados; rollback foi provado ou documentado; produção foi promovida a partir do mesmo artefato; smoke test passou; e o Work recebeu o novo baseline.

