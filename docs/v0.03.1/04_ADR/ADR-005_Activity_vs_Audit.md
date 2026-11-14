# ADR-005 — Activity Log separado de Audit Log

**Status:** Aceita

## Decisão

`activities` registra narrativa comercial exibível; `audit_logs` registra mutações técnicas/administrativas e before/after.

## Consequências

Não unificar tabelas nem usar activity como prova de auditoria. Audit exige acesso mais restrito, retenção e cuidado com PII.

