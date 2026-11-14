# Implementação e verificação — 09/09/2026

## Escopo e estado

Comparação do pacote CRM_Core_Documentation_Pack_v0.03.1-0.zip com o checkout real. Os packets 013–016 são retrospectivos: não representam autorização para iniciar todo o roadmap v0.04–v1.0. A lacuna encontrada nesta execução foi a escrita de tags e campos personalizados na interface do Contact 360.

Implementado no checkout, sem publicação do Site e sem promoção em CLASSY. As alterações anteriores de busca, páginas de entidades, testes SQL e renomeação das migrations foram preservadas. Não houve alteração de schema.

## Entregas desta execução

- `components/crm/contact-data-editor.tsx`: catálogo, criação, associação e remoção de tags; criação de definições de contato com chave estável, ordem, opções e obrigatoriedade; formulário dos 13 tipos; salvar/limpar valor; confirmação e erros recuperáveis. Demonstração permanece somente leitura.
- `app/api/contacts/[contactId]/metadata/route.ts`: GET do catálogo e POST das operações, com origem validada, JWT do usuário, workspace da sessão, consulta prévia do contato sob RLS, validação de definição ativa e respostas sem detalhes internos. Nenhuma credencial privilegiada é utilizada.
- `lib/custom-fields.ts`: contrato discriminado de operações, rejeição de propriedades extras e validação dos tipos. JSON null não é persistido; limpar remove a linha opcional. `false` e `0` são valores válidos. O banco conserva seus triggers de validação.
- `components/crm/contact-360.tsx`: integração na aba Dados, atualização do 360 após salvar, manutenção da aba selecionada, cancelamento/descartes de respostas obsoletas.
- `app/app/layout.tsx`: remonta o shell pelo workspace, invalidando estados dos componentes filhos na troca.
- `tests/contact-metadata.test.mjs`: contratos dos 13 tipos, valores inválidos, rejeição de tenant/autor enviados pelo cliente, origem, sessão, demonstração, contato inacessível, autorização e propagação do JWT.
- `supabase/tests/custom_field_types.sql`: insert/upsert e rejeição de tipos/JSON null/opções para os 13 tipos; proibição de escrita por viewer, dentro de transação com rollback.

## Reconciliação das migrations

As 13 entradas de `supabase_migrations.schema_migrations` no FERNANDES foram consultadas por MCP e comparadas ao SQL integral local. Todas correspondem após normalizar CRLF para LF e remover espaço externo. Nenhum arquivo de migration aplicada foi reescrito nesta execução.

O arquivo `02_ARCHITECTURE/migration-verification-2026-09-09.json` registra os nomes, hashes SHA-256 dos bytes locais e resultado da comparação. Esta verificação encerra a dúvida de correspondência de conteúdo; as alterações locais ainda precisam integrar o fluxo Git/review da equipe.

## Evidências reproduzidas

- Build: `node node_modules/vinext/dist/cli.js build`, aprovado.
- Regressão: `node --test tests/*.test.mjs`, 11/11 testes aprovados. Aviso não bloqueante de porta HMR ocupada durante a execução conjunta com preview.
- ESLint dos arquivos alterados nesta execução: aprovado.
- FERNANDES: `rls_smoke.sql`, 34/34 verificações aprovadas.
- FERNANDES: `crm_v003_smoke.sql`, 9/9 verificações aprovadas.
- FERNANDES: `custom_field_types.sql`, matriz dos 13 tipos e viewer aprovada.
- FERNANDES: 19/19 tabelas públicas com RLS ativo, confirmado por catálogo PostgreSQL.
- As transações SQL terminam em rollback. Consulta posterior confirmou ausência dos usuários fictícios dos testes de Contact 360 e dos novos testes de tipos.
- Preview local respondeu HTTP 200. Teste visual/interativo em navegador e E2E com login real não foram executados nesta rodada.

## Limitações e revisão

O typecheck global encontra problemas anteriores de tipagem do runtime Cloudflare (`cloudflare:workers`, `Fetcher`, `D1Database`). Gerando tipos com `wrangler types` a partir do build e fornecendo-os ao TypeScript, restam dois erros em `db/index.ts` porque o template acessa `Env.DB`, mas este Site não tem D1 configurado. Os arquivos adicionados passam nesse contexto; não se declara o typecheck global aprovado.

A interface permite solicitar operações e apresenta a negação devolvida pelo banco. RLS continua sendo a autoridade de permissão; os testes de API usam transporte simulado, e os testes de banco usam identidades fictícias via role/claims SQL. Isso não substitui o aceite com usuários reais, carga representativa, navegador e promoção controlada.

Semântica de campos obrigatórios: a interface/API impede salvar vazio ou limpar um campo obrigatório; não retropreenche contatos antigos ao criar uma definição obrigatória. O banco valida os tipos JSON; validações de formato (email, URL, data real) foram acrescentadas na API/UI, sem mudar migrations aplicadas.

Advisors de segurança em 09/09/2026: INFO de outbox sem policies e WARN de `create_workspace` SECURITY DEFINER continuam presentes, como no baseline. A outbox permanece privada e o RPC de criação de workspace é deliberado. Referências de revisão: [outbox/RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) e [RPC SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Rollback

Reverter somente a integração e os arquivos novos desta execução por revisão Git, preservando as alterações que já estavam no checkout. Isso desabilita os formulários; tags, definições e valores persistidos permanecem no banco e continuam legíveis pelo contrato anterior. Não remover tabelas nem migrations. Não foi realizado deploy nesta execução.

## References

Supabase. (s.d.). [Securing your API](https://supabase.com/docs/guides/api/securing-your-api). Consultado em 09/09/2026: grants e RLS são camadas complementares; a implementação mantém ambos.

Supabase. (2026). [Changelog](https://supabase.com/changelog.md). Consultado em 09/09/2026 antes da implementação; mudanças recentes revisadas para a integração existente.
