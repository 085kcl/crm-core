# ADR-001 — Work/Sites como frontend inicial

Status: Aceito para MVP.

## Contexto

É necessário acelerar desenvolvimento e iteração visual sem tornar a plataforma dependente de um frontend específico.

## Decisão

Usar ChatGPT Work/Sites como experiência inicial do CRM e manter Supabase/PostgreSQL como backend canônico.

## Consequências

Positivas:
- iteração rápida;
- preview e publicação simplificados;
- manutenção conversacional;
- possibilidade de substituir frontend no futuro.

Riscos:
- Sites está em beta;
- limites e capacidades podem mudar;
- requisitos avançados de backend devem permanecer fora da camada de Sites.
