# DP-CRM-017B — fechamento da baseline

> Registro histórico de 10/09/2026. A revalidação de 24/09/2026 consta em [DP-CRM-017-status-2026-09-24.md](DP-CRM-017-status-2026-09-24.md) e não certifica o candidato atual. A afirmação abaixo não substitui os gates e o estado Git da revalidação.

CRM Core v0.03.1 · FERNANDES / staging · 10/09/2026

**BASELINE CERTIFIED**

Escopo: código local e preview conectado ao FERNANDES (`fnzcmoydjlarelotnmon`). Não houve deploy, promoção, reset de staging, migration nova ou alteração em CLASSY. Este relatório atualiza os gates pendentes registrados em `../IMPLEMENTATION_2026-09-09.md`; os resultados históricos daquele documento permanecem históricos.

## A. D1 / Typecheck

**Causa:** resíduo do template. `db/index.ts` dependia de `Env.DB`/`cloudflare:workers`; seu único consumidor era o exemplo não roteado em `examples/d1`. O schema e o journal Drizzle estavam vazios; `.openai/hosting.json` declara D1 nulo. Os fluxos reais usam Supabase.

**Correção:** removidos `db/index.ts`, `db/schema.ts`, `drizzle.config.ts`, `drizzle/meta/_journal.json` e os dois arquivos do exemplo D1. Removidos o binding fictício do Vite, `DB: D1Database` do worker, o empacotamento do diretório Drizzle e o script `db:generate`. `ASSETS` usa o contrato de fetch efetivamente consumido pelo worker. Nenhum binding fictício foi adicionado. As versões das dependências e o lockfile foram preservados.

Não existia script oficial de typecheck. Após conferir `package.json`, `tsconfig.json` e o compilador instalado, foi formalizado `typecheck: tsc --noEmit --incremental false` e documentado no README.

Comando executado no Windows: `node node_modules/typescript/bin/tsc --noEmit --incremental false`. **PASS, exit 0**, repetido após a última alteração funcional.

## B. Build e correções encontradas no E2E

`node node_modules/vinext/dist/cli.js build`: **PASS, exit 0**, após a última alteração. É o executável usado pelo build verificado do projeto, invocado diretamente neste host sem Bash.

A busca retornava contatos por telefone/documento no servidor, mas o filtro adicional do cmdk os ocultava porque esses termos não aparecem no título/subtítulo. `CommandDialog` agora expõe `shouldFilter`, mantendo o padrão para os demais consumidores; GlobalSearch usa `false`. Uma nova consulta invalida resultados anteriores e mostra loading durante o debounce de 300 ms. Telefone e documento foram repetidos com sucesso no navegador após a correção. A opção é suportada pela documentação do cmdk (cmdk, s.d.; ver References).

O lint encontrou reset síncrono de estado no efeito de EntityPreview. O estado agora pertence a um filho com chave por tipo/id; o resultado de uma requisição abortada é descartado. Após o ajuste, uma segunda fixture autenticada confirmou a navegação Empresa Final A → Empresa Final B, sem manter o registro anterior.

## C. Automated tests

| Suite | Command | Expected | Actual | Status |
|---|---|---|---|---|
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 0 erros | exit 0 | PASS |
| Build | `node node_modules/vinext/dist/cli.js build` | sucesso | exit 0 | PASS |
| Node regression | `node --test tests/*.test.mjs` | 11/11 | 11 pass, 0 fail, 0 skip | PASS |
| RLS smoke | FERNANDES, `supabase/tests/rls_smoke.sql` | 34/34 | 34/34 em 09/09, nesta tarefa | PASS |
| CRM v0.03 smoke | FERNANDES, `supabase/tests/crm_v003_smoke.sql` | 9/9 | 9/9 em 09/09, nesta tarefa | PASS |
| Custom field SQL matrix | FERNANDES, `supabase/tests/custom_field_types.sql` | 13 tipos + rejeições/viewer | aprovado em 09/09, nesta tarefa | PASS |
| Lint de fontes | `node node_modules/eslint/bin/eslint.js . --ignore-pattern dist --ignore-pattern .next --ignore-pattern .sites-runtime` | 0 erros | exit 0 | PASS |
| Diff | `git diff --check` | sem erros | exit 0 | PASS |

As suítes SQL foram executadas com rollback; não houve mudança de SQL/schema após elas. Os checks locais foram repetidos após a correção final de EntityPreview. O lint sem excluir `.sites-runtime` também inspeciona tipos locais gerados e emite três avisos de diretivas eslint desnecessárias; esse diretório é ignorado no Git. Os testes mantiveram um aviso de porta HMR 24678 ocupada, inclusive com o preview encerrado; todas as 11 asserções passaram. Uma execução concorrente anterior também teve aviso EPERM do cache Vite; a repetição final não o apresentou. O build informa limitações de classificação estática de algumas rotas, sem falhar.

