import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { CorrectionType, EntrySource, Role, TimeEntryType } from '@prisma/client';
import { AccessScopeService } from '../../src/common/auth/access-scope.service';
import { AuthenticatedUser } from '../../src/common/auth/auth.decorators';
import { CorrectionsService } from '../../src/modules/corrections/corrections.service';
import { PrismaService } from '../../src/infra/prisma/prisma.service';

/**
 * Testes contra PostgreSQL real (ver README, "Limitações conhecidas" →
 * "Testes contra o banco real").
 *
 * O resto da suíte roda contra um repositório em memória
 * (test/support/in-memory-prisma.ts): rápido e sem infraestrutura, mas não
 * exercita as migrations, as constraints de integridade nem a atomicidade de
 * transação de verdade — um duplo permissivo aceitaria dados que o Postgres
 * recusaria. Aqui não há duplo: um Postgres efêmero sobe via Testcontainers,
 * as migrations reais do projeto rodam contra ele, e os testes usam o Prisma
 * Client de verdade.
 *
 * Cada teste cria seus próprios registros com identificadores únicos
 * (randomUUID/e-mail com timestamp) para não colidir com os demais — não há
 * limpeza entre testes porque não há o que limpar.
 *
 * Requer Docker disponível na máquina que rodar `npm run test:db`. Fica fora
 * do `npm test` padrão de propósito (ver jest-db.config.js).
 */
describe('Postgres real · migrations, constraints e transação', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('jornada')
      .withUsername('jornada')
      .withPassword('jornada')
      .start();

    process.env.DATABASE_URL = container.getConnectionUri();

    // Roda as migrations reais do projeto contra o banco efêmero — é isto que
    // prova que os arquivos em prisma/migrations produzem de fato o schema que
    // a aplicação espera. O repositório em memória não verifica isso: ele
    // aceitaria um schema desalinhado sem reclamar.
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: path.resolve(__dirname, '..', '..'),
      env: process.env,
      stdio: 'inherit',
    });

    prisma = new PrismaService();
    await prisma.$connect();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  function dadosUsuario(sobrescreve: Partial<{ name: string; email: string; managerId: string }> = {}) {
    return {
      name: sobrescreve.name ?? 'Usuário de Teste',
      email: sobrescreve.email ?? `teste-${randomUUID()}@teste.example`,
      passwordHash: 'hash-fake-so-para-teste-de-schema',
      baseTimezone: 'America/Sao_Paulo',
      countryCode: 'BR',
      managerId: sobrescreve.managerId,
    };
  }

  it('aplica as migrations reais e deixa o schema utilizável', async () => {
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it('recusa dois usuários com o mesmo e-mail — constraint @unique do schema', async () => {
    const email = `duplicado-${randomUUID()}@teste.example`;
    await prisma.user.create({ data: dadosUsuario({ email }) });

    await expect(prisma.user.create({ data: dadosUsuario({ email }) })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('recusa uma marcação para um colaborador inexistente — foreign key do schema', async () => {
    const idInexistente = randomUUID();

    await expect(
      prisma.timeEntry.create({
        data: {
          userId: idInexistente,
          registeredById: idInexistente,
          type: TimeEntryType.CLOCK_IN,
          occurredAt: new Date('2026-01-05T09:00:00Z'),
          timezone: 'America/Sao_Paulo',
          countryCode: 'BR',
          utcOffsetMinutes: -180,
          workDate: new Date('2026-01-05'),
          source: EntrySource.WEB,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('recusa dois fechamentos para a mesma competência — constraint @@unique([userId, year, month])', async () => {
    const usuario = await prisma.user.create({ data: dadosUsuario() });

    await prisma.monthlyClosing.create({ data: { userId: usuario.id, year: 2026, month: 1 } });

    await expect(
      prisma.monthlyClosing.create({ data: { userId: usuario.id, year: 2026, month: 1 } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it(
    'reverte a revogação da marcação antiga quando a homologação falha depois — ' +
      'atomicidade real da transação de aprovação',
    async () => {
      // Cenário: uma correção MODIFY chega com um fuso inválido no campo proposto.
      // O fluxo normal de solicitação (CorrectionsService.request) nunca deixaria
      // isso chegar ao banco — valida o fuso antes de salvar. Aqui ele é inserido
      // direto, ignorando essa validação de propósito: o objetivo não é testar a
      // validação de entrada (isso já está coberto pelos testes de API), e sim
      // forçar o SEGUNDO passo da transação de homologação (a criação da nova
      // marcação) a falhar DEPOIS que o primeiro passo (a revogação da antiga) já
      // escreveu. É exatamente esse cenário — dois passos, o segundo falhando —
      // que prova, ou não, a atomicidade real contra um Postgres de verdade; um
      // repositório em memória não teria como reproduzir um rollback de verdade.
      const gestor = await prisma.user.create({ data: dadosUsuario({ name: 'Gestora' }) });
      const colaborador = await prisma.user.create({
        data: dadosUsuario({ name: 'Colaborador', managerId: gestor.id }),
      });

      const marcacaoOriginal = await prisma.timeEntry.create({
        data: {
          userId: colaborador.id,
          registeredById: colaborador.id,
          type: TimeEntryType.CLOCK_IN,
          occurredAt: new Date('2026-01-05T09:00:00Z'),
          timezone: 'America/Sao_Paulo',
          countryCode: 'BR',
          utcOffsetMinutes: -180,
          workDate: new Date('2026-01-05'),
          source: EntrySource.WEB,
        },
      });

      const correcao = await prisma.correctionRequest.create({
        data: {
          userId: colaborador.id,
          requestedById: colaborador.id,
          type: CorrectionType.MODIFY,
          targetEntryId: marcacaoOriginal.id,
          proposedType: TimeEntryType.CLOCK_IN,
          proposedOccurredAt: new Date('2026-01-05T09:05:00Z'),
          proposedTimezone: 'Fuso/Que/Nao/Existe',
          workDate: new Date('2026-01-05'),
          reason: 'Ajuste de horário de entrada',
        },
      });

      const requester: AuthenticatedUser = {
        id: gestor.id,
        email: gestor.email,
        role: Role.MANAGER,
        baseTimezone: gestor.baseTimezone,
        countryCode: gestor.countryCode,
      };

      const corrections = new CorrectionsService(prisma, new AccessScopeService(prisma));

      await expect(corrections.approve(requester, correcao.id, {})).rejects.toThrow();

      const marcacaoRecarregada = await prisma.timeEntry.findUniqueOrThrow({
        where: { id: marcacaoOriginal.id },
      });
      expect(marcacaoRecarregada.revokedAt).toBeNull();

      const correcaoRecarregada = await prisma.correctionRequest.findUniqueOrThrow({
        where: { id: correcao.id },
      });
      expect(correcaoRecarregada.status).toBe('PENDING');
    },
  );
});
