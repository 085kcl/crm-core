# ADR-002 — Multi-tenancy por workspace

**Status:** Aceita

## Decisão

Adotar pool model: mesmas tabelas, registros separados por `workspace_id`, membership ativa, RLS e FKs tenant-aware.

## Consequências

Simplifica evolução e permite vários clientes por projeto, mas exige `workspace_id` em toda query/relação e testes cross-tenant obrigatórios.

