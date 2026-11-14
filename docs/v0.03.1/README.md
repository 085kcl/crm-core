# CRM CORE — Documentação Oficial

**Baseline:** v0.03.1  
**Data-base:** 04/09/2026  
**Estado:** consolidado a partir dos artefatos v0.01/v0.02/v0.03, do Site publicado e do schema ativo no Supabase FERNANDES.

## Fontes de verdade

| Domínio | Fonte oficial |
|---|---|
| Documentação, decisões, requisitos, critérios e handoffs | **Work** |
| Código-fonte, migrations e histórico executável | **Git** |
| Dados operacionais e estado aplicado do schema | **Supabase/PostgreSQL** |

Em conflito: o comportamento do sistema deve ser investigado no Git e no banco; a divergência deve gerar atualização documental no Work. Nenhuma alteração é considerada encerrada enquanto código, banco e documentação não estiverem reconciliados.

## Workflow oficial

1. **CHATGPT** — pesquisa, discussão, arquitetura, regras e decisões.
2. **WORK** — documentação persistente.
3. **CHATGPT** — handoff técnico.
4. **CODEX** — implementação.
5. **CHATGPT** — review.
6. **WORK** — atualização documental e novo baseline.

## Regra de promoção

Toda mudança segue obrigatoriamente: **Git/local → FERNANDES (staging) → testes e aceite → CLASSY (produção)**. Alterações manuais diretas em CLASSY são proibidas.

## Como usar este pacote

- Comece por `00_MASTER/CRM_Core_Master_Specification.md` e `00_MASTER/Current_State.md`.
- Antes de programar, selecione um Development Packet em `05_DEVELOPMENT_PACKETS/`.
- Antes de alterar schema, confira `02_ARCHITECTURE/Migration_Baseline.md` e crie uma nova migration no Git.
- Antes do deploy, execute os critérios de `06_TESTING/`.
- Após o review, atualize `00_MASTER/Version_History.md`, o packet e os ADRs afetados.

## Invariantes não negociáveis

- frontend inicial em ChatGPT Sites/Work;
- backend Supabase/PostgreSQL;
- multi-tenancy por `workspace_id`;
- RLS + RBAC;
- FERNANDES = staging/homologação;
- CLASSY = produção;
- `activities` separado de `audit_logs`;
- `outbox_events` privada;
- PostgreSQL Full Text Search;
- custom fields tipados;
- tags multi-entidade;
- RPCs `public.search_crm` e `public.get_contact_360`;
- nenhuma `service_role`/secret key no frontend;
- migrations no Git como fonte de verdade do schema;
- deploy sempre staging → testes → produção.

