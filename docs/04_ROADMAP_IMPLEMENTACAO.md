# Roadmap de Implementação — Work/Sites

## Incremento 0 — Fundação visual
- shell da aplicação;
- sidebar;
- topbar;
- design tokens;
- rotas;
- estados loading/error/empty.

## Incremento 1 — Autenticação e tenancy
- Supabase Auth;
- perfil;
- seletor de workspace;
- criação inicial de workspace;
- contexto de workspace;
- proteção de rotas.

## Incremento 2 — Contatos e empresas
- CRUD de contatos;
- CRUD de empresas;
- relação contato-empresa;
- filtros e busca;
- detalhe 360° inicial.

## Incremento 3 — Leads
- cadastro;
- qualificação;
- score manual;
- responsável;
- conversão futura para negócio.

## Incremento 4 — Pipeline e negócios
- configuração de pipeline;
- etapas;
- deals;
- Kanban;
- drag-and-drop;
- activity `deal.stage_changed`.

## Incremento 5 — Operações
- tarefas;
- notas;
- timeline;
- atividades recentes.

## Incremento 6 — Dashboard
- KPIs operacionais;
- funil;
- pipeline value;
- tarefas vencidas;
- últimas atividades.

## Incremento 7 — Endurecimento
- revisão de RLS;
- testes de cross-tenant;
- tratamento de erros;
- validação de inputs;
- auditoria;
- performance inicial.

## Saída da v0.01

O CRM deve ser utilizável por pelo menos dois workspaces independentes sem vazamento de dados e permitir executar um fluxo completo: contato -> lead -> negócio -> mudança de etapa -> tarefa -> histórico.
