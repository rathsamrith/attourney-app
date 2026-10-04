import { Module } from '@nestjs/common';
import { DeliberationController } from './deliberation.controller.js';
import { DeliberationService } from './deliberation.service.js';

@Module({
  controllers: [DeliberationController],
  providers: [DeliberationService],
})
export class DeliberationModule {}
