import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../auth/current-user.js';
import { Roles } from '../auth/decorators.js';
import {
  ScheduleResultDto,
  ScheduleSessionDto,
  SessionDetailDto,
  SessionSummaryDto,
  SetPresenceDto,
  SetRecordStateDto,
} from './sessions.dto.js';
import { SessionsService } from './sessions.service.js';

@Controller()
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('sessions')
  @ApiOkResponse({ type: [SessionSummaryDto] })
  list(@CurrentUser() user: AuthUser) {
    return this.sessions.listMine(user);
  }

  @Get('sessions/:id')
  @ApiOkResponse({ type: SessionDetailDto })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.sessions.getForParticipant(id, user);
  }

  /** Story "Schedule hearing/deposition": the record officer creates a session or series. */
  @Post('sessions')
  @Roles('officer')
  @HttpCode(201)
  @ApiCreatedResponse({ type: ScheduleResultDto })
  schedule(@Body() body: ScheduleSessionDto, @CurrentUser() user: AuthUser) {
    return this.sessions.schedule(body, user);
  }

  @Post('sessions/:id/record-state')
  @Roles('officer')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Blocked, with the reason to show the user' })
  async setRecordState(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetRecordStateDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.sessions.setRecordState(id, body.state, user);
  }

  @Post('participants/:id/presence')
  @Roles('officer')
  @HttpCode(204)
  @ApiNoContentResponse()
  async setPresence(@Param('id', ParseUUIDPipe) id: string, @Body() body: SetPresenceDto, @CurrentUser() user: AuthUser) {
    await this.sessions.setPresence(id, body.state, user);
  }
}
