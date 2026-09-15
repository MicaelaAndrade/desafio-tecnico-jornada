import request from 'supertest';
import { AmbienteApi, SENHA_TESTE, criarAmbienteApi } from '../support/api-test-app';

describe('API · autenticação e escopo de acesso', () => {
  let ambiente: AmbienteApi;

  beforeAll(async () => {
    ambiente = await criarAmbienteApi();
  });

  afterAll(async () => {
    await ambiente.encerrar();
  });

  const http = () => request(ambiente.app.getHttpServer());

  describe('autenticação', () => {
    it('devolve token e identidade para credenciais válidas', async () => {
      const resposta = await http()
        .post('/api/auth/login')
        .send({ email: ambiente.usuarios.ana.email, password: SENHA_TESTE })
        .expect(200);

      expect(resposta.body.accessToken).toEqual(expect.any(String));
      expect(resposta.body.user).toMatchObject({
        email: ambiente.usuarios.ana.email,
        role: 'EMPLOYEE',
        baseTimezone: 'America/Sao_Paulo',
      });
      expect(resposta.body.user.passwordHash).toBeUndefined();
    });

    it('recusa senha incorreta com a mesma resposta de e-mail inexistente', async () => {
      const senhaErrada = await http()
        .post('/api/auth/login')
        .send({ email: ambiente.usuarios.ana.email, password: 'senha-errada' })
        .expect(401);

      const inexistente = await http()
        .post('/api/auth/login')
        .send({ email: 'ninguem@ddgroup.example', password: SENHA_TESTE })
        .expect(401);

      // Respostas idênticas impedem enumeração de usuários.
      expect(senhaErrada.body.message).toBe(inexistente.body.message);
    });

    it('exige autenticação nas rotas protegidas', async () => {
      await http().get('/api/time-entries/status').expect(401);
    });
  });

  describe('escopo de visão', () => {
    it('permite ao colaborador ler a própria jornada', async () => {
      await http()
        .get('/api/time-entries')
        .set('Authorization', `Bearer ${ambiente.tokenDe(ambiente.usuarios.ana)}`)
        .expect(200);
    });

    it('impede o colaborador de ler a jornada de outra pessoa', async () => {
      await http()
        .get('/api/time-entries')
        .query({ userId: ambiente.usuarios.bruno.id })
        .set('Authorization', `Bearer ${ambiente.tokenDe(ambiente.usuarios.ana)}`)
        .expect(403);
    });

    it('permite ao gestor ler a jornada de um subordinado direto', async () => {
      await http()
        .get('/api/time-entries')
        .query({ userId: ambiente.usuarios.ana.id })
        .set('Authorization', `Bearer ${ambiente.tokenDe(ambiente.usuarios.gestor)}`)
        .expect(200);
    });

    it('impede o gestor de ler a jornada de quem está fora da sua equipe', async () => {
      await http()
        .get('/api/time-entries')
        .query({ userId: ambiente.usuarios.forasteira.id })
        .set('Authorization', `Bearer ${ambiente.tokenDe(ambiente.usuarios.gestor)}`)
        .expect(403);
    });

    it('permite ao RH ler a jornada de qualquer colaborador', async () => {
      await http()
        .get('/api/time-entries')
        .query({ userId: ambiente.usuarios.forasteira.id })
        .set('Authorization', `Bearer ${ambiente.tokenDe(ambiente.usuarios.rh)}`)
        .expect(200);
    });

    it('lista apenas a própria equipe para o gestor', async () => {
      const resposta = await http()
        .get('/api/users')
        .set('Authorization', `Bearer ${ambiente.tokenDe(ambiente.usuarios.gestor)}`)
        .expect(200);

      const ids = resposta.body.map((u: { id: string }) => u.id);
      expect(ids).toContain(ambiente.usuarios.ana.id);
      expect(ids).toContain(ambiente.usuarios.bruno.id);
      expect(ids).not.toContain(ambiente.usuarios.forasteira.id);
    });
  });

  describe('restrição por papel', () => {
    it('impede o colaborador de cadastrar usuários', async () => {
      await http()
        .post('/api/users')
        .set('Authorization', `Bearer ${ambiente.tokenDe(ambiente.usuarios.ana)}`)
        .send({
          name: 'Novo Colaborador',
          email: 'novo@ddgroup.example',
          password: 'senha-forte-123',
          role: 'EMPLOYEE',
          baseTimezone: 'America/Sao_Paulo',
          countryCode: 'BR',
        })
        .expect(403);
    });

    it('impede o colaborador de lançar marcação em nome de terceiro', async () => {
      await http()
        .post('/api/time-entries/manual')
        .set('Authorization', `Bearer ${ambiente.tokenDe(ambiente.usuarios.ana)}`)
        .send({
          userId: ambiente.usuarios.bruno.id,
          type: 'CLOCK_IN',
          occurredAt: new Date().toISOString(),
          timezone: 'America/Sao_Paulo',
          countryCode: 'BR',
          reason: 'tentativa indevida de lançamento',
        })
        .expect(403);
    });

    it('impede o colaborador de consultar o consolidado da equipe', async () => {
      await http()
        .get('/api/timesheets/team')
        .query({ year: 2026, month: 9 })
        .set('Authorization', `Bearer ${ambiente.tokenDe(ambiente.usuarios.ana)}`)
        .expect(403);
    });
  });

  describe('validação de entrada', () => {
    it('recusa campos não declarados no contrato', async () => {
      await http()
        .post('/api/time-entries')
        .set('Authorization', `Bearer ${ambiente.tokenDe(ambiente.usuarios.ana)}`)
        .send({
          type: 'CLOCK_IN',
          timezone: 'America/Sao_Paulo',
          countryCode: 'BR',
          // O horário nunca vem do cliente; aceitar este campo em silêncio seria
          // uma porta para fraude de ponto.
          occurredAt: '2020-01-01T00:00:00.000Z',
        })
        .expect(400);
    });

    it('recusa fuso horário que não seja um identificador IANA', async () => {
      await http()
        .post('/api/time-entries')
        .set('Authorization', `Bearer ${ambiente.tokenDe(ambiente.usuarios.ana)}`)
        .send({ type: 'CLOCK_IN', timezone: 'BRT', countryCode: 'BR' })
        .expect(400);
    });

    it('recusa país fora do padrão ISO 3166-1 alpha-2', async () => {
      await http()
        .post('/api/time-entries')
        .set('Authorization', `Bearer ${ambiente.tokenDe(ambiente.usuarios.ana)}`)
        .send({ type: 'CLOCK_IN', timezone: 'America/Sao_Paulo', countryCode: 'Brasil' })
        .expect(400);
    });
  });
});
