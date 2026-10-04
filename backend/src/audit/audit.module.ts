import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { CommandRunner } from './command-runner.js';
import { DomainEvents } from './domain-events.js';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, CommandRunner, DomainEvents],
  exports: [AuditService, CommandRunner, DomainEvents],
})
export class AuditModule {}