## D. E2E autenticado

Execução manual assistida no Codex In-app Browser, usando a UI e login real por senha no Supabase Auth. Nenhum cookie/sessão foi forjado. As credenciais ficaram fora do repositório. Evidências: snapshots AX/DOM e resultados de ações na sessão desta tarefa, corroborados por consultas SQL de valores e de limpeza. Não foi produzido um vídeo ou uma suíte Playwright independente.

| Scenario | User role | Viewport | Result | Evidence |
|---|---|---|---|---|
| Login → workspace → contatos → Contact 360 | owner | desktop 1440×1000 | PASS | Mariana Costa, ativo, Grupo Atlas, responsável E2E, canais, Alta prioridade e última atividade |
| Criar/associar/reload/remover/reload tag | owner | desktop | PASS | Certificação E2E persistiu e depois desapareceu; feedback de sucesso |
| Texto | owner | desktop | PASS | `Persistência desktop` após reload |
| Boolean false | owner | desktop | PASS | combobox Não após reload; SQL `false` |
| Integer zero | owner | desktop | PASS | input `0` após reload; SQL número `0` |
| Decimal | owner | desktop | PASS | `1234.56` após reload e no SQL |
| Date | owner | desktop | PASS | definição `date`; entrada nativa por teclado; `2026-10-10` após reload e no SQL |
| Email / URL | owner | desktop | PASS | gravação pela UI; SQL `validacao@example.invalid` e `https://example.com/validacao`; URL também conferida após reload |
| Select | owner | desktop | PASS | lista restrita a E-mail/Telefone/WhatsApp; Telefone salvo; valores fora das opções cobertos pela matriz automatizada |
| Multiselect | owner | desktop | PASS | Primeira e Terceira selecionadas após reload; array correspondente no SQL |
| Obrigatório | owner | desktop | PASS | vazio: `validity.valueMissing=true`; preenchido: persistiu; limpar não é oferecido; proteção API coberta pela suíte |
| Opcional | owner | desktop | PASS | limpar texto removeu o valor e o botão Limpar; depois o campo foi reutilizado no teste sales |
| Negócios/tarefas/notas/timeline | owner | desktop | PASS | Diagnóstico Atlas, R$84 mil, tarefa documental, nota e duas atividades em ordem decrescente |
| Abas vazias | owner | desktop | PASS | contato vazio: mensagens específicas nas quatro abas e contadores zero |
| Loading e erro do Contact 360 | owner | desktop | PASS | estado Carregando contato; contato de A solicitado em B retorna Contato indisponível/Contato não encontrado e Tentar novamente |
| Busca nome/e-mail/telefone/documento | owner | desktop | PASS após correção | Mariana; e-mail completo; `88881204`; `12345678909` encontraram Mariana |
| Busca empresa/lead/deal | owner | desktop | PASS | Atlas retornou três tipos; clique/Enter abriram prévias correspondentes |
| Busca teclado | owner | desktop | PASS | Ctrl+K, ArrowDown, ArrowUp, Enter e Escape executados; seleção ativa conferida no DOM |
| Busca mínimo/empty/error | owner | desktop | PASS | um caractere: orientação; termo ausente: nenhum resultado; 121 caracteres: erro API recuperável |
| Debounce/loading | owner | desktop | PASS | atraso de 300 ms preservado; mudança invalida resultados e inicia loading; consultas reais concluídas |
| Troca A → B | owner | desktop | PASS | Contact 360 desmontado; busca vazia ao reabrir; Mariana não aparece em B |
| Operação permitida | sales | desktop | PASS | `Operação sales` salvo e confirmado após reload |
| Administração negada | sales | desktop | PASS | criação de tag: Seu papel não permite esta alteração; sem detalhes internos |
| Leitura permitida/escrita negada | viewer | desktop | PASS | Contact 360 legível; salvar campo, criar e associar tag negados com mensagem recuperável; ações comerciais futuras desabilitadas |
| Login/contatos/360/abas | owner | mobile 390×844 | PASS | menu mobile, lista, Visão geral e Dados acessíveis |
| Tag/campo/reload | owner | mobile | PASS | tag associada e `Persistência mobile` presentes após reload |
| Dropdown e largura | owner | mobile | PASS | dropdown entre x=37 e x≈201; documento sem overflow horizontal crítico |
| Busca mobile | owner | mobile | PASS | três resultados Atlas; diálogo entre x=16 e x=374, abaixo do limite vertical de 844 |
| Workspace switch mobile | owner | mobile | PASS | A → B; diálogo reaberto sem consulta/resultados anteriores |
| Prévia após último ajuste | owner temporário final | desktop | PASS | login real; Empresa Final A → Empresa Final B; somente Registro B na prévia final |

