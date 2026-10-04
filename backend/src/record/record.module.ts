import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RecordController } from './record.controller.js';
import { RECORD_QUEUE, RecordScheduler, RecordWorker } from './record.jobs.js';
import { RecordService } from './record.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: RECORD_QUEUE })],
  controllers: [RecordController],
  providers: [RecordService, RecordScheduler, RecordWorker],
  exports: [RecordService],
})
export class RecordModule {}
