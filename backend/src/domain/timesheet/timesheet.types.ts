import { WorkDate } from '../../common/time/work-date';

/**
 * Tipos de evento que compõem a jornada. Espelha o enum do banco, mas é declarado
 * aqui de propósito: o domínio não depende do Prisma (ver ADR-0001). A camada de
 * infraestrutura mapeia as linhas do banco para estes tipos.
 */
export enum TimesheetEventType {
  CLOCK_IN = 'CLOCK_IN',
  BREAK_START = 'BREAK_START',
  BREAK_END = 'BREAK_END',
  CLOCK_OUT = 'CLOCK_OUT',
}

/** Marcação já normalizada para o domínio. Registros revogados nunca chegam aqui. */
export interface TimesheetEvent {
  id: string;
  type: TimesheetEventType;
  /** Instante absoluto, em UTC. Toda aritmética de duração usa exclusivamente este campo. */
  occurredAt: Date;
  /** Fuso IANA do local onde a marcação foi feita. */
  timezone: string;
  /** País onde a marcação foi feita (ISO 3166-1 alpha-2). */
  countryCode: string;
  /** Offset congelado no registro (ver ADR-0004). */
  utcOffsetMinutes: number;
  workDate: WorkDate;
  source: string;
  note?: string | null;
}

export type InconsistencySeverity = 'ERROR' | 'WARNING' | 'INFO';

export enum InconsistencyCode {
  /** A jornada foi aberta e não foi encerrada. */
  MISSING_CLOCK_OUT = 'MISSING_CLOCK_OUT',
  /** Saída registrada sem entrada correspondente. */
  CLOCK_OUT_WITHOUT_CLOCK_IN = 'CLOCK_OUT_WITHOUT_CLOCK_IN',
  /** Segunda entrada sem que a anterior tenha sido encerrada. */
  DUPLICATE_CLOCK_IN = 'DUPLICATE_CLOCK_IN',
  /** Início de pausa fora de uma jornada aberta. */
  BREAK_OUTSIDE_SHIFT = 'BREAK_OUTSIDE_SHIFT',
  /** Fim de pausa sem início correspondente. */
  BREAK_END_WITHOUT_START = 'BREAK_END_WITHOUT_START',
  /** Segundo início de pausa sem encerrar a anterior. */
  DUPLICATE_BREAK_START = 'DUPLICATE_BREAK_START',
  /** Jornada encerrada com pausa ainda aberta. */
  UNCLOSED_BREAK = 'UNCLOSED_BREAK',
  /** Turno com duração implausível — indício de marcação esquecida. */
  EXCESSIVE_SHIFT_DURATION = 'EXCESSIVE_SHIFT_DURATION',
  /** Jornada registrada em mais de um fuso: colaborador em deslocamento. Informativo. */
  MULTIPLE_TIMEZONES = 'MULTIPLE_TIMEZONES',
  /** Jornada registrada fora do fuso contratual do colaborador. Informativo. */
  WORKED_ABROAD = 'WORKED_ABROAD',
}

export interface Inconsistency {
  code: InconsistencyCode;
  severity: InconsistencySeverity;
  message: string;
  /** Evento que originou o apontamento, quando aplicável. */
  eventId?: string;
}

/** Intervalo contínuo de trabalho, já descontadas as pausas internas. */
export interface WorkSegment {
  startedAt: Date;
  /** `null` quando a jornada ficou aberta (sem `CLOCK_OUT`). */
  endedAt: Date | null;
  /** Minutos efetivamente trabalhados no segmento. Zero enquanto o segmento estiver aberto. */
  workedMinutes: number;
  /** Minutos de pausa consumidos dentro deste segmento. */
  breakMinutes: number;
}

export interface DailyTimesheet {
  workDate: WorkDate;
  events: TimesheetEvent[];
  segments: WorkSegment[];
  workedMinutes: number;
  breakMinutes: number;
  expectedMinutes: number;
  /** Positivo = crédito de horas; negativo = débito. */
  balanceMinutes: number;
  inconsistencies: Inconsistency[];
  /** Fusos distintos em que houve marcação no dia. */
  timezones: string[];
  /** Países distintos em que houve marcação no dia. */
  countries: string[];
  /** `false` quando há apontamento de severidade ERROR — o dia precisa de correção. */
  isConsistent: boolean;
}

export interface MonthlyTimesheet {
  year: number;
  month: number;
  days: DailyTimesheet[];
  workedMinutes: number;
  expectedMinutes: number;
  balanceMinutes: number;
  /** Dias com ao menos um apontamento de severidade ERROR. */
  daysWithInconsistencies: number;
}

export interface TimesheetCalculationOptions {
  /** Carga horária diária contratada, em minutos. */
  expectedDailyMinutes: number;
  /**
   * Fuso contratual do colaborador. Quando informado, marcações feitas em outro
   * fuso geram apontamento informativo `WORKED_ABROAD` (cenário de viagem).
   */
  baseTimezone?: string;
  /**
   * Fim de semana não gera expectativa de horas. Feriados NÃO são tratados —
   * ver "Limitações conhecidas" no README.
   */
  expectHoursOnWeekends?: boolean;

  /**
   * Último dia que já aconteceu, do ponto de vista do colaborador.
   *
   * Dias posteriores a ele aparecem na folha, mas não geram expectativa de horas:
   * cobrar jornada de um dia que ainda não chegou produziria um saldo devedor
   * fictício, crescente até o fim do mês. Quando omitido, todos os dias contam.
   */
  referenceDate?: WorkDate;
  /** Acima disso, o turno é sinalizado como implausível. Padrão: 16 horas. */
  maxShiftMinutes?: number;
}
