# ADR-001 — Supabase/PostgreSQL como backend

**Status:** Aceita

## Contexto

O CRM requer Auth, dados relacionais, regras transacionais, busca, APIs e segurança multi-tenant.

## Decisão

Usar Supabase como plataforma e PostgreSQL como núcleo canônico. Dados e regras críticas não dependem da persistência do frontend.

## Consequências

Benefícios: SQL, RLS, integridade, portabilidade e APIs. Custos: disciplina de migrations, segurança de grants e operação de dois ambientes.

