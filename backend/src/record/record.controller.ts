import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, StreamableFile } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiProduces } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../auth/current-user.js';
import { Roles } from '../auth/decorators.js';
import { DecideErratumDto, FileErratumDto, RecordStatusDto } from './record.dto.js';
import { RecordService } from './record.service.js';

@Controller()
export class RecordController {
  constructor(private readonly record: RecordService) {}

  @Get('sessions/:id/record')
  @ApiOkResponse({ type: RecordStatusDto })
  status(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.record.status(id, user);
  }

  @Post('sessions/:id/errata')
  @HttpCode(204)
  @ApiNoContentResponse()
  async file(@Param('id', ParseUUIDPipe) id: string, @Body() body: FileErratumDto, @CurrentUser() user: AuthUser) {
    await this.record.fileErratum(id, body, user);
  }

  @Post('errata/:id/decision')
  @Roles('officer')
  @HttpCode(204)
  @ApiNoContentResponse()
  async decide(@Param('id', ParseUUIDPipe) id: string, @Body() body: DecideErratumDto, @CurrentUser() user: AuthUser) {
    await this.record.decideErratum(id, body.status, user);
  }

  @Post('sessions/:id/errata/close')
  @Roles('officer')
  @HttpCode(204)
  @ApiNoContentResponse()
  async closeWindow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.record.closeWindow(id, user);
  }

  @Post('sessions/:id/seal/lock')
  @Roles('officer')
  @HttpCode(204)
  @ApiNoContentResponse()
  async lock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.record.lock(id, user);
  }

  @Post('sessions/:id/exports')
  @Roles('officer')
  @HttpCode(204)
  @ApiNoContentResponse()
  async export(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.record.export(id, user);
  }

  @Get('exports/:id/file')
  @ApiProduces('application/zip')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async download(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    const { name, data } = await this.record.exportFile(id, user);
    return new StreamableFile(data, { type: 'application/zip', disposition: `attachment; filename="${name}"` });
  }
}
