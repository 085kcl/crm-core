# DP-CRM-015 — Global Search

**Verificação de 09/09/2026:** preservadas as alterações locais existentes para navegação de entidades. Regressão local e testes `search_contact_channels`, `search_identifies_company_lead_deal`, limites e isolamento no FERNANDES aprovados. Nenhuma nova publicação. Ver [evidências](../IMPLEMENTATION_2026-09-09.md).

**Release:** v0.03  
**Estado:** implementado, publicado e validado.

## Objetivo

Oferecer busca global rápida e tenant-aware em contatos, empresas, leads e negócios usando PostgreSQL FTS.

## Escopo

- colunas geradas `search_document`;
- índices GIN;
- RPC `public.search_crm`;
- interface de busca global, debounce, teclado e navegação;
- limpeza ao trocar workspace;
- estados vazio/loading/erro.

## Arquivos/objetos afetados

- migration `crm_v003_search_and_contact_360`;
- migration `crm_v003_fk_index_hardening` quando aplicável;
- componente Global Search/topbar/command palette;
- cliente Supabase e tipos de retorno;
- testes de função, segurança, UI e E2E;
- `FRONTEND_CONTRACT`/documentação.

## Contrato

Entrada: `p_workspace_id`, `p_query`, `p_limit=20`. Saída: `entity_type`, `entity_id`, `title`, `subtitle`, `rank`. Limite efetivo 1–100. Query vazia retorna vazio. Tipos aceitos: contact/company/lead/deal.

## Regras que não podem ser quebradas

- `p_workspace_id` sempre explícito;
- membership ativa validada no banco;
- sem resultado de outro tenant;
- RPC invoker, `search_path=''`, sem EXECUTE para anon;
- nenhum filtro de frontend substitui RLS;
- troca de workspace cancela/descarta resultados anteriores;
- resultados são tratados como texto, não HTML confiável.

## Testes

Nome, e-mail, telefone, WhatsApp, documento, empresa, tax ID, website, lead, deal, acentos/case, query vazia, limite, ranking, usuário sem membership, UUIDs iguais em contextos distintos, troca rápida de workspace e navegação por teclado.

## Critérios de aceite

- resultados relevantes e ordenados;
- zero vazamento cross-tenant;
- busca vazia não consulta/mostra dados;
- estado antigo desaparece na troca do workspace;
- navegação abre a entidade correta;
- performance avaliada com `EXPLAIN` após carga representativa.

## Deploy e rollback

Criar colunas/índices/RPC no FERNANDES, reindexar quando necessário, testar e publicar UI. Rollback preferencial: desligar ponto de entrada e revogar RPC; remoção de coluna/índice apenas por migration compensatória aprovada.
