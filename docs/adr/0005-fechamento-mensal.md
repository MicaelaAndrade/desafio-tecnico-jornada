# ADR-0005 — Fechamento mensal como entidade com ciclo de vida

**Status:** Aceito
**Data:** 2026-09-14

## Contexto

O enunciado aponta que o processo atual "começou a gerar inconsistências nos fechamentos
mensais". Isso descreve um problema específico: não existe um momento em que a competência
seja declarada encerrada. Enquanto a planilha continua editável, o número que o RH apurou
na segunda-feira pode não ser o mesmo na quarta, sem que ninguém perceba.

## Decisão

O fechamento é modelado como entidade própria (`MonthlyClosing`), única por
`(colaborador, ano, mês)`, com status `OPEN` ou `CLOSED`.

- Enquanto `OPEN`: a competência aceita novas marcações e correções.
- Ao fechar: o sistema **congela um snapshot** (`workedMinutes`, `expectedMinutes`,
  `balanceMinutes`) e registra quem fechou e quando.
- Enquanto `CLOSED`: marcações e correções para aquele período são **recusadas**. Apenas o
  RH pode reabrir, e a reabertura fica registrada.

## Justificativa

- **Ataca diretamente a dor descrita.** Dá à competência um estado explícito, em vez de
  deixá-la implicitamente aberta para sempre.
- **O snapshot é persistido, não recalculado.** Se uma regra de cálculo evoluir (mudança
  de política de intervalo, por exemplo), os meses já homologados não podem mudar de valor
  retroativamente. O número que foi para a folha de pagamento precisa continuar sendo o
  número que foi para a folha de pagamento.
- **Define um ponto de corte para a operação.** O RH passa a ter uma resposta objetiva para
  "esse mês já pode ser processado?".

## Consequências

- O registro de ponto passa a ter uma validação a mais na escrita: verificar se a
  competência do `workDate` está aberta. Implementado como guarda no serviço de jornada.
- Uma marcação esquecida num mês já fechado exige reabertura pelo RH — passo burocrático
  adicional, porém deliberado: é exatamente o controle que hoje não existe.
- O fechamento é por colaborador, não global. Isso permite encerrar a competência de quem
  está com a jornada consistente sem esperar pendências de terceiros. Um fechamento em
  lote por equipe/empresa é uma operação de conveniência sobre esse mesmo modelo,
  registrada como evolução.

## Alternativas consideradas

- **Fechamento global por competência** (um registro por mês, para toda a empresa) —
  mais simples, mas trava o processo inteiro por causa de uma pendência individual, o que
  em operação distribuída entre fusos e países é restritivo demais.
- **Sem entidade de fechamento, apenas um relatório por período** — mantém o problema
  original: nada impede que o passado mude depois de apurado.
- **Bloqueio por data-limite fixa** (ex.: dia 5 do mês seguinte) — automatiza o corte, mas
  não registra a homologação nem permite tratar exceções sem alterar configuração global.
