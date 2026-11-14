# Fluxo — Contato até Negócio

1. Criar contato no workspace ativo.
2. Opcionalmente associar empresa e marcar principal.
3. Aplicar tags e preencher custom fields válidos.
4. Criar lead ligado ao contato; registrar origem, score e owner.
5. Qualificar lead; ao converter, manter `converted_at` coerente.
6. Criar deal em pipeline/estágio do mesmo workspace.
7. Mover deal; banco sincroniza estado e cria activity.
8. Criar tarefas/notas relacionadas.
9. Fechar como won/lost; registrar timestamps e motivo de perda quando aplicável.
10. Conferir histórico no Contact 360 e audit técnico quando autorizado.

## Invariantes

Todas as relações carregam `workspace_id`; responsáveis são membros ativos; estágio pertence ao pipeline; nenhuma entidade externa pode ser referenciada.

