import { Module } from '@nestjs/common';
import { ExhibitsController } from './exhibits.controller.js';
import { ExhibitsService } from './exhibits.service.js';

@Module({
  controllers: [ExhibitsController],
  providers: [ExhibitsService],
})
export class ExhibitsModule {}
