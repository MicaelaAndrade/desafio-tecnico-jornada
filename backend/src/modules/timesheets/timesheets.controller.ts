import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser, Roles } from '../../common/auth/auth.decorators';
import {
  DailyTimesheetDto,
  MonthlyQueryDto,
  MonthlyTimesheetDto,
  RangeQueryDto,
  TeamMemberSummaryDto,
} from './dto/timesheet.dto';
import { TimesheetsService } from './timesheets.service';

@ApiTags('Folha de ponto')
@ApiBearerAuth()
@Controller('timesheets')
export class TimesheetsController {
  constructor(private readonly service: TimesheetsService) {}

  @Get('monthly')
  @ApiOperation({ summary: 'Espelho de ponto da competência, dia a dia' })
  @ApiResponse({ status: 200, type: MonthlyTimesheetDto })
  @ApiResponse({ status: 403, description: 'Fora do escopo de visão do solicitante' })
  monthly(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthlyQueryDto,
  ): Promise<MonthlyTimesheetDto> {
    return this.service.monthly(user, query.userId ?? user.id, query.year, query.month);
  }

  @Get('range')
  @ApiOperation({ summary: 'Espelho de ponto de um intervalo de dias' })
  @ApiResponse({ status: 200, type: [DailyTimesheetDto] })
  range(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RangeQueryDto,
  ): Promise<DailyTimesheetDto[]> {
    return this.service.range(user, query.userId ?? user.id, query.from, query.to);
  }

  @Get('team')
  @Roles(Role.MANAGER, Role.HR)
  @ApiOperation({
    summary: 'Consolidado da equipe na competência',
    description: 'Gestor enxerga apenas os subordinados diretos; RH enxerga todos.',
  })
  @ApiResponse({ status: 200, type: [TeamMemberSummaryDto] })
  team(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthlyQueryDto,
  ): Promise<TeamMemberSummaryDto[]> {
    return this.service.teamSummary(user, query.year, query.month);
  }
}
