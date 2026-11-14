# Estratégia de Regressão

## Pirâmide

1. **SQL/constraints:** RLS, helpers, triggers, FKs, checks, funções e views.
2. **Contrato/API:** RPCs e rotas server-side com JWTs/papéis distintos.
3. **Componentes:** estados, formulários, acessibilidade e troca de workspace.
4. **E2E:** ciclo comercial e cenários cross-tenant.
5. **Operacional:** deploy, logs, advisors e rollback.

## Matriz mínima de identidades

- anon;
- usuário A owner do Workspace A;
- usuário B viewer do Workspace A;
- usuário C owner do Workspace B;
- token expirado/revogado.

## Dados de teste

Usar apenas dados fictícios/anonimizados no FERNANDES. Seeds devem gerar dois workspaces, usuários/papéis, contatos e IDs cruzados destinados a testes negativos. Seeds são proibidos em CLASSY fora de processo controlado.

## Quando executar

- PR: unit/SQL/contrato afetado;
- merge: suíte completa local;
- staging: SQL + API + E2E + security + advisors;
- produção: smoke não destrutivo;
- mensal: revisão de segurança somente leitura.

## Evidências

Registrar commit, migration, ambiente, data, executor, resultado, logs relevantes e decisão sobre findings. Falha cross-tenant bloqueia a release.

