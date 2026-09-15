import { offsetMinutesAt } from '../../common/time/timezone';
import { calculateDailyTimesheet, calculateMonthlyTimesheet } from './timesheet-calculator';
import {
  InconsistencyCode,
  TimesheetCalculationOptions,
  TimesheetEvent,
  TimesheetEventType,
} from './timesheet.types';

const { CLOCK_IN, CLOCK_OUT, BREAK_START, BREAK_END } = TimesheetEventType;

const SP = { timezone: 'America/Sao_Paulo', countryCode: 'BR', utcOffsetMinutes: -180 };
const LISBOA_VERAO = { timezone: 'Europe/Lisbon', countryCode: 'PT', utcOffsetMinutes: 60 };

const BASE_OPTIONS: TimesheetCalculationOptions = { expectedDailyMinutes: 480 };

let sequence = 0;

function event(
  type: TimesheetEventType,
  utcIso: string,
  overrides: Partial<TimesheetEvent> = {},
): TimesheetEvent {
  return {
    id: `evt-${++sequence}`,
    type,
    occurredAt: new Date(utcIso),
    workDate: '2026-09-14',
    source: 'WEB',
    ...SP,
    ...overrides,
  };
}

describe('calculateDailyTimesheet', () => {
  describe('jornada regular', () => {
    it('desconta a pausa e fecha o dia sem apontamentos', () => {
      // 09:00 → 18:00 em São Paulo, com 1h de almoço.
      const result = calculateDailyTimesheet(
        '2026-09-14',
        [
          event(CLOCK_IN, '2026-09-14T12:00:00Z'),
          event(BREAK_START, '2026-09-14T15:00:00Z'),
          event(BREAK_END, '2026-09-14T16:00:00Z'),
          event(CLOCK_OUT, '2026-09-14T21:00:00Z'),
        ],
        BASE_OPTIONS,
      );

      expect(result.workedMinutes).toBe(480);
      expect(result.breakMinutes).toBe(60);
      expect(result.balanceMinutes).toBe(0);
      expect(result.segments).toHaveLength(1);
      expect(result.isConsistent).toBe(true);
      expect(result.inconsistencies).toHaveLength(0);
    });

    it('soma múltiplos turnos no mesmo dia', () => {
      const result = calculateDailyTimesheet(
        '2026-09-14',
        [
          event(CLOCK_IN, '2026-09-14T11:00:00Z'),
          event(CLOCK_OUT, '2026-09-14T14:00:00Z'),
          event(CLOCK_IN, '2026-09-14T17:00:00Z'),
          event(CLOCK_OUT, '2026-09-14T22:00:00Z'),
        ],
        BASE_OPTIONS,
      );

      expect(result.segments).toHaveLength(2);
      expect(result.workedMinutes).toBe(480);
      expect(result.isConsistent).toBe(true);
    });

    it('ordena eventos recebidos fora de ordem antes de calcular', () => {
      const result = calculateDailyTimesheet(
        '2026-09-14',
        [event(CLOCK_OUT, '2026-09-14T21:00:00Z'), event(CLOCK_IN, '2026-09-14T12:00:00Z')],
        BASE_OPTIONS,
      );

      expect(result.workedMinutes).toBe(540);
      expect(result.isConsistent).toBe(true);
    });

    it('trata dia sem marcação como débito integral, sem apontar erro', () => {
      const result = calculateDailyTimesheet('2026-09-14', [], BASE_OPTIONS);

      expect(result.workedMinutes).toBe(0);
      expect(result.expectedMinutes).toBe(480);
      expect(result.balanceMinutes).toBe(-480);
      expect(result.isConsistent).toBe(true);
    });
  });

  describe('turno que cruza a meia-noite', () => {
    it('mantém a jornada unida sob o mesmo dia de trabalho', () => {
      // Entrada 22:00 do dia 14 e saída 06:00 do dia 15, ambas atribuídas ao dia 14
      // pela regra de continuidade do ADR-0004.
      const result = calculateDailyTimesheet(
        '2026-09-14',
        [
          event(CLOCK_IN, '2026-09-15T01:00:00Z', { workDate: '2026-09-14' }),
          event(CLOCK_OUT, '2026-09-15T09:00:00Z', { workDate: '2026-09-14' }),
        ],
        BASE_OPTIONS,
      );

      expect(result.segments).toHaveLength(1);
      expect(result.workedMinutes).toBe(480);
      expect(result.isConsistent).toBe(true);
    });
  });

  describe('transição de horário de verão', () => {
    it('conta o tempo real decorrido, não a diferença de relógio de parede', () => {
      // Fim do horário de verão em Portugal: os relógios voltam de 02:00 para 01:00.
      const entrada = new Date('2026-10-24T23:00:00Z'); // 00:00 local, UTC+1
      const saida = new Date('2026-10-25T04:00:00Z'); //  04:00 local, UTC+0

      // Confirma que os instantes realmente cercam a transição.
      expect(offsetMinutesAt(entrada, 'Europe/Lisbon')).toBe(60);
      expect(offsetMinutesAt(saida, 'Europe/Lisbon')).toBe(0);

      const result = calculateDailyTimesheet(
        '2026-10-25',
        [
          event(CLOCK_IN, entrada.toISOString(), {
            workDate: '2026-10-25',
            timezone: 'Europe/Lisbon',
            countryCode: 'PT',
            utcOffsetMinutes: 60,
          }),
          event(CLOCK_OUT, saida.toISOString(), {
            workDate: '2026-10-25',
            timezone: 'Europe/Lisbon',
            countryCode: 'PT',
            utcOffsetMinutes: 0,
          }),
        ],
        BASE_OPTIONS,
      );

      // O relógio de parede marca 00:00 → 04:00 (4h), mas se passaram 5 horas reais.
      expect(result.workedMinutes).toBe(300);
    });
  });

  describe('operação internacional', () => {
    it('sinaliza jornada cumprida fora do fuso contratual', () => {
      const result = calculateDailyTimesheet(
        '2026-09-14',
        [
          event(CLOCK_IN, '2026-09-14T08:00:00Z', LISBOA_VERAO),
          event(CLOCK_OUT, '2026-09-14T16:00:00Z', LISBOA_VERAO),
        ],
        { ...BASE_OPTIONS, baseTimezone: 'America/Sao_Paulo' },
      );

      expect(result.countries).toEqual(['PT']);
      expect(result.inconsistencies.map((i) => i.code)).toContain(InconsistencyCode.WORKED_ABROAD);
      // Apontamento informativo não invalida a jornada.
      expect(result.isConsistent).toBe(true);
    });

    it('sinaliza deslocamento quando há marcações em fusos diferentes no mesmo dia', () => {
      const result = calculateDailyTimesheet(
        '2026-09-14',
        [
          event(CLOCK_IN, '2026-09-14T11:00:00Z', SP),
          event(CLOCK_OUT, '2026-09-14T19:00:00Z', LISBOA_VERAO),
        ],
        BASE_OPTIONS,
      );

      expect(result.timezones).toHaveLength(2);
      expect(result.inconsistencies.map((i) => i.code)).toContain(
        InconsistencyCode.MULTIPLE_TIMEZONES,
      );
      expect(result.workedMinutes).toBe(480);
    });
  });

  describe('inconsistências', () => {
    it('não contabiliza jornada aberta e aponta a saída faltante', () => {
      const result = calculateDailyTimesheet(
        '2026-09-14',
        [event(CLOCK_IN, '2026-09-14T12:00:00Z')],
        BASE_OPTIONS,
      );

      expect(result.workedMinutes).toBe(0);
      expect(result.segments[0].endedAt).toBeNull();
      expect(result.isConsistent).toBe(false);
      expect(result.inconsistencies.map((i) => i.code)).toEqual([
        InconsistencyCode.MISSING_CLOCK_OUT,
      ]);
    });

    it('aponta saída sem entrada correspondente', () => {
      const result = calculateDailyTimesheet(
        '2026-09-14',
        [event(CLOCK_OUT, '2026-09-14T21:00:00Z')],
        BASE_OPTIONS,
      );

      expect(result.workedMinutes).toBe(0);
      expect(result.inconsistencies.map((i) => i.code)).toEqual([
        InconsistencyCode.CLOCK_OUT_WITHOUT_CLOCK_IN,
      ]);
    });

    it('aponta entrada duplicada e ignora a segunda no cálculo', () => {
      const result = calculateDailyTimesheet(
        '2026-09-14',
        [
          event(CLOCK_IN, '2026-09-14T12:00:00Z'),
          event(CLOCK_IN, '2026-09-14T13:00:00Z'),
          event(CLOCK_OUT, '2026-09-14T21:00:00Z'),
        ],
        BASE_OPTIONS,
      );

      expect(result.workedMinutes).toBe(540); // conta a partir da primeira entrada
      expect(result.inconsistencies.map((i) => i.code)).toContain(
        InconsistencyCode.DUPLICATE_CLOCK_IN,
      );
      expect(result.isConsistent).toBe(false);
    });

    it('aponta fim de pausa sem início', () => {
      const result = calculateDailyTimesheet(
        '2026-09-14',
        [
          event(CLOCK_IN, '2026-09-14T12:00:00Z'),
          event(BREAK_END, '2026-09-14T16:00:00Z'),
          event(CLOCK_OUT, '2026-09-14T21:00:00Z'),
        ],
        BASE_OPTIONS,
      );

      expect(result.inconsistencies.map((i) => i.code)).toContain(
        InconsistencyCode.BREAK_END_WITHOUT_START,
      );
      expect(result.workedMinutes).toBe(540);
    });

    it('encerra o turno no início da pausa quando a pausa fica aberta', () => {
      const result = calculateDailyTimesheet(
        '2026-09-14',
        [
          event(CLOCK_IN, '2026-09-14T12:00:00Z'),
          event(BREAK_START, '2026-09-14T15:00:00Z'),
          event(CLOCK_OUT, '2026-09-14T21:00:00Z'),
        ],
        BASE_OPTIONS,
      );

      // Não há evidência de trabalho entre o início da pausa e a saída.
      expect(result.workedMinutes).toBe(180);
      expect(result.inconsistencies.map((i) => i.code)).toContain(InconsistencyCode.UNCLOSED_BREAK);
      // WARNING não invalida o dia, apenas sinaliza.
      expect(result.isConsistent).toBe(true);
    });

    it('sinaliza turno com duração implausível', () => {
      const result = calculateDailyTimesheet(
        '2026-09-14',
        [event(CLOCK_IN, '2026-09-14T08:00:00Z'), event(CLOCK_OUT, '2026-09-15T01:00:00Z')],
        BASE_OPTIONS,
      );

      expect(result.workedMinutes).toBe(1020);
      expect(result.inconsistencies.map((i) => i.code)).toContain(
        InconsistencyCode.EXCESSIVE_SHIFT_DURATION,
      );
    });
  });

  describe('fim de semana', () => {
    it('não gera expectativa de horas, mas contabiliza o que foi trabalhado', () => {
      const result = calculateDailyTimesheet(
        '2026-09-12', // sábado
        [
          event(CLOCK_IN, '2026-09-12T12:00:00Z', { workDate: '2026-09-12' }),
          event(CLOCK_OUT, '2026-09-12T16:00:00Z', { workDate: '2026-09-12' }),
        ],
        BASE_OPTIONS,
      );

      expect(result.expectedMinutes).toBe(0);
      expect(result.workedMinutes).toBe(240);
      expect(result.balanceMinutes).toBe(240);
    });
  });
});

