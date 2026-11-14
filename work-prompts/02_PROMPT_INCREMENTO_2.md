# Work Prompt — Incremento 2: Contatos + Empresas

Implemente Contatos e Empresas conforme o schema do projeto.

Requisitos:
- CRUD de contatos respeitando o workspace ativo;
- CRUD de empresas respeitando o workspace ativo;
- relação contato-empresa;
- listagens com busca e filtros básicos;
- detalhe de contato com visão geral, empresas relacionadas, notas/tarefas em placeholder e timeline inicial;
- detalhe de empresa com contatos relacionados;
- created_by/updated_by preenchidos quando aplicável;
- tratamento correto de erros de RLS;
- nenhuma query pode confiar apenas no workspace selecionado pela UI; o backend/RLS deve rejeitar cross-tenant.

Crie também um pequeno conjunto de dados de demonstração apenas para ambiente de desenvolvimento, nunca inserido automaticamente em produção.
