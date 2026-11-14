# ADR-004 — Outbox Pattern

**Status:** Aceita

## Decisão

Persistir eventos de integração em `outbox_events` na mesma transação do estado. Worker processará depois com idempotência e retentativas.

## Consequências

Falhas externas não quebram a transação principal. A tabela permanece privada, sem policy cliente; somente backend/worker autorizado a processa.

