import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { AllExceptionsFilter } from './common/http/http-exception.filter';
import { PrismaModule } from './infra/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClosingsModule } from './modules/closings/closings.module';
import { CorrectionsModule } from './modules/corrections/corrections.module';
import { TimeEntriesModule } from './modules/time-entries/time-entries.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    TimeEntriesModule,
    TimesheetsModule,
    CorrectionsModule,
    ClosingsModule,
  ],
  providers: [
    // Autenticação é o padrão: rotas públicas precisam optar por sair, com @Public().
    // O inverso (proteger rota a rota) deixa endpoint aberto por esquecimento.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
