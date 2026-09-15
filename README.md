# Plataforma de Jornada de Trabalho

Plataforma interna para registro e consulta de jornada de trabalho de uma empresa com
operação distribuída entre Brasil e Europa, incluindo colaboradores remotos e em viagem
internacional.

O problema a resolver não é apenas substituir a planilha compartilhada por um formulário:
é eliminar as causas das divergências que ela produz — registros editáveis sem rastro,
horários ambíguos entre fusos e competências que nunca são formalmente encerradas.

---

## Como executar

### Caminho rápido (Docker)

Pré-requisito: Docker com Compose v2.

```bash
git clone https://github.com/MicaelaAndrade/desafio-tecnico-jornada.git
cd desafio-tecnico-jornada
docker compose up --build
```

Na primeira execução o banco é criado, as migrations são aplicadas e a carga de
demonstração é inserida automaticamente.

| Serviço | Endereço |
|---|---|
| Aplicação web | http://localhost:4200 |
| API | http://localhost:3000/api |
| Documentação da API (Swagger) | http://localhost:3000/api/docs |
| Banco (PostgreSQL) | `localhost:5432` — usuário/senha/base: `jornada` |

### Execução local, sem Docker

Requisitos: Node.js 22+ e uma instância de PostgreSQL 16.

```bash
# Backend
cd backend
cp .env.example .env            # ajuste DATABASE_URL se necessário
npm install
npx prisma migrate deploy
npx prisma db seed
npm run start:dev               # http://localhost:3000

# Frontend (em outro terminal)
cd frontend
npm install
npm start                       # http://localhost:4200
```

O `ng serve` já encaminha `/api` para `http://localhost:3000` via `proxy.conf.json`, então
não há configuração de CORS a fazer em desenvolvimento.

### Testes

```bash
cd backend
npm test                # suíte completa
npm run test:cov        # com cobertura
```

---

## Acessos de demonstração

Senha para todos os usuários: `jornada123`

| Papel | E-mail | Contexto |
|---|---|---|
| Colaboradora | `ana.souza@ddgroup.example` | Brasil · tem um dia com saída não registrada e uma correção pendente |
| Colaborador | `bruno.almeida@ddgroup.example` | Portugal · plantão noturno semanal que atravessa a meia-noite |
| Colaboradora | `carla.nunes@ddgroup.example` | Alemanha · jornada contratual de 7h |
| Colaborador | `diego.ramos@ddgroup.example` | Contrato no Brasil, últimos dias trabalhados em Lisboa |
| Gestor | `rafael.costa@ddgroup.example` | Enxerga os quatro colaboradores acima |
| RH | `helena.martins@ddgroup.example` | Enxerga todos e fecha competências |

### Roteiro sugerido de avaliação

1. Entre como **Ana Souza** e registre uma marcação em *Meu ponto*. O botão oferecido
   depende do estado atual da jornada — o sistema não permite escolher uma marcação
   inválida.
2. Abra o *Espelho de ponto*. O último dia aparece sinalizado: houve entrada, mas não
   houve saída. O dia não recebe horas estimadas, apenas o apontamento.
3. Clique no ícone de correção naquele dia e solicite a inclusão da saída, com
   justificativa.
4. Entre como **Rafael Costa** (gestor), vá em *Correções* e homologue a solicitação.
   Volte ao espelho da Ana: a marcação passa a existir, marcada como originada de
   correção, e o apontamento desaparece. Nenhum registro anterior foi alterado.
5. Entre como **Diego Ramos** e veja no espelho os dias cumpridos em Lisboa: o horário
   exibido é o local de Portugal, e o dia carrega o ícone de jornada fora do fuso
   contratual.
6. Entre como **Bruno Almeida** e observe o plantão noturno: entrada às 22h e saída às
   6h30 aparecem como uma jornada única, atribuída ao dia em que começou.
7. Entre como **Helena Martins** (RH), vá em *Equipe* e tente fechar a competência de
   quem tem pendência. O sistema recusa e oferece a homologação com ressalva.
8. Com a competência fechada, tente registrar uma marcação naquele período: a API recusa
   com `409`.

---

## Decisões técnicas

As decisões relevantes estão documentadas como ADRs em [`docs/adr`](docs/adr), cada uma
com o contexto, a decisão, as consequências e as alternativas descartadas.

