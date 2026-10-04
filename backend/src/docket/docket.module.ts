import { Module } from '@nestjs/common';
import { DocketController } from './docket.controller.js';
import { DocketService } from './docket.service.js';

@Module({
  controllers: [DocketController],
  providers: [DocketService],
})
export class DocketModule {}
