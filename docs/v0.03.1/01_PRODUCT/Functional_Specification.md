# Especificação Funcional

## Atores

- **Owner:** proprietário do workspace; responsabilidade final por configuração e membros.
- **Admin:** administra workspace e dados, respeitando invariantes do owner.
- **Manager:** gerencia configuração operacional e registros.
- **Sales/Marketing/Finance/Support:** operam dados conforme o RBAC atual.
- **Viewer:** acesso de leitura.
- **Worker:** processador backend de eventos privados da outbox.

## Módulos

### Autenticação e sessão

Login, logout, recuperação, refresh, sessão protegida por cookies e redirecionamento de usuário não autenticado. O frontend usa publishable key e JWT do usuário; nunca usa `service_role`.

### Workspace

Listar workspaces do usuário, criar workspace, selecionar workspace ativo, consultar configurações e administrar membros conforme papel. A seleção é preferência de interface, não prova de autorização.

### Contatos e empresas

CRUD tenant-aware, associação N:N, empresa principal, proprietário ativo do mesmo workspace, status e rastreabilidade de criação/atualização.

### Leads

Criar a partir de contato, registrar origem, score de 0–100, status, qualificação, owner e conversão com timestamp coerente.

### Pipelines e negócios

Manter pipelines e estágios ordenados, limitar um pipeline padrão ativo, criar negócios ligados a contato/empresa/lead e sincronizar `state`/fechamento com o estágio. Mudança de estágio gera atividade.

### Operações

Tarefas com responsável, prioridade, status e vencimento; notas ligadas a entidades; atividades comerciais imutáveis/append-oriented; audit log separado para mutações sensíveis.

### Tags

Criar catálogo por workspace e associar tags a entidades suportadas, sem duplicidade e sem vínculo cross-tenant.

### Custom Fields

Definir campos por workspace e tipo de entidade; suportar tipos `text`, `textarea`, `integer`, `decimal`, `currency`, `boolean`, `date`, `datetime`, `select`, `multiselect`, `email`, `phone`, `url`; validar valor JSON conforme tipo/opções.

### Busca Global

Pesquisar contatos, empresas, leads e negócios no workspace ativo, com FTS e fallbacks específicos para e-mail, telefone, WhatsApp, documento, CNPJ/CPF e website. Ordenar por relevância, limitar 1–100 e limpar estado ao trocar workspace.

### Contact 360

Exibir resumo do contato, owner, empresas, leads, negócios, tarefas, notas, atividades, tags, custom fields e métricas agregadas. UUID externo retorna `null`/estado genérico, sem enumeração de dados.

## Estados de interface obrigatórios

Loading, vazio, erro recuperável, sem permissão/não encontrado genérico e sucesso. A interface deve ser responsiva, navegável por teclado e preservar o shell atual.