O campo inicialmente denominado E2E Date foi criado como decimal durante uma sequência rápida da automação. O teste válido utilizou outra definição, cujo tipo `date` foi conferido antes e depois da criação. O preenchimento nativo da data foi confirmado por teclado e persistência; não foi necessária alteração do validador.

Erros controlados cobertos: API de busca 400, negação de permissão nas mutações e contato indisponível no workspace ativo. Não se afirma ter induzido queda do provedor ou todo código HTTP possível. As abas do 360 compartilham o carregamento/erro do agregado; não possuem transporte independente.

## E. Security

- RLS/RBAC: suítes SQL aprovadas; login real de owner, sales e viewer corroborou permissões. Nenhuma policy, grant ou função do banco foi alterada nesta etapa.
- Tenant isolation: troca de workspace limpa a UI; contato existente em A não é exposto em B. O erro não devolveu dados/UUIDs de outros registros, SQL ou stack trace.
- Secrets: busca por `service_role`, secret key, database password, private API token e `sb_secret_` no bundle `dist/client` sem ocorrências. Nas fontes runtime, sem ocorrências; referências no README/migrations são documentação e nomes de roles/grants. `.dev.vars` é ignorado e contém apenas URL/publicável do staging. Nenhuma credencial E2E foi gravada no Git.
- Security Advisor final: somente INFO `outbox_events` sem policies e WARN `create_workspace` SECURITY DEFINER, ambos aceitos expressamente no handoff. Ver [evidência JSON](DP-CRM-017B-advisors-final.json) e links de remediação nela.
- Uma consulta intermediária retornou `auth_leaked_password_protection`; duas consultas finais não o retornaram. Não foi alterada configuração Auth por esta tarefa, nem se infere a causa da diferença. O critério final usa a observação mais recente; ela não demonstra, isoladamente, o valor da configuração de senhas. A documentação descreve essa proteção e sua disponibilidade (Supabase, s.d.; ver References).
- Performance Advisor: apenas INFO de índices ainda não usados e estratégia de conexões Auth. Nenhum índice removido; nenhum WARN/ERROR novo no resultado final.

### Limpeza

Os três usuários e os dois workspaces da matriz principal foram removidos. A fixture final adicional também foi removida após logout. Consultas finais retornaram **0 usuários E2E e 0 workspaces E2E**, com contatos, memberships e valores da matriz principal em zero.

As sessões e refresh tokens foram removidos antes das contas. A limpeza eliminou somente dados dos IDs sintéticos conhecidos. Para descartar memberships dos workspaces temporários, que são protegidos pelo trigger de último owner, usou-se `SET LOCAL session_replication_role=replica` apenas durante esse DELETE, restaurando `origin` imediatamente dentro da transação. Não houve ALTER/DROP de trigger, alteração persistente de configuração ou de schema. As entidades e seus logs sintéticos foram removidos antes dos workspaces; o estado `origin` foi conferido depois.

## F. Files changed

O manifesto Git referido no registro original (`DP-CRM-017B-files.txt`) não está presente neste checkout. A lista de alterações observada na revalidação consta no [relatório de 24/09](DP-CRM-017-status-2026-09-24.md); não se deve inferir um commit a partir desta seção histórica.

## G. Git

Branch: `chore/DP-CRM-017-baseline-reconciliation`.

Base anterior: `065a2de7f0a1460d79ffba7323f958955f077731`.

Commit de fechamento: identificado por `fix(crm): close v0.03.1 baseline certification gates`; o hash final é entregue na resposta e pode ser obtido com `git log -1 --format=%H` nesta branch. Não há política local de PR encontrada; nenhum PR ou push foi realizado.

## H. Remaining issues

| Severity | Issue | Impact |
|---|---|---|
| BLOCKER / HIGH | Nenhum gate obrigatório pendente nesta rodada | — |
| LOW | Aviso HMR 24678 e avisos do build/classificação | Não impediram typecheck, build, lint de fontes ou 11/11 testes |
| LOW | Menu mobile permanece aberto após clicar no link de navegação | Exige fechar o painel; o fluxo foi concluído |
| DEBT | Cabeçalho de perfil ainda mostra rótulo demonstrativo João/Owner | Não representa a role autenticada; RBAC foi validado por login e negativas reais |
| DEBT | E2E manual assistido, sem runner versionado para reprodução automática | Evidências desta sessão e matriz acima; não é teste de carga nem validação de produção |
| DEBT | Aviso de senhas vazadas observado apenas na consulta intermediária | Investigar se reaparecer; não há prova de alteração da configuração nesta tarefa |

## References

cmdk. (s.d.). [README — desabilitar filtragem e ordenação](https://github.com/dip/cmdk#parts-and-styling). Consultado em 10/09/2026.

Supabase. (s.d.). [Password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Consultado em 10/09/2026.
