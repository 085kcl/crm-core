# ADR-006 — Custom Fields tipados

**Status:** Aceita

## Decisão

Usar definições e valores separados, valor em JSONB validado no banco por enum de tipos e opções.

## Consequências

Permite extensibilidade sem DDL por campo, preservando tipagem. Consultas complexas podem exigir índices e materialização futura.

