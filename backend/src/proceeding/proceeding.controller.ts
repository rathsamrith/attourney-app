import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../auth/current-user.js';
import { Roles } from '../auth/decorators.js';
import { CaucusService } from './caucus.service.js';
import { ContinuancesService } from './continuances.service.js';
import { MediaService } from './media.service.js';
import { ObjectionsService } from './objections.service.js';
import {
  AddTranscriptLineDto,
  CaucusRoomDto,
  ContinuanceDto,
  CorrectTranscriptLineDto,
  MediaTokenDto,
  MediaTokenRequestDto,
  ObjectionDto,
  RaiseObjectionDto,
  RequestContinuanceDto,
  RuleContinuanceDto,
  RuleObjectionDto,
  TranscriptLineDto,
} from './proceeding.dto.js';
import { TranscriptService } from './transcript.service.js';

@Controller()
export class ProceedingController {
  constructor(
    private readonly objections: ObjectionsService,
    private readonly continuances: ContinuancesService,
    private readonly caucus: CaucusService,
    private readonly transcript: TranscriptService,
    private readonly media: MediaService,
  ) {}

  // ---------- objections ----------

  @Get('sessions/:id/objections')
  @ApiOkResponse({ type: [ObjectionDto] })
  listObjections(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.objections.list(id, user);
  }

  @Post('sessions/:id/objections')
  @Roles('counsel')
  @HttpCode(204)
  @ApiNoContentResponse()
  async raiseObjection(@Param('id', ParseUUIDPipe) id: string, @Body() body: RaiseObjectionDto, @CurrentUser() user: AuthUser) {
    await this.objections.raise(id, body.grounds, body.transcriptLineId, user);
  }

  @Post('objections/:id/ruling')
  @Roles('adj')
  @HttpCode(204)
  @ApiNoContentResponse()
  async ruleObjection(@Param('id', ParseUUIDPipe) id: string, @Body() body: RuleObjectionDto, @CurrentUser() user: AuthUser) {
    await this.objections.rule(id, body.ruling, user);
  }

  // ---------- continuances ----------

  @Get('sessions/:id/continuances')
  @ApiOkResponse({ type: [ContinuanceDto] })
  listContinuances(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.continuances.list(id, user);
  }

  @Post('sessions/:id/continuances')
  @Roles('counsel')
  @HttpCode(204)
  @ApiNoContentResponse()
  async requestContinuance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RequestContinuanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.continuances.request(id, body.reason, body.proposedResumeAt, user);
  }

  @Post('continuances/:id/ruling')
  @Roles('adj')
  @HttpCode(204)
  @ApiNoContentResponse()
  async ruleContinuance(@Param('id', ParseUUIDPipe) id: string, @Body() body: RuleContinuanceDto, @CurrentUser() user: AuthUser) {
    await this.continuances.rule(id, body.status, user);
  }

  // ---------- caucus ----------

  @Get('sessions/:id/caucus')
  @ApiOkResponse({ type: [CaucusRoomDto] })
  listCaucus(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.caucus.list(id, user);
  }

  @Post('sessions/:id/caucus')
  @Roles('counsel')
  @HttpCode(204)
  @ApiNoContentResponse()
  async openCaucus(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.caucus.open(id, user);
  }

  @Post('caucus/:id/join')
  @HttpCode(204)
  @ApiNoContentResponse()
  async joinCaucus(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.caucus.join(id, user);
  }

  @Post('caucus/:id/leave')
  @HttpCode(204)
  @ApiNoContentResponse()
  async leaveCaucus(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.caucus.leave(id, user);
  }

  @Post('caucus/:id/close')
  @Roles('counsel')
  @HttpCode(204)
  @ApiNoContentResponse()
  async closeCaucus(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.caucus.close(id, user);
  }

  // ---------- transcript ----------

  @Get('sessions/:id/transcript')
  @ApiOkResponse({ type: [TranscriptLineDto] })
  listTranscript(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.transcript.list(id, user);
  }

  @Post('sessions/:id/transcript')
  @HttpCode(204)
  @ApiNoContentResponse()
  async addLine(@Param('id', ParseUUIDPipe) id: string, @Body() body: AddTranscriptLineDto, @CurrentUser() user: AuthUser) {
    await this.transcript.add(id, body, user);
  }

  @Patch('transcript-lines/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async correctLine(@Param('id', ParseUUIDPipe) id: string, @Body() body: CorrectTranscriptLineDto, @CurrentUser() user: AuthUser) {
    await this.transcript.correct(id, body.text, user);
  }

  // ---------- media ----------

  @Post('sessions/:id/media-token')
  @HttpCode(200)
  @ApiOkResponse({ type: MediaTokenDto })
  mediaToken(@Param('id', ParseUUIDPipe) id: string, @Body() body: MediaTokenRequestDto, @CurrentUser() user: AuthUser) {
    return this.media.token(id, body.room, user);
  }
}
