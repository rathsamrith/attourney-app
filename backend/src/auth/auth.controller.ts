import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, type AuthUser } from './current-user.js';
import { Public } from './decorators.js';
import { OtpService } from './otp.service.js';
import { SCREENS, screensFor, type Screen } from './permissions.js';

class ScreenAccessDto {
  @ApiProperty({ enum: SCREENS }) screen: Screen;
  @ApiProperty() allowed: boolean;
  @ApiProperty() reason: string;
}

class DemoUserDto {
  @ApiProperty() email: string;
  @ApiProperty() name: string;
  @ApiProperty() role: string;
  @ApiProperty() side: string;
}

class AuthConfigDto {
  @ApiProperty({ description: 'When true, sign in with an emailed one-time code; when false, use the OIDC provider.' })
  otp: boolean;
  @ApiProperty({ description: 'When true, the sign-in screen may list the seeded test accounts.' })
  showCredentials: boolean;
  @ApiProperty({ type: [DemoUserDto], description: 'Seeded test accounts, shown as role → credentials.' })
  demoUsers: DemoUserDto[];
}

class OtpRequestDto {
  @ApiProperty() @IsEmail() email: string;
}

class OtpVerifyDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty({ description: 'The 6-digit code from the email.' }) @IsString() @Length(6, 6) code: string;
}

class OtpTokenDto {
  @ApiProperty() token: string;
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
  constructor(
    private readonly audit: AuditService,
    private readonly otp: OtpService,
  ) {}

  /** Tells the sign-in screen whether to use the OTP demo flow, and lists demo accounts. */
  @Public()
  @Get('auth/config')
  @ApiOkResponse({ type: AuthConfigDto })
  async authConfig(): Promise<AuthConfigDto> {
    return { otp: this.otp.otpEnabled, showCredentials: this.otp.showCredentials, demoUsers: await this.otp.demoUsers() };
  }

  /** Demo sign-in step 1: email a one-time code (caught by MailHog in dev). */
  @Public()
  @Post('auth/otp/request')
  @HttpCode(204)
  @ApiNoContentResponse()
  async requestOtp(@Body() body: OtpRequestDto) {
    await this.otp.requestOtp(body.email);
  }

  /** Demo sign-in step 2: exchange the code for a short-lived app token. */
  @Public()
  @Post('auth/otp/verify')
  @ApiOkResponse({ type: OtpTokenDto })
  verifyOtp(@Body() body: OtpVerifyDto): Promise<OtpTokenDto> {
    return this.otp.verifyOtp(body.email, body.code);
  }

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
