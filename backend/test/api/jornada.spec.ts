import request from 'supertest';
import { AmbienteApi, UsuarioDeTeste, criarAmbienteApi } from '../support/api-test-app';

/** Dia civil de hoje no fuso informado, no formato usado pela API. */
function hojeEm(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

function comoData(workDate: string): Date {
  return new Date(`${workDate}T00:00:00.000Z`);
}

describe('API · registro e consulta de jornada', () => {
  let ambiente: AmbienteApi;

  beforeAll(async () => {
    ambiente = await criarAmbienteApi();
  });

  afterAll(async () => {
    await ambiente.encerrar();
  });

  beforeEach(() => {
    ambiente.prisma.timeEntry.limpar();
    ambiente.prisma.correctionRequest.limpar();
    ambiente.prisma.monthlyClosing.limpar();
  });

  const http = () => request(ambiente.app.getHttpServer());
  const comoUsuario = (usuario: UsuarioDeTeste) => `Bearer ${ambiente.tokenDe(usuario)}`;

  /** Insere marcações direto no repositório, para montar cenários determinísticos. */
  function semearMarcacao(params: {
    usuario: UsuarioDeTeste;
    type: string;
    occurredAt: string;
    workDate: string;
    timezone?: string;
    countryCode?: string;
    utcOffsetMinutes?: number;
  }) {
    return ambiente.prisma.timeEntry.semear({
      userId: params.usuario.id,
      type: params.type,
      occurredAt: new Date(params.occurredAt),
      timezone: params.timezone ?? params.usuario.baseTimezone,
      countryCode: params.countryCode ?? params.usuario.countryCode,
      utcOffsetMinutes: params.utcOffsetMinutes ?? -180,
      workDate: comoData(params.workDate),
      registeredById: params.usuario.id,
    });
  }

  describe('marcação em tempo real', () => {
    it('grava o instante do servidor e o contexto informado pelo cliente', async () => {
      const antes = Date.now();

      const resposta = await http()
        .post('/api/time-entries')
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .send({ type: 'CLOCK_IN', timezone: 'America/Sao_Paulo', countryCode: 'BR' })
        .expect(201);

      const depois = Date.now();
      const instante = new Date(resposta.body.occurredAt).getTime();

      // O horário é do servidor: precisa cair na janela da própria requisição.
      expect(instante).toBeGreaterThanOrEqual(antes);
      expect(instante).toBeLessThanOrEqual(depois);

      expect(resposta.body).toMatchObject({
        type: 'CLOCK_IN',
        source: 'WEB',
        timezone: 'America/Sao_Paulo',
        countryCode: 'BR',
        registeredById: ambiente.usuarios.ana.id,
        workDate: hojeEm('America/Sao_Paulo'),
      });
      expect(resposta.body.localTime).toMatch(/^\d{2}:\d{2}$/);
    });

    it('atribui o dia da jornada pelo fuso do local da marcação', async () => {
      const resposta = await http()
        .post('/api/time-entries')
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .send({ type: 'CLOCK_IN', timezone: 'Pacific/Kiritimati', countryCode: 'KI' })
        .expect(201);

      // Kiritimati está em UTC+14: em boa parte do dia o calendário local já virou
      // em relação ao de São Paulo, e é o dia local que vale.
      expect(resposta.body.workDate).toBe(hojeEm('Pacific/Kiritimati'));
    });

    it('preserva o dia da jornada aberta em marcações seguintes', async () => {
      const ontem = new Date(Date.now() - 86_400_000);
      const diaDeOntem = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
      }).format(ontem);

      // Plantão iniciado ontem e ainda em aberto.
      semearMarcacao({
        usuario: ambiente.usuarios.ana,
        type: 'CLOCK_IN',
        occurredAt: new Date(Date.now() - 8 * 3_600_000).toISOString(),
        workDate: diaDeOntem,
      });

      const resposta = await http()
        .post('/api/time-entries')
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .send({ type: 'CLOCK_OUT', timezone: 'America/Sao_Paulo', countryCode: 'BR' })
        .expect(201);

      // A saída pertence à jornada que começou ontem, e não ao dia de hoje.
      expect(resposta.body.workDate).toBe(diaDeOntem);
    });
  });

  describe('estado da jornada', () => {
    it('parte de fora da jornada, oferecendo apenas a entrada', async () => {
      const resposta = await http()
        .get('/api/time-entries/status')
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .expect(200);

      expect(resposta.body.state).toBe('OFF_SHIFT');
      expect(resposta.body.allowedNext).toEqual(['CLOCK_IN']);
    });

    it('avança pelos estados conforme as marcações', async () => {
      const autorizacao = comoUsuario(ambiente.usuarios.ana);
      const marcar = (type: string) =>
        http()
          .post('/api/time-entries')
          .set('Authorization', autorizacao)
          .send({ type, timezone: 'America/Sao_Paulo', countryCode: 'BR' })
          .expect(201);

      await marcar('CLOCK_IN');
      let status = await http()
        .get('/api/time-entries/status')
        .set('Authorization', autorizacao)
        .expect(200);
      expect(status.body.state).toBe('WORKING');
      expect(status.body.allowedNext).toEqual(['BREAK_START', 'CLOCK_OUT']);

      await marcar('BREAK_START');
      status = await http()
        .get('/api/time-entries/status')
        .set('Authorization', autorizacao)
        .expect(200);
      expect(status.body.state).toBe('ON_BREAK');
      expect(status.body.allowedNext).toEqual(['BREAK_END', 'CLOCK_OUT']);

      await marcar('BREAK_END');
      await marcar('CLOCK_OUT');
      status = await http()
        .get('/api/time-entries/status')
        .set('Authorization', autorizacao)
        .expect(200);
      expect(status.body.state).toBe('OFF_SHIFT');
    });
  });

  describe('espelho de ponto', () => {
    it('apura as horas do dia descontando a pausa', async () => {
      const dia = '2026-09-14';
      const marcacoes: Array<[string, string]> = [
        ['CLOCK_IN', '2026-09-14T12:00:00Z'],
        ['BREAK_START', '2026-09-14T15:00:00Z'],
        ['BREAK_END', '2026-09-14T16:00:00Z'],
        ['CLOCK_OUT', '2026-09-14T21:00:00Z'],
      ];

      for (const [type, occurredAt] of marcacoes) {
        semearMarcacao({ usuario: ambiente.usuarios.ana, type, occurredAt, workDate: dia });
      }

      const resposta = await http()
        .get('/api/timesheets/monthly')
        .query({ year: 2026, month: 9 })
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .expect(200);

      const apurado = resposta.body.days.find((d: { workDate: string }) => d.workDate === dia);

      expect(apurado.workedMinutes).toBe(480);
      expect(apurado.breakMinutes).toBe(60);
      expect(apurado.balanceMinutes).toBe(0);
      expect(apurado.isConsistent).toBe(true);
      expect(resposta.body.closingStatus).toBe('OPEN');
    });

    it('aponta jornada sem saída sem estimar o horário de encerramento', async () => {
      const dia = '2026-09-15';

      semearMarcacao({
        usuario: ambiente.usuarios.ana,
        type: 'CLOCK_IN',
        occurredAt: '2026-09-15T12:00:00Z',
        workDate: dia,
      });

      const resposta = await http()
        .get('/api/timesheets/monthly')
        .query({ year: 2026, month: 9 })
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .expect(200);

      const apurado = resposta.body.days.find((d: { workDate: string }) => d.workDate === dia);

      expect(apurado.workedMinutes).toBe(0);
      expect(apurado.isConsistent).toBe(false);
      expect(apurado.inconsistencies.map((i: { code: string }) => i.code)).toContain(
        'MISSING_CLOCK_OUT',
      );
      expect(resposta.body.daysWithInconsistencies).toBeGreaterThan(0);
    });

    it('sinaliza jornada cumprida fora do fuso contratual', async () => {
      const dia = '2026-09-16';

      semearMarcacao({
        usuario: ambiente.usuarios.ana,
        type: 'CLOCK_IN',
        occurredAt: '2026-09-16T08:00:00Z',
        workDate: dia,
        timezone: 'Europe/Lisbon',
        countryCode: 'PT',
        utcOffsetMinutes: 60,
      });
      semearMarcacao({
        usuario: ambiente.usuarios.ana,
        type: 'CLOCK_OUT',
        occurredAt: '2026-09-16T16:00:00Z',
        workDate: dia,
        timezone: 'Europe/Lisbon',
        countryCode: 'PT',
        utcOffsetMinutes: 60,
      });

      const resposta = await http()
        .get('/api/timesheets/monthly')
        .query({ year: 2026, month: 9 })
        .set('Authorization', comoUsuario(ambiente.usuarios.ana))
        .expect(200);

      const apurado = resposta.body.days.find((d: { workDate: string }) => d.workDate === dia);

      expect(apurado.countries).toEqual(['PT']);
      expect(apurado.workedMinutes).toBe(480);
      expect(apurado.inconsistencies.map((i: { code: string }) => i.code)).toContain(
        'WORKED_ABROAD',
      );
      // Apontamento informativo não invalida o dia.
      expect(apurado.isConsistent).toBe(true);
    });

    it('consolida a equipe respeitando o escopo do gestor', async () => {
      semearMarcacao({
        usuario: ambiente.usuarios.ana,
        type: 'CLOCK_IN',
        occurredAt: '2026-09-14T12:00:00Z',
        workDate: '2026-09-14',
      });
      semearMarcacao({
        usuario: ambiente.usuarios.ana,
        type: 'CLOCK_OUT',
        occurredAt: '2026-09-14T20:00:00Z',
        workDate: '2026-09-14',
      });

      const resposta = await http()
        .get('/api/timesheets/team')
        .query({ year: 2026, month: 9 })
        .set('Authorization', comoUsuario(ambiente.usuarios.gestor))
        .expect(200);

      const nomes = resposta.body.map((m: { name: string }) => m.name);
      expect(nomes).toContain('Ana Souza');
      expect(nomes).toContain('Bruno Almeida');
      expect(nomes).not.toContain('Carla Nunes');

      const ana = resposta.body.find((m: { userId: string }) => m.userId === ambiente.usuarios.ana.id);
      expect(ana.workedMinutes).toBe(480);
    });
  });
});
