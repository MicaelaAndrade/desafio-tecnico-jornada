import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { TimeEntryResponseDto } from '../../time-entries/dto/time-entry.dto';

export class MonthlyQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Padrão: o próprio usuário autenticado.' })
  @IsOptional()
  @IsUUID()
  userId?: string;

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
}

export class RangeQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ example: '2026-09-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @ApiProperty({ example: '2026-09-30' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}

export class InconsistencyDto {
  @ApiProperty() code!: string;
  @ApiProperty({ enum: ['ERROR', 'WARNING', 'INFO'] }) severity!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional() eventId?: string;
}

export class WorkSegmentDto {
  @ApiProperty() startedAt!: string;
  @ApiProperty({ nullable: true }) endedAt!: string | null;
  @ApiProperty() workedMinutes!: number;
  @ApiProperty() breakMinutes!: number;
}

export class DailyTimesheetDto {
  @ApiProperty({ example: '2026-09-14' }) workDate!: string;
  @ApiProperty({ type: [TimeEntryResponseDto] }) entries!: TimeEntryResponseDto[];
  @ApiProperty({ type: [WorkSegmentDto] }) segments!: WorkSegmentDto[];
  @ApiProperty() workedMinutes!: number;
  @ApiProperty() breakMinutes!: number;
  @ApiProperty() expectedMinutes!: number;
  @ApiProperty({ description: 'Positivo = crédito; negativo = débito.' }) balanceMinutes!: number;
  @ApiProperty({ type: [InconsistencyDto] }) inconsistencies!: InconsistencyDto[];
  @ApiProperty({ type: [String] }) timezones!: string[];
  @ApiProperty({ type: [String] }) countries!: string[];
  @ApiProperty() isConsistent!: boolean;
}

export class MonthlyTimesheetDto {
  @ApiProperty() userId!: string;
  @ApiProperty() userName!: string;
  /**
   * Fuso contratual de quem a jornada pertence — não de quem consulta. Um gestor
   * no Brasil vendo a folha de um colaborador em Lisboa precisa do "hoje" dele.
   */
  @ApiProperty({ example: 'America/Sao_Paulo' }) baseTimezone!: string;
  @ApiProperty() year!: number;
  @ApiProperty() month!: number;
  @ApiProperty({ type: [DailyTimesheetDto] }) days!: DailyTimesheetDto[];
  @ApiProperty() workedMinutes!: number;
  @ApiProperty() expectedMinutes!: number;
  @ApiProperty() balanceMinutes!: number;
  @ApiProperty() daysWithInconsistencies!: number;
  @ApiProperty({ enum: ['OPEN', 'CLOSED'] }) closingStatus!: string;
}

export class TeamMemberSummaryDto {
  @ApiProperty() userId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() countryCode!: string;
  @ApiProperty() baseTimezone!: string;
  @ApiProperty() workedMinutes!: number;
  @ApiProperty() expectedMinutes!: number;
  @ApiProperty() balanceMinutes!: number;
  @ApiProperty() daysWithInconsistencies!: number;
  @ApiProperty({ enum: ['OPEN', 'CLOSED'] }) closingStatus!: string;
}
