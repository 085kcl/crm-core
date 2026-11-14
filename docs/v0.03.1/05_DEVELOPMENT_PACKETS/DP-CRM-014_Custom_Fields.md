# DP-CRM-014 — Custom Fields

**Complemento de 09/09/2026:** definição e edição dos 13 tipos na aba Dados implementadas em `components/crm/contact-data-editor.tsx`, `lib/custom-fields.ts` e API de metadata do contato. Testes: `tests/contact-metadata.test.mjs` e `supabase/tests/custom_field_types.sql`. Build, API e SQL aprovados; publicação/aceite interativo pendentes. Ver [evidências e semântica de obrigatoriedade](../IMPLEMENTATION_2026-09-09.md).

**Release:** v0.03  
**Estado:** implementado e validado no FERNANDES.

## Objetivo

Adicionar extensibilidade tipada por workspace e entidade sem exigir nova coluna por campo.

## Escopo

- `custom_field_definitions` e `custom_field_values`;
- enum `custom_field_type`;
- validação server/database de tipo, opções e referência;
- RLS/RBAC;
- exibição no Contact 360;
- métricas na view.

## Arquivos/objetos afetados

- migration `crm_v003_tags_and_custom_fields` e hardening posterior;
- trigger/helper `private.validate_custom_field_value`;
- formulários/renderizadores por tipo;
- integração de Contact 360;
- testes SQL/API/E2E e documentação.

## Contrato de tipos

| Tipo | JSON esperado |
|---|---|
| text, textarea, email, phone, url, date, datetime, select | string |
| integer, decimal, currency | number |
| boolean | boolean |
| multiselect | array de strings |

`select`/`multiselect` devem respeitar `options` quando não vazias. JSON `null` é inválido; ausência de valor deve ser representada por ausência de linha/sem valor conforme contrato da UI.

## Regras que não podem ser quebradas

- definição ativa, entidade e valor no mesmo workspace;
- `entity_type` da definição deve coincidir com o valor;
- entidade referenciada deve existir no tenant;
- validação no banco permanece obrigatória;
- chave da definição é estável; renomear label não altera key;
- não interpretar valor inseguro como HTML/código;
- não expor segredo no frontend.

## Testes

Cobrir cada tipo válido e inválido; integer fracionário; select fora das opções; multiselect com item não string/fora das opções; definição inativa; mismatch de entidade; ID cross-tenant; viewer; update; ordenação por position; retorno no Contact 360.

## Critérios de aceite

- tipos inválidos falham no banco;
- UI renderiza e salva todos os tipos suportados;
- obrigatório/ordem/opções são respeitados;
- isolamento cross-tenant comprovado;
- Contact 360 retorna definição + valor de modo previsível.

## Deploy e rollback

Aplicar primeiro no FERNANDES, testar matriz de tipos e advisors. Em rollback com dados, preservar definições/valores e desativar UI; remoção física exige exportação e aprovação explícita. Produção recebe somente o artefato aprovado.
