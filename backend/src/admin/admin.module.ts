import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

/** Admin dashboard: user and role management (PrismaService and AuditService are global). */
@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
