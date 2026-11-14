# Baseline de Migrations

**Verificação adicional, 09/09/2026:** as 13 migrations locais correspondem ao SQL aplicado no FERNANDES após normalização de quebras de linha/espaço externo. Evidência: `migration-verification-2026-09-09.json`. A pendência histórica de comparar conteúdo está resolvida; não houve nova DDL.

**Fonte aplicada:** Supabase FERNANDES, consultado em 04/09/2026.

| Ordem | Versão Supabase | Nome | Finalidade consolidada |
|---:|---|---|---|
| 001 | 20260829232954 | `crm_core_foundation` | entidades, enums, RLS e base CRM |
| 002 | 20260829233030 | `tenant_integrity_and_role_hardening` | integridade cross-tenant e RBAC |
| 003 | 20260829233102 | `database_audit` | audit log e triggers de auditoria |
| 004 | 20260829233131 | `domain_invariants_and_session_hardening` | invariantes, timestamps, owners e estágio |
| 005 | 20260829233148 | `private_security_functions` | helpers privileged movidos para `private` |
| 006 | 20260829233204 | `data_api_least_privilege` | grants mínimos na Data API |
| 007 | 20260829233402 | `private_function_least_privilege` | revogação/EXECUTE mínimo de funções privadas |
| 008 | 20260829234118 | `performance_hardening` | índices/FKs/performance |
| 009 | 20260831221538 | `polymorphic_entity_tenant_integrity` | validação de referências polimórficas |
| 010 | 20260901031048 | `crm_v003_tags_and_custom_fields` | tags, associações, definições e valores tipados |
| 011 | 20260901031202 | `crm_v003_search_and_contact_360` | FTS e view Contact 360 |
| 012 | 20260901031355 | `crm_v003_fk_index_hardening` | índices de FKs da v0.03 |
| 013 | 20260901032746 | `crm_v003_contact_360_rpc` | RPC final `get_contact_360` |

## Regra de baseline

As migrations aplicadas são imutáveis. Correções entram em migration nova. O Git deve conter o SQL integral das 13 entradas na mesma ordem. A indicação antiga de que 006–013 precisavam ser recuperadas foi superada pela verificação de 09/09 e pela [revalidação de 24/09](../06_TESTING/DP-CRM-017-status-2026-09-24.md): os 13 corpos SQL estão no checkout; 001–008 foram renomeadas para as versões remotas, sem alterar SQL. Ainda precisam ser integradas ao Git por commit/review. O banco prova o que foi aplicado; não substitui a fonte executável no Git.

## Verificação antes de nova migration

- comparar lista/ordem Git ↔ FERNANDES;
- registrar checksum e responsável;
- verificar que CLASSY está no baseline de produção esperado;
- aplicar somente em FERNANDES;
- executar testes e advisors;
- preparar rollback ou forward-fix;
- promover o mesmo arquivo em CLASSY.
