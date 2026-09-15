import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClosingStatus, EntrySource, Prisma, TimeEntry, TimeEntryType } from '@prisma/client';
import { AccessScopeService } from '../../common/auth/access-scope.service';
import { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { assertValidTimezone, offsetMinutesAt } from '../../common/time/timezone';
import {
  WorkDate,
  assertWorkDate,
  resolveWorkDate,
  workDateFromDb,
  workDateToDb,
} from '../../common/time/work-date';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  CreateManualEntryDto,
  QueryEntriesDto,
  RegisterEntryDto,
  ShiftStatusDto,
  TimeEntryResponseDto,
} from './dto/time-entry.dto';
import { toResponse } from './time-entry.mapper';

type ShiftState = 'OFF_SHIFT' | 'WORKING' | 'ON_BREAK';

const NEXT_ALLOWED: Record<ShiftState, TimeEntryType[]> = {
  OFF_SHIFT: [TimeEntryType.CLOCK_IN],
  WORKING: [TimeEntryType.BREAK_START, TimeEntryType.CLOCK_OUT],
  ON_BREAK: [TimeEntryType.BREAK_END, TimeEntryType.CLOCK_OUT],
};

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
  ) {}

  /**
   * Marcação em tempo real feita pelo próprio colaborador.
   *
   * O instante vem do relógio do servidor. O cliente informa apenas o contexto
   * (fuso e país), nunca o horário — caso contrário alterar o relógio do celular
   * seria fraude de ponto trivial (ADR-0004, item 2).
   */
  async register(
    requester: AuthenticatedUser,
    dto: RegisterEntryDto,
  ): Promise<TimeEntryResponseDto> {
    const timezone = assertValidTimezone(dto.timezone);
    const occurredAt = new Date();
    const utcOffsetMinutes = offsetMinutesAt(occurredAt, timezone);

    const workDate = await this.resolveTargetWorkDate(requester.id, occurredAt, timezone);
    await this.assertCompetenceOpen(requester.id, workDate);

    const created = await this.prisma.timeEntry.create({
      data: {
        userId: requester.id,
        type: dto.type,
        occurredAt,
        timezone,
        countryCode: dto.countryCode.toUpperCase(),
        utcOffsetMinutes,
        workDate: workDateToDb(workDate),
        source: EntrySource.WEB,
        note: dto.note,
        registeredById: requester.id,
      },
    });

    return toResponse(created);
  }

  /**
   * Lançamento retroativo por gestor ou RH. Sempre gravado com `source = MANUAL`,
   * autoria explícita e justificativa obrigatória.
   */
  async createManual(
    requester: AuthenticatedUser,
    dto: CreateManualEntryDto,
  ): Promise<TimeEntryResponseDto> {
    await this.scope.assertCanRegisterFor(requester, dto.userId);

    const timezone = assertValidTimezone(dto.timezone);
    const occurredAt = new Date(dto.occurredAt);

    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('Instante inválido para a marcação.');
    }
    if (occurredAt.getTime() > Date.now()) {
      throw new BadRequestException('Não é possível lançar uma marcação no futuro.');
    }

    const workDate = dto.workDate
      ? assertWorkDate(dto.workDate)
      : resolveWorkDate(occurredAt, timezone);

    await this.assertCompetenceOpen(dto.userId, workDate);

    const created = await this.prisma.timeEntry.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        occurredAt,
        timezone,
        countryCode: dto.countryCode.toUpperCase(),
        utcOffsetMinutes: offsetMinutesAt(occurredAt, timezone),
        workDate: workDateToDb(workDate),
        source: EntrySource.MANUAL,
        note: dto.reason,
        registeredById: requester.id,
      },
    });

    return toResponse(created);
  }

  async findMany(
    requester: AuthenticatedUser,
    query: QueryEntriesDto,
  ): Promise<TimeEntryResponseDto[]> {
    const targetUserId = query.userId ?? requester.id;
    await this.scope.assertCanReadUser(requester, targetUserId);

    const where: Prisma.TimeEntryWhereInput = {
      userId: targetUserId,
      ...(query.includeRevoked ? {} : { revokedAt: null }),
    };

    if (query.from || query.to) {
      where.workDate = {
        ...(query.from ? { gte: workDateToDb(assertWorkDate(query.from)) } : {}),
        ...(query.to ? { lte: workDateToDb(assertWorkDate(query.to)) } : {}),
      };
    }

    const rows = await this.prisma.timeEntry.findMany({
      where,
      orderBy: [{ workDate: 'asc' }, { occurredAt: 'asc' }],
    });

    return rows.map(toResponse);
  }

  /**
   * Estado atual da jornada do colaborador — usado pela interface para decidir qual
   * botão oferecer, em vez de deixar o usuário escolher uma marcação inválida.
   */
  async currentStatus(userId: string): Promise<ShiftStatusDto> {
    const last = await this.lastEntry(userId);
    const state = this.stateAfter(last);

    return {
      state,
      lastEntry: last ? toResponse(last) : null,
      openWorkDate: last && state !== 'OFF_SHIFT' ? workDateFromDb(last.workDate) : null,
      allowedNext: NEXT_ALLOWED[state],
    };
  }

  /**
   * Regra de continuidade do ADR-0004: enquanto houver jornada em aberto, os eventos
   * seguintes herdam o `workDate` dela. É isso que mantém um turno iniciado às 22h e
   * encerrado às 6h como uma jornada única, e não duas meias-jornadas.
   */
  private async resolveTargetWorkDate(
    userId: string,
    occurredAt: Date,
    timezone: string,
  ): Promise<WorkDate> {
    const last = await this.lastEntry(userId);

    if (last && this.stateAfter(last) !== 'OFF_SHIFT') {
      return workDateFromDb(last.workDate);
    }

    return resolveWorkDate(occurredAt, timezone);
  }

  private lastEntry(userId: string): Promise<TimeEntry | null> {
    return this.prisma.timeEntry.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { occurredAt: 'desc' },
    });
  }

  private stateAfter(entry: TimeEntry | null): ShiftState {
    if (!entry) return 'OFF_SHIFT';

    switch (entry.type) {
      case TimeEntryType.CLOCK_IN:
      case TimeEntryType.BREAK_END:
        return 'WORKING';
      case TimeEntryType.BREAK_START:
        return 'ON_BREAK';
      case TimeEntryType.CLOCK_OUT:
      default:
        return 'OFF_SHIFT';
    }
  }

  /**
   * Competência fechada não aceita nova marcação (ADR-0005). A reabertura é
   * privativa do RH e fica registrada.
   */
  private async assertCompetenceOpen(userId: string, workDate: WorkDate): Promise<void> {
    const [year, month] = workDate.split('-').map(Number);

    const closing = await this.prisma.monthlyClosing.findUnique({
      where: { userId_year_month: { userId, year, month } },
      select: { status: true },
    });

    if (closing?.status === ClosingStatus.CLOSED) {
      throw new ConflictException(
        `A competência ${String(month).padStart(2, '0')}/${year} está fechada. Solicite a reabertura ao RH.`,
      );
    }
  }

  async findByIdOrFail(id: string): Promise<TimeEntry> {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Marcação não encontrada.');
    return entry;
  }
}
