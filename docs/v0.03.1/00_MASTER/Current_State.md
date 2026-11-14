# CRM Core — Estado Atual

> **Revalidação de 24/09/2026:** consulte [DP-CRM-017-status-2026-09-24.md](../06_TESTING/DP-CRM-017-status-2026-09-24.md). A matriz e a captura abaixo descrevem estados históricos; o checkout atual ainda não está certificado nem publicado como candidato final.

## Atualização verificada em 09/09/2026

Reconciliação do SQL integral das 13 migrations confirmada com FERNANDES. Implementada no checkout a escrita de tags e dos 13 tipos de custom fields na aba Dados do Contact 360. Build e testes de API/SQL executados. Nenhuma publicação ou promoção em CLASSY nesta rodada. Ver [relatório de implementação](../IMPLEMENTATION_2026-09-09.md) para evidências e limitações; a captura de 04/09 abaixo é histórica.

**Captura:** 04/09/2026  
**Baseline:** v0.03.1

## Resumo executivo

O CRM Core está operacional como MVP técnico em Sites, conectado ao Supabase FERNANDES. O backend contém a fundação v0.01, endurecimentos v0.02 e recursos v0.03. A versão publicada do Site é a 5. O projeto CLASSY continua reservado para produção e não foi alterado pela entrega v0.03.

## Matriz de estado

| Área | Estado | Evidência |
|---|---|---|
| Site/Frontend | Publicado | Site CRM Core, versão 5, atualizado em 01/09/2026 |
| Supabase staging | Saudável | projeto FERNANDES ativo |
| Banco | Aplicado | 13 migrations registradas |
| RLS | Ativo | 19/19 tabelas públicas com RLS |
| v0.03 banco | Aplicado | tags, custom fields, FTS, Contact 360 |
| v0.03 interface | Publicada/validada | Contatos, Busca Global e Contact 360 |
| Testes v0.03 | Aprovados | 8/8, incluindo cross-tenant e rollback |
| Produção CLASSY | Intocada | promoção ainda não autorizada neste baseline |

## Tabelas e objetos atuais

- 19 tabelas públicas;
- 7 enums: `record_status`, `workspace_role`, `lead_status`, `deal_state`, `task_priority`, `task_status`, `custom_field_type`;
- view `contact_360_summary` com `security_invoker=true`;
- RPCs públicas deliberadas: `create_workspace`, `search_crm`, `get_contact_360`;
- helpers e triggers privileged no schema `private`;
- FTS em contatos, empresas, leads e negócios.

## Advisors no momento da captura

### Segurança

1. **INFO:** `outbox_events` tem RLS e nenhuma policy. Estado intencional: tabela worker-only, não deve ser exposta ao cliente.
2. **WARN:** `create_workspace` é `SECURITY DEFINER` executável por `authenticated`. Estado intencional e compensado por `auth.uid()`, `search_path=''`, grants explícitos e escopo mínimo. Reavaliar mensalmente.

### Performance

Índices aparecem como não utilizados porque o staging está vazio. Não removê-los sem carga representativa, análise de planos e janela de observação. O advisor também recomenda revisar a estratégia de conexões do Auth antes de escalar a instância.

## Débito documental/técnico controlado

- o Git deve conter cópia canônica das 13 migrations aplicadas; os artefatos anexos preservam integralmente 001–005, enquanto 006–013 estão comprovadas no histórico do banco e devem ser reconciliadas com o repositório antes da próxima alteração de schema;
- executar teste com dois usuários reais e dois workspaces sempre que houver mudança de RLS/RBAC;
- manter validação de não exposição de segredos no bundle publicado;
- definir política de retenção/redação para dados pessoais em `audit_logs`;
- ampliar autorização por domínio/ação em versão futura sem enfraquecer o isolamento existente.

## Próximo gate recomendado

Fechar a sincronização Git ↔ migrations aplicadas, consolidar os packets v0.03 como “done”, criar o packet da próxima entrega e somente então iniciar v0.04 Analytics no FERNANDES.
