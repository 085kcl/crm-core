# Critérios de Aceite — CRM Core v0.01

## Segurança

- [ ] Usuário não autenticado não acessa dados.
- [ ] Usuário A não consulta dados do Workspace B.
- [ ] Usuário A não insere registro usando `workspace_id` de Workspace B.
- [ ] Usuário A não atualiza ou exclui registros de Workspace B.
- [ ] Nenhuma service-role key aparece no bundle do cliente.
- [ ] Erros não exibem SQL, tokens ou stack sensível.

## Funcional

- [ ] Criar workspace.
- [ ] Adicionar/visualizar membro conforme fluxo implementado.
- [ ] Criar contato.
- [ ] Criar empresa.
- [ ] Relacionar contato e empresa.
- [ ] Criar lead para contato.
- [ ] Criar pipeline e etapas.
- [ ] Criar negócio.
- [ ] Mover negócio entre etapas.
- [ ] Registrar atividade da mudança.
- [ ] Criar e concluir tarefa.
- [ ] Visualizar timeline relacionada.

## UX

- [ ] Navegação funciona em desktop e mobile.
- [ ] Cada tela possui loading, vazio, erro e sucesso.
- [ ] Tabelas suportam busca e filtros básicos.
- [ ] Kanban é utilizável por toque e mouse.

## Dados

- [ ] UUIDs como PK.
- [ ] UTC em timestamps.
- [ ] `workspace_id` presente em tabelas de negócio.
- [ ] índices de tenant configurados.
- [ ] RLS ativada nas tabelas multi-tenant.
