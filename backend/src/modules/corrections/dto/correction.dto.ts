import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CorrectionStatus, CorrectionType, TimeEntryType } from '@prisma/client';
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

export class CreateCorrectionDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Colaborador dono da jornada. Padrão: o próprio solicitante.',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ enum: CorrectionType })
  @IsEnum(CorrectionType)
  type!: CorrectionType;

  @ApiPropertyOptional({ format: 'uuid', description: 'Obrigatório para REMOVE e MODIFY.' })
  @IsOptional()
  @IsUUID()
  targetEntryId?: string;

  @ApiPropertyOptional({ enum: TimeEntryType, description: 'Obrigatório para ADD e MODIFY.' })
  @IsOptional()
  @IsEnum(TimeEntryType)
  proposedType?: TimeEntryType;

  @ApiPropertyOptional({ example: '2026-09-14T21:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  proposedOccurredAt?: string;

  @ApiPropertyOptional({ example: 'America/Sao_Paulo' })
  @IsOptional()
  @IsString()
  proposedTimezone?: string;

  @ApiPropertyOptional({ example: 'BR' })
  @IsOptional()
  @IsISO31661Alpha2()
  proposedCountry?: string;

  @ApiProperty({ example: '2026-09-14', description: 'Dia da jornada afetado.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  workDate!: string;

  @ApiProperty({ example: 'Esqueci de registrar a saída; encerrei o expediente às 18h.' })
  @IsString()
  @MinLength(10, { message: 'A justificativa deve ser específica (mínimo de 10 caracteres).' })
  @MaxLength(500)
  reason!: string;
}

export class ReviewCorrectionDto {
  @ApiPropertyOptional({ example: 'Confirmado com o gestor da célula.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}

export class CorrectionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() userName!: string;
  @ApiProperty() requestedById!: string;
  @ApiProperty({ enum: CorrectionType }) type!: CorrectionType;
  @ApiProperty({ nullable: true }) targetEntryId!: string | null;
  @ApiProperty({ nullable: true, enum: TimeEntryType }) proposedType!: TimeEntryType | null;
  @ApiProperty({ nullable: true }) proposedOccurredAt!: string | null;
  @ApiProperty({ nullable: true }) proposedTimezone!: string | null;
  @ApiProperty({ example: '2026-09-14' }) workDate!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: CorrectionStatus }) status!: CorrectionStatus;
  @ApiProperty({ nullable: true }) reviewedById!: string | null;
  @ApiProperty({ nullable: true }) reviewedAt!: string | null;
  @ApiProperty({ nullable: true }) reviewNote!: string | null;
  @ApiProperty() createdAt!: string;
}
