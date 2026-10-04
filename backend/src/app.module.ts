import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CheckinModule } from './checkin/checkin.module.js';
import { PrismaExceptionFilter } from './common/prisma-exception.filter.js';
import { DeliberationModule } from './deliberation/deliberation.module.js';
import { DocketModule } from './docket/docket.module.js';
import { ExhibitsModule } from './exhibits/exhibits.module.js';
import { HealthController } from './health/health.controller.js';
import { NotificationsController } from './notifications/notifications.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProceedingModule } from './proceeding/proceeding.module.js';
import { ProvidersModule } from './providers/providers.module.js';
import { RealtimeGateway } from './realtime/realtime.gateway.js';
import { RecordModule } from './record/record.module.js';
import { SessionsModule } from './sessions/sessions.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<string>('REDIS_URL'));
        return {
          connection: { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined },
          prefix: config.get<string>('QUEUE_PREFIX') ?? 'attest',
        };
      },
    }),
    PrismaModule,
    ProvidersModule,
    AuditModule,
    AuthModule,
    SessionsModule,
    CheckinModule,
    ProceedingModule,
    ExhibitsModule,
    DeliberationModule,
    RecordModule,
    DocketModule,
  ],
  controllers: [HealthController, NotificationsController],
  providers: [RealtimeGateway, { provide: APP_FILTER, useClass: PrismaExceptionFilter }],
})
export class AppModule {}
