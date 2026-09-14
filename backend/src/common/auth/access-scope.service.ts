import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthenticatedUser } from './auth.decorators';

/**
 * Escopo de visibilidade por papel (ADR-0006).
 *
 * A verificação vive aqui, no serviço, e não apenas num guard de rota: qualquer
 * endpoint que receba `userId` como parâmetro vazaria dados de fora do escopo se a
 * checagem dependesse só do verbo HTTP.
 */
@Injectable()
export class AccessScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lança 403 se o solicitante não puder ler a jornada do colaborador informado. */
  async assertCanReadUser(requester: AuthenticatedUser, targetUserId: string): Promise<void> {
    if (requester.role === Role.HR) return;
    if (requester.id === targetUserId) return;

    if (requester.role === Role.MANAGER) {
      const target = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { managerId: true },
      });

      if (!target) throw new NotFoundException('Colaborador não encontrado.');
      if (target.managerId === requester.id) return;
    }

    throw new ForbiddenException('Você não tem acesso à jornada deste colaborador.');
  }

  /**
   * Lança 403 se o solicitante não puder lançar marcação em nome do colaborador.
   * Lançar para si mesmo é sempre permitido; para terceiros, exige gestão ou RH.
   */
  async assertCanRegisterFor(requester: AuthenticatedUser, targetUserId: string): Promise<void> {
    if (requester.id === targetUserId) return;
    if (requester.role === Role.EMPLOYEE) {
      throw new ForbiddenException('Você só pode registrar a própria jornada.');
    }
    await this.assertCanReadUser(requester, targetUserId);
  }

  /**
   * Ninguém homologa a própria correção (ADR-0006). Um gestor que solicitou ajuste
   * na própria jornada precisa de aprovação do RH.
   */
  async assertCanReviewCorrection(
    requester: AuthenticatedUser,
    correctionOwnerId: string,
  ): Promise<void> {
    if (requester.id === correctionOwnerId) {
      throw new ForbiddenException(
        'Uma correção da própria jornada precisa ser homologada por outra pessoa.',
      );
    }

    if (requester.role === Role.HR) return;

    if (requester.role === Role.MANAGER) {
      const owner = await this.prisma.user.findUnique({
        where: { id: correctionOwnerId },
        select: { managerId: true },
      });
      if (owner?.managerId === requester.id) return;
    }

    throw new ForbiddenException('Você não pode homologar correções deste colaborador.');
  }

  /**
   * Ids que o solicitante pode enxergar. `null` significa "todos" (RH) e evita
   * carregar a base inteira só para montar um filtro.
   */
  async visibleUserIds(requester: AuthenticatedUser): Promise<string[] | null> {
    if (requester.role === Role.HR) return null;

    if (requester.role === Role.MANAGER) {
      const reports = await this.prisma.user.findMany({
        where: { managerId: requester.id },
        select: { id: true },
      });
      return [requester.id, ...reports.map((r) => r.id)];
    }

    return [requester.id];
  }
}
