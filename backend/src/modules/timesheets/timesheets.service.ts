import { Injectable, NotFoundException } from '@nestjs/common';
import { ClosingStatus, Prisma, TimeEntry } from '@prisma/client';
import { AccessScopeService } from '../../common/auth/access-scope.service';
import { AuthenticatedUser } from '../../common/auth/auth.decorators';
import {
  WorkDate,
  assertWorkDate,
  firstDayOfMonth,
  lastDayOfMonth,
  workDateToDb,
} from '../../common/time/work-date';
import {
  calculateDailyTimesheet,
  calculateMonthlyTimesheet,
} from '../../domain/timesheet/timesheet-calculator';
import {
  DailyTimesheet,
  TimesheetCalculationOptions,
} from '../../domain/timesheet/timesheet.types';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { toDomainEvent, toResponse } from '../time-entries/time-entry.mapper';
import { DailyTimesheetDto, MonthlyTimesheetDto, TeamMemberSummaryDto } from './dto/timesheet.dto';

@Injectable()
export class TimesheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
  ) {}

  /** Espelho de ponto da competência, dia a dia. */
  async monthly(
    requester: AuthenticatedUser,
    userId: string,
    year: number,
    month: number,
  ): Promise<MonthlyTimesheetDto> {
    await this.scope.assertCanReadUser(requester, userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, expectedDailyMinutes: true, baseTimezone: true },
    });
    if (!user) throw new NotFoundException('Colaborador não encontrado.');

    const rows = await this.entriesBetween(
      userId,
      firstDayOfMonth(year, month),
      lastDayOfMonth(year, month),
    );

    const options: TimesheetCalculationOptions = {
      expectedDailyMinutes: user.expectedDailyMinutes,
      baseTimezone: user.baseTimezone,
    };

    const monthly = calculateMonthlyTimesheet(year, month, rows.map(toDomainEvent), options);
    const closing = await this.prisma.monthlyClosing.findUnique({
      where: { userId_year_month: { userId, year, month } },
      select: { status: true },
    });

    const rowsById = new Map(rows.map((row) => [row.id, row]));

    return {
      userId: user.id,
      userName: user.name,
      year,
      month,
      days: monthly.days.map((day) => this.toDailyDto(day, rowsById)),
      workedMinutes: monthly.workedMinutes,
      expectedMinutes: monthly.expectedMinutes,
      balanceMinutes: monthly.balanceMinutes,
      daysWithInconsistencies: monthly.daysWithInconsistencies,
      closingStatus: closing?.status ?? ClosingStatus.OPEN,
    };
  }

  /** Espelho de ponto de um intervalo arbitrário de dias. */
  async range(
    requester: AuthenticatedUser,
    userId: string,
    from: WorkDate,
    to: WorkDate,
  ): Promise<DailyTimesheetDto[]> {
    await this.scope.assertCanReadUser(requester, userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { expectedDailyMinutes: true, baseTimezone: true },
    });
    if (!user) throw new NotFoundException('Colaborador não encontrado.');

    const rows = await this.entriesBetween(userId, assertWorkDate(from), assertWorkDate(to));
    const rowsById = new Map(rows.map((row) => [row.id, row]));

    const byDate = new Map<WorkDate, TimeEntry[]>();
    for (const row of rows) {
      const key = row.workDate.toISOString().slice(0, 10);
      const bucket = byDate.get(key);
      if (bucket) bucket.push(row);
      else byDate.set(key, [row]);
    }

    const options: TimesheetCalculationOptions = {
      expectedDailyMinutes: user.expectedDailyMinutes,
      baseTimezone: user.baseTimezone,
    };

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([workDate, entries]) =>
        this.toDailyDto(
          calculateDailyTimesheet(workDate, entries.map(toDomainEvent), options),
          rowsById,
        ),
      );
  }

  /**
   * Consolidado da equipe na competência. Respeita o escopo do solicitante:
   * gestor vê apenas os subordinados diretos; RH vê todos (ADR-0006).
   */
  async teamSummary(
    requester: AuthenticatedUser,
    year: number,
    month: number,
  ): Promise<TeamMemberSummaryDto[]> {
    const visible = await this.scope.visibleUserIds(requester);

    const users = await this.prisma.user.findMany({
      where: { active: true, ...(visible ? { id: { in: visible } } : {}) },
      select: {
        id: true,
        name: true,
        countryCode: true,
        baseTimezone: true,
        expectedDailyMinutes: true,
      },
      orderBy: { name: 'asc' },
    });

    const from = firstDayOfMonth(year, month);
    const to = lastDayOfMonth(year, month);

    const [allEntries, closings] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: {
          userId: { in: users.map((u) => u.id) },
          revokedAt: null,
          workDate: { gte: workDateToDb(from), lte: workDateToDb(to) },
        },
        orderBy: { occurredAt: 'asc' },
      }),
      this.prisma.monthlyClosing.findMany({
        where: { userId: { in: users.map((u) => u.id) }, year, month },
        select: { userId: true, status: true },
      }),
    ]);

    const entriesByUser = new Map<string, TimeEntry[]>();
    for (const entry of allEntries) {
      const bucket = entriesByUser.get(entry.userId);
      if (bucket) bucket.push(entry);
      else entriesByUser.set(entry.userId, [entry]);
    }

    const closingByUser = new Map(closings.map((c) => [c.userId, c.status]));

    return users.map((user) => {
      const monthly = calculateMonthlyTimesheet(
        year,
        month,
        (entriesByUser.get(user.id) ?? []).map(toDomainEvent),
        { expectedDailyMinutes: user.expectedDailyMinutes, baseTimezone: user.baseTimezone },
      );

      return {
        userId: user.id,
        name: user.name,
        countryCode: user.countryCode,
        baseTimezone: user.baseTimezone,
        workedMinutes: monthly.workedMinutes,
        expectedMinutes: monthly.expectedMinutes,
        balanceMinutes: monthly.balanceMinutes,
        daysWithInconsistencies: monthly.daysWithInconsistencies,
        closingStatus: closingByUser.get(user.id) ?? ClosingStatus.OPEN,
      };
    });
  }

  /** Registros revogados nunca entram no cálculo (ADR-0003). */
  private entriesBetween(userId: string, from: WorkDate, to: WorkDate): Promise<TimeEntry[]> {
    const where: Prisma.TimeEntryWhereInput = {
      userId,
      revokedAt: null,
      workDate: { gte: workDateToDb(from), lte: workDateToDb(to) },
    };

    return this.prisma.timeEntry.findMany({
      where,
      orderBy: [{ workDate: 'asc' }, { occurredAt: 'asc' }],
    });
  }

  private toDailyDto(day: DailyTimesheet, rowsById: Map<string, TimeEntry>): DailyTimesheetDto {
    return {
      workDate: day.workDate,
      entries: day.events
        .map((event) => rowsById.get(event.id))
        .filter((row): row is TimeEntry => Boolean(row))
        .map(toResponse),
      segments: day.segments.map((segment) => ({
        startedAt: segment.startedAt.toISOString(),
        endedAt: segment.endedAt ? segment.endedAt.toISOString() : null,
        workedMinutes: segment.workedMinutes,
        breakMinutes: segment.breakMinutes,
      })),
      workedMinutes: day.workedMinutes,
      breakMinutes: day.breakMinutes,
      expectedMinutes: day.expectedMinutes,
      balanceMinutes: day.balanceMinutes,
      inconsistencies: day.inconsistencies.map((i) => ({
        code: i.code,
        severity: i.severity,
        message: i.message,
        eventId: i.eventId,
      })),
      timezones: day.timezones,
      countries: day.countries,
      isConsistent: day.isConsistent,
    };
  }
}
