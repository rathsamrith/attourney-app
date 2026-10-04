import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditInput, AuditService } from './audit.service.js';
import { DomainEvents, toDomainEvent } from './domain-events.js';

/**
 * The one way state changes are written (R8).
 *
 *   const session = await this.commands.run(
 *     async (tx) => {
 *       // rule guards: throw BlockedException(reason, { rule: 'R4' }) before writing
 *       return tx.session.update(...);
 *     },
 *     (session) => ({ entity: 'session', entityId: session.id, action: 'record.opened', ... }),
 *   );
 *
 * The change and its audit events commit together or not at all, and the events are
 * published to connected clients only after the commit succeeds. Return an array from
 * `describe` when one command changes several things (a granted continuance also recesses).
 */
@Injectable()
export class CommandRunner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: DomainEvents,
  ) {}

  async run<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    describe: (result: T) => AuditInput | AuditInput[],
  ): Promise<T> {
    const { result, written } = await this.prisma.$transaction(async (tx) => {
      const result = await work(tx);
      const inputs = [describe(result)].flat();
      const written = [];
      for (const input of inputs) written.push(await this.audit.append(tx, input));
      return { result, written };
    });
    for (const event of written) this.events.publish(toDomainEvent(event));
    return result;
  }
}
