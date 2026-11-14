# Fluxo — Workspace

1. Após autenticar, listar apenas memberships ativas.
2. Usuário seleciona workspace; a preferência orienta UI/rotas.
3. Toda consulta envia `workspace_id`; RLS revalida acesso.
4. Ao trocar workspace, limpar caches, busca, seleções e dados 360 anteriores.
5. Para criar workspace, chamar `create_workspace(name, slug)`; a função cria o owner atomicamente.
6. Gestão de membros respeita RBAC e a regra do último owner.

## Falhas seguras

Workspace removido/inativo invalida contexto; ID externo não revela metadados; alteração de role sem permissão falha; nunca confiar apenas no ID salvo pelo navegador.

