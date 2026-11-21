import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

/** Admin dashboard: user/role management and case creation (reuses SessionsService). */
@Module({
  imports: [SessionsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
