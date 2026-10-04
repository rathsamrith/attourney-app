import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { AuditService } from '../audit/audit.service.js';
import { DomainEvents } from '../audit/domain-events.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RecordService } from './record.service.js';

export const RECORD_QUEUE = 'record';

/**
 * Schedules the timed work for the record:
 * - closing each errata window at its deadline (a delayed job per closed session, kept in Redis
 *   so it survives restarts);
 * - the hourly tamper check of the audit hash chain.
 */
@Injectable()
export class RecordScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecordScheduler.name);
  private unsubscribe?: () => void;

  constructor(
    @InjectQueue(RECORD_QUEUE) private readonly queue: Queue,
    private readonly events: DomainEvents,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.unsubscribe = this.events.subscribe((e) => {
      if (e.action === 'session.closed' && e.sessionId) void this.scheduleErrataDeadline(e.sessionId);
    });
    // Without a listener, a Redis error on the queue is an unhandled "error" event and kills the process.
    this.queue.on('error', (err) => this.logger.error(`Record queue: ${err.message}`));
    // Don't hold up startup on Redis; the scheduler is registered as soon as it is reachable.
    this.queue
      .upsertJobScheduler('tamper-check', { every: 60 * 60 * 1000 }, { name: 'tamper-check' })
      .catch((err: Error) => this.logger.error(`Could not schedule the tamper check: ${err.message}`));
  }

  onModuleDestroy() {
    this.unsubscribe?.();
  }

  async scheduleErrataDeadline(sessionId: string) {
    const seal = await this.prisma.transcriptSeal.findUnique({ where: { sessionId } });
    if (!seal || seal.errataClosedAt) return;
    await this.queue.add(
      'errata-deadline',
      { sessionId },
      { jobId: `errata-deadline-${sessionId}`, delay: Math.max(0, seal.errataDeadline.getTime() - Date.now()), removeOnComplete: true },
    );
  }
}

@Processor(RECORD_QUEUE)
export class RecordWorker extends WorkerHost {
  private readonly logger = new Logger(RecordWorker.name);

  constructor(
    private readonly record: RecordService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  @OnWorkerEvent('error')
  onError(err: Error) {
    this.logger.error(`Record worker: ${err.message}`);
  }

  async process(job: Job<{ sessionId?: string }>) {
    if (job.name === 'errata-deadline' && job.data.sessionId) {
      const seal = await this.prisma.transcriptSeal.findUnique({ where: { sessionId: job.data.sessionId } });
      if (seal && !seal.errataClosedAt) await this.record.closeWindow(job.data.sessionId, null);
      return;
    }
    if (job.name === 'tamper-check') {
      const broken = await this.audit.findFirstBrokenLink();
      if (broken !== null) {
        this.logger.error(`Audit hash chain broken at seq ${broken}`);
        await this.audit.appendStandalone({ entity: 'audit', action: 'audit.tamper_detected', data: { seq: broken.toString() } });
      }
    }
  }
}
