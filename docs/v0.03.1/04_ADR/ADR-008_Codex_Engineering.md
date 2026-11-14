# ADR-008 — Codex como executor de engenharia

**Status:** Aceita

## Decisão

Separar decisão/documentação de implementação. ChatGPT pesquisa e decide; Work mantém documentação; ChatGPT produz handoff; Codex altera Git; ChatGPT revisa; Work consolida.

## Consequências

Todo Development Packet deve conter escopo, arquivos, invariantes, testes, aceite, deploy e rollback. Codex não redefine arquitetura silenciosamente e não toca produção sem gate.

