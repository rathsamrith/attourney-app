import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiProperty } from '@nestjs/swagger';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, type AuthUser } from './current-user.js';
import { SCREENS, screensFor, type Screen } from './permissions.js';

class ScreenAccessDto {
  @ApiProperty({ enum: SCREENS }) screen: Screen;
  @ApiProperty() allowed: boolean;
  @ApiProperty() reason: string;
}

class MeDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['adj', 'counsel', 'officer', 'witness'] }) role: AuthUser['role'];
  @ApiProperty({ enum: ['P', 'D', 'T'] }) side: AuthUser['side'];
  @ApiProperty({ type: [ScreenAccessDto] }) screens: ScreenAccessDto[];
}

@Controller()
export class AuthController {
  constructor(private readonly audit: AuditService) {}

  @Get('me')
  @ApiOkResponse({ type: MeDto })
  me(@CurrentUser() user: AuthUser): MeDto {
    return { ...user, screens: screensFor(user.role) };
  }

  /**
   * Story "Sign in": sign-in and sign-out appear in the audit trail. The identity
   * provider handles the credentials; the app reports the completed sign-in once.
   */
  @Post('auth/signed-in')
  @HttpCode(204)
  @ApiNoContentResponse()
  async signedIn(@CurrentUser() user: AuthUser) {
    await this.audit.appendStandalone({ entity: 'user', entityId: user.id, action: 'auth.signed_in', actorId: user.id });
  }

  @Post('auth/signed-out')
  @HttpCode(204)
  @ApiNoContentResponse()
  async signedOut(@CurrentUser() user: AuthUser) {
    await this.audit.appendStandalone({ entity: 'user', entityId: user.id, action: 'auth.signed_out', actorId: user.id });
  }
}
