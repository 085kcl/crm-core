# CRM Core — checkpoint operacional de 14/11/2026

## Destinos oficiais

- Código: https://github.com/085kcl/crm-core
- Backend: `kyhxgxogokwnblsxzxjo` / CRM-CORE, ACTIVE_HEALTHY.
- GitHub antigo apenas fonte histórica; Supabase antigo não foi utilizado como destino.

## GitHub e runtime

O main inicialmente continha somente MIGRATION_ORIGIN.md, commit `2926895a016ed141652b13f7cdc246b8a7fe8403`. Importação concluída no commit `dd425bdbdfbb87a82d23236b80e9732931e9d514`: 287 arquivos e modos Git idênticos ao baseline histórico `998e395037bdf3915c89c9c1540764104b6637ab`, mais o marcador inicial preservado. Verificação remota: zero divergências.

Importação por objetos Git via conexão 085kcl. Sem autenticação Git local, os pais históricos não foram transferidos. O novo commit descende do marcador novo, não do commit histórico. Nenhum force push.

CI novo: https://github.com/085kcl/crm-core/actions/runs/43612925419 — verify e container SUCCESS. Inclui npm ci, typecheck, lint, build, 32 testes Node, standalone isolado, Docker build/boot, smoke e HEALTHY. Node do CI/container: 22.13.0; Vinext: 0.1.0. Verificação adicional local Node 24.22.1: typecheck, lint (2 warnings preexistentes), builds, 32 testes, standalone isolado e smoke PASS (29 assets, API 401, duas páginas 200). Nenhuma dependência alterada.

Deploy continua manual com confirmação `deploy-staging` e environment hostinger-staging. Importação/CI não dispara deploy. Não houve merge nos PRs históricos ou alteração CLASSY.

## Banco e reconciliação

Ver matriz em SUPABASE-BASELINE-2026-11-14.md. Permanecem 33 migrations aplicadas e 30 tabelas públicas com RLS. Nenhuma migration reaplicada, nenhum schema gerenciado substituído, nenhum grant/índice/política alterado.

Backup utilizado: db_cluster-16-10-2026@08-59-04.backup.gz.
SHA-256: `f6f498036760f8d148d0d95b7a9876442ecc39c2f5067eff172844d66dbc0c24`.

Importação seletiva de 164 registros de origem, com allowlist de 27 tabelas (inclui tabelas vazias), ordem de FKs, trava transacional e rejeição de destino não vazio. Ensaio completo com ROLLBACK passou; destino vazio reconfirmado antes de COMMIT. RLS, triggers, constraints e verificações de contagem permaneceram ativos.

Preservados e conferidos IDs/chaves:

| Objeto | Quantidade |
|---|---:|
| auth.users / auth.identities / profiles | 2 / 2 / 2 |
| workspaces / workspace_members | 2 / 3 |
| contacts / leads | 1 / 1 |
| pipelines / pipeline_stages | 2 / 20 |
| tags / custom_field_definitions | 12 / 18 |
| intake_statuses / intake_form_configs | 17 / 2 |
| intake_reference_counters | 1 |
| intake_requests / integration_links / intake_status_history | 5 / 5 / 5 |
| audit_logs históricos | 64 |

Audit logs total: 128, sendo 64 históricos com IDs preservados e 64 gerados pelos triggers durante a importação. Profiles criados pelo trigger Auth foram atualizados com os dados históricos; updated_at reflete a importação pelo trigger existente. Hashes de senha preservados; tokens efêmeros antigos limpos. Sessões/refresh tokens antigos não importados (0/0). Não foram copiados Vault, secrets, roles ou schemas de sistema.

Leitura transacional com ROLE authenticated e contexto dos usuários importados: primeiro usuário vê 2 workspaces, 1 contato, 5 intakes; segundo vê 1 workspace, 0 contatos, 0 intakes; ambos veem o próprio profile. Isso verifica leitura/RLS, NÃO substitui teste de login com senha.

## Edge Functions

Reimplantadas no novo projeto a partir do baseline sem alterações de código:

- crm-workspace-command v1 ACTIVE, verify_jwt=true.
- crm-intake-operator-command v1 ACTIVE, verify_jwt=true.

Ambas rejeitaram requisição sem credenciais com HTTP 401. Usam SUPABASE_URL e credenciais do próprio ambiente; nenhuma URL do projeto antigo no código das funções. Teste autenticado de comando ainda pendente.

P1 pendente: crm-notification-dispatch, crm-resend-webhook, crm-classy-intake-bridge; estado histórico de notificações/outbox, secrets novos, pg_net/pg_cron/Vault e schedulers. Não habilitar workers antes de reconciliar entregas antigas para evitar reenvios. Não importar tokens antigos.

## Staging e bloqueio de infraestrutura

Smoke público HTTPS existente: 200 direto em /crm e /crm/recuperar-senha, sem redirects; 29 assets sob /crm com MIME correto; /crm/api/workspaces retornou JSON 401. O smoke Node direto sofreu timeout da rede desta sessão; o contrato equivalente foi verificado por Python urllib usando o proxy do ambiente. As duas Edge Functions novas responderam 401 sem autenticação. A configuração Supabase do container existente NÃO foi verificada nem alterada. HTML 200 não prova utilização do backend novo.

Hostinger não expõe ferramentas nesta sessão. Tentativa de registrar o MCP oficial https://mcp.hostinger.com falhou porque /home/agent/.codex/config.toml está em filesystem somente leitura. Nenhuma configuração de servidor, DNS ou produção foi alterada. É necessário conectar Hostinger no aplicativo e autenticar antes de auditar a VPS e atualizar somente SUPABASE_URL/publishable key do staging.

## Gates restantes P0

1. Acesso autenticado Hostinger; auditar VPS/container/proxy e imagem atual antes de alteração.
2. Atualizar staging para https://kyhxgxogokwnblsxzxjo.supabase.co e publishable key nova por canal seguro; preservar VINEXT_TRUST_PROXY=1 e bind 127.0.0.1:3100. Recriar container e conferir HEALTHY.
3. Configurar/verificar redirect autorizado https://crm-staging.classyrp.com.br/crm no Auth novo, sem alterar Site URL para produção.
4. Login inválido/válido, workspace selection/persistence, dashboard, contatos/busca, Intake Inbox/detalhe, refresh, logout, cookies Path=/crm/Secure/HttpOnly/SameSite=Lax e APIs /crm/api/* usando backend novo.
5. Recuperação de senha por e-mail e callback completo, com participação do titular; nenhum e-mail foi enviado nesta execução.

Nenhum gate de produção está liberado. classyrp.com.br/crm, DNS principal e PR CLASSY antigo permanecem intocados.

## Segurança e referências

Advisors mantêm 4 INFO de RLS sem policy em tabelas internas e WARN do create_workspace legado, revisados sem alteração automática. Também reportam proteção contra senhas vazadas desativada; configuração não alterada.

- Supabase. (2026). Backup and restore using the CLI. https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Supabase. (2026). Authorization headers. https://supabase.com/docs/guides/functions/auth-headers
- Supabase. (2026). RLS enabled no policy. https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Supabase. (2026). Signed-in users can execute SECURITY DEFINER function. https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Supabase. (2026). Password security. https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
