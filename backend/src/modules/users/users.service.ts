import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { AccessScopeService } from '../../common/auth/access-scope.service';
import { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { assertValidTimezone } from '../../common/time/timezone';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
  ) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    assertValidTimezone(dto.baseTimezone);

    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException('Já existe um colaborador com este e-mail.');

    if (dto.managerId) await this.assertManagerExists(dto.managerId);

    const created = await this.prisma.user.create({
      data: {
        name: dto.name,
        email,
        passwordHash: await AuthService.hashPassword(dto.password),
        role: dto.role,
        baseTimezone: dto.baseTimezone,
        countryCode: dto.countryCode.toUpperCase(),
        expectedDailyMinutes: dto.expectedDailyMinutes ?? 480,
        managerId: dto.managerId ?? null,
      },
    });

    return this.toResponse(created);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    await this.findOrFail(id);
    if (dto.baseTimezone) assertValidTimezone(dto.baseTimezone);
    if (dto.managerId) await this.assertManagerExists(dto.managerId, id);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email.toLowerCase() } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.baseTimezone !== undefined ? { baseTimezone: dto.baseTimezone } : {}),
        ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode.toUpperCase() } : {}),
        ...(dto.expectedDailyMinutes !== undefined
          ? { expectedDailyMinutes: dto.expectedDailyMinutes }
          : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });

    return this.toResponse(updated);
  }

  /** Lista respeitando o escopo do solicitante (ADR-0006). */
  async findMany(requester: AuthenticatedUser): Promise<UserResponseDto[]> {
    const visible = await this.scope.visibleUserIds(requester);

    const users = await this.prisma.user.findMany({
      where: visible ? { id: { in: visible } } : {},
      orderBy: { name: 'asc' },
    });

    return users.map((user) => this.toResponse(user));
  }

  async findOne(requester: AuthenticatedUser, id: string): Promise<UserResponseDto> {
    await this.scope.assertCanReadUser(requester, id);
    return this.toResponse(await this.findOrFail(id));
  }

  private async findOrFail(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Colaborador não encontrado.');
    return user;
  }

  private async assertManagerExists(managerId: string, selfId?: string): Promise<void> {
    if (selfId && managerId === selfId) {
      throw new ConflictException('Um colaborador não pode ser o próprio gestor.');
    }

    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
      select: { role: true },
    });

    if (!manager) throw new NotFoundException('Gestor informado não encontrado.');
    if (manager.role === Role.EMPLOYEE) {
      throw new ConflictException('O gestor informado não possui perfil de gestão.');
    }
  }

  private toResponse(user: User): UserResponseDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      baseTimezone: user.baseTimezone,
      countryCode: user.countryCode,
      expectedDailyMinutes: user.expectedDailyMinutes,
      managerId: user.managerId,
      active: user.active,
    };
  }
}
