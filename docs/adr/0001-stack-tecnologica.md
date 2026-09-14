# ADR-0001 — Stack tecnológica

**Status:** Aceito
**Data:** 2026-09-14

## Contexto

O enunciado informa que o ecossistema atual da empresa é majoritariamente Microsoft no
backend e Angular no frontend, e explicitamente abre espaço para propostas aderentes ao
cenário. Em alinhamento prévio com o time responsável pelo processo, confirmou-se que a
posição é voltada para **Node.js**.

O desafio será avaliado, entre outros critérios, por qualidade de código, modelagem e
adoção de boas práticas de mercado — critérios que penalizam código escrito em uma
tecnologia com a qual não se tem domínio.

## Decisão

| Camada | Escolha |
|---|---|
| Backend | Node.js + TypeScript com **NestJS** |
| ORM | **Prisma** |
| Banco | **PostgreSQL** |
| Frontend | **Angular** (mantido conforme o ecossistema da empresa) |
| Empacotamento | Monorepo (`/backend`, `/frontend`) + Docker Compose |

## Justificativa

**Node.js em vez de .NET.** O desafio é uma amostra de trabalho para uma posição Node.
Entregar código idiomático na tecnologia da vaga é mais informativo para o avaliador do
que uma tentativa em uma stack fora do domínio do candidato — onde o tempo seria gasto em
sintaxe e framework, e não nas decisões de arquitetura que o enunciado pede.

**NestJS em vez de Express puro.** O Nest organiza a aplicação em módulos com injeção de
dependência, controllers, services, guards e pipes. Isso (a) mantém a separação de camadas
explícita e verificável, (b) fornece RBAC declarativo e validação de entrada sem
boilerplate próprio, e (c) usa os mesmos conceitos estruturais de ASP.NET Core e Angular,
o que reduz o custo de leitura para o time atual da empresa.

**Prisma em vez de TypeORM.** O `schema.prisma` funciona como artefato de modelagem legível
— o domínio inteiro se lê num arquivo só, o que é diretamente relevante para o critério
"modelagem da aplicação". As migrations são determinísticas, o que importa para a
reprodutibilidade da avaliação. Prisma é também o padrão corrente do ecossistema Node,
enquanto TypeORM hoje aparece majoritariamente em manutenção de legado.

**PostgreSQL em vez de SQL Server.** O domínio é fortemente dependente de tratamento
correto de instantes no tempo, e o `timestamptz` do Postgres tem semântica precisa para
isso. Adicionalmente, roda em container sem questão de licenciamento, o que simplifica a
execução do projeto por quem for avaliá-lo.

## Consequências

- O campo `workDate` usa o tipo `DATE`, que o Prisma expõe como `Date` em meia-noite UTC.
  Isso é uma armadilha conhecida (erro de "um dia a menos" ao formatar). Mitigação: o
  valor nunca transita por conversão de fuso; toda formatação passa pelo helper único
  `WorkDate` em `src/common/time/`. Ver ADR-0004.
- O time da empresa, vindo de .NET, encontrará os mesmos conceitos estruturais no Nest,
  mas a sintaxe de decorators e o ciclo de vida de módulos exigem familiarização.

## Alternativas consideradas

- **.NET 8 + Entity Framework Core** — máxima aderência ao ecossistema atual descrito no
  enunciado, mas desalinhada com a vaga (Node) e fora do domínio técnico do candidato.
- **Express + camada própria** — menor "mágica" e estrutura demonstravelmente autoral;
  descartada porque o tempo gasto reconstruindo o que o Nest já oferece (DI, guards,
  validação, OpenAPI) sairia do orçamento destinado à modelagem de domínio.
- **TypeORM** — mais próximo do Entity Framework conceitualmente, o que favoreceria a
  leitura pelo time atual; descartado pelos motivos de modelagem e migrations acima.
