import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandRunner } from '../audit/command-runner.js';
import type { AuthUser } from '../auth/current-user.js';
import { BlockedException } from '../common/blocked.exception.js';
import { loadSessionAccess, requireSessionRole } from '../common/session-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ObjectionDto, ObjectionGround } from './proceeding.dto.js';

@Injectable()
export class ObjectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandRunner,
  ) {}

  async list(sessionId: string, user: AuthUser): Promise<ObjectionDto[]> {
    await loadSessionAccess(this.prisma, sessionId, user);
    const rows = await this.prisma.objection.findMany({
      where: { sessionId },
      include: { raisedBy: { include: { user: true } }, transcriptLine: true },
      orderBy: { id: 'asc' },
    });
    return rows
      .map((o) => ({
        id: o.id,
        grounds: o.grounds,
        raisedByName: o.raisedBy.user.name,
        raisedBySide: o.raisedBy.user.side,
        lineSeq: o.transcriptLine?.seq ?? null,
        lineText: o.transcriptLine?.text ?? null,
        ruling: o.ruling,
        ruledAt: o.ruledAt?.toISOString() ?? null,
      }))
      .sort((a, b) => (a.ruling === 'pending' ? -1 : 0) - (b.ruling === 'pending' ? -1 : 0));
  }

  /** Story "Log objection": counsel, on the record, linked to the question. */
  raise(sessionId: string, grounds: ObjectionGround, transcriptLineId: string | undefined, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        requireSessionRole(me, ['counsel'], 'Raising an objection');
        if (session.recordState !== 'open') {
          throw new BlockedException('Objections are raised on the record.', { code: 'objection.offRecord' });
        }
        if (transcriptLineId) {
          const line = await tx.transcriptLine.findFirst({ where: { id: transcriptLineId, sessionId } });
          if (!line) throw new NotFoundException('Transcript line not found in this session.');
        }
        return tx.objection.create({ data: { sessionId, raisedById: me.id, grounds, transcriptLineId } });
      },
      (o) => ({
        entity: 'objection',
        entityId: o.id,
        action: 'objection.raised',
        sessionId,
        actorId: user.id,
        data: { grounds },
      }),
    );
  }

  /** Story "Rule on objection": only the presiding adjudicator rules. */
  rule(objectionId: string, ruling: 'sustained' | 'overruled', user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const objection = await tx.objection.findUnique({ where: { id: objectionId } });
        if (!objection) throw new NotFoundException('Objection not found.');
        const { session, me } = await loadSessionAccess(tx, objection.sessionId, user);
        requireSessionRole(me, ['presiding'], 'Ruling on objections');
        if (objection.ruling !== 'pending') {
          throw new BlockedException('This objection has already been ruled on.', { code: 'objection.alreadyRuled' });
        }
        await tx.objection.update({
          where: { id: objectionId },
          data: { ruling, ruledById: user.id, ruledAt: new Date() },
        });
        return session;
      },
      (session) => ({
        entity: 'objection',
        entityId: objectionId,
        action: `objection.${ruling}`,
        matterId: session.matterId,
        sessionId: session.id,
        actorId: user.id,
      }),
    );
  }
}