| # | Decisão |
|---|---|
| [0001](docs/adr/0001-stack-tecnologica.md) | Stack tecnológica |
| [0002](docs/adr/0002-jornada-como-log-de-eventos.md) | Jornada modelada como log de eventos |
| [0003](docs/adr/0003-imutabilidade-e-correcoes.md) | Imutabilidade dos registros e fluxo de correção |
| [0004](docs/adr/0004-estrategia-de-fuso-horario.md) | Estratégia de fuso horário |
| [0005](docs/adr/0005-fechamento-mensal.md) | Fechamento mensal com ciclo de vida |
| [0006](docs/adr/0006-papeis-e-escopo-de-visao.md) | Papéis e escopo de visão |

As quatro decisões que mais moldam o sistema, em resumo:

**A jornada é um log append-only de eventos.** Cada marcação é uma linha imutável com
tipo e instante; totais e inconsistências são derivados na leitura. Isso acomoda jornadas
irregulares, plantões noturnos e múltiplas pausas sem alteração de schema, e atende ao
requisito de inviolabilidade do registro de ponto (Portaria MTP 671/2021).

**Registros nunca são editados nem apagados.** Não existe `PUT` nem `DELETE` sobre uma
marcação. Ajustes passam por uma solicitação de correção com justificativa obrigatória e
homologação de terceiro; aprovada, ela cria registros novos e revoga logicamente os
antigos, preservando o histórico completo.

**O tempo é tratado com três informações, não uma.** O instante é gravado em UTC e
definido pelo servidor (o relógio do cliente não é confiável para ponto); o fuso IANA e o
país *do local da marcação* são persistidos junto ao evento, o que representa o
colaborador em viagem sem distorcer o contrato; e o offset UTC é congelado no registro,
para que atualizações futuras da tz database não mudem retroativamente o horário de uma
marcação antiga. O dia da jornada é resolvido no fuso local e congelado, com regra de
continuidade para turnos que cruzam a meia-noite.

**A competência mensal tem estado.** Fechar congela um snapshot das horas apuradas e
bloqueia novas marcações no período; reabrir é privativo do RH e fica registrado. É o que
dá ao RH uma resposta objetiva para "esse mês já pode ser processado?".

---

## Arquitetura

```
.
├── backend/                 API NestJS + Prisma + PostgreSQL
│   ├── prisma/              schema, migrations e carga de demonstração
│   └── src/
│       ├── domain/          regra de negócio pura, sem framework e sem ORM
│       ├── common/          tempo, autenticação, escopo de acesso, erros
│       ├── infra/           acesso a dados
│       └── modules/         auth · users · time-entries · timesheets · corrections · closings
├── frontend/                Angular 18 + Material
│   └── src/app/
│       ├── core/            modelos, serviços, interceptor, guards
│       └── features/        login · ponto · espelho · equipe · correções
└── docs/adr/                registros de decisão de arquitetura
```

O ponto estrutural mais relevante é a separação do diretório `domain`: o cálculo de
jornada — pareamento de eventos, desconto de pausas, saldo e detecção de inconsistências —
não importa nada do Prisma nem do NestJS. A camada de infraestrutura traduz linhas do
banco para tipos do domínio. Na prática, isso significa que a regra de negócio central é
testada sem banco, sem mock e sem subir a aplicação.

### Modelo de dados

- **`User`** — colaborador, com papel, fuso contratual, país, carga diária e gestor.
- **`TimeEntry`** — evento de jornada. Guarda instante em UTC, fuso e país do registro,
  offset congelado, dia da jornada, origem e autoria. Revogação é lógica.
- **`CorrectionRequest`** — solicitação de ajuste, com justificativa, homologação e
  vínculo com os registros que criou e revogou.
- **`MonthlyClosing`** — competência por colaborador, com status e snapshot das horas.

### API

