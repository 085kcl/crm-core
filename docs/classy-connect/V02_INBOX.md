# CLASSY Connect v0.2 — Inbox Omnicanal

**Repositório oficial:** `085kcl/crm-core`  
**Status:** implementação em branch/PR de revisão, não implantada.  
**Banco oficial de referência:** Supabase `kyhxgxogokwnblsxzxjo`, sem alterações realizadas.

## O que foi implementado

- Portabilidade da v0.1 (webhook Meta com assinatura HMAC, canais autorizados, fila privada).
- Nova migração `20261114170000_crm_connect_inbox_v02.sql` para `connect_conversations`, `connect_messages`, autorização RLS e fila com leasing.
- Processamento em lote de eventos pela rota interna `POST /api/internal/connect/process` (somente servidor, protegido por segredo específico).
- Normalização recebida: WhatsApp Cloud API e Instagram/Messenger (`messaging`). Atualizações sem mensagem e comentários não viram conversas artificialmente.
- Deduplicação por conta + `provider_message_id`; idempotência na RPC.
- API autenticada de conversas e mensagens com `workspace_id` do cookie de sessão validado, filtragem e paginação; lista de contatos para vínculo com campos mínimos (até 100 recentes).
- Atribuição de conversa para o próprio usuário (assumir/liberar), fechamento/reabertura e vínculo manual/desvínculo com um contato do CRM; todos protegidos por papel, workspace, same-origin e concorrência otimista `row_version`.
- Página `/app/connect` (sujeita ao base path `/crm`) com caixa de entrada mobile-first, conversas, mensagens e responsabilidade.

## Restrições expressas

- **Nenhum deploy, merge ou aplicação de migrations em produção neste incremento.**
- A própria interface informa que o envio de mensagens, IA e campanhas não estão habilitados.
- Não realiza contato automático, não lê informações de crédito, não atribui critérios de elegibilidade, não cria lead nem vincula contatos automaticamente.
- A conexão Meta real ainda depende de App Review, OAuth, campos de webhook, consentimentos e configuração administrativa.
- A nova fila só processa eventos quando a rota interna é invocada por servidor autorizado; não foi agendado cron nem conectado provedor.
- A tabela guarda conteúdo de mensagens. Antes de tráfego real, são obrigatórias regras de retenção e minimização, resposta a solicitações LGPD, logs sanitizados e revisão de proteção de dados.

## Endpoints

| Método | Endpoint | Segurança |
|---|---|---|
| GET | `/api/integrations/meta/webhook` | Verificação Meta |
| POST | `/api/integrations/meta/webhook` | HMAC SHA-256 Meta |
| POST | `/api/internal/connect/process` | Bearer `CONNECT_WORKER_TOKEN` servidor |
| GET | `/api/connect/conversations` | JWT + workspace + papel |
| GET | `/api/connect/conversations/:id/messages` | JWT + workspace + papel |
| POST | `/api/connect/conversations/:id/assignment` | JWT + workspace + papel + same-origin + version |

## Gates de homologação

1. Revisar schema e RPCs; aplicar as duas migrations **em staging isolado**, somente após confirmar histórico e backup.
2. Verificar `connect_*` RLS: `anon` e `viewer` sem acesso, não membros e cross-tenant sem acesso, escritores restritos a `assigned_to,row_version`.
3. Testar recepção HMAC válida/inválida e canal ativo/inativo sob carga controlada.
4. Testar duplicação de evento e de `provider_message_id`; não deve duplicar conversas e mensagens.
5. Testar a fila: claim atômico, lease expirado, retentativas limitadas, ack com token errado e falha de persistência.
6. Testar Inbox com sessão real em `/crm`: cookies, refresh, acesso de visitante, viewer, financeiro, operadores, outro workspace e concorrência de atribuição.
7. Confirmar que o contêiner Hostinger de staging aponta **exclusivamente** para o Supabase oficial novo antes de qualquer teste autenticado real; não usar produção da CLASSY.
8. Revisar os fluxos LGPD, canal/provedor, webhooks, limites de payload e monitoramento; documentar rollback.
9. Executar `npm run typecheck`, `npm run lint`, `npm run build` e `node --test tests/classy-connect-*.test.mjs`.

## Configuração de teste (segredos apenas em infraestrutura)

- `META_WEBHOOK_VERIFY_TOKEN` (v0.1)
- `META_APP_SECRET` (v0.1)
- `CONNECT_WORKER_TOKEN` (v0.2; segredo independente com ao menos 32 caracteres)
- `SUPABASE_URL` / `SUPABASE_SECRET_KEY` (server-only)

Nenhum valor real de segredo é necessário nem deve ser enviado por mensagem.

## Próxima versão

v0.3: editor de automações declarativas, camada explícita de consentimentos, envio Meta permitido por canal/janela, templates, handoff, observabilidade e governança de campanhas, após homologação do recebimento.

## Referências

Meta. (s.d.). *Get started with webhooks*. https://developers.facebook.com/docs/graph-api/webhooks/getting-started/

Supabase. (s.d.). *Row Level Security*. https://supabase.com/docs/guides/database/postgres/row-level-security

Supabase. (2026). *Supabase Changelog*. https://supabase.com/changelog.md
