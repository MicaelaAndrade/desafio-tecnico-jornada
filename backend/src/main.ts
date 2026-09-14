import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

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
