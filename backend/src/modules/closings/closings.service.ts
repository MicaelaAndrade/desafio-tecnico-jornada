import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClosingStatus, MonthlyClosing } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TimesheetsService } from '../timesheets/timesheets.service';
import { CloseCompetenceDto, ClosingResponseDto, ReopenCompetenceDto } from './dto/closing.dto';

/**
 * Ciclo de vida da competência mensal (ADR-0005).
 *
 * O snapshot de horas é congelado no fechamento em vez de recalculado sob demanda:
 * o número que foi para a folha de pagamento precisa continuar sendo o número que
 * foi para a folha de pagamento, mesmo que uma regra de cálculo evolua depois.
 */
@Injectable()
export class ClosingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timesheets: TimesheetsService,
  ) {}

  async close(requester: AuthenticatedUser, dto: CloseCompetenceDto): Promise<ClosingResponseDto> {
    const { userId, year, month } = dto;

    const existing = await this.prisma.monthlyClosing.findUnique({
      where: { userId_year_month: { userId, year, month } },
    });

    if (existing?.status === ClosingStatus.CLOSED) {
      throw new ConflictException('Esta competência já está fechada.');
    }

    const timesheet = await this.timesheets.monthly(requester, userId, year, month);

    // Fechar sobre dias inconsistentes é justamente o que produz a divergência que o
    // sistema existe para evitar. É permitido, mas exige decisão explícita e registro.
    if (timesheet.daysWithInconsistencies > 0 && !dto.force) {
      throw new ConflictException(
        `A competência possui ${timesheet.daysWithInconsistencies} dia(s) com inconsistência. ` +
          'Trate as pendências ou use "force" com justificativa para homologar mesmo assim.',
      );
    }

    const closed = await this.prisma.monthlyClosing.upsert({
      where: { userId_year_month: { userId, year, month } },
      create: {
        userId,
        year,
        month,
        status: ClosingStatus.CLOSED,
        workedMinutes: timesheet.workedMinutes,
        expectedMinutes: timesheet.expectedMinutes,
        balanceMinutes: timesheet.balanceMinutes,
        closedById: requester.id,
        closedAt: new Date(),
      },
      update: {
        status: ClosingStatus.CLOSED,
        workedMinutes: timesheet.workedMinutes,
        expectedMinutes: timesheet.expectedMinutes,
        balanceMinutes: timesheet.balanceMinutes,
        closedById: requester.id,
        closedAt: new Date(),
      },
    });

    return this.toResponse(closed);
  }

  async reopen(
    requester: AuthenticatedUser,
    dto: ReopenCompetenceDto,
  ): Promise<ClosingResponseDto> {
    const { userId, year, month } = dto;

    const existing = await this.prisma.monthlyClosing.findUnique({
      where: { userId_year_month: { userId, year, month } },
    });

    if (!existing) throw new NotFoundException('Competência não encontrada.');
    if (existing.status === ClosingStatus.OPEN) {
      throw new ConflictException('Esta competência já está aberta.');
    }

    // O snapshot anterior é mantido até o próximo fechamento: perder o valor
    // homologado ao reabrir apagaria a informação que se quer poder auditar.
    const reopened = await this.prisma.monthlyClosing.update({
      where: { id: existing.id },
      data: { status: ClosingStatus.OPEN, closedById: requester.id, closedAt: null },
    });

    return this.toResponse(reopened);
  }

  async findMany(year: number, month: number): Promise<ClosingResponseDto[]> {
    const rows = await this.prisma.monthlyClosing.findMany({
      where: { year, month },
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((row) => this.toResponse(row));
  }

  private toResponse(row: MonthlyClosing): ClosingResponseDto {
    return {
      id: row.id,
      userId: row.userId,
      year: row.year,
      month: row.month,
      status: row.status,
      workedMinutes: row.workedMinutes,
      expectedMinutes: row.expectedMinutes,
      balanceMinutes: row.balanceMinutes,
      closedById: row.closedById,
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    };
  }
}
