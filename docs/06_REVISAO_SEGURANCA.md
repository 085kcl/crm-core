# Revisão de Segurança — v0.01

## Controles implementados no schema

- RLS ativada em tabelas multi-tenant.
- Membership de workspace avaliada no banco.
- Papel `viewer` é somente leitura no banco.
- Exclusões de dados operacionais limitadas a owner/admin/manager.
- Admin não pode promover usuário a owner nem remover/demover owner.
- O último owner ativo de um workspace não pode ser removido/demovido.
- Chaves estrangeiras críticas incluem `workspace_id`, reduzindo referências cruzadas entre tenants.
- Owner/assignee de entidades precisa ser membro do mesmo workspace.
- Audit log é gerado por triggers no banco para entidades comerciais principais.
- Outbox não possui policy para clientes autenticados; deverá ser alimentada por código confiável/RPCs futuros.
- Funções `SECURITY DEFINER` têm `search_path` fixo.

## Controles que ainda dependem da aplicação

- permissões finas por domínio/ação;
- validação das referências polimórficas `entity_type/entity_id` em tasks, notes e activities;
- sanitização/validação de campos e formatos;
- rate limiting;
- políticas de sessão e MFA;
- autorização de exportações;
- proteção/mascaramento de dados sensíveis;
- retenção e anonimização LGPD;
- logging de IP/user-agent a partir de uma camada server-side confiável.

## Testes obrigatórios antes de produção

1. Criar Workspace A e Workspace B com usuários distintos.
2. Tentar SELECT cross-tenant usando SDK diretamente.
3. Tentar INSERT com `workspace_id` externo.
4. Tentar FK com ID de entidade pertencente a outro workspace.
5. Tentar UPDATE e DELETE cross-tenant.
6. Tentar mutação como viewer.
7. Tentar promover owner como admin.
8. Tentar remover o último owner.
9. Conferir audit log após INSERT/UPDATE/DELETE.
10. Verificar bundle do frontend para ausência de service-role e segredos.
