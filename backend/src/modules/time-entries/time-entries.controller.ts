import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser, Roles } from '../../common/auth/auth.decorators';
import {
  CreateManualEntryDto,
  QueryEntriesDto,
  RegisterEntryDto,
  ShiftStatusDto,
  TimeEntryResponseDto,
} from './dto/time-entry.dto';
import { TimeEntriesService } from './time-entries.service';

@ApiTags('Jornada')
@ApiBearerAuth()
@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly service: TimeEntriesService) {}

  @Post()
  @ApiOperation({
    summary: 'Registra uma marcação do próprio colaborador',
    description:
      'O instante é atribuído pelo servidor. O cliente informa apenas fuso e país de onde a marcação está sendo feita.',
  })
  @ApiResponse({ status: 201, type: TimeEntryResponseDto })
  @ApiResponse({ status: 409, description: 'Competência fechada' })
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterEntryDto,
  ): Promise<TimeEntryResponseDto> {
    return this.service.register(user, dto);
  }

  @Post('manual')
  @Roles(Role.MANAGER, Role.HR)
  @ApiOperation({
    summary: 'Lança uma marcação em nome de um colaborador',
    description: 'Exige justificativa. Gravado com origem MANUAL e autoria explícita.',
  })
  @ApiResponse({ status: 201, type: TimeEntryResponseDto })
  createManual(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateManualEntryDto,
  ): Promise<TimeEntryResponseDto> {
    return this.service.createManual(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista as marcações de um colaborador em um período' })
  @ApiResponse({ status: 200, type: [TimeEntryResponseDto] })
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryEntriesDto,
  ): Promise<TimeEntryResponseDto[]> {
    return this.service.findMany(user, query);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Estado atual da jornada do usuário autenticado',
    description: 'Indica qual marcação é válida a seguir, para que a interface não ofereça uma inválida.',
  })
  @ApiResponse({ status: 200, type: ShiftStatusDto })
  currentStatus(@CurrentUser() user: AuthenticatedUser): Promise<ShiftStatusDto> {
    return this.service.currentStatus(user.id);
  }
}
