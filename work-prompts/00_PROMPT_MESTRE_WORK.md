# PROMPT MESTRE — CRM CORE v0.01

Crie um aplicativo CRM empresarial responsivo chamado provisoriamente **CRM Core** usando ChatGPT Sites, com foco inicial em desktop, mas funcionando bem em tablets e celulares.

## Princípio arquitetural

O ChatGPT Site é a camada de experiência do MVP. O banco canônico e a autenticação devem permanecer no Supabase/PostgreSQL. Não use armazenamento local do navegador como fonte canônica para dados de CRM. LocalStorage pode ser usado apenas para preferências não sensíveis de interface.

## Requisitos inegociáveis

1. Multiempresa por `workspace_id`.
2. Usuário autenticado só pode acessar workspaces dos quais é membro.
3. Dados operacionais devem respeitar isolamento de tenant por PostgreSQL Row-Level Security.
4. Não expor Supabase service-role key no cliente.
5. Toda mutação crítica deve gerar `activity` e/ou `audit_log` quando aplicável.
6. Todos os IDs devem ser UUID.
7. Timestamps em UTC no banco e convertidos para o fuso do usuário na interface.
8. Interface não deve codificar pipelines específicos de um único negócio; pipeline e etapas são configuráveis.
9. O frontend deve ser desacoplado do banco por uma camada de serviços/repositórios, mesmo quando usar o SDK do Supabase.
10. Erros devem ser tratados com mensagens claras e sem expor detalhes internos, SQL ou segredos.

## Design

Visual B2B moderno, sóbrio e limpo. Priorizar legibilidade, densidade controlada e navegação rápida.

Estrutura principal:
- sidebar recolhível;
- topbar com workspace atual, busca global, notificações e perfil;
- conteúdo com breadcrumbs;
- cards discretos;
- tabelas com filtros, ordenação, busca e paginação;
- estados vazios úteis;
- skeleton loading;
- toasts para feedback de ações.

Não adotar cores de marca definitivas nesta fase. Estruture tokens de design para que branding possa ser alterado depois.

## Navegação v0.01

- Visão geral
- Contatos
- Empresas
- Leads
- Pipeline
- Negócios
- Tarefas
- Atividades
- Configurações
  - Workspace
  - Usuários e papéis
  - Pipelines

## Tela de login

- e-mail e senha;
- opção de recuperar senha;
- preparar layout para MFA;
- após login, carregar workspaces disponíveis;
- se houver um workspace, entrar nele;
- se houver mais de um, permitir seleção;
- se não houver, oferecer criação de workspace quando permitido.

## Dashboard

Criar versão inicial com:
- novos leads no período;
- negócios abertos;
- negócios ganhos;
- valor total do pipeline;
- tarefas vencidas;
- funil por etapa;
- últimas atividades.

Os cards devem trabalhar com dados reais do backend; usar mock somente enquanto a conexão não estiver disponível, deixando claramente marcado no código e interface de desenvolvimento.

## Contatos

Listagem com:
- nome;
- empresa principal;
- e-mail;
- telefone;
- responsável;
- status;
- tags;
- última atividade.

Detalhe 360° com abas:
- visão geral;
- atividades;
- negócios;
- notas;
- tarefas.

## Empresas

Listagem e detalhe com:
- razão/nome;
- nome fantasia;
- documento fiscal;
- website;
- segmento;
- responsável;
- contatos relacionados;
- negócios relacionados.

## Leads

Lead representa uma oportunidade de entrada/qualificação e referencia um contato. Um contato pode gerar mais de um lead ao longo do tempo.

Campos iniciais:
- contato;
- origem;
- responsável;
- score 0–100;
- status;
- qualificação;
- data de criação;
- data de conversão.

## Pipeline

Kanban configurável por pipeline.
Cada etapa possui:
- nome;
- posição;
- probabilidade padrão;
- tipo aberto/ganho/perdido;

Cards do negócio:
- título;
- contato/empresa;
- valor;
- responsável;
- idade na etapa;
- próxima tarefa.

Drag-and-drop deve atualizar a etapa e registrar atividade `deal.stage_changed`.

## Tarefas

- título;
- responsável;
- entidade relacionada;
- prioridade;
- status;
- vencimento;
- conclusão.

## Atividades

Timeline unificada para eventos comerciais. Tipos mínimos:
- contact.created;
- contact.updated;
- lead.created;
- lead.converted;
- deal.created;
- deal.stage_changed;
- task.created;
- task.completed;
- note.created.

## Segurança de interface

O frontend pode esconder controles conforme o papel, mas isso nunca deve ser tratado como autorização suficiente. A autorização efetiva deve ocorrer no backend/RLS.

## Estados obrigatórios em toda tela

- loading;
- vazio;
- erro recuperável;
- sem permissão;
- sucesso após mutação.

## Entrega inicial

Primeiro gere a estrutura navegável e o design system. Em seguida conecte autenticação e workspace. Depois implemente Contatos e Empresas. Não tente construir IA, WhatsApp, billing, campanhas ou automações avançadas nesta versão.

Antes de cada mudança estrutural importante, preserve compatibilidade com o schema descrito na especificação do projeto.
