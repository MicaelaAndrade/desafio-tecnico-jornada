import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO31661Alpha2,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Ana Souza' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'ana.souza@ddgroup.example' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'senha123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter ao menos 8 caracteres.' })
  password!: string;

  @ApiProperty({ enum: Role, default: Role.EMPLOYEE })
  @IsEnum(Role)
  role!: Role;

  @ApiProperty({ example: 'America/Sao_Paulo', description: 'Fuso contratual (IANA).' })
  @IsString()
  baseTimezone!: string;

  @ApiProperty({ example: 'BR' })
  @IsISO31661Alpha2()
  countryCode!: string;

  @ApiPropertyOptional({ example: 480, default: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  expectedDailyMinutes?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  managerId?: string;
}

export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password'] as const)) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: Role }) role!: Role;
  @ApiProperty() baseTimezone!: string;
  @ApiProperty() countryCode!: string;
  @ApiProperty() expectedDailyMinutes!: number;
  @ApiProperty({ nullable: true }) managerId!: string | null;
  @ApiProperty() active!: boolean;
}
