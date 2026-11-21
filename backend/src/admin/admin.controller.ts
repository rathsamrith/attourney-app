import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser, type AuthUser } from '../auth/current-user.js';
import { Roles } from '../auth/decorators.js';
import { AdminService } from './admin.service.js';

const ROLES = ['adj', 'counsel', 'officer', 'witness', 'admin'] as const;
const SIDES = ['P', 'D', 'T'] as const;

class AdminUserDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: ROLES }) role: string;
  @ApiProperty({ enum: SIDES }) side: string;
  @ApiProperty() active: boolean;
  @ApiProperty() createdAt: string;
}

class CreateUserDto {
  @ApiProperty() @IsString() @MinLength(1) name: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty({ enum: ROLES }) @IsIn(ROLES) role: (typeof ROLES)[number];
  @ApiProperty({ enum: SIDES }) @IsIn(SIDES) side: (typeof SIDES)[number];
}

class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiPropertyOptional({ enum: ROLES }) @IsOptional() @IsIn(ROLES) role?: (typeof ROLES)[number];
  @ApiPropertyOptional({ enum: SIDES }) @IsOptional() @IsIn(SIDES) side?: (typeof SIDES)[number];
  @ApiPropertyOptional({ description: 'false deactivates the account, true reactivates it.' })
  @IsOptional() @IsBoolean() active?: boolean;
}

/** Admin dashboard API: user and role management (record officer only). */
@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @ApiOkResponse({ type: [AdminUserDto] })
  list() {
    return this.admin.list();
  }

  @Post('users')
  @HttpCode(201)
  @ApiCreatedResponse({ type: AdminUserDto })
  @ApiConflictResponse({ description: 'A user with that email already exists.' })
  create(@Body() body: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.admin.create(body, user);
  }

  @Patch('users/:id')
  @ApiOkResponse({ type: AdminUserDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateUserDto, @CurrentUser() user: AuthUser) {
    return this.admin.update(id, body, user);
  }
}
