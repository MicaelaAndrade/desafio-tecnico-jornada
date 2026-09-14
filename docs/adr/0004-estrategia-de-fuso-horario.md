# ADR-0004 — Estratégia de fuso horário

**Status:** Aceito
**Data:** 2026-09-14

## Contexto

Este é o ponto central do cenário descrito no enunciado:

> "colaboradores distribuídos entre Brasil e Europa (...) parte da equipe atua remotamente
> e alguns colaboradores realizam viagens frequentes entre países"

Um colaborador com contrato no Brasil que bate o ponto às 9h em Lisboa está marcando 5h
em São Paulo. Tratar isso ingenuamente produz três classes de erro: horário exibido
errado, jornada atribuída ao dia errado e saldo de horas calculado errado.

## Decisão

### 1. O instante é sempre UTC

`TimeEntry.occurredAt` é `timestamptz` e armazena o instante absoluto. Nenhuma coluna
guarda horário local "solto".

### 2. O horário vem do servidor, não do cliente

Para marcações em tempo real (`source = WEB`), `occurredAt` é atribuído pelo **servidor**.
O cliente informa apenas seu contexto (fuso e país), nunca o instante.

Isso é uma decisão de segurança: se o horário viesse do dispositivo, alterar o relógio do
celular seria fraude de ponto trivial. Lançamentos retroativos legítimos existem, mas
passam pelo fluxo de correção com aprovação (ADR-0003), não pelo caminho comum.

### 3. O fuso do registro é persistido junto com o evento

`TimeEntry.timezone` (IANA, ex.: `Europe/Lisbon`) e `TimeEntry.countryCode` guardam **onde
a marcação foi feita**, que pode divergir de `User.baseTimezone` / `User.countryCode`, que
descrevem o **vínculo contratual**.

Essa separação é o que permite representar o colaborador em viagem sem distorcer o
contrato — e torna visível, na folha, que aquele dia foi trabalhado fora do país de
origem.

### 4. O offset UTC é congelado no registro

`TimeEntry.utcOffsetMinutes` é redundante em relação a `(occurredAt, timezone)`, mas é
persistido de propósito.

A tz database muda: países alteram regras de horário de verão, às vezes retroativamente
(o Brasil extinguiu o DST em 2019; a União Europeia discute o fim da mudança sazonal).
Se o horário local exibido for sempre recalculado a partir da biblioteca vigente, um
registro de ponto pode mudar de horário anos depois por atualização de dependência. Num
sistema com efeito trabalhista, isso é inaceitável. O offset congelado garante que o
horário local histórico é reproduzível.

### 5. O dia da jornada é resolvido no fuso local do registro

`TimeEntry.workDate` (tipo `DATE`) é calculado **na criação**, a partir do horário local
do lugar onde a marcação ocorreu, e nunca mais recalculado.

Exemplo: colaborador com base em `America/Sao_Paulo`, em viagem, bate entrada às
09:00 em `Europe/Lisbon` (= 05:00 em São Paulo, mesmo dia civil em ambos, mas nem sempre).
A jornada é atribuída ao dia **09:00 Lisboa**, porque é o dia de trabalho que a pessoa
efetivamente viveu.

**Regra de continuidade:** eventos posteriores ao `CLOCK_IN` herdam o `workDate` da
jornada aberta até o `CLOCK_OUT` correspondente. É isso que faz um turno iniciado às 22h
e encerrado às 6h ser uma jornada única, e não duas meias-jornadas em dias distintos.

### 6. Exibição

A folha de ponto exibe o **horário local do registro**, rotulado com o fuso
(`09:00 WEST`), porque é o horário que o colaborador reconhece como sendo o seu.
A conversão para o fuso de quem está lendo (ex.: um gestor no Brasil olhando a jornada de
alguém em Portugal) é oferecida como alternância na interface, nunca como padrão silencioso.

## Consequências

- `workDate` é `DATE` no Postgres, e o Prisma o expõe como `Date` em meia-noite UTC.
  Formatá-lo com qualquer função sensível a fuso produz erro de um dia. **Mitigação:** o
  valor nunca passa por conversão; toda leitura e formatação usa o helper único em
  `src/common/time/work-date.ts`. Há teste de regressão cobrindo isso.
- Comparações de "mesmo dia" entre colaboradores em fusos diferentes não são comparações
  de instante. O relatório de equipe agrupa por `workDate`, que é uma data civil local —
  o que é o comportamento desejado para folha de ponto, mas seria errado para, por exemplo,
  um relatório de sobreposição de disponibilidade. Este último usaria `occurredAt`.
- O cálculo de duração usa exclusivamente `occurredAt` (instantes UTC). Durações nunca são
  calculadas sobre horários locais, o que torna o resultado imune a transições de horário
  de verão no meio da jornada.

## Alternativas consideradas

- **Atribuir o dia pelo fuso contratual do colaborador** (`User.baseTimezone`) —
  consistente com a folha do país de contratação, mas quebra a intuição de quem viaja:
  uma entrada às 8h em Lisboa cairia no dia anterior para um contrato brasileiro em alguns
  casos. Descartada por produzir folha que o próprio colaborador não reconhece.
- **Atribuir o dia em UTC** — simples e uniforme, porém arbitrário: nenhum colaborador
  vive no fuso UTC, e jornadas noturnas no Brasil (UTC-3) cairiam sistematicamente no dia
  seguinte.
- **Guardar apenas o horário local, sem UTC** — impossibilita ordenação cronológica
  correta entre colaboradores de fusos diferentes e torna o cálculo de duração incorreto
  em dias de transição de horário de verão.
