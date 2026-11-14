# DP-CRM-016 — Contact 360

**Complemento de 09/09/2026:** editor integrado em `components/crm/contact-360.tsx`; manutenção da aba após salvar e descarte de respostas obsoletas; shell remontado por workspace em `app/app/layout.tsx`. Contratos, métricas, ordenação e isolamento aprovados no FERNANDES. Aceite visual/login real e publicação pendentes. Ver [evidências](../IMPLEMENTATION_2026-09-09.md).

**Release:** v0.03  
**Estado:** implementado, publicado e validado.

## Objetivo

Concentrar o contexto comercial de um contato em uma resposta e uma tela tenant-aware.

## Escopo

- view `public.contact_360_summary`;
- RPC `public.get_contact_360`;
- cabeçalho, métricas e seções Overview/Deals/Activities/Tasks/Notes/Data;
- owner, empresas, leads, deals, tarefas, notas, activities, tags e custom fields;
- estado genérico para ausente/sem permissão;
- responsividade e acessibilidade.

## Arquivos/objetos afetados

- migrations `crm_v003_search_and_contact_360` e `crm_v003_contact_360_rpc`;
- página de detalhe do contato e componentes associados;
- tipos/cliente de dados;
- integração com tags/custom fields;
- testes SQL/API/E2E e contrato frontend.

## Contrato

Entrada: workspace, contact e activity limit. Saída JSONB com `contact`, `owner`, `companies`, `leads`, `deals`, `tasks`, `notes`, `activities`, `tags`, `custom_fields`. Activity limit efetivo 1–200. Ausente/externo retorna `null`.

## Regras que não podem ser quebradas

- view `security_invoker=true`;
- RPC não é `SECURITY DEFINER`;
- `search_path=''`;
- membership no workspace;
- todo join inclui tenant quando aplicável;
- não diferenciar inexistente de sem permissão;
- troca de workspace invalida resposta/cache;
- não criar duplicação de regras de autorização na UI.

## Testes

Contato completo; contato sem relações; métricas de deals/tarefas; ordenação de empresa principal/atividades; limite 1, 50, 200 e acima; custom fields sem valor; tags; contato cross-tenant; usuário sem membership; loading/empty/error; mobile/teclado; regressão de N+1 e tempo de consulta com carga.

## Critérios de aceite

- 360 completo no workspace ativo;
- métricas batem com consultas de controle;
- arrays vazios são `[]`, owner opcional é `null`;
- cross-tenant retorna estado genérico;
- layout utilizável em mobile e desktop;
- nenhuma chamada usa service role no navegador.

## Deploy e rollback

Aplicar view/RPC no FERNANDES, rodar contratos/segurança/E2E, publicar Site, revisar e só então promover. Rollback seguro: desabilitar rota/tela, restaurar contrato anterior por migration compensatória e manter tabelas/dados v0.03 intactos até decisão.
