# CLASSY Connect — Incremento 0.1: ingresso de eventos Meta

**Status:** código em desenvolvimento; **não conectado à Meta nem habilitado em produção**.

## Objetivo e escopo

Esta entrega implementa apenas a fundação segura de entrada:
- `GET /api/integrations/meta/webhook`: validação de assinatura da assinatura do webhook (challenge/token).
- `POST /api/integrations/meta/webhook`: validação HMAC SHA-256 do corpo bruto; limite de 256 KiB; normalização de Instagram, Messenger e WhatsApp.
- `public.connect_channels`: associação operacional de identificadores de contas do provedor com workspaces. **Não confiar em workspace_id de payloads externos**.
- `public.connect_webhook_events`: fila privada e deduplicada de eventos.
- `public.ingest_connect_webhook_events(jsonb)`: RPC exclusiva de `service_role` que resolve o workspace a partir da associação operacional da conta e grava lote em transação única.

**Fora do escopo**: login OAuth da Meta, permissões verificadas, interface de mensagens, envio privado, autoresponder, leads, IA, opt-in, editor visual de fluxos, processador da fila e campanhas. Nenhum envio ao cliente ocorre neste incremento.

## Segurança e segregação

1. A assinatura `x-hub-signature-256` deve corresponder ao HMAC-SHA256 do **corpo original** assinado pelo Meta App Secret. Credenciais incorretas retornam 401.
2. O token `META_WEBHOOK_VERIFY_TOKEN` permite somente o handshake GET, não autentica os POSTs.
3. Os canais são inativos por padrão; só é permitido ativá-los após vinculação e prova operacional da posse da conta na Meta.
4. O banco associa canal e workspace por `(provider, external_account_id)`; `workspace_id` nunca é aceito do webhook.
5. Apenas `service_role` possui privilégios nas novas tabelas e RPC. RLS está habilitada e nenhum acesso de `anon` ou `authenticated` é concedido.
6. Deduplicação por hash de conteúdo canônico *por conta e entrada*. Eventos logicamente iguais enviados com conteúdo diferente podem exigir segunda camada de deduplicação por IDs de mensagens na etapa de processamento.
7. Erros de persistência retornam 503 para permitir retries oficiais. Não registrar payloads pessoais em logs.
8. O endpoint confirma eventos de contas desconhecidas, mas **descarta sua persistência**, para impedir roteamento não autorizado. Instrumentar contagem/alertas agregados antes do piloto.
9. Nenhum token de página, WhatsApp ou App Secret deve ser colocado em variáveis públicas, repositório ou frontend.

## Variáveis de ambiente

```dotenv
META_WEBHOOK_VERIFY_TOKEN=<string aleatória forte definida também no painel Meta>
META_APP_SECRET=<App Secret do aplicativo da Meta>
SUPABASE_URL=<URL do projeto Supabase>
SUPABASE_SECRET_KEY=<chave secret de servidor ou service_role legado>
```

Configure em um cofre/secret manager de ambiente. Nunca use `NEXT_PUBLIC_` para elas. Não inclua valores reais em issues, logs, builds ou prints.

## Preparação de homologação (não produção)

1. Resolver e homologar o deploy same-origin `/crm` do CRM Core antes de configurar a URL pública. O path efetivo pode ser `/crm/api/integrations/meta/webhook`; confirmar roteamento no ambiente implantado, não presumir.
2. Aplicar a migration `20261114160000_crm_connect_meta_ingress.sql` **apenas em staging** após backup e revisão SQL, mantendo o histórico de migrations.
3. Configurar secrets de staging. Criar um aplicativo Meta com conta de testes, habilitar webhooks e somente as permissões oficiais adequadas.
4. Configurar o callback HTTPS validado pelo GET da Meta.
5. Após comprovação de conta e de assinatura válida, um administrador de infraestrutura provisiona o canal no banco usando acesso privilegiado. Por exemplo, em contexto administrativo controlado:
   ```sql
   insert into public.connect_channels (workspace_id, provider, external_account_id, active)
   values ('<workspace_uuid_autorizado>', 'instagram', '<instagram_professional_account_id>', true);
   ```
6. Confirmar que um webhook autêntico cria apenas um registro `queued` no workspace esperado, sem envio de mensagens. Repetir o mesmo evento e verificar que não cria uma segunda linha.
7. Testar assinatura inválida (401), falha do Supabase (503), canal não cadastrado (sem persistência), canal inativo (sem persistência), payload malformado e tentativa cross-workspace.

## Gates obrigatórios antes de ativar tráfego real

- [ ] Meta App Review e permissões necessárias para os eventos pretendidos.
- [ ] OAuth/token lifecycle e rotação segura de credenciais dos canais.
- [ ] Política LGPD de minimização, retenção, exclusão, exportação e controle de acesso dos payloads.
- [ ] Monitoramento de eventos descartados, falhas de assinatura, fila e processamento.
- [ ] Rate limiting na borda, proteção de disponibilidade e revisão do limite 256 KiB para batches reais.
- [ ] Testes reais de RLS/tenant no Supabase, testes end-to-end e análise de segurança do banco.
- [ ] Processador idempotente da fila, estados de processamento, leases e fila de falhas.
- [ ] Regras de consentimento, janelas de atendimento e mensagens autorizadas por canal.
- [ ] Handoff humano e política de automação CLASSY de crédito imobiliário.
- [ ] Plano de rollback e homologação do `/crm` sem afetar as integrações existentes.

## Próximos incrementos

**0.2 — Inbox:** canais autorizados, conversas, mensagens recebidas, estados e atribuição a atendentes.

**0.3 — Motor de automação:** gatilhos e ações declarativas; executor com idempotência; pausas, opt-out e reentrada; nenhuma mensagem sem verificação da janela de envio e base legal adequada.

**0.4 — Interface:** caixa de entrada omnicanal e editor visual de fluxos, seguindo o design system do CRM e a identidade CLASSY (fundo claro nas telas densas, dourado pontual e contraste acessível).

**0.5 — Inteligência:** respostas consultivas baseadas em documentação oficial revisada, com revisão humana e sem simulação tratada como aprovação.

## Referências de API

Meta. *Get started with webhooks*. https://developers.facebook.com/docs/graph-api/webhooks/getting-started/

Meta. *Set Up Webhooks for Instagram*. https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-instagram/

Meta. *Instagram Messaging Changelog*. https://developers.facebook.com/documentation/business-messaging/instagram-messaging/changelog/
