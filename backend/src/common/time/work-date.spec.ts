import {
  InvalidWorkDateError,
  assertWorkDate,
  eachWorkDate,
  isWeekend,
  lastDayOfMonth,
  resolveWorkDate,
  workDateFromDb,
  workDateToDb,
} from './work-date';

describe('workDate', () => {
  describe('resolveWorkDate — a que dia a marcação pertence (ADR-0004)', () => {
    it('usa o dia civil do fuso do local da marcação, não o de UTC', () => {
      // 2026-03-10T02:00Z é ainda 2026-03-09 23:00 em São Paulo (UTC-3).
      const instant = new Date('2026-03-10T02:00:00Z');

      expect(resolveWorkDate(instant, 'America/Sao_Paulo')).toBe('2026-03-09');
      expect(resolveWorkDate(instant, 'Europe/Lisbon')).toBe('2026-03-10');
    });

    it('atribui dias diferentes ao mesmo instante conforme o local do registro', () => {
      // Colaborador em viagem: 22:30 em São Paulo é 02:30 do dia seguinte em Lisboa.
      const instant = new Date('2026-06-15T01:30:00Z');

      expect(resolveWorkDate(instant, 'America/Sao_Paulo')).toBe('2026-06-14');
      expect(resolveWorkDate(instant, 'Europe/Lisbon')).toBe('2026-06-15');
    });
  });

  describe('conversão com o tipo DATE do Prisma', () => {
    // Regressão para a armadilha descrita no ADR-0001: o Prisma devolve DATE como
    // um Date à meia-noite UTC. Ler com getters locais deslocaria a data em um dia
    // em qualquer servidor a oeste de Greenwich.
    it('lê o valor do banco sem deslocar o dia', () => {
      const fromDb = new Date('2026-03-10T00:00:00Z');
      expect(workDateFromDb(fromDb)).toBe('2026-03-10');
    });

    it('faz round-trip sem perda', () => {
      const original = '2026-12-31';
      expect(workDateFromDb(workDateToDb(original))).toBe(original);
    });

    it('grava sempre à meia-noite UTC', () => {
      expect(workDateToDb('2026-01-01').toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('validação', () => {
    it.each(['2026-13-01', '10/03/2026', '2026-3-1', '', 'ontem'])(
      'recusa %p',
      (value) => {
        expect(() => assertWorkDate(value)).toThrow(InvalidWorkDateError);
      },
    );
  });

  describe('utilitários de período', () => {
    it('gera o intervalo inclusivo de dias', () => {
      expect(eachWorkDate('2026-02-26', '2026-03-02')).toEqual([
        '2026-02-26',
        '2026-02-27',
        '2026-02-28',
        '2026-03-01',
        '2026-03-02',
      ]);
    });

    it('devolve vazio quando o fim antecede o início', () => {
      expect(eachWorkDate('2026-03-02', '2026-03-01')).toEqual([]);
    });

    it('resolve o último dia de fevereiro em ano bissexto', () => {
      expect(lastDayOfMonth(2028, 2)).toBe('2028-02-29');
      expect(lastDayOfMonth(2026, 2)).toBe('2026-02-28');
    });

    it('identifica fim de semana', () => {
      expect(isWeekend('2026-09-12')).toBe(true); // sábado
      expect(isWeekend('2026-09-13')).toBe(true); // domingo
      expect(isWeekend('2026-09-14')).toBe(false); // segunda
    });
  });
});
