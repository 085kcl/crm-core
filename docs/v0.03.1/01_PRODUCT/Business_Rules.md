# Regras de Negócio

| ID | Regra |
|---|---|
| BR-001 | O workspace é o tenant operacional. |
| BR-002 | Todo registro de negócio deve carregar `workspace_id`. |
| BR-003 | Membership deve estar ativa para permitir acesso. |
| BR-004 | `viewer` não escreve dados operacionais. |
| BR-005 | Somente owner/admin/manager configuram ou excluem dados conforme helpers atuais. |
| BR-006 | O último owner ativo não pode ser removido, inativado ou rebaixado. |
| BR-007 | Owner/assignee deve ser membro ativo do mesmo workspace. |
| BR-008 | Relações entre entidades não podem atravessar tenants. |
| BR-009 | Contato possui no máximo uma empresa principal. |
| BR-010 | Workspace possui no máximo um pipeline padrão ativo. |
| BR-011 | Score do lead varia de 0 a 100. |
| BR-012 | Lead convertido recebe `converted_at`; reversão coerente limpa o timestamp quando aplicável. |
| BR-013 | Estado do deal deriva do estágio; fechamento/lost reason permanecem coerentes. |
| BR-014 | Mover deal registra atividade `deal.stage_changed`. |
| BR-015 | Tarefa concluída recebe `completed_at`; demais estados limpam o timestamp. |
| BR-016 | Activity descreve evento comercial; Audit registra mutação técnica/administrativa. Não unificar. |
| BR-017 | Outbox é privada e processada por backend/worker idempotente. |
| BR-018 | Nome/slug de tag é único no workspace conforme constraints. |
| BR-019 | Tag só pode apontar para entidade suportada no mesmo workspace. |
| BR-020 | Definição de custom field é específica por workspace + entidade + chave. |
| BR-021 | Valor de custom field deve respeitar tipo, opções e entidade da definição. |
| BR-022 | Busca e Contact 360 exigem workspace explícito e membership ativo. |
| BR-023 | Contato externo retorna ausência genérica; nunca indicar que existe em outro tenant. |
| BR-024 | Mudanças de schema entram primeiro em staging por migration versionada. |

