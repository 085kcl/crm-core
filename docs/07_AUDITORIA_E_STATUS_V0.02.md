# Auditoria Técnica e Status — CRM Core v0.02

## Resumo

O pacote v0.01 continha uma fundação consistente de arquitetura, documentação e banco, mas não continha frontend executável. A v0.02 implementa o Incremento 0/1 e acrescenta duas migrations de endurecimento.

## Entregue

- Site responsivo com login, recuperação de senha, workspace e dashboard.
- Modo demonstrativo explicitamente não canônico.
- Integração Supabase preparada por rotas server-side, sem `service_role` no cliente.
- Sessão armazenada em cookies `HttpOnly`, `SameSite=Lax` e `Secure` em produção.
- Renovação automática da sessão usando refresh token em cookie protegido.
- Verificação de mesma origem nas rotas de mutação para reduzir risco de CSRF.
- Seleção de workspace tratada como preferência; RLS permanece como autorização efetiva.
- Estados de loading, vazio, erro e sucesso nos fluxos principais.

## Endurecimento incluído na migration 004

1. Perfis de membros passam a ser visíveis apenas entre usuários que compartilham workspace ativo.
2. `created_by`, `updated_by` e `actor_id` passam a ser carimbados no banco para reduzir falsificação pelo cliente.
3. Owners e responsáveis precisam ser membros ativos do mesmo workspace.
4. O estado de um negócio passa a seguir a etapa do pipeline.
5. Mudança de etapa gera `deal.stage_changed` no banco.
6. `completed_at` e `converted_at` passam a acompanhar os estados de tarefa e lead.
7. Apenas uma empresa principal por contato e um pipeline padrão ativo por workspace.
8. Atividades comerciais deixam de poder ser atualizadas ou excluídas por clientes autenticados.

## Endurecimento incluído na migration 005

- Funções privilegiadas internas e funções de trigger são movidas para schema privado.
- `search_path` das funções privilegiadas é fixado como vazio e os objetos são qualificados por schema.
- Apenas a RPC deliberadamente pública `create_workspace` permanece no schema exposto, com execução limitada a usuários autenticados.

## Pontos ainda abertos

- validar as migrations em um projeto Supabase limpo e em uma cópia com dados;
- implementar rate limiting, MFA e política de sessão;
- trocar o RBAC grosseiro por autorização por domínio/ação;
- validar referências polimórficas no servidor ou substituí-las por relações tipadas;
- definir política LGPD de retenção, anonimização, exportação e descarte;
- evitar duplicação excessiva de dados pessoais no audit log;
- implementar convites e transferência controlada de ownership;
- executar testes cross-tenant com pelo menos dois usuários e dois workspaces.

## Próximo incremento recomendado

Incremento 2: contatos e empresas, incluindo busca, filtros, relação N:N, detalhe 360° e dados de demonstração somente em ambiente não produtivo.
