import { WorkDate, eachWorkDate, isWeekend } from '../../common/time/work-date';
import {
  DailyTimesheet,
  Inconsistency,
  InconsistencyCode,
  MonthlyTimesheet,
  TimesheetCalculationOptions,
  TimesheetEvent,
  TimesheetEventType,
  WorkSegment,
} from './timesheet.types';

const DEFAULT_MAX_SHIFT_MINUTES = 16 * 60;

/**
 * Diferença em minutos entre dois instantes UTC.
 *
 * A aritmética é feita exclusivamente sobre instantes absolutos, nunca sobre
 * horários locais. É isso que torna o cálculo imune a transições de horário de
 * verão no meio da jornada e a marcações feitas em fusos diferentes (ADR-0004).
 */
function diffMinutes(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

interface OpenSegment {
  startedAt: Date;
  breakMinutes: number;
  breakStartedAt: Date | null;
}

/**
 * Reconstrói a jornada de um dia a partir dos seus eventos.
 *
 * Função pura: não conhece banco, framework nem requisição HTTP. Toda a regra de
 * negócio central do sistema vive aqui e é testada isoladamente.
 *
 * Princípio que rege o tratamento de erro: o cálculo **nunca inventa horário**.
 * Diante de uma sequência inválida, o evento problemático é ignorado para fins de
 * soma e registrado como apontamento — uma jornada sem `CLOCK_OUT` contabiliza
 * zero minuto naquele segmento, em vez de estimar um encerramento. Fabricar tempo
 * numa base com efeito trabalhista seria pior do que apontar a lacuna.
 */
export function calculateDailyTimesheet(
  workDate: WorkDate,
  events: TimesheetEvent[],
  options: TimesheetCalculationOptions,
): DailyTimesheet {
  const maxShiftMinutes = options.maxShiftMinutes ?? DEFAULT_MAX_SHIFT_MINUTES;

  const ordered = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const inconsistencies: Inconsistency[] = [];
  const segments: WorkSegment[] = [];

  let state: 'OFF_SHIFT' | 'WORKING' | 'ON_BREAK' = 'OFF_SHIFT';
  let current: OpenSegment | null = null;
  let totalBreakMinutes = 0;

  const flag = (
    code: InconsistencyCode,
    severity: Inconsistency['severity'],
    message: string,
    eventId?: string,
  ) => inconsistencies.push({ code, severity, message, eventId });

  const closeSegment = (endedAt: Date) => {
    if (!current) return;
    const elapsed = diffMinutes(current.startedAt, endedAt);
    const worked = Math.max(0, elapsed - current.breakMinutes);

    segments.push({
      startedAt: current.startedAt,
      endedAt,
      workedMinutes: worked,
      breakMinutes: current.breakMinutes,
    });

    if (elapsed > maxShiftMinutes) {
      flag(
        InconsistencyCode.EXCESSIVE_SHIFT_DURATION,
        'WARNING',
        `Turno com ${(elapsed / 60).toFixed(1)}h de duração total, acima do limite de ${maxShiftMinutes / 60}h. Possível marcação esquecida.`,
      );
    }

    current = null;
    state = 'OFF_SHIFT';
  };

  for (const event of ordered) {
    switch (event.type) {
      case TimesheetEventType.CLOCK_IN: {
        if (state === 'OFF_SHIFT') {
          current = { startedAt: event.occurredAt, breakMinutes: 0, breakStartedAt: null };
          state = 'WORKING';
        } else {
          flag(
            InconsistencyCode.DUPLICATE_CLOCK_IN,
            'ERROR',
            'Entrada registrada com uma jornada já em aberto.',
            event.id,
          );
        }
        break;
      }

      case TimesheetEventType.BREAK_START: {
        if (state === 'WORKING' && current) {
          current.breakStartedAt = event.occurredAt;
          state = 'ON_BREAK';
        } else if (state === 'ON_BREAK') {
          flag(
            InconsistencyCode.DUPLICATE_BREAK_START,
            'ERROR',
            'Início de pausa registrado com outra pausa já em aberto.',
            event.id,
          );
        } else {
          flag(
            InconsistencyCode.BREAK_OUTSIDE_SHIFT,
            'ERROR',
            'Início de pausa sem jornada em aberto.',
            event.id,
          );
        }
        break;
      }

      case TimesheetEventType.BREAK_END: {
        if (state === 'ON_BREAK' && current?.breakStartedAt) {
          const minutes = Math.max(0, diffMinutes(current.breakStartedAt, event.occurredAt));
          current.breakMinutes += minutes;
          totalBreakMinutes += minutes;
          current.breakStartedAt = null;
          state = 'WORKING';
        } else {
          flag(
            InconsistencyCode.BREAK_END_WITHOUT_START,
            'ERROR',
            'Fim de pausa sem início correspondente.',
            event.id,
          );
        }
        break;
      }

      case TimesheetEventType.CLOCK_OUT: {
        if (state === 'WORKING') {
          closeSegment(event.occurredAt);
        } else if (state === 'ON_BREAK' && current?.breakStartedAt) {
          // Jornada encerrada sem fechar a pausa. O turno é encerrado no início da
          // pausa: o intervalo entre o início da pausa e a saída não é atribuído a
          // trabalho, porque não há evidência de que tenha sido trabalhado.
          flag(
            InconsistencyCode.UNCLOSED_BREAK,
            'WARNING',
            'Saída registrada com pausa em aberto. O período da pausa não foi contabilizado como trabalhado.',
            event.id,
          );
          closeSegment(current.breakStartedAt);
        } else {
          flag(
            InconsistencyCode.CLOCK_OUT_WITHOUT_CLOCK_IN,
            'ERROR',
            'Saída registrada sem entrada correspondente.',
            event.id,
          );
        }
        break;
      }
    }
  }

  // Jornada que terminou o dia em aberto.
  if (state !== 'OFF_SHIFT' && current) {
    flag(
      InconsistencyCode.MISSING_CLOCK_OUT,
      'ERROR',
      'Jornada aberta sem registro de saída. O período não foi contabilizado.',
    );
    segments.push({
      startedAt: current.startedAt,
      endedAt: null,
      workedMinutes: 0,
      breakMinutes: current.breakMinutes,
    });
  }

  // Apontamentos informativos sobre localização — evidenciam o cenário de viagem.
  const timezones = unique(ordered.map((e) => e.timezone));
  const countries = unique(ordered.map((e) => e.countryCode));

  if (timezones.length > 1) {
    flag(
      InconsistencyCode.MULTIPLE_TIMEZONES,
      'INFO',
      `Jornada registrada em mais de um fuso (${timezones.join(', ')}): colaborador em deslocamento.`,
    );
  }

  if (options.baseTimezone && timezones.some((tz) => tz !== options.baseTimezone)) {
    flag(
      InconsistencyCode.WORKED_ABROAD,
      'INFO',
      `Jornada registrada fora do fuso contratual (${options.baseTimezone}).`,
    );
  }

  const workedMinutes = segments.reduce((sum, s) => sum + s.workedMinutes, 0);

  // Fim de semana não gera expectativa de horas; feriados não são tratados no MVP.
  const expectsHours = (options.expectHoursOnWeekends ?? false) || !isWeekend(workDate);
  const expectedMinutes = expectsHours ? options.expectedDailyMinutes : 0;

  return {
    workDate,
    events: ordered,
    segments,
    workedMinutes,
    breakMinutes: totalBreakMinutes,
    expectedMinutes,
    balanceMinutes: workedMinutes - expectedMinutes,
    inconsistencies,
    timezones,
    countries,
    isConsistent: !inconsistencies.some((i) => i.severity === 'ERROR'),
  };
}

/**
 * Agrega a jornada de uma competência mensal.
 *
 * Dias sem marcação são incluídos com jornada zerada: a ausência é informação
 * relevante para o fechamento, e omiti-los esconderia débito de horas.
 */
export function calculateMonthlyTimesheet(
  year: number,
  month: number,
  events: TimesheetEvent[],
  options: TimesheetCalculationOptions,
): MonthlyTimesheet {
  const byDate = new Map<WorkDate, TimesheetEvent[]>();
  for (const event of events) {
    const bucket = byDate.get(event.workDate);
    if (bucket) bucket.push(event);
    else byDate.set(event.workDate, [event]);
  }

  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  const days = eachWorkDate(firstDay, lastDay).map((workDate) =>
    calculateDailyTimesheet(workDate, byDate.get(workDate) ?? [], options),
  );

  return {
    year,
    month,
    days,
    workedMinutes: days.reduce((sum, d) => sum + d.workedMinutes, 0),
    expectedMinutes: days.reduce((sum, d) => sum + d.expectedMinutes, 0),
    balanceMinutes: days.reduce((sum, d) => sum + d.balanceMinutes, 0),
    daysWithInconsistencies: days.filter((d) => !d.isConsistent).length,
  };
}
