import { Injectable } from '@nestjs/common';
import type { AuditEvent, Prisma, Side } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditFields, chainHash } from './audit-hash.js';

export interface AuditInput {
  entity: string;
  action: string;
  entityId?: string | null;
  matterId?: string | null;
  sessionId?: string | null;
  actorId?: string | null;
  /** Set to the owning side for events the opposing side must not see (R7). */
  visibilitySide?: Side | null;
  /** Non-sensitive details. Never put vote contents or caucus content here. */
  data?: Prisma.InputJsonValue;
}

/** Any id works; it only has to be the same for every writer of the chain. */
const CHAIN_LOCK_KEY = 0x41545354; // "ATST"

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends one event to the hash chain inside the caller's transaction (R8).
   * The advisory lock serializes writers so each event links to the true tail.
   */
  async append(tx: Prisma.TransactionClient, input: AuditInput): Promise<AuditEvent> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`;
    const tail = await tx.auditEvent.findFirst({ orderBy: { seq: 'desc' }, select: { hash: true } });

    const fields: AuditFields = {
      at: new Date(),
      matterId: input.matterId ?? null,
      sessionId: input.sessionId ?? null,
      actorId: input.actorId ?? null,
      entity: input.entity,
      entityId: input.entityId ?? null,
      action: input.action,
      visibilitySide: input.visibilitySide ?? null,
      data: input.data ?? null,
    };
    const prevHash = tail?.hash ?? null;

    return tx.auditEvent.create({
      data: {
        ...fields,
        data: input.data,
        prevHash,
        hash: chainHash(prevHash, fields),
      },
    });
  }

  /** Records an event that has no accompanying change, such as a refused request. */
  appendStandalone(input: AuditInput): Promise<AuditEvent> {
    return this.prisma.$transaction((tx) => this.append(tx, input));
  }

  /** Recomputes the chain and returns the seq of the first broken link, or null if intact. */
  async findFirstBrokenLink(): Promise<bigint | null> {
    let prevHash: string | null = null;
    let cursor: bigint | undefined;
    for (;;) {
      const page: AuditEvent[] = await this.prisma.auditEvent.findMany({
        orderBy: { seq: 'asc' },
        take: 500,
        ...(cursor !== undefined && { where: { seq: { gt: cursor } } }),
      });
      if (page.length === 0) return null;
      for (const e of page) {
        const expected = chainHash(prevHash, {
          at: e.at,
          matterId: e.matterId,
          sessionId: e.sessionId,
          actorId: e.actorId,
          entity: e.entity,
          entityId: e.entityId,
          action: e.action,
          visibilitySide: e.visibilitySide,
          data: e.data,
        });
        if (e.prevHash !== prevHash || e.hash !== expected) return e.seq;
        prevHash = e.hash;
      }
      cursor = page[page.length - 1].seq;
    }
  }
}