describe('calculateMonthlyTimesheet', () => {
  it('cobre todos os dias da competência, inclusive os sem marcação', () => {
    const result = calculateMonthlyTimesheet(
      2026,
      9,
      [
        event(CLOCK_IN, '2026-09-14T12:00:00Z', { workDate: '2026-09-14' }),
        event(CLOCK_OUT, '2026-09-14T20:00:00Z', { workDate: '2026-09-14' }),
      ],
      BASE_OPTIONS,
    );

    expect(result.days).toHaveLength(30);
    expect(result.workedMinutes).toBe(480);
    expect(result.daysWithInconsistencies).toBe(0);

    const dia14 = result.days.find((d) => d.workDate === '2026-09-14');
    expect(dia14?.workedMinutes).toBe(480);
  });

  it('acumula expectativa apenas nos dias úteis', () => {
    const result = calculateMonthlyTimesheet(2026, 9, [], BASE_OPTIONS);

    // Setembro de 2026 tem 22 dias úteis.
    expect(result.expectedMinutes).toBe(22 * 480);
    expect(result.balanceMinutes).toBe(-22 * 480);
  });

  it('conta dias com inconsistência', () => {
    const result = calculateMonthlyTimesheet(
      2026,
      9,
      [event(CLOCK_IN, '2026-09-14T12:00:00Z', { workDate: '2026-09-14' })],
      BASE_OPTIONS,
    );

    expect(result.daysWithInconsistencies).toBe(1);
  });
});
