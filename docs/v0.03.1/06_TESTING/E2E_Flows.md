# Fluxos E2E

## E2E-001 — Jornada comercial

Login → selecionar Workspace A → criar contato → associar empresa → criar lead → qualificar → criar deal → mover estágio → criar tarefa/nota → fechar negócio → conferir Activity/Audit/Contact 360.

## E2E-002 — Busca e Contact 360

Pesquisar contato → abrir 360 → validar header, métricas, empresas, leads, deals, tarefas, notas, timeline, tags e custom fields → voltar à busca → abrir outra entidade.

## E2E-003 — Troca de tenant

Pesquisar no Workspace A → trocar para B → confirmar limpeza → repetir query → garantir ausência de resultados A → tentar URL direta do contato A → receber estado genérico.

## E2E-004 — RBAC

Repetir leitura/escrita/configuração com owner, admin, manager, operador e viewer; validar matriz e último owner.

## E2E-005 — Falhas

Sessão expirada, rede intermitente, RPC inválida, valor de custom field incorreto, vínculo cross-tenant e evento de outbox com falha. Confirmar mensagens seguras, retry controlado e ausência de corrupção.

## E2E-006 — Rollback

Aplicar release em ambiente descartável/branch ou staging controlado, executar smoke, aplicar plano compensatório/feature flag, executar novamente e comparar schema/contratos/dados.

