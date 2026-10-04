import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuditInput } from '../audit/audit.service.js';
import { CommandRunner } from '../audit/command-runner.js';
import type { AuthUser } from '../auth/current-user.js';
import { BlockedException } from '../common/blocked.exception.js';
import { loadSessionAccess, requireSessionRole } from '../common/session-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ContinuanceDto } from './proceeding.dto.js';

@Injectable()
export class ContinuancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandRunner,
  ) {}

  async list(sessionId: string, user: AuthUser): Promise<ContinuanceDto[]> {
    await loadSessionAccess(this.prisma, sessionId, user);
    const rows = await this.prisma.continuance.findMany({
      where: { sessionId },
      include: { requestedBy: { include: { user: true } } },
      orderBy: { id: 'asc' },
    });
    return rows.map((c) => ({
      id: c.id,
      requestedByName: c.requestedBy.user.name,
      requestedBySide: c.requestedBy.user.side,
      reason: c.reason,
      proposedResumeAt: c.proposedResumeAt?.toISOString() ?? null,
      status: c.status,
      ruledAt: c.ruledAt?.toISOString() ?? null,
    }));
  }

  /** Story "Request continuance": the request is the only record a ruling can attach to (R3). */
  request(sessionId: string, reason: string, proposedResumeAt: string | undefined, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        requireSessionRole(me, ['counsel'], 'Requesting a continuance');
        if (session.recordState === 'closed') {
          throw new BlockedException('This session is closed. Closing cannot be undone.', { code: 'recordState.closed' });
        }
        if (await tx.continuance.count({ where: { sessionId, status: 'requested' } })) {
          throw new BlockedException('A continuance request is already waiting for a ruling.', {
            code: 'continuance.pendingExists',
          });
        }
        return tx.continuance.create({
          data: {
            sessionId,
            requestedById: me.id,
            reason,
            proposedResumeAt: proposedResumeAt ? new Date(proposedResumeAt) : null,
          },
        });
      },
      (c) => ({ entity: 'continuance', entityId: c.id, action: 'continuance.requested', sessionId, actorId: user.id }),
    );
  }

  /** Story "Rule on continuance" (R3, R2): a grant puts the session in recess, pausing sworn time. */
  rule(continuanceId: string, status: 'granted' | 'denied', user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const c = await tx.continuance.findUnique({ where: { id: continuanceId } });
        if (!c) throw new NotFoundException('Continuance not found.');
        const { session, me } = await loadSessionAccess(tx, c.sessionId, user);
        requireSessionRole(me, ['presiding'], 'Ruling on continuances');
        if (c.status !== 'requested') {
          throw new BlockedException('This continuance has already been ruled on.', {
            rule: 'R3',
            code: 'continuance.alreadyRuled',
          });
        }
        await tx.continuance.update({
          where: { id: continuanceId },
          data: { status, ruledById: user.id, ruledAt: new Date() },
        });
        const recess = status === 'granted' && session.recordState !== 'closed' && session.recordState !== 'recess';
        if (recess) await tx.session.update({ where: { id: session.id }, data: { recordState: 'recess' } });
        return { session, recess };
      },
      ({ session, recess }) => {
        const events: AuditInput[] = [
          {
            entity: 'continuance',
            entityId: continuanceId,
            action: `continuance.${status}`,
            matterId: session.matterId,
            sessionId: session.id,
            actorId: user.id,
          },
        ];
        if (recess) {
          events.push({
            entity: 'session',
            entityId: session.id,
            action: 'record.recessed',
            matterId: session.matterId,
            sessionId: session.id,
            actorId: user.id,
            data: { from: session.recordState, to: 'recess', cause: 'continuance' },
          });
        }
        return events;
      },
    );
  }
}
