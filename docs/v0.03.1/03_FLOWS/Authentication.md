# Fluxo — Autenticação

1. Usuário informa credenciais em `/`.
2. Rota server-side autentica no Supabase Auth.
3. Tokens são mantidos em sessão/cookies seguros; segredo privilegiado não participa.
4. Aplicação carrega workspaces autorizados pelo JWT + RLS.
5. Sem workspace selecionado, usuário segue para `/workspaces`.
6. Sessão expirada tenta refresh; falha limpa sessão e retorna ao login.
7. Logout invalida estado local/cookies e redireciona.
8. Recuperação envia fluxo oficial do Supabase sem revelar se o e-mail existe.

## Aceite

Login válido entra; inválido mostra erro genérico; rota protegida sem sessão redireciona; refresh preserva sessão; logout impede reuso; nenhum token privileged aparece no cliente.

