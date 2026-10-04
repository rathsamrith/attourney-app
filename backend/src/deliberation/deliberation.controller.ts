import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../auth/current-user.js';
import { Roles } from '../auth/decorators.js';
import { CastBallotDto, DeliberationDto } from './deliberation.dto.js';
import { DeliberationService } from './deliberation.service.js';

@Controller('sessions/:id')
export class DeliberationController {
  constructor(private readonly deliberation: DeliberationService) {}

  @Get('deliberation')
  @ApiOkResponse({ type: DeliberationDto })
  state(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.deliberation.state(id, user);
  }

  @Post('ballot')
  @Roles('adj')
  @HttpCode(204)
  @ApiNoContentResponse()
  async cast(@Param('id', ParseUUIDPipe) id: string, @Body() body: CastBallotDto, @CurrentUser() user: AuthUser) {
    await this.deliberation.cast(id, body.choice, user);
  }

  @Post('ballot/seal')
  @Roles('adj')
  @HttpCode(204)
  @ApiNoContentResponse()
  async seal(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.deliberation.seal(id, user);
  }
}
