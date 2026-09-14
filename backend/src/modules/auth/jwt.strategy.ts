import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * O papel e o fuso são relidos do banco a cada requisição, em vez de confiar no
   * que está no token: uma promoção, um desligamento ou uma mudança de país
   * precisam surtir efeito imediato, sem esperar o token expirar.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, baseTimezone: true, countryCode: true, active: true },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    const { active: _active, ...authenticated } = user;
    return authenticated;
  }
}
