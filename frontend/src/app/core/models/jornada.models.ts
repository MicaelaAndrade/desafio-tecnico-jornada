export type Role = 'EMPLOYEE' | 'MANAGER' | 'HR';

export type TimeEntryType = 'CLOCK_IN' | 'BREAK_START' | 'BREAK_END' | 'CLOCK_OUT';

export type EntrySource = 'WEB' | 'MANUAL' | 'CORRECTION' | 'IMPORT';

export type ShiftState = 'OFF_SHIFT' | 'WORKING' | 'ON_BREAK';

export type InconsistencySeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  baseTimezone: string;
  countryCode: string;
  expectedDailyMinutes: number;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface TimeEntry {
  id: string;
  userId: string;
  type: TimeEntryType;
  occurredAt: string;
  /** Horário local do registro, reconstruído a partir do offset congelado no servidor. */
  localTime: string;
  timezone: string;
  countryCode: string;
  utcOffsetMinutes: number;
  workDate: string;
  source: EntrySource;
  note?: string | null;
  registeredById: string;
  revokedAt?: string | null;
}

export interface ShiftStatus {
  state: ShiftState;
  lastEntry?: TimeEntry | null;
  openWorkDate?: string | null;
  allowedNext: TimeEntryType[];
}

export interface Inconsistency {
  code: string;
  severity: InconsistencySeverity;
  message: string;
  eventId?: string;
}

export interface WorkSegment {
  startedAt: string;
  endedAt: string | null;
  workedMinutes: number;
  breakMinutes: number;
}

export interface DailyTimesheet {
  workDate: string;
  entries: TimeEntry[];
  segments: WorkSegment[];
  workedMinutes: number;
  breakMinutes: number;
  expectedMinutes: number;
  balanceMinutes: number;
  inconsistencies: Inconsistency[];
  timezones: string[];
  countries: string[];
  isConsistent: boolean;
}

export interface MonthlyTimesheet {
  userId: string;
  userName: string;
  /** Fuso contratual do colaborador consultado, não o de quem consulta. */
  baseTimezone: string;
  year: number;
  month: number;
  days: DailyTimesheet[];
  workedMinutes: number;
  expectedMinutes: number;
  balanceMinutes: number;
  daysWithInconsistencies: number;
  closingStatus: 'OPEN' | 'CLOSED';
}

export interface TeamMemberSummary {
  userId: string;
  name: string;
  countryCode: string;
  baseTimezone: string;
  workedMinutes: number;
  expectedMinutes: number;
  balanceMinutes: number;
  daysWithInconsistencies: number;
  closingStatus: 'OPEN' | 'CLOSED';
}

export type CorrectionType = 'ADD' | 'REMOVE' | 'MODIFY';
export type CorrectionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface CorrectionRequest {
  id: string;
  userId: string;
  userName: string;
  requestedById: string;
  type: CorrectionType;
  targetEntryId: string | null;
  proposedType: TimeEntryType | null;
  proposedOccurredAt: string | null;
  proposedTimezone: string | null;
  workDate: string;
  reason: string;
  status: CorrectionStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export const TIPO_MARCACAO_LABEL: Record<TimeEntryType, string> = {
  CLOCK_IN: 'Entrada',
  BREAK_START: 'Início da pausa',
  BREAK_END: 'Fim da pausa',
  CLOCK_OUT: 'Saída',
};

export const ORIGEM_LABEL: Record<EntrySource, string> = {
  WEB: 'Registrado pelo colaborador',
  MANUAL: 'Lançado manualmente',
  CORRECTION: 'Originado de correção',
  IMPORT: 'Importado',
};
