import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser, Roles } from '../../common/auth/auth.decorators';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Colaboradores')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista colaboradores dentro do escopo do solicitante',
    description: 'Colaborador vê apenas a si; gestor vê a própria equipe; RH vê todos.',
  })
  @ApiResponse({ status: 200, type: [UserResponseDto] })
  findMany(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto[]> {
    return this.service.findMany(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um colaborador' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    return this.service.findOne(user, id);
  }

  @Post()
  @Roles(Role.HR)
  @ApiOperation({ summary: 'Cadastra um colaborador' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.HR)
  @ApiOperation({
    summary: 'Atualiza um colaborador',
    description: 'O desligamento é feito por `active: false`; o histórico de jornada é preservado.',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.service.update(id, dto);
  }
}
