import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiNoContentResponse, ApiOkResponse, ApiProduces } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../auth/current-user.js';
import { Roles } from '../auth/decorators.js';
import { ExhibitDto, PublishExhibitDto, RuleExhibitDto, SessionPublicationDto, TagExhibitDto } from './exhibits.dto.js';
import { ExhibitsService } from './exhibits.service.js';

@Controller()
export class ExhibitsController {
  constructor(private readonly exhibits: ExhibitsService) {}

  @Get('sessions/:id/exhibits')
  @ApiOkResponse({ type: [ExhibitDto] })
  list(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.exhibits.list(id, user);
  }

  @Post('exhibits')
  @Roles('counsel')
  @HttpCode(204)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['sessionId', 'title', 'file'],
      properties: { sessionId: { type: 'string' }, title: { type: 'string' }, file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiNoContentResponse()
  async tag(@Body() body: TagExhibitDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    await this.exhibits.tag(body.sessionId, body.title, file, user);
  }

  @Get('exhibits/:id/file')
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async file(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    const { exhibit, data } = await this.exhibits.file(id, user);
    return new StreamableFile(data, {
      type: 'application/pdf',
      disposition: `inline; filename="${exhibit.label}.pdf"`,
    });
  }

  @Post('exhibits/:id/offer')
  @Roles('counsel')
  @HttpCode(204)
  @ApiNoContentResponse()
  async offer(@Param('id', ParseUUIDPipe) id: string, @Body() body: PublishExhibitDto, @CurrentUser() user: AuthUser) {
    await this.exhibits.offer(id, body.sessionId, user);
  }

  @Post('exhibits/:id/ruling')
  @Roles('adj')
  @HttpCode(204)
  @ApiNoContentResponse()
  async rule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RuleExhibitDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.exhibits.rule(id, body.sessionId, body.ruling, user);
  }

  @Post('exhibits/:id/publish')
  @Roles('counsel')
  @HttpCode(204)
  @ApiNoContentResponse()
  async publish(@Param('id', ParseUUIDPipe) id: string, @Body() body: PublishExhibitDto, @CurrentUser() user: AuthUser) {
    await this.exhibits.publish(id, body.sessionId, user);
  }

  @Get('sessions/:id/publication')
  @ApiOkResponse({ type: SessionPublicationDto })
  current(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.exhibits.current(id, user);
  }

  @Post('sessions/:id/publication/end')
  @HttpCode(204)
  @ApiNoContentResponse()
  async unpublish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.exhibits.unpublish(id, user);
  }
}
