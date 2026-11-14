# DP-CRM-013 — Tags

**Complemento de 09/09/2026:** criação do catálogo e associação/remoção de tags na aba Dados implementadas no checkout em `components/crm/contact-data-editor.tsx` e `app/api/contacts/[contactId]/metadata/route.ts`. Validação SQL no FERNANDES aprovada; publicação e aceite com login real pendentes. Ver [evidências](../IMPLEMENTATION_2026-09-09.md). O estado histórico abaixo se refere ao baseline.

**Release:** v0.03  
**Estado:** implementado e validado no FERNANDES; documentação retrospectiva para manutenção.

## Objetivo

Permitir catálogo de tags por workspace e associação reutilizável a múltiplas entidades, com isolamento tenant-aware e apresentação no Contact 360.

## Escopo

- tabelas `tags` e `entity_tags`;
- RLS/RBAC e grants mínimos;
- validação de entidade e workspace;
- unicidade de associação;
- leitura/escrita de tags na interface de contato;
- inclusão em `get_contact_360` e contagem na view.

## Arquivos/objetos afetados

- migration Git correspondente a `crm_v003_tags_and_custom_fields`;
- migrations de integridade/índices subsequentes;
- componentes de formulário/chips do contato;
- serviço/repositório Supabase de tags;
- `public.get_contact_360`;
- testes SQL, API e E2E;
- documentos de contrato e modelo de dados.

Codex deve localizar os paths reais no Git antes de editar e registrar a lista final no fechamento do packet.

## Regras que não podem ser quebradas

- `workspace_id` obrigatório;
- tag e entidade pertencem ao mesmo workspace;
- associação polimórfica aceita somente tipos suportados;
- `viewer` não cria/remove;
- troca de workspace limpa tags em memória;
- exclusão não atravessa tenant;
- não usar `service_role` no cliente.

## Testes

1. Criar tag como papel com escrita.
2. Impedir duplicidade de nome/slug conforme constraint.
3. Associar/remover em contato do mesmo workspace.
4. Rejeitar tag ou entidade de outro workspace.
5. Negar escrita a viewer e anon.
6. Verificar retorno/ordem em Contact 360.
7. Validar audit conforme política da entidade.
8. Executar advisors e regressão RLS.

## Critérios de aceite

- operações válidas funcionam no FERNANDES;
- nenhum ID externo é revelado;
- tags aparecem no Contact 360 e contagem é correta;
- troca de workspace não mantém chips/resultados anteriores;
- rollback restaura objetos sem afetar dados de outras features.

## Deploy

Migration no Git → aplicar no FERNANDES → testes → publicar frontend de staging → aceite → promover a mesma migration/código em CLASSY.

## Rollback

Para ambiente sem dados, migration compensatória pode remover objetos em ordem de dependência. Com dados, preferir feature flag/ocultar UI e forward-fix; exportar tags e associações antes de alteração destrutiva.
