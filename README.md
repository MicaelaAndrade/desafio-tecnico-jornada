# Plataforma de Jornada de Trabalho

Plataforma interna para registro e consulta de jornada de trabalho de uma empresa com
operação distribuída entre Brasil e Europa, incluindo colaboradores remotos e em viagem
internacional.

O problema a resolver não é apenas substituir a planilha compartilhada por um formulário:
é eliminar as causas das divergências que ela produz — registros editáveis sem rastro,
horários ambíguos entre fusos e competências que nunca são formalmente encerradas.

## Sobre a escolha do backend

O enunciado informa que o ecossistema atual da empresa usa majoritariamente tecnologias
Microsoft no backend, e abre espaço para propostas aderentes ao cenário. **Este projeto
usa Node.js com NestJS**, e a decisão foi deliberada: em conversa prévia com o time
responsável pelo processo seletivo, confirmou-se que a posição é voltada para Node.

Como o desafio é avaliado por qualidade de código e decisões de arquitetura, entregar
código idiomático na tecnologia da vaga pareceu mais informativo do que uma tentativa numa
stack fora do meu domínio — onde o tempo iria para sintaxe e framework em vez de ir para a
modelagem, que é o que o enunciado pede.

O frontend permanece em **Angular**, conforme o ecossistema descrito. O raciocínio completo,
com as alternativas descartadas, está no [ADR-0001](docs/adr/0001-stack-tecnologica.md).

---

## Como executar

### Requisitos

| | |
|---|---|
| Node.js | **20.19+** ou **22.12+** — exigência do Angular 21 |
| Docker | apenas para o caminho com banco |
| PostgreSQL | 16, se optar por rodar sem Docker |

Confira com `node -v` antes de começar. Versões anteriores instalam as dependências
normalmente e só falham na hora de subir o frontend, com a mensagem
`The Angular CLI requires a minimum Node.js version`.

### Caminho rápido (Docker)

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

### Modo demonstração (sem banco, sem Docker)

Para avaliar a interface e os fluxos sem montar infraestrutura:

```bash
cd backend && npm install && npm run demo      # API na porta 3000
cd frontend && npm install && npm start        # aplicação em http://localhost:4200
```

A aplicação é a real — mesmas rotas, guards, validação e regras de cálculo. O que muda é
apenas o acesso a dados, servido pelo repositório em memória usado nos testes, com o mesmo
cenário do seed. Os dados vivem no processo e somem ao reiniciar; migrations, constraints e
transações não são exercitadas nesse modo. Para avaliar a persistência, use o Docker acima.

### Execução local, sem Docker

Além dos requisitos acima, é preciso uma instância de PostgreSQL 16 em execução.

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
# Backend — 86 testes
cd backend
npm test                # suíte completa
npm run test:unit       # apenas as regras de domínio
npm run test:api        # apenas os testes de API
npm run test:cov        # com cobertura

