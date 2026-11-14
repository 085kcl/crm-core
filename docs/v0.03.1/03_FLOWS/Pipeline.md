# Fluxo — Pipeline

1. Owner/admin/manager cria ou edita pipeline.
2. Define estágios ordenados, probabilidade e estado (`open`, `won`, `lost`).
3. Apenas um pipeline padrão ativo por workspace.
4. Deal é criado em estágio válido do mesmo pipeline/workspace.
5. Movimento atualiza `stage_id`; trigger deriva `state` e timestamps.
6. Trigger registra `deal.stage_changed` em `activities` com origem/destino.
7. Interface atualiza Kanban e métricas sem contornar RLS.

## Rollback funcional

Movimento pode ser revertido para estágio anterior por operação autorizada, gerando nova activity; histórico não deve ser apagado.

