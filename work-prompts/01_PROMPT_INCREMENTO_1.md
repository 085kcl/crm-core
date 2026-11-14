# Work Prompt — Incremento 1: Fundação visual + Auth + Workspace

Usando a Especificação Mestre do projeto, implemente apenas o Incremento 1.

1. Crie shell responsivo com sidebar, topbar e rotas.
2. Crie telas: Login, Recuperar senha, Selecionar workspace, Dashboard vazio/placeholder, Configurações > Workspace.
3. Integre Supabase Auth sem usar service-role key no cliente.
4. Após login, consulte os workspaces disponíveis por membership.
5. Se o usuário não tiver workspace, permita criar um usando a RPC `create_workspace(name, slug)`.
6. Mantenha o workspace ativo em estado de sessão da aplicação; não use localStorage como prova de autorização.
7. Proteja telas internas para usuários autenticados.
8. Implemente estados de loading, erro, vazio e acesso negado.
9. Não implemente ainda contatos, empresas, leads ou pipeline além de itens de navegação desabilitados/placeholder.
10. Ao final, faça uma revisão de segurança e liste qualquer ponto que dependa de configuração externa do Supabase.