# Frontend — 72 testes
cd ../frontend
npm test -- --watch=false
```

Nenhum teste do backend exige banco de dados, Docker ou aplicação no ar: os testes de API
sobem a aplicação NestJS de verdade e substituem apenas o acesso a dados por um repositório
em memória. Rodam em qualquer ambiente e servem como porta de CI.

Os testes do frontend rodam em Chrome headless. Em ambiente sem Chrome instalado, aponte a
variável `CHROME_BIN` para o executável — o launcher já está configurado sem sandbox, para
funcionar dentro de contêiner.

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
| [0007](docs/adr/0007-coerencia-entre-pais-declarado-e-fuso.md) | Coerência entre país declarado e fuso detectado |

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

São 158 testes — 86 no backend e 72 no frontend —, concentrados onde o risco está.

**Regras de domínio (48).** Funções puras, testadas sem banco, sem framework e sem mock:

- turno que cruza a meia-noite mantido como jornada única;
- transição de horário de verão em Portugal — cinco horas reais contabilizadas onde o
  relógio de parede mostra quatro;
- jornada cumprida em fuso diferente do contratual;
- cada tipo de inconsistência (saída ausente, entrada duplicada, pausa não encerrada,
  turno implausível);
- a conversão entre o tipo `DATE` do banco e a data civil, que é a origem clássica do erro
  de "um dia a menos".

**API (38).** A aplicação NestJS real é inicializada e exercitada por HTTP, com o mesmo
pipeline de validação, os mesmos guards e as mesmas regras de acesso da execução em
produção. Entre os casos cobertos:

- o instante da marcação vem do servidor, e um `occurredAt` enviado pelo cliente faz a
  requisição ser recusada;
- o dia da jornada é atribuído pelo fuso do local da marcação, e uma jornada em aberto
  mantém o mesmo dia nas marcações seguintes;
- colaborador não lê jornada alheia, gestor só lê a própria equipe, RH lê todos — em cada
  caso verificado pelo endpoint, não apenas pela rota;
- o ciclo completo de correção: solicitação, recusa de auto-homologação, homologação pelo
  gestor, efeito na folha, e a marcação revogada que some do cálculo mas permanece
  auditável;
- fechamento recusado com dia inconsistente, homologação com ressalva, bloqueio de
  marcações no período fechado e reabertura privativa do RH.

**Frontend (38).** Formatação de duração e saldo, resolução de dia da semana sem depender
do fuso do navegador, guarda de rota por papel, e o interceptor HTTP — que anexa o token
apenas a chamadas da própria API e encerra a sessão quando o servidor a recusa. Na tela de
marcação, verifica-se que só são oferecidas as marcações válidas para o estado atual da
jornada, que nenhum horário é enviado pelo cliente, e que um turno em aberto consulta o dia
da jornada em vez do dia de hoje.

O acesso a dados do backend é substituído por um repositório em memória
([`test/support/in-memory-prisma.ts`](backend/test/support/in-memory-prisma.ts)), que
implementa apenas as consultas usadas pela aplicação e falha explicitamente diante de
qualquer outra — um duplo permissivo devolveria dados errados em silêncio. A troca
mantém a suíte executável sem infraestrutura; o que ela não cobre são migrations,
constraints e atomicidade real de transação, que dependem do PostgreSQL.

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
5. Dias que ainda não chegaram aparecem na folha, mas não geram expectativa de horas — o
   saldo do mês corrente reflete apenas os dias decorridos. O corte usa o calendário do
   fuso contratual do colaborador, de modo que quem está em Berlim vira o dia antes de
   quem está em São Paulo.
6. Horas extras e adicional noturno não são apurados — o sistema entrega horas
   trabalhadas e saldo, deixando a política de remuneração para a folha de pagamento.
7. A hierarquia de gestão tem um nível (gestor → subordinado direto).
8. A instância atende uma única empresa; não há multi-tenancy.

## Limitações conhecidas

São escolhas de escopo, não descuidos — cada uma tem um caminho de evolução claro:

- **Calendário de feriados por país.** Brasil, Portugal e Alemanha têm feriados distintos,
  e o MVP não os trata: um feriado aparece como dia útil com débito de horas. A evolução é
  uma tabela de feriados por país consultada no cálculo da expectativa diária.
- **Escala por dia da semana.** A carga esperada é um valor único por colaborador; jornadas
  6x1 ou meio período às sextas não são representáveis.
- **Migração das planilhas atuais.** O cenário descreve um controle feito hoje em planilhas
  compartilhadas, mas não há funcionalidade de importação. O modelo já prevê o caso — as
  marcações têm origem `IMPORT`, distinta de um registro feito pelo colaborador —, de modo
  que o histórico migrado não se confunde com o registrado na plataforma. Falta a rotina de
  leitura da planilha e a conciliação, que dependem do formato real usado pela empresa.
- **Hierarquia de um nível.** Gestor de gestor não enxerga a equipe estendida.
- **Sem refresh token.** A sessão dura o tempo do access token (8h) e exige novo login.
- **Testes contra o banco real.** Os testes de API rodam sobre um repositório em memória,
  o que os torna rápidos e independentes de infraestrutura, mas deixa de fora migrations,
  constraints de integridade e atomicidade de transação. A evolução natural é uma segunda
  suíte com PostgreSQL efêmero (Testcontainers), executada no CI.
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
