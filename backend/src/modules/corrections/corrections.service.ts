import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClosingStatus,
  CorrectionRequest,
  CorrectionStatus,
  CorrectionType,
  EntrySource,
  Prisma,
  User,
} from '@prisma/client';
import { AccessScopeService } from '../../common/auth/access-scope.service';
import { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { assertValidTimezone, offsetMinutesAt } from '../../common/time/timezone';
import { WorkDate, assertWorkDate, workDateFromDb, workDateToDb } from '../../common/time/work-date';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CorrectionResponseDto, CreateCorrectionDto, ReviewCorrectionDto } from './dto/correction.dto';

type CorrectionWithUser = CorrectionRequest & { user: Pick<User, 'name'> };

/**
 * Fluxo de correção de jornada (ADR-0003).
 *
 * Nenhuma operação aqui altera ou apaga uma marcação existente: aprovar uma correção
 * cria registros novos e/ou revoga logicamente os antigos, sempre preservando a linha
 * original e a autoria.
 */
@Injectable()
export class CorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
  ) {}

  async request(
    requester: AuthenticatedUser,
    dto: CreateCorrectionDto,
  ): Promise<CorrectionResponseDto> {
    const userId = dto.userId ?? requester.id;
    await this.scope.assertCanRegisterFor(requester, userId);

    const workDate = assertWorkDate(dto.workDate);
    await this.assertCompetenceOpen(userId, workDate);

    if (dto.type === CorrectionType.ADD) {
      this.assertProposalComplete(dto);
    }

    if (dto.type === CorrectionType.REMOVE || dto.type === CorrectionType.MODIFY) {
      if (!dto.targetEntryId) {
        throw new BadRequestException('Informe a marcação alvo da correção.');
      }
      await this.assertTargetIsCorrectable(dto.targetEntryId, userId);
      if (dto.type === CorrectionType.MODIFY) this.assertProposalComplete(dto);
    }

    const created = await this.prisma.correctionRequest.create({
      data: {
        userId,
        requestedById: requester.id,
        type: dto.type,
        targetEntryId: dto.targetEntryId ?? null,
        proposedType: dto.proposedType ?? null,
        proposedOccurredAt: dto.proposedOccurredAt ? new Date(dto.proposedOccurredAt) : null,
        proposedTimezone: dto.proposedTimezone ?? null,
        proposedCountry: dto.proposedCountry?.toUpperCase() ?? null,
        workDate: workDateToDb(workDate),
        reason: dto.reason,
      },
      include: { user: { select: { name: true } } },
    });

    return this.toResponse(created);
  }

  async findMany(
    requester: AuthenticatedUser,
    status?: CorrectionStatus,
  ): Promise<CorrectionResponseDto[]> {
    const visible = await this.scope.visibleUserIds(requester);

    const where: Prisma.CorrectionRequestWhereInput = {
      ...(visible ? { userId: { in: visible } } : {}),
      ...(status ? { status } : {}),
    };

    const rows = await this.prisma.correctionRequest.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.toResponse(row));
  }

  /**
   * Homologa a correção e aplica seus efeitos numa única transação: ou a marcação
   * nova e a revogação da antiga acontecem juntas, ou nada acontece.
   */
  async approve(
    requester: AuthenticatedUser,
    id: string,
    dto: ReviewCorrectionDto,
  ): Promise<CorrectionResponseDto> {
    const correction = await this.findPendingOrFail(id);
    await this.scope.assertCanReviewCorrection(requester, correction.userId);

    const workDate = workDateFromDb(correction.workDate);
    await this.assertCompetenceOpen(correction.userId, workDate);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (
        correction.type === CorrectionType.REMOVE ||
        correction.type === CorrectionType.MODIFY
      ) {
        const target = await tx.timeEntry.findUnique({ where: { id: correction.targetEntryId! } });
        if (!target || target.revokedAt) {
          throw new ConflictException('A marcação alvo já foi revogada por outra correção.');
        }

        await tx.timeEntry.update({
          where: { id: target.id },
          data: { revokedAt: new Date(), revokedByCorrectionId: correction.id },
        });
      }

      if (correction.type === CorrectionType.ADD || correction.type === CorrectionType.MODIFY) {
        const timezone = assertValidTimezone(correction.proposedTimezone);
        const occurredAt = correction.proposedOccurredAt!;

        await tx.timeEntry.create({
          data: {
            userId: correction.userId,
            type: correction.proposedType!,
            occurredAt,
            timezone,
            countryCode: correction.proposedCountry ?? 'BR',
            utcOffsetMinutes: offsetMinutesAt(occurredAt, timezone),
            workDate: correction.workDate,
            source: EntrySource.CORRECTION,
            note: correction.reason,
            registeredById: requester.id,
            originCorrectionId: correction.id,
          },
        });
      }

      return tx.correctionRequest.update({
        where: { id: correction.id },
        data: {
          status: CorrectionStatus.APPROVED,
          reviewedById: requester.id,
          reviewedAt: new Date(),
          reviewNote: dto.reviewNote ?? null,
        },
        include: { user: { select: { name: true } } },
      });
    });

    return this.toResponse(updated);
  }

  async reject(
    requester: AuthenticatedUser,
    id: string,
    dto: ReviewCorrectionDto,
  ): Promise<CorrectionResponseDto> {
    const correction = await this.findPendingOrFail(id);
    await this.scope.assertCanReviewCorrection(requester, correction.userId);

    const updated = await this.prisma.correctionRequest.update({
      where: { id },
      data: {
        status: CorrectionStatus.REJECTED,
        reviewedById: requester.id,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote ?? null,
      },
      include: { user: { select: { name: true } } },
    });

    return this.toResponse(updated);
  }

  /** O próprio solicitante pode desistir enquanto a correção não foi homologada. */
  async cancel(requester: AuthenticatedUser, id: string): Promise<CorrectionResponseDto> {
    const correction = await this.findPendingOrFail(id);

    if (correction.requestedById !== requester.id) {
      throw new ForbiddenException('Apenas quem solicitou pode cancelar a correção.');
    }

    const updated = await this.prisma.correctionRequest.update({
      where: { id },
      data: { status: CorrectionStatus.CANCELLED },
      include: { user: { select: { name: true } } },
    });

    return this.toResponse(updated);
  }

  private assertProposalComplete(dto: CreateCorrectionDto): void {
    if (!dto.proposedType || !dto.proposedOccurredAt || !dto.proposedTimezone) {
      throw new BadRequestException(
        'Para inclusão ou ajuste, informe o tipo, o instante e o fuso da marcação proposta.',
      );
    }
    assertValidTimezone(dto.proposedTimezone);

    if (new Date(dto.proposedOccurredAt).getTime() > Date.now()) {
      throw new BadRequestException('A marcação proposta não pode estar no futuro.');
    }
  }

  private async assertTargetIsCorrectable(entryId: string, userId: string): Promise<void> {
    const target = await this.prisma.timeEntry.findUnique({
      where: { id: entryId },
      select: { userId: true, revokedAt: true },
    });

    if (!target) throw new NotFoundException('Marcação alvo não encontrada.');
    if (target.userId !== userId) {
      throw new BadRequestException('A marcação alvo pertence a outro colaborador.');
    }
    if (target.revokedAt) {
      throw new ConflictException('Esta marcação já foi revogada por outra correção.');
    }
  }

  private async findPendingOrFail(id: string): Promise<CorrectionRequest> {
    const correction = await this.prisma.correctionRequest.findUnique({ where: { id } });
    if (!correction) throw new NotFoundException('Correção não encontrada.');
    if (correction.status !== CorrectionStatus.PENDING) {
      throw new ConflictException('Esta correção já foi analisada.');
    }
    return correction;
  }

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

  private toResponse(row: CorrectionWithUser): CorrectionResponseDto {
    return {
      id: row.id,
      userId: row.userId,
      userName: row.user.name,
      requestedById: row.requestedById,
      type: row.type,
      targetEntryId: row.targetEntryId,
      proposedType: row.proposedType,
      proposedOccurredAt: row.proposedOccurredAt ? row.proposedOccurredAt.toISOString() : null,
      proposedTimezone: row.proposedTimezone,
      workDate: workDateFromDb(row.workDate),
      reason: row.reason,
      status: row.status,
      reviewedById: row.reviewedById,
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
      reviewNote: row.reviewNote,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
