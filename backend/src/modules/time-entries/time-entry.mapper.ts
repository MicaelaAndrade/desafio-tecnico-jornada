import { TimeEntry as PrismaTimeEntry } from '@prisma/client';
import { localTimeFromFrozenOffset } from '../../common/time/timezone';
import { workDateFromDb } from '../../common/time/work-date';
import {
  TimesheetEvent,
  TimesheetEventType,
} from '../../domain/timesheet/timesheet.types';
import { TimeEntryResponseDto } from './dto/time-entry.dto';

/**
 * Fronteira entre infraestrutura e domínio.
 *
 * O domínio (`src/domain`) não importa nada do Prisma; é aqui que a linha do banco
 * vira um evento de jornada. Isso é o que permite testar toda a regra de cálculo
 * sem banco, sem framework e sem mock (ver ADR-0001).
 */
export function toDomainEvent(row: PrismaTimeEntry): TimesheetEvent {
  return {
    id: row.id,
    type: row.type as unknown as TimesheetEventType,
    occurredAt: row.occurredAt,
    timezone: row.timezone,
    countryCode: row.countryCode,
    utcOffsetMinutes: row.utcOffsetMinutes,
    workDate: workDateFromDb(row.workDate),
    source: row.source,
    note: row.note,
  };
}

export function toResponse(row: PrismaTimeEntry): TimeEntryResponseDto {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    localTime: localTimeFromFrozenOffset(row.occurredAt, row.utcOffsetMinutes),
    timezone: row.timezone,
    countryCode: row.countryCode,
    utcOffsetMinutes: row.utcOffsetMinutes,
    workDate: workDateFromDb(row.workDate),
    source: row.source,
    note: row.note,
    registeredById: row.registeredById,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}
