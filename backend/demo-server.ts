/**
 * Modo demonstração — sobe a aplicação sem PostgreSQL e sem Docker.
 *
 * A aplicação é a real: mesmas rotas, mesmos guards, mesma validação e as mesmas
 * regras de cálculo de jornada. O que muda é apenas o acesso a dados, substituído
 * pelo repositório em memória usado nos testes.
 *
 * Serve para quem quer avaliar a interface e os fluxos sem montar infraestrutura.
 * NÃO é modo de produção: os dados vivem no processo e desaparecem ao reiniciar,
 * e nada aqui exercita migrations, constraints ou transações de verdade.
 */
import { Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ClienteDeCarga, SENHA_PADRAO, popularCenario } from './prisma/seed-data';
import { AppModule } from './src/app.module';
import { PrismaService } from './src/infra/prisma/prisma.service';
import { InMemoryPrisma } from './test/support/in-memory-prisma';

async function main(): Promise<void> {
  process.env['JWT_SECRET'] ??= 'segredo-de-demonstracao-nao-usar-em-producao';

  const prisma = new InMemoryPrisma();
  // Custo de hash reduzido: são seis usuários recriados a cada inicialização e,
  // num ambiente efêmero de demonstração, a senha não protege nada.
  const { usuarios } = await popularCenario(prisma as unknown as ClienteDeCarga, {
    custoDoHash: 4,
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication();

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableCors({ origin: process.env['CORS_ORIGIN']?.split(',') ?? ['http://localhost:4200'] });

  const config = new DocumentBuilder()
    .setTitle('Plataforma de Jornada de Trabalho')
    .setDescription(
      'API de registro e consulta de jornada para operação internacional. ' +
        'As decisões de modelagem estão documentadas em /docs/adr no repositório.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port, '0.0.0.0');

  Logger.log(`Modo demonstração — dados em memória, sem banco`, 'Demo');
  Logger.log(`API em http://localhost:${port}/api`, 'Demo');
  Logger.log(`Documentação em http://localhost:${port}/api/docs`, 'Demo');
  Logger.log(`Senha de todos os usuários: ${SENHA_PADRAO}`, 'Demo');
  console.table(usuarios);
}

void main();
