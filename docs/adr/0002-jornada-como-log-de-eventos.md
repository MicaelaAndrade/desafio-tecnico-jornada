# ADR-0002 — Jornada modelada como log de eventos

**Status:** Aceito
**Data:** 2026-09-14

## Contexto

O enunciado pede o "registro de eventos relacionados à jornada dos colaboradores". Há duas
formas usuais de modelar isso:

1. **Orientada a estado** — uma linha por colaborador/dia, com colunas `entrada`, `saida`,
   `inicio_almoco`, `fim_almoco`.
2. **Orientada a evento** — uma linha por marcação, com tipo e instante; a jornada do dia é
   derivada pelo pareamento cronológico dessas marcações.

A empresa tem operação internacional, parte da equipe é remota e há colaboradores em
viagens frequentes — cenários que produzem jornadas irregulares.

## Decisão

A jornada é um **log append-only de eventos**. Cada marcação é uma linha em `TimeEntry`
com `type ∈ {CLOCK_IN, BREAK_START, BREAK_END, CLOCK_OUT}` e um instante associado.

Nenhum agregado diário é persistido: totais, saldos e inconsistências são **derivados** na
consulta a partir dos eventos. A única exceção é o snapshot do fechamento mensal
(ver ADR-0005).

## Justificativa

- **É o que o enunciado descreve.** "Registro de eventos" é a formulação literal do
  requisito.
- **Suporta jornadas irregulares sem alteração de schema.** Mais de uma pausa no dia,
  pausas de duração variável, ou um dia com múltiplas entradas e saídas (comum em quem
  viaja ou atende cliente fora) cabem no mesmo modelo. Na modelagem orientada a estado,
  cada variação nova exige coluna nova.
- **Turno que cruza a meia-noite** deixa de ser exceção: os eventos simplesmente carregam
  o mesmo `workDate` (ver ADR-0004).
- **Conformidade.** A legislação brasileira de registro eletrônico de ponto
  (Portaria MTP 671/2021) exige que a marcação seja registrada de forma íntegra e não
  passível de alteração. Um log append-only atende esse requisito por construção; um
  registro mutável orientado a estado, não.
- **Auditabilidade.** Cada linha preserva quem registrou, de onde e por qual origem —
  informação que a modelagem agregada perde.

## Consequências

- O cálculo da jornada passa a ser responsabilidade da aplicação, concentrado num serviço
  de domínio puro e testável (`TimesheetCalculator`). Isso é desejável: é a regra de
  negócio central do sistema e merece cobertura de testes dedicada.
- Sequências inválidas (ex.: dois `CLOCK_IN` seguidos, `CLOCK_OUT` sem `CLOCK_IN`) são
  **possíveis de gravar** e detectadas na leitura, em vez de bloqueadas na escrita. Isso é
  intencional: recusar a marcação do colaborador porque o registro anterior ficou
  inconsistente transferiria a ele um problema que é do RH. O sistema registra e sinaliza.
- Consultas de folha de ponto leem N eventos por dia em vez de 1 linha. Mitigado pelo
  índice `(userId, workDate)`; em volume maior, a evolução natural é uma view materializada
  por competência.

## Alternativas consideradas

- **Modelagem orientada a estado** — leitura mais simples e agregação trivial em SQL;
  descartada por rigidez frente a jornadas irregulares e por não atender ao requisito de
  inviolabilidade do registro.
- **Log de eventos + tabela agregada mantida por trigger** — melhor desempenho de leitura,
  ao custo de duplicidade de verdade e de regra de negócio no banco. Fora do escopo de um
  MVP; registrado como evolução possível.
