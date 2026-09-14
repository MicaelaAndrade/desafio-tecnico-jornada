import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser, Roles } from '../../common/auth/auth.decorators';
import { ClosingsService } from './closings.service';
import { CloseCompetenceDto, ClosingResponseDto, ReopenCompetenceDto } from './dto/closing.dto';
import { MonthlyQueryDto } from '../timesheets/dto/timesheet.dto';

@ApiTags('Fechamento mensal')
@ApiBearerAuth()
@Roles(Role.HR)
@Controller('closings')
export class ClosingsController {
  constructor(private readonly service: ClosingsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista o estado das competências no mês' })
  @ApiResponse({ status: 200, type: [ClosingResponseDto] })
  findMany(@Query() query: MonthlyQueryDto): Promise<ClosingResponseDto[]> {
    return this.service.findMany(query.year, query.month);
  }

  @Post('close')
  @ApiOperation({
    summary: 'Fecha a competência de um colaborador',
    description:
      'Congela o total de horas apurado. A partir daí, marcações e correções do período são recusadas até a reabertura.',
  })
  @ApiResponse({ status: 201, type: ClosingResponseDto })
  @ApiResponse({ status: 409, description: 'Competência já fechada ou com dias inconsistentes' })
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CloseCompetenceDto,
  ): Promise<ClosingResponseDto> {
    return this.service.close(user, dto);
  }

  @Post('reopen')
  @ApiOperation({
    summary: 'Reabre uma competência fechada',
    description: 'Privativo do RH. O snapshot anterior é preservado para auditoria.',
  })
  @ApiResponse({ status: 201, type: ClosingResponseDto })
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReopenCompetenceDto,
  ): Promise<ClosingResponseDto> {
    return this.service.reopen(user, dto);
  }
}
