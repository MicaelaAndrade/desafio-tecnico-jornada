import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  /**
   * Confia no cabeçalho `X-Forwarded-For` de exatamente um salto — o nginx que
   * serve o frontend e encaminha `/api` (ver `frontend/nginx.conf`).
   *
   * Sem isso, toda requisição chega ao Nest com o IP do container do nginx, e o
   * limite de 5 logins por minuto passa a ser compartilhado por toda a empresa:
   * a terceira pessoa a entrar de manhã recebe 429. O efeito só aparece no
   * caminho com Docker, porque em desenvolvimento o navegador fala direto com a
   * API.
   *
   * O número é 1 de propósito. `true` aceitaria a cadeia inteira, e aí qualquer
   * cliente forjaria o próprio `X-Forwarded-For` para escapar do limite. Se um
   * dia houver outro proxy à frente (balanceador, CDN), este número sobe junto.
   */
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove campos não declarados no DTO
      forbidNonWhitelisted: true, // e recusa a requisição que os envie
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:4200'],
    credentials: true,
  });

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

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');

  Logger.log(`API disponível em http://localhost:${port}/api`, 'Bootstrap');
  Logger.log(`Documentação em http://localhost:${port}/api/docs`, 'Bootstrap');
}

void bootstrap();
