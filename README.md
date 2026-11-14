# CRM Core — Work/Sites + Supabase — v0.02

CRM proprietário multiempresa, API-first, com interface inicial em ChatGPT Work/Sites e Supabase/PostgreSQL como núcleo canônico.

## Estado desta versão

O Incremento 0/1 está implementado e navegável:

- shell responsivo com sidebar recolhível e topbar;
- login por e-mail e senha preparado para Supabase Auth;
- recuperação de senha sem enumeração explícita de contas;
- sessão em cookies `HttpOnly`;
- renovação automática da sessão por refresh token, sem armazenamento no navegador;
- modo de demonstração identificado, sem se apresentar como dado real;
- seleção e criação de workspace;
- dashboard inicial com estados demonstrativo e vazio;
- configurações básicas do workspace;
- estrutura de membros e papéis;
- rotas de erro, loading, vazio e acesso negado nos fluxos principais;
- cinco migrations PostgreSQL com RLS, integridade cross-tenant, auditoria e invariantes de domínio.

Contatos, empresas, leads, pipeline, negócios, tarefas e atividades aparecem na navegação como módulos planejados e serão habilitados por incremento.

## Arquitetura

```text
ChatGPT Work/Sites
        |
        v
Interface + rotas server-side
        |
        v
Supabase Auth / REST / RPC
        |
        v
PostgreSQL + RLS + audit log + outbox
```

A seleção de workspace orienta a interface, mas não é prova de autorização. Toda consulta real permanece sujeita ao JWT do usuário e às policies RLS.

## Configuração

1. Crie o projeto no Supabase.
2. Aplique, em ordem, os arquivos de `supabase/migrations/001_...sql` até `005_...sql`.
3. Configure `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no ambiente de execução.
   Projetos legados também podem usar `SUPABASE_ANON_KEY` como fallback.
4. Não adicione `service_role` ao frontend ou às variáveis utilizadas por este aplicativo.
5. Crie usuários de teste no Supabase Auth e execute os critérios de aceite de `docs/05_CRITERIOS_ACEITE.md`.

Sem essas variáveis, o aplicativo entra apenas no modo de demonstração e deixa isso explícito na interface.

## Rotas implementadas

- `/` — login;
- `/recuperar-senha` — recuperação;
- `/workspaces` — seleção/criação de workspace;
- `/app` — dashboard;
- `/app/configuracoes/workspace` — identidade, status e membros;
- `/api/auth/*` — login, logout e recuperação;
- `/api/workspaces/*` — leitura, criação, seleção e atualização do workspace atual.

## Desenvolvimento

```bash
npm run lint
npm run typecheck
npm run build
```

Requisito: Node.js `>=22.13.0`.

O typecheck global usa o TypeScript e o `tsconfig.json` do projeto: `tsc --noEmit --incremental false`. Em hosts sem npm no PATH, o executável instalado é `node node_modules/typescript/bin/tsc --noEmit --incremental false`. Não exige build prévio nem tipos gerados locais. Supabase/PostgreSQL é o backend; os exemplos e bindings D1 residuais foram removidos no DP-CRM-017B.

## Segurança ainda obrigatória antes de produção aberta

- rate limiting e proteção adicional contra abuso em autenticação;
- MFA e política de sessão;
- testes reais cross-tenant no Supabase;
- autorização fina por módulo e ação;
- validação das referências polimórficas de tarefas, notas e atividades;
- política LGPD de retenção, exportação, anonimização e mascaramento.

Consulte `docs/06_REVISAO_SEGURANCA.md` e `docs/07_AUDITORIA_E_STATUS_V0.02.md`.
