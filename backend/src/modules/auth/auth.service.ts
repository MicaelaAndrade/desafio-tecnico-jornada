import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });

    // A mesma mensagem é devolvida para e-mail inexistente e senha incorreta, para
    // não permitir enumeração de usuários. A comparação também roda mesmo quando o
    // usuário não existe, evitando distinção por tempo de resposta.
    const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid';
    const passwordMatches = await bcrypt.compare(dto.password, hash);

    if (!user || !passwordMatches || !user.active) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        baseTimezone: user.baseTimezone,
        countryCode: user.countryCode,
        expectedDailyMinutes: user.expectedDailyMinutes,
      },
    };
  }

  static hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }
}
