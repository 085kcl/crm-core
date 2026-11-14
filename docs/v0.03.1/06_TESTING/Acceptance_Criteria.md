# Critérios de Aceite

## Gate A — Segurança

- [ ] 19/19 tabelas públicas com RLS ativo.
- [ ] Anon não executa RPCs do CRM.
- [ ] Usuário A não lê, cria, altera ou exclui dados do Workspace B.
- [ ] FK/tag/custom field polimórfico cross-tenant falha.
- [ ] Viewer não escreve.
- [ ] Último owner ativo não pode ser removido/rebaixado.
- [ ] Bundle e variáveis não expõem `service_role`/secret.
- [ ] View exposta usa `security_invoker=true`.
- [ ] `outbox_events` permanece inacessível ao cliente.

## Gate B — Funcional

- [ ] Login → workspace → contato → lead → deal → mudança de estágio → tarefa/nota → fechamento funciona.
- [ ] Contact 360 retorna seções e métricas corretas.
- [ ] Busca encontra contact/company/lead/deal e respeita ranking/limite.
- [ ] Tags e custom fields persistem e aparecem no 360.
- [ ] Troca de workspace limpa busca, caches e seleção anterior.
- [ ] Activity e Audit são gerados para suas finalidades corretas.

## Gate C — Qualidade

- [ ] UI funciona em desktop, tablet e mobile.
- [ ] Estados loading/vazio/erro/sucesso são claros.
- [ ] Navegação por teclado e foco visível.
- [ ] Sem erros críticos em logs de auth/API/Postgres/Site.
- [ ] Advisors revisados e findings classificados.
- [ ] Performance testada com volume representativo antes de remover índices.

## Gate D — Release

- [ ] Migration e código estão no Git e correspondem ao FERNANDES.
- [ ] Testes locais e staging aprovados.
- [ ] Rollback/forward-fix documentado e provado.
- [ ] Aprovação explícita para produção.
- [ ] Mesmo artefato promovido em CLASSY.
- [ ] Smoke test pós-deploy aprovado.
- [ ] Work atualizado com versão, data e evidências.

