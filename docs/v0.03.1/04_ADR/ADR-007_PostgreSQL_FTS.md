# ADR-007 — PostgreSQL Full Text Search

**Status:** Aceita

## Decisão

Usar `tsvector`, GIN, `websearch_to_tsquery` e ranking dentro do PostgreSQL; combinar fallbacks para identificadores.

## Consequências

Busca centralizada, tenant-aware e sem serviço adicional. O idioma `simple` evita stemming inadequado no baseline; evolução linguística exige benchmark.

