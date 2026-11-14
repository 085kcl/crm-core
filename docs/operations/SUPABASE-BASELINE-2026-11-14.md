# Reconciliação do novo Supabase — 2026-11-14

Destino exclusivo: `kyhxgxogokwnblsxzxjo` (CRM-CORE). Baseline histórico: `998e395037bdf3915c89c9c1540764104b6637ab`.

## Evidências somente leitura

33 migrations registradas em 20261111; o SQL registrado corresponde ao arquivo histórico após normalizar comentários/espaços. Catálogo: 30 tabelas públicas com RLS; funções finais criadas/removidas conferidas; 44 funções public/private, 144 índices públicos. Nenhuma migration reaplicada. Verificação de catálogo não equivale a um diff completo de todos os grants.

| Migration original | Aplicada / versão registrada | Efeito / ação |
|---|---|---|
| `20260829232954_crm_core_foundation` | Sim — `20261111175434` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260829233030_tenant_integrity_and_role_hardening` | Sim — `20261111175436` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260829233102_database_audit` | Sim — `20261111175439` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260829233131_domain_invariants_and_session_hardening` | Sim — `20261111175442` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260829233148_private_security_functions` | Sim — `20261111175445` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260829233204_data_api_least_privilege` | Sim — `20261111175447` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260829233402_private_function_least_privilege` | Sim — `20261111175449` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260829234118_performance_hardening` | Sim — `20261111175452` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260831221538_polymorphic_entity_tenant_integrity` | Sim — `20261111175454` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260901031048_crm_v003_tags_and_custom_fields` | Sim — `20261111175456` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260901031202_crm_v003_search_and_contact_360` | Sim — `20261111175518` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260901031355_crm_v003_fk_index_hardening` | Sim — `20261111175523` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260901032746_crm_v003_contact_360_rpc` | Sim — `20261111175525` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260924223042_crm_v0032_intake_bridge_foundation` | Sim — `20261111175528` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260925002144_crm_v0032_transactional_notifications` | Sim — `20261111175531` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260925002311_crm_v0032_notification_digest_hardening` | Sim — `20261111175539` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260925002601_crm_v0032_notification_fk_index_hardening` | Sim — `20261111175541` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260925002856_crm_v0032_notification_manual_retry` | Sim — `20261111175544` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260925003156_crm_v0032_notification_provider_truthfulness` | Sim — `20261111175546` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260925003612_crm_v0032_intake_status_workflow` | Sim — `20261111175548` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260925003825_crm_v0032_intake_status_write_hardening` | Sim — `20261111175554` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260925004341_crm_v0032_intake_status_seed_alignment` | Sim — `20261111175556` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260925161640_crm_v0032_status_command_idempotency` | Sim — `20261111175558` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260925161928_crm_v0032_intake_activity_entity_support` | Sim — `20261111175601` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260925162130_crm_v0032_status_notification_policy_rpc` | Sim — `20261111175603` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260925163328_crm_v0032_status_advisor_closure` | Sim — `20261111175610` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260927170348_crm_v0032_notification_runtime` | Não | Runtime opcional deliberadamente pendente. Não aplicar literalmente. |
| `20260927170643_crm_v0032_notification_runtime_portable` | Não | Runtime opcional deliberadamente pendente. Não aplicar literalmente. |
| `20260927170703_crm_v0032_notification_runtime_job_name` | Não | Runtime opcional deliberadamente pendente. Não aplicar literalmente. |
| `20260927172531_crm_v0032_classy_site_bridge_secret_access` | Sim — `20261111175643` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260928001242_crm_v0032_intake_inbox_assignment` | Sim — `20261111175645` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260928001323_crm_v0032_intake_assignment_activity_fix` | Sim — `20261111175648` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260928001924_crm_v0032_intake_assignment_ambiguity_fix` | Sim — `20261111175650` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260929172900_crm_v0032_classy_external_retry_scheduler` | Não | Runtime opcional deliberadamente pendente. Não aplicar literalmente. |
| `20260930175610_crm_v0032_authenticated_operational_commands` | Sim — `20261111175656` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260930180133_crm_v0032_remove_authenticated_definer_wrappers` | Sim — `20261111175658` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |
| `20260930181557_crm_v0032_workspace_command_service` | Sim — `20261111175701` | SQL registrado correspondente; objetos finais conferidos coletivamente. Não reaplicar. |

## Estratégia de baseline

Manter os arquivos históricos intactos como evidência. NÃO executar `supabase db push` na pasta raiz. Antes de automatizar deploys de banco, materializar um diretório CLI isolado contendo as 33 migrations com as versões efetivamente registradas no novo projeto e conteúdo idêntico; manter as quatro migrations de runtime fora dessa sequência. Validar `migration list` e `db push --dry-run` nesse diretório antes de qualquer execução. Não reparar o histórico remoto nem marcar migrations opcionais como aplicadas. Novas migrations devem ser geradas pela CLI nesse fluxo e revisadas contra o schema real. A automação de banco permanece desabilitada até esse gate.

## create_workspace

O baseline mantém `public.create_workspace(text,text)` SECURITY DEFINER acessível a authenticated, com auth.uid obrigatório e search_path vazio. As migrations authenticated_operational_commands/remove_authenticated_definer_wrappers tratam assignment/retry, não removem create_workspace. A migration workspace_command_service adiciona uma função distinta restrita a service_role; a aplicação usa a Edge Function JWT-protegida. Não remover SECURITY DEFINER nem alterar grants como parte da restauração. Uma eventual descontinuação do endpoint legado exige mudança específica e testes.

Tabelas internas sem políticas permanecem fechadas por RLS; não foram adicionadas políticas. Índices não foram removidos. pg_net/pg_cron e schedulers permanecem pendentes.

## Preparação determinística

`python scripts/materialize-supabase-baseline.py /caminho/novo` cria apenas arquivos locais. O manifest `deploy/supabase/baseline-kyhxgxogokwnblsxzxjo.json` associa as 33 versões registradas aos arquivos originais e seus SHA-256. O script rejeita alterações nos originais e diretórios existentes; não conecta, não aplica SQL, não inclui schedulers. Execução local validada com 33 arquivos. Inicialização/link da CLI, confirmação de projeto e dry-run remoto continuam gates obrigatórios antes de futura automação.
