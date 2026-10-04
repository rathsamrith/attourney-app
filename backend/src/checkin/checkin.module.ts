import { Module } from '@nestjs/common';
import { CheckinController } from './checkin.controller.js';
import { CheckinService } from './checkin.service.js';

@Module({
  controllers: [CheckinController],
  providers: [CheckinService],
})
export class CheckinModule {}
