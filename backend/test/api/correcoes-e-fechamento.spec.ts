import request from 'supertest';
import { AmbienteApi, UsuarioDeTeste, criarAmbienteApi } from '../support/api-test-app';

function comoData(workDate: string): Date {
  return new Date(`${workDate}T00:00:00.000Z`);
}

describe('API · correções e fechamento de competência', () => {
  let ambiente: AmbienteApi;

  beforeAll(async () => {
    ambiente = await criarAmbienteApi();
  });

  afterAll(async () => {
    await ambiente.encerrar();
  });

  const http = () => request(ambiente.app.getHttpServer());
  const comoUsuario = (usuario: UsuarioDeTeste) => `Bearer ${ambiente.tokenDe(usuario)}`;

  function semearMarcacao(params: {
    usuario: UsuarioDeTeste;
    type: string;
    occurredAt: string;
    workDate: string;
  }) {
    return ambiente.prisma.timeEntry.semear({
      userId: params.usuario.id,
      type: params.type,
      occurredAt: new Date(params.occurredAt),
      timezone: params.usuario.baseTimezone,
      countryCode: params.usuario.countryCode,
      utcOffsetMinutes: -180,
      workDate: comoData(params.workDate),
      registeredById: params.usuario.id,
    });
  }

  describe('inclusão de marcação esquecida', () => {
    const dia = '2026-08-10';
    let correcaoId: string;

    beforeAll(() => {
      ambiente.prisma.timeEntry.limpar();
      ambiente.prisma.correctionRequest.limpar();
      ambiente.prisma.monthlyClosing.limpar();

      // Jornada aberta e nunca encerrada.
      semearMarcacao({
        usuario: ambiente.usuarios.ana,
        type: 'CLOCK_IN',
        occurredAt: '2026-08-10T12:00:00Z',
        workDate: dia,
      });
    });

    it('recusa solicitação sem justificativa específica', async () => {
      await http()
        .post('/api/corrections')
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .send({
          type: 'ADD',
          proposedType: 'CLOCK_OUT',
          proposedOccurredAt: '2026-08-10T21:00:00.000Z',
          proposedTimezone: 'America/Sao_Paulo',
          workDate: dia,
          reason: 'esqueci',
        })
        .expect(400);
    });

    it('registra a solicitação como pendente', async () => {
      const resposta = await http()
        .post('/api/corrections')
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .send({
          type: 'ADD',
          proposedType: 'CLOCK_OUT',
          proposedOccurredAt: '2026-08-10T21:00:00.000Z',
          proposedTimezone: 'America/Sao_Paulo',
          proposedCountry: 'BR',
          workDate: dia,
          reason: 'Esqueci de registrar a saída; encerrei o expediente às 18h.',
        })
        .expect(201);

      expect(resposta.body).toMatchObject({
        status: 'PENDING',
        type: 'ADD',
        userId: ambiente.usuarios.ana.id,
        requestedById: ambiente.usuarios.ana.id,
        workDate: dia,
      });

      correcaoId = resposta.body.id;
    });

    it('impede o próprio solicitante de homologar', async () => {
      await http()
        .patch(`/api/corrections/${correcaoId}/approve`)
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .send({})
        .expect(403);
    });

    it('aplica a correção à folha quando o gestor homologa', async () => {
      const antes = await http()
        .get('/api/timesheets/monthly')
        .query({ year: 2026, month: 8, userId: ambiente.usuarios.ana.id })
        .set('Authorization', comoUsuario(ambiente.usuarios.gestor))
        .expect(200);

      const diaAntes = antes.body.days.find((d: { workDate: string }) => d.workDate === dia);
      expect(diaAntes.workedMinutes).toBe(0);
      expect(diaAntes.isConsistent).toBe(false);

      await http()
        .patch(`/api/corrections/${correcaoId}/approve`)
        .set('Authorization', comoUsuario(ambiente.usuarios.gestor))
        .send({ reviewNote: 'Confirmado com o time.' })
        .expect(200);

      const depois = await http()
        .get('/api/timesheets/monthly')
        .query({ year: 2026, month: 8, userId: ambiente.usuarios.ana.id })
        .set('Authorization', comoUsuario(ambiente.usuarios.gestor))
        .expect(200);

      const diaDepois = depois.body.days.find((d: { workDate: string }) => d.workDate === dia);

      expect(diaDepois.workedMinutes).toBe(540);
      expect(diaDepois.isConsistent).toBe(true);

      // A marcação criada carrega a origem e a autoria da homologação.
      const criada = diaDepois.entries.find((e: { type: string }) => e.type === 'CLOCK_OUT');
      expect(criada.source).toBe('CORRECTION');
      expect(criada.registeredById).toBe(ambiente.usuarios.gestor.id);
    });

    it('recusa homologar uma correção já analisada', async () => {
      await http()
        .patch(`/api/corrections/${correcaoId}/approve`)
        .set('Authorization', comoUsuario(ambiente.usuarios.gestor))
        .send({})
        .expect(409);
    });
  });

  describe('remoção de marcação indevida', () => {
    const dia = '2026-08-11';
    let marcacaoId: string;

    beforeAll(() => {
      ambiente.prisma.timeEntry.limpar();
      ambiente.prisma.correctionRequest.limpar();

      semearMarcacao({
        usuario: ambiente.usuarios.ana,
        type: 'CLOCK_IN',
        occurredAt: '2026-08-11T12:00:00Z',
        workDate: dia,
      });
      const duplicada = semearMarcacao({
        usuario: ambiente.usuarios.ana,
        type: 'CLOCK_IN',
        occurredAt: '2026-08-11T12:05:00Z',
        workDate: dia,
      });
      semearMarcacao({
        usuario: ambiente.usuarios.ana,
        type: 'CLOCK_OUT',
        occurredAt: '2026-08-11T21:00:00Z',
        workDate: dia,
      });

      marcacaoId = duplicada['id'];
    });

    it('revoga a marcação sem removê-la da base', async () => {
      const solicitacao = await http()
        .post('/api/corrections')
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .send({
          type: 'REMOVE',
          targetEntryId: marcacaoId,
          workDate: dia,
          reason: 'Registrei a entrada duas vezes por engano.',
        })
        .expect(201);

      await http()
        .patch(`/api/corrections/${solicitacao.body.id}/approve`)
        .set('Authorization', comoUsuario(ambiente.usuarios.gestor))
        .send({})
        .expect(200);

      // Some do cálculo...
      const espelho = await http()
        .get('/api/timesheets/monthly')
        .query({ year: 2026, month: 8, userId: ambiente.usuarios.ana.id })
        .set('Authorization', comoUsuario(ambiente.usuarios.gestor))
        .expect(200);

      const apurado = espelho.body.days.find((d: { workDate: string }) => d.workDate === dia);
      expect(apurado.entries.map((e: { id: string }) => e.id)).not.toContain(marcacaoId);
      expect(apurado.isConsistent).toBe(true);

      // ...mas continua auditável.
      const auditoria = await http()
        .get('/api/time-entries')
        .query({ userId: ambiente.usuarios.ana.id, includeRevoked: true })
        .set('Authorization', comoUsuario(ambiente.usuarios.gestor))
        .expect(200);

      const revogada = auditoria.body.find((e: { id: string }) => e.id === marcacaoId);
      expect(revogada).toBeDefined();
      expect(revogada.revokedAt).not.toBeNull();
    });

    it('recusa nova correção sobre uma marcação já revogada', async () => {
      await http()
        .post('/api/corrections')
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .send({
          type: 'REMOVE',
          targetEntryId: marcacaoId,
          workDate: dia,
          reason: 'Tentativa de revogar novamente a mesma marcação.',
        })
        .expect(409);
    });
  });

  describe('fechamento da competência', () => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth() + 1;
    const diaDeHoje = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(hoje);

    beforeAll(() => {
      ambiente.prisma.timeEntry.limpar();
      ambiente.prisma.correctionRequest.limpar();
      ambiente.prisma.monthlyClosing.limpar();

      // Jornada aberta no mês corrente: a competência tem pendência.
      semearMarcacao({
        usuario: ambiente.usuarios.ana,
        type: 'CLOCK_IN',
        occurredAt: new Date(Date.now() - 4 * 3_600_000).toISOString(),
        workDate: diaDeHoje,
      });
    });

    it('impede o colaborador de fechar a própria competência', async () => {
      await http()
        .post('/api/closings/close')
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .send({ userId: ambiente.usuarios.ana.id, year: ano, month: mes })
        .expect(403);
    });

    it('recusa o fechamento enquanto houver dia inconsistente', async () => {
      const resposta = await http()
        .post('/api/closings/close')
        .set('Authorization', comoUsuario(ambiente.usuarios.rh))
        .send({ userId: ambiente.usuarios.ana.id, year: ano, month: mes })
        .expect(409);

      expect(resposta.body.message).toContain('inconsistência');
    });

    it('permite homologar com ressalva e congela o total apurado', async () => {
      const resposta = await http()
        .post('/api/closings/close')
        .set('Authorization', comoUsuario(ambiente.usuarios.rh))
        .send({
          userId: ambiente.usuarios.ana.id,
          year: ano,
          month: mes,
          force: true,
          note: 'Pendência tratada fora do sistema.',
        })
        .expect(201);

      expect(resposta.body).toMatchObject({
        status: 'CLOSED',
        closedById: ambiente.usuarios.rh.id,
      });
      expect(resposta.body.workedMinutes).toEqual(expect.any(Number));
      expect(resposta.body.closedAt).not.toBeNull();
    });

    it('recusa novas marcações na competência fechada', async () => {
      const resposta = await http()
        .post('/api/time-entries')
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .send({ type: 'CLOCK_OUT', timezone: 'America/Sao_Paulo', countryCode: 'BR' })
        .expect(409);

      expect(resposta.body.message).toContain('fechada');
    });

    it('recusa correções na competência fechada', async () => {
      await http()
        .post('/api/corrections')
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .send({
          type: 'ADD',
          proposedType: 'CLOCK_OUT',
          proposedOccurredAt: new Date(Date.now() - 3_600_000).toISOString(),
          proposedTimezone: 'America/Sao_Paulo',
          workDate: diaDeHoje,
          reason: 'Tentativa de ajuste em competência já fechada.',
        })
        .expect(409);
    });

    it('volta a aceitar marcações depois da reabertura pelo RH', async () => {
      await http()
        .post('/api/closings/reopen')
        .set('Authorization', comoUsuario(ambiente.usuarios.rh))
        .send({
          userId: ambiente.usuarios.ana.id,
          year: ano,
          month: mes,
          reason: 'Reabertura para lançamento da saída pendente.',
        })
        .expect(201);

      await http()
        .post('/api/time-entries')
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .send({ type: 'CLOCK_OUT', timezone: 'America/Sao_Paulo', countryCode: 'BR' })
        .expect(201);
    });

    it('impede o gestor de reabrir uma competência', async () => {
      await http()
        .post('/api/closings/reopen')
        .set('Authorization', comoUsuario(ambiente.usuarios.gestor))
        .send({
          userId: ambiente.usuarios.ana.id,
          year: ano,
          month: mes,
          reason: 'Gestor não deve poder reabrir competência.',
        })
        .expect(403);
    });
  });
});
