# Ambientes e Deploy

| Ambiente | Projeto | Uso | Dados | DDL |
|---|---|---|---|---|
| Local/Git | repositório | desenvolvimento e revisão | fictícios | migration nova |
| Staging | FERNANDES (`fnzcmoydjlarelotnmon`) | homologação | fictícios/anonimizados | primeiro destino |
| Produção | CLASSY (`butuqmpyospdsavlwpwv`) | operação real | reais | somente após gate |

## Pipeline oficial

1. Atualizar Work/packet e obter decisão.
2. Criar branch e migration no Git.
3. Implementar e testar localmente.
4. Aplicar exatamente os mesmos artefatos no FERNANDES.
5. Executar regressão, E2E, segurança, advisors e rollback.
6. Review no ChatGPT e aprovação explícita.
7. Backup/restore point conforme impacto.
8. Promover em CLASSY sem edição manual divergente.
9. Smoke test e observação.
10. Atualizar Work e version history.

## Proibições em produção

Seeds livres, resets, testes destrutivos, DDL exploratório, uso de chave de staging, deploy sem rollback e alterações fora das migrations aprovadas.

