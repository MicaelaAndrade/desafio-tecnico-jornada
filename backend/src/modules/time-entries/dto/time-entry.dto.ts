import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntrySource, TimeEntryType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Marcação feita pelo próprio colaborador, em tempo real.
 *
 * Note que NÃO existe campo de horário: o instante é atribuído pelo servidor
 * (ADR-0004, item 2). O cliente informa apenas onde está.
 */
export class RegisterEntryDto {
  @ApiProperty({ enum: TimeEntryType, example: TimeEntryType.CLOCK_IN })
  @IsEnum(TimeEntryType)
  type!: TimeEntryType;

  @ApiProperty({
    example: 'Europe/Lisbon',
    description: 'Fuso IANA de onde a marcação está sendo feita. Permite registrar jornada em viagem.',
  })
  @IsString()
  timezone!: string;

  @ApiProperty({ example: 'PT', description: 'País onde a marcação está sendo feita (ISO 3166-1 alpha-2).' })
  @IsISO31661Alpha2({ message: 'Informe o país no formato ISO 3166-1 alpha-2 (ex.: BR, PT).' })
  countryCode!: string;

  @ApiPropertyOptional({ example: 'Início de expediente no escritório de Lisboa' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}

/**
 * Lançamento feito por gestor ou RH em nome de um colaborador.
 * Exige horário explícito e justificativa — o sistema nunca perde a distinção
 * entre "o colaborador marcou" e "alguém marcou por ele" (ADR-0006).
 */
export class CreateManualEntryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: TimeEntryType })
  @IsEnum(TimeEntryType)
  type!: TimeEntryType;

  @ApiProperty({ example: '2026-09-14T12:00:00.000Z', description: 'Instante do evento, em UTC.' })
  @IsDateString()
  occurredAt!: string;

  @ApiProperty({ example: 'America/Sao_Paulo' })
  @IsString()
  timezone!: string;

  @ApiProperty({ example: 'BR' })
  @IsISO31661Alpha2()
  countryCode!: string;

  @ApiPropertyOptional({
    example: '2026-09-14',
    description: 'Dia da jornada. Quando omitido, é resolvido pelo fuso informado.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use o formato YYYY-MM-DD.' })
  workDate?: string;

  @ApiProperty({ example: 'Colaborador esqueceu de registrar a saída; confirmado por e-mail.' })
  @IsString()
  @MinLength(10, { message: 'A justificativa deve ser específica (mínimo de 10 caracteres).' })
  @MaxLength(500)
  reason!: string;
}

export class QueryEntriesDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Padrão: o próprio usuário autenticado.' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @ApiPropertyOptional({ description: 'Inclui registros revogados, para auditoria.', default: false })
  @IsOptional()
  @Type(() => Boolean)
  includeRevoked?: boolean;
}

export class TimeEntryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: TimeEntryType }) type!: TimeEntryType;
  @ApiProperty({ description: 'Instante absoluto, em UTC.' }) occurredAt!: string;
  @ApiProperty({ description: 'Horário local do registro, reconstruído do offset congelado.' })
  localTime!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty() countryCode!: string;
  @ApiProperty() utcOffsetMinutes!: number;
  @ApiProperty({ example: '2026-09-14' }) workDate!: string;
  @ApiProperty({ enum: EntrySource }) source!: EntrySource;
  @ApiPropertyOptional() note?: string | null;
  @ApiProperty({ description: 'Quem efetivamente criou o registro.' }) registeredById!: string;
  @ApiPropertyOptional({ description: 'Preenchido quando o registro foi revogado por correção.' })
  revokedAt?: string | null;
}

export class ShiftStatusDto {
  @ApiProperty({ enum: ['OFF_SHIFT', 'WORKING', 'ON_BREAK'] })
  state!: 'OFF_SHIFT' | 'WORKING' | 'ON_BREAK';

  @ApiPropertyOptional({ type: TimeEntryResponseDto })
  lastEntry?: TimeEntryResponseDto | null;

  @ApiPropertyOptional({ example: '2026-09-14', description: 'Dia da jornada em aberto, se houver.' })
  openWorkDate?: string | null;

  @ApiProperty({ enum: TimeEntryType, isArray: true, description: 'Marcações válidas a partir do estado atual.' })
  allowedNext!: TimeEntryType[];
}
