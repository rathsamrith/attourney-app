import { Module } from '@nestjs/common';
import { CaucusService } from './caucus.service.js';
import { ContinuancesService } from './continuances.service.js';
import { MediaService } from './media.service.js';
import { ObjectionsService } from './objections.service.js';
import { ProceedingController } from './proceeding.controller.js';
import { TranscriptService } from './transcript.service.js';

/** Epic E2, live proceeding: objections, continuances, caucus rooms, transcript and media. */
@Module({
  controllers: [ProceedingController],
  providers: [ObjectionsService, ContinuancesService, CaucusService, TranscriptService, MediaService],
})
export class ProceedingModule {}
