# Requisitos Funcionais e Não Funcionais

## Requisitos funcionais

| ID | Requisito | Estado |
|---|---|---|
| RF-001 | Autenticar usuário por Supabase Auth | Implementado |
| RF-002 | Encerrar e renovar sessão com segurança | Implementado |
| RF-003 | Recuperar acesso por fluxo de senha | Implementado |
| RF-004 | Listar somente workspaces do usuário | Implementado |
| RF-005 | Criar workspace e owner inicial atomicamente | Implementado |
| RF-006 | Selecionar e trocar workspace ativo | Implementado |
| RF-007 | Administrar membros e papéis | Implementado no backend/base UI |
| RF-008 | CRUD de contatos tenant-aware | Implementado |
| RF-009 | CRUD de empresas e vínculos com contatos | Implementado no modelo/backend |
| RF-010 | Criar e qualificar leads | Implementado no modelo/backend |
| RF-011 | Manter pipelines e estágios | Implementado no modelo/backend |
| RF-012 | Criar e mover negócios no pipeline | Implementado no modelo/backend |
| RF-013 | Criar tarefas, notas e atividades | Implementado no modelo/backend |
| RF-014 | Registrar activity de mudança de estágio | Implementado |
| RF-015 | Registrar audit de mutações sensíveis | Implementado |
| RF-016 | Gravar eventos assíncronos na outbox privada | Implementado como infraestrutura |
| RF-017 | Criar e gerir tags por workspace | Implementado v0.03 |
| RF-018 | Associar tags a múltiplos tipos de entidade | Implementado v0.03 |
| RF-019 | Definir custom fields tipados | Implementado v0.03 |
| RF-020 | Validar valores de custom fields no banco | Implementado v0.03 |
| RF-021 | Pesquisar globalmente por FTS | Implementado v0.03 |
| RF-022 | Exibir Contact 360 | Implementado v0.03 |
| RF-023 | Limpar busca/dados ao trocar workspace | Implementado/aceite v0.03 |
| RF-024 | Não revelar entidade de outro workspace | Implementado/aceite v0.03 |
| RF-025 | Oferecer analytics operacionais | Planejado v0.04 |

## Requisitos não funcionais

| ID | Requisito | Critério |
|---|---|---|
| RNF-001 | Isolamento | nenhuma leitura/escrita cross-tenant com JWT comum |
| RNF-002 | Autorização | RLS no banco + RBAC por capacidade |
| RNF-003 | Segredos | zero `service_role`/secret no cliente, Git ou logs |
| RNF-004 | Integridade | FKs/constraints/triggers impedem referências inválidas |
| RNF-005 | Portabilidade | frontend substituível sem migrar dados/regras centrais |
| RNF-006 | Versionamento | schema alterado somente por migrations no Git |
| RNF-007 | Auditabilidade | trilha técnica distinta do histórico comercial |
| RNF-008 | Disponibilidade | falha de integração não reverte transação principal |
| RNF-009 | Performance | índices por workspace e GIN para FTS; validar por plano/carga |
| RNF-010 | Responsividade | desktop, tablet e mobile sem perda de função |
| RNF-011 | Acessibilidade | teclado, foco visível, labels e contraste adequados |
| RNF-012 | Observabilidade | logs, advisors, eventos e erros acionáveis |
| RNF-013 | Privacidade | minimizar PII em logs e aplicar retenção definida |
| RNF-014 | Recuperação | rollback testado ou estratégia forward-fix documentada |
| RNF-015 | Deploy | FERNANDES → testes → aprovação → CLASSY |

