import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infra/prisma/prisma.service';
import { InMemoryPrisma } from './in-memory-prisma';

export const SENHA_TESTE = 'jornada123';

export interface UsuarioDeTeste {
  id: string;
  name: string;
  email: string;
  role: 'EMPLOYEE' | 'MANAGER' | 'HR';
  baseTimezone: string;
  countryCode: string;
}

export interface AmbienteApi {
  app: INestApplication;
  prisma: InMemoryPrisma;
  usuarios: {
    rh: UsuarioDeTeste;
    gestor: UsuarioDeTeste;
    ana: UsuarioDeTeste;
    bruno: UsuarioDeTeste;
    /** Colaboradora de outro time — usada para verificar o limite do escopo do gestor. */
    forasteira: UsuarioDeTeste;
  };
  /**
   * Emite um token válido para o usuário, evitando passar pelo endpoint de login
   * em cada teste — o login tem limite de tentativas por minuto, e exercitá-lo
   * repetidamente testaria o rate limit em vez da regra de negócio.
   */
  tokenDe(usuario: UsuarioDeTeste): string;
  encerrar(): Promise<void>;
}

export async function criarAmbienteApi(): Promise<AmbienteApi> {
  process.env['JWT_SECRET'] ??= 'segredo-de-teste';
  process.env['JWT_EXPIRES_IN'] ??= '1h';

  const prisma = new InMemoryPrisma();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication();

  // Mesma configuração de main.ts: os testes precisam exercitar o mesmo pipeline
  // de validação e o mesmo prefixo de rota que a aplicação real usa.
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.init();

  const passwordHash = await bcrypt.hash(SENHA_TESTE, 4);

  const criar = (dados: Omit<UsuarioDeTeste, 'id'> & { managerId?: string }): UsuarioDeTeste => {
    const registro = prisma.user.semear({ ...dados, passwordHash, email: dados.email.toLowerCase() });
    return registro as UsuarioDeTeste;
  };

  const rh = criar({
    name: 'Helena Martins',
    email: 'helena.martins@ddgroup.example',
    role: 'HR',
    baseTimezone: 'America/Sao_Paulo',
    countryCode: 'BR',
  });

  const gestor = criar({
    name: 'Rafael Costa',
    email: 'rafael.costa@ddgroup.example',
    role: 'MANAGER',
    baseTimezone: 'America/Sao_Paulo',
    countryCode: 'BR',
  });

  const ana = criar({
    name: 'Ana Souza',
    email: 'ana.souza@ddgroup.example',
    role: 'EMPLOYEE',
    baseTimezone: 'America/Sao_Paulo',
    countryCode: 'BR',
    managerId: gestor.id,
  });

  const bruno = criar({
    name: 'Bruno Almeida',
    email: 'bruno.almeida@ddgroup.example',
    role: 'EMPLOYEE',
    baseTimezone: 'Europe/Lisbon',
    countryCode: 'PT',
    managerId: gestor.id,
  });

  const forasteira = criar({
    name: 'Carla Nunes',
    email: 'carla.nunes@ddgroup.example',
    role: 'EMPLOYEE',
    baseTimezone: 'Europe/Berlin',
    countryCode: 'DE',
  });

  const jwt = app.get(JwtService);

  return {
    app,
    prisma,
    usuarios: { rh, gestor, ana, bruno, forasteira },
    tokenDe: (usuario) => jwt.sign({ sub: usuario.id, email: usuario.email }),
    encerrar: () => app.close(),
  };
}
