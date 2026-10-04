import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../auth/current-user.js';
import { Roles } from '../auth/decorators.js';
import { CheckinQueueDto, CheckinStatusDto, IdentityAttemptDto, IdentityResultDto, ManualVerificationDto } from './checkin.dto.js';
import { CheckinService } from './checkin.service.js';

@Controller()
export class CheckinController {
  constructor(private readonly checkin: CheckinService) {}

  @Get('sessions/:id/checkin')
  @ApiOkResponse({ type: CheckinStatusDto })
  status(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.checkin.status(id, user);
  }

  @Post('sessions/:id/checkin/identity')
  @HttpCode(200)
  @ApiOkResponse({ type: IdentityResultDto })
  identity(@Param('id', ParseUUIDPipe) id: string, @Body() body: IdentityAttemptDto, @CurrentUser() user: AuthUser) {
    return this.checkin.verifyIdentity(id, body.method, body.evidence, user);
  }

  @Post('sessions/:id/checkin/oath')
  @HttpCode(204)
  @ApiNoContentResponse()
  async oath(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.checkin.affirmOath(id, user);
  }

  @Get('sessions/:id/checkin/queue')
  @Roles('officer')
  @ApiOkResponse({ type: CheckinQueueDto })
  queue(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.checkin.queue(id, user);
  }

  @Post('participants/:id/manual-verification')
  @Roles('officer')
  @HttpCode(204)
  @ApiNoContentResponse()
  async manual(@Param('id', ParseUUIDPipe) id: string, @Body() body: ManualVerificationDto, @CurrentUser() user: AuthUser) {
    await this.checkin.manualVerify(id, body.documentChecked, user);
  }

  @Post('participants/:id/admit')
  @Roles('officer')
  @HttpCode(204)
  @ApiNoContentResponse()
  async admit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.checkin.admit(id, user);
  }
}
