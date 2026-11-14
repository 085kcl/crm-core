# CRM Core — Histórico de Versões

| Versão | Data | Estado | Conteúdo principal |
|---|---:|---|---|
| v0.01 | 28/08/2026 | baseline | schema CRM, tenancy, RLS, RBAC inicial, atividades, auditoria, outbox e migrations 001–003 |
| v0.02 | 29/08/2026 | validada em staging | frontend executável, auth/sessão/workspace, dashboard, rotas server-side e hardening 004–008 |
| v0.03 | 01/09/2026 | publicada/validada | Tags, Custom Fields, PostgreSQL FTS, Busca Global, Contact 360, migrations 009–013 e interface publicada |
| v0.03.1 | 04/09/2026 | documentação oficial | consolidação mestre, ADRs, packets, baseline de migrations, contratos, testes e roadmap |
| v0.04 | futura | planejada | analytics e dashboards operacionais |

## Releases do Site

09/09/2026 — Complemento local da v0.03.1: edição de tags/campos no Contact 360, testes de tipos/API e reconciliação das 13 migrations. Ver `../IMPLEMENTATION_2026-09-09.md`. Não constitui nova versão publicada.

O Site possui cinco versões salvas. A versão 5 é a publicação corrente. O código deve ser preservado no Git; versões do Site são evidência de deploy, não substituem o repositório.

## Regra de versionamento

- MAJOR: quebra deliberada de contrato ou mudança estrutural incompatível;
- MINOR: capacidade funcional compatível;
- PATCH: correção, hardening ou documentação sem quebra de contrato.

Toda versão altera este arquivo, `Current_State`, packets afetados e, quando necessário, ADRs/contratos.
