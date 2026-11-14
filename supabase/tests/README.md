# Testes de aceite do banco

Execute `rls_smoke.sql` para a fundação multi-tenant e `crm_v003_smoke.sql` para o Contact 360 e a busca global, sempre em um projeto Supabase de teste.

Os dois scripts abrem uma transação, criam fixtures, validam asserções e executam `rollback` ao final. O teste v0.03 cobre payload agregado, métricas, ordenação da timeline, busca por canais, identificação de entidades, isolamento cross-tenant e privilégios dos RPCs.

Checklist manual complementar:

1. Crie dois usuários e dois workspaces independentes.
2. Confirme que cada usuário enxerga apenas seus workspaces e registros.
3. Tente `SELECT`, `INSERT`, `UPDATE` e `DELETE` cross-tenant pelo SDK com a anon key.
4. Tente associar contato, empresa, lead, pipeline, etapa e negócio entre workspaces diferentes.
5. Confirme que `viewer` não modifica dados.
6. Confirme que admin não promove ou remove owner e que o último owner não pode ser removido.
7. Tente atribuir owner/assignee inativo e confirme a rejeição.
8. Mova um negócio entre etapas e confira `state`, `closed_at` e a activity `deal.stage_changed`.
9. Conclua/reabra uma tarefa e confira `completed_at`.
10. Converta/reabra um lead e confira `converted_at`.
11. Confirme que activities não podem ser alteradas ou excluídas pelo cliente.
12. Verifique o audit log como owner/admin e confirme sua ausência para outros papéis.

Registre resultados, usuário, workspace, horário UTC e erro retornado para cada tentativa.
