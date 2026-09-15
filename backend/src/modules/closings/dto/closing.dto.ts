import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClosingStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CloseCompetenceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({ example: 9 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Fecha mesmo havendo dias inconsistentes. Exige justificativa — o fechamento fica registrado como homologado com pendência.',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional({ example: 'Pendências tratadas fora do sistema, conforme ata de reunião.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReopenCompetenceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  year!: number;

  @ApiProperty({ example: 9 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({
    example: 'Marcação do dia 30 não havia sido lançada; reabertura autorizada pelo RH.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class ClosingResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() year!: number;
  @ApiProperty() month!: number;
  @ApiProperty({ enum: ClosingStatus }) status!: ClosingStatus;
  @ApiProperty({ nullable: true }) workedMinutes!: number | null;
  @ApiProperty({ nullable: true }) expectedMinutes!: number | null;
  @ApiProperty({ nullable: true }) balanceMinutes!: number | null;
  @ApiProperty({ nullable: true }) closedById!: string | null;
  @ApiProperty({ nullable: true }) closedAt!: string | null;
}
