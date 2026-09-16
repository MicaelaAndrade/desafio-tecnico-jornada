# Registros de Decisão de Arquitetura (ADR)

Cada arquivo documenta uma decisão relevante: o contexto que a motivou, a decisão em si,
o que ela custa e quais alternativas foram descartadas — e por quê.

O enunciado do desafio afirma que "nem todos os requisitos de negócio foram descritos
explicitamente" e pede que as premissas assumidas sejam documentadas. Estes ADRs são essa
documentação.

| # | Decisão | Por que importa |
|---|---|---|
| [0001](0001-stack-tecnologica.md) | Stack tecnológica | Justifica Node/NestJS/Prisma diante de um ecossistema Microsoft |
| [0002](0002-jornada-como-log-de-eventos.md) | Jornada como log de eventos | Define a modelagem central do domínio |
| [0003](0003-imutabilidade-e-correcoes.md) | Imutabilidade e fluxo de correção | Ataca a dor de "divergências de horário" |
| [0004](0004-estrategia-de-fuso-horario.md) | Estratégia de fuso horário | Trata operação internacional e colaboradores em viagem |
| [0005](0005-fechamento-mensal.md) | Fechamento mensal | Ataca a dor de "inconsistências nos fechamentos" |
| [0006](0006-papeis-e-escopo-de-visao.md) | Papéis e escopo de visão | Colaborador / gestor / RH + minimização de acesso (GDPR) |
| [0007](0007-coerencia-entre-pais-declarado-e-fuso.md) | País declarado × fuso detectado | Avisar sem bloquear: o sistema não recusa jornada que aconteceu |

## Premissas assumidas

Consolidadas aqui por conveniência; o detalhamento está em cada ADR.

1. Uma jornada diária é delimitada por um `CLOCK_IN` e o `CLOCK_OUT` correspondente;
   pausas ocorrem entre eles e podem se repetir.
2. O dia de trabalho ao qual uma marcação pertence é o dia civil **no local onde a
   marcação foi feita**, não no fuso contratual do colaborador.
3. Carga horária esperada é um valor diário por colaborador. Escala por dia da semana e
   calendário de feriados por país estão fora do MVP.
4. Sábados e domingos não geram expectativa de horas; feriados não são tratados, e por isso
   aparecem como dia útil com débito.
5. Dias futuros aparecem na folha sem gerar expectativa de horas: o saldo do mês corrente
   considera apenas os dias já decorridos, pelo calendário do fuso contratual do colaborador.
6. Horas extras e adicional noturno não são apurados: o sistema entrega horas trabalhadas
   e saldo em relação ao esperado, deixando a política de remuneração para a folha.
7. A hierarquia de gestão tem um nível (gestor → subordinado direto).
8. Não há multi-tenancy: a instância atende uma empresa.
9. O país informado na marcação é declaração do colaborador e não participa de cálculo. Se
   contradisser o fuso do dispositivo, a plataforma avisa antes de gravar, mas registra o que
   foi declarado — nunca recusa nem corrige por conta própria.
