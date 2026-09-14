import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CorrectionStatus, Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser, Roles } from '../../common/auth/auth.decorators';
import { CorrectionsService } from './corrections.service';
import {
  CorrectionResponseDto,
  CreateCorrectionDto,
  ReviewCorrectionDto,
} from './dto/correction.dto';

@ApiTags('Correções de jornada')
@ApiBearerAuth()
@Controller('corrections')
export class CorrectionsController {
  constructor(private readonly service: CorrectionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Solicita correção de jornada',
    description:
      'Marcações nunca são editadas nem apagadas. A correção aprovada cria registros novos e revoga logicamente os antigos, preservando a trilha de auditoria.',
  })
  @ApiResponse({ status: 201, type: CorrectionResponseDto })
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCorrectionDto,
  ): Promise<CorrectionResponseDto> {
    return this.service.request(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista correções dentro do escopo do solicitante' })
  @ApiQuery({ name: 'status', enum: CorrectionStatus, required: false })
  @ApiResponse({ status: 200, type: [CorrectionResponseDto] })
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: CorrectionStatus,
  ): Promise<CorrectionResponseDto[]> {
    return this.service.findMany(user, status);
  }

  @Patch(':id/approve')
  @Roles(Role.MANAGER, Role.HR)
  @ApiOperation({
    summary: 'Homologa uma correção',
    description: 'Ninguém homologa a própria correção — nesse caso a análise cabe ao RH.',
  })
  @ApiResponse({ status: 200, type: CorrectionResponseDto })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewCorrectionDto,
  ): Promise<CorrectionResponseDto> {
    return this.service.approve(user, id, dto);
  }

  @Patch(':id/reject')
  @Roles(Role.MANAGER, Role.HR)
  @ApiOperation({ summary: 'Rejeita uma correção' })
  @ApiResponse({ status: 200, type: CorrectionResponseDto })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewCorrectionDto,
  ): Promise<CorrectionResponseDto> {
    return this.service.reject(user, id, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancela uma correção ainda não analisada' })
  @ApiResponse({ status: 200, type: CorrectionResponseDto })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CorrectionResponseDto> {
    return this.service.cancel(user, id);
  }
}
