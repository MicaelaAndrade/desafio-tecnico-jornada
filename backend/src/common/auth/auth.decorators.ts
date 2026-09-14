import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const PUBLIC_KEY = 'isPublic';

/** Restringe a rota aos papéis informados. A verificação de escopo por colaborador
 *  acontece no serviço, não aqui (ver ADR-0006). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Marca a rota como acessível sem autenticação. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Identidade do usuário autenticado, extraída do token. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  baseTimezone: string;
  countryCode: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return data ? request.user?.[data] : request.user;
  },
);
