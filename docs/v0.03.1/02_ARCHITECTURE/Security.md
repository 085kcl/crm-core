# Segurança, Multi-tenancy, RLS e RBAC

## Modelo de ameaça mínimo

Riscos prioritários: IDOR/BOLA cross-tenant, execução privilegiada indevida, segredo no bundle, enumeração de UUIDs, FK cross-tenant, manipulação de campos polimórficos, exposição da outbox, auditoria com PII excessiva e drift entre staging/produção.

## Controles em camadas

1. Supabase Auth emite identidade/JWT.
2. Workspace ativo é enviado explicitamente.
3. Helpers `private.is_workspace_member` e `private.current_workspace_role` verificam membership ativo.
4. RLS filtra linhas e operações.
5. RBAC determina escrita/configuração/exclusão.
6. FKs compostas, checks e triggers bloqueiam inconsistências.
7. Rotas/UI evitam vazamento por mensagens e cache.
8. Audit e advisors fornecem detecção.

## Matriz RBAC corrente

| Capacidade | owner | admin | manager | sales | marketing | finance | support | viewer |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Ler dados do workspace | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Escrever dados operacionais | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Excluir/configurar | ✓ | ✓ | ✓ | — | — | — | — | — |
| Administrar membros | ✓ | ✓ | policy específica | — | — | — | — | — |
| Remover último owner | — | — | — | — | — | — | — | — |

Esta matriz documenta os helpers correntes. Evoluções por domínio/ação exigem nova ADR e testes de não regressão.

## Regras RLS

- todas as 19 tabelas públicas têm RLS ativo;
- `authenticated` só acessa workspace com membership ativa;
- INSERT/UPDATE usam `WITH CHECK` equivalente à capacidade necessária;
- `profiles` só permite escrita do próprio perfil e leitura entre membros que compartilham workspace;
- `audit_logs` é leitura administrativa;
- `outbox_events` não possui policy pública por desenho;
- RPCs negam `anon`.

## Funções privileged

Helpers e triggers `SECURITY DEFINER` ficam em `private`, com `search_path=''` e grants mínimos. A exceção pública é `create_workspace`, que precisa criar workspace e owner inicial atomicamente. Ela exige `auth.uid()`, não permite `anon` e deve permanecer pequena e auditada.

## Segredos

- cliente: `SUPABASE_URL` + publishable key;
- servidor/worker: segredo apenas em vault/env protegida;
- proibido: `service_role` em variáveis públicas, código, ZIPs, documentação, screenshots e logs;
- rotação imediata se houver vazamento.

## Revisão operacional

Antes de cada promoção: varredura de segredo, tests cross-tenant, advisors security/performance, revisão de grants/RPCs/views, confirmação de RLS, comparação de migrations e smoke test. Revisão mensal já está agendada para o FERNANDES em modo somente leitura.