Documentação interativa em `/api/docs`. Principais recursos:

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/auth/login` | Autenticação |
| `GET` | `/api/time-entries/status` | Estado atual da jornada e marcações válidas a seguir |
| `POST` | `/api/time-entries` | Marcação do próprio colaborador (horário do servidor) |
| `POST` | `/api/time-entries/manual` | Lançamento por gestor/RH, com justificativa |
| `GET` | `/api/timesheets/monthly` | Espelho de ponto da competência |
| `GET` | `/api/timesheets/team` | Consolidado da equipe, respeitando o escopo |
| `POST` | `/api/corrections` | Solicitação de correção |
| `PATCH` | `/api/corrections/:id/approve` | Homologação |
| `POST` | `/api/closings/close` | Fechamento da competência |

### Segurança

- Autenticação por JWT; papel e situação do usuário são relidos do banco a cada
  requisição, para que desligamento ou mudança de papel surtam efeito imediato.
- Autenticação é o padrão das rotas — expor uma rota exige declarar `@Public()`
  explicitamente, o que evita endpoint aberto por esquecimento.
- Escopo de visão verificado no **serviço**, não apenas na rota: qualquer endpoint que
  aceite `userId` seria um vazamento se a checagem dependesse só do verbo HTTP.
- Rate limit mais restritivo no login e mensagem de erro idêntica para e-mail inexistente
  e senha incorreta, evitando enumeração de usuários.
- Validação estrita de entrada: campos não declarados no DTO fazem a requisição ser
  recusada.

### Testes

A cobertura foi concentrada onde o risco está: o cálculo da jornada e o tratamento de
tempo. Entre os casos cobertos:

- turno que cruza a meia-noite mantido como jornada única;
- transição de horário de verão em Portugal — cinco horas reais contabilizadas onde o
  relógio de parede mostra quatro;
- jornada cumprida em fuso diferente do contratual;
- cada tipo de inconsistência (saída ausente, entrada duplicada, pausa não encerrada,
  turno implausível);
- a conversão entre o tipo `DATE` do banco e a data civil, que é a origem clássica do erro
  de "um dia a menos".

---

## Premissas assumidas

O enunciado informa que nem todos os requisitos foram descritos explicitamente. As
premissas adotadas estão consolidadas em [`docs/adr/README.md`](docs/adr/README.md);
em resumo:

1. A jornada diária é delimitada por uma entrada e a saída correspondente; pausas ocorrem
   entre elas e podem se repetir.
2. O dia a que uma marcação pertence é o dia civil **no local onde foi feita**, não no
   fuso contratual do colaborador.
3. A carga horária esperada é um valor diário por colaborador.
4. Fim de semana não gera expectativa de horas; o que for trabalhado é contabilizado como
   crédito.
5. Horas extras e adicional noturno não são apurados — o sistema entrega horas
   trabalhadas e saldo, deixando a política de remuneração para a folha de pagamento.
6. A hierarquia de gestão tem um nível (gestor → subordinado direto).
7. A instância atende uma única empresa; não há multi-tenancy.

## Limitações conhecidas

São escolhas de escopo, não descuidos — cada uma tem um caminho de evolução claro:

- **Calendário de feriados por país.** Brasil, Portugal e Alemanha têm feriados distintos,
  e o MVP não os trata: um feriado aparece como dia útil com débito de horas. A evolução é
  uma tabela de feriados por país consultada no cálculo da expectativa diária.
- **Escala por dia da semana.** A carga esperada é um valor único por colaborador; jornadas
  6x1 ou meio período às sextas não são representáveis.
- **Hierarquia de um nível.** Gestor de gestor não enxerga a equipe estendida.
- **Sem refresh token.** A sessão dura o tempo do access token (8h) e exige novo login.
- **Testes end-to-end de API.** A cobertura atual é de testes unitários do domínio; os
  fluxos HTTP não têm testes automatizados.
- **Desempenho em volume.** A folha de ponto lê os eventos do período e agrega em
  aplicação. É adequado para a ordem de grandeza do problema; em volume maior, o caminho
  é uma view materializada por competência.

## Próximos passos

Em ordem de valor para a operação descrita:

1. Calendário de feriados por país e escala por dia da semana.
2. Notificação ao gestor quando houver correção pendente e ao colaborador quando o dia
   ficar inconsistente.
3. Exportação do espelho de ponto em PDF para arquivamento e conferência.
4. Retenção e anonimização de dados de jornada, conforme GDPR — relevante porque a
   operação inclui a União Europeia.
5. Registro de ponto offline com sincronização posterior, para quem está em deslocamento
   sem conectividade.
