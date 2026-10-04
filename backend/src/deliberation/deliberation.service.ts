import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandRunner } from '../audit/command-runner.js';
import type { AuditInput } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/current-user.js';
import { BlockedException } from '../common/blocked.exception.js';
import { loadSessionAccess, PANEL_ROLES, requireSessionRole } from '../common/session-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { decryptBallot, encryptBallot, outcome, type Choice } from './ballot-crypto.js';
import type { DeliberationDto } from './deliberation.dto.js';

/** Stories "Cast and seal" and "Simultaneous reveal" (R6). */
@Injectable()
export class DeliberationService {
  private readonly key: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandRunner,
    config: ConfigService,
  ) {
    this.key = Buffer.from(config.getOrThrow<string>('VOTE_ENCRYPTION_KEY'), 'hex');
    if (this.key.length !== 32) throw new Error('VOTE_ENCRYPTION_KEY must be 32 bytes of hex');
  }

  /** Everyone in the session sees seal progress; contents only once every panel member has sealed. */
  async state(sessionId: string, user: AuthUser): Promise<DeliberationDto> {
    const { me } = await loadSessionAccess(this.prisma, sessionId, user);
    const panel = await this.prisma.participant.findMany({
      where: { sessionId, sessionRole: { in: PANEL_ROLES } },
      include: { user: true },
    });
    const votes = await this.prisma.vote.findMany({ where: { sessionId } });
    const sealed = votes.filter((v) => v.sealedAt);
    const panelSize = panel.length;
    const iAmPanelist = PANEL_ROLES.includes(me.sessionRole) && user.role === 'adj';
    const mine = votes.find((v) => v.panelistId === user.id);

    let revealed: DeliberationDto['revealed'] = null;
    if (panelSize > 0 && sealed.length === panelSize) {
      const choices = sealed.map((v) => ({
        panelistName: panel.find((p) => p.userId === v.panelistId)?.user.name ?? '',
        choice: decryptBallot(this.key, Buffer.from(v.ciphertext), sessionId, v.panelistId),
      }));
      revealed = {
        outcome: outcome(choices.map((c) => c.choice), panelSize),
        votes: choices,
        revealedAt: new Date(Math.max(...sealed.map((v) => v.sealedAt!.getTime()))).toISOString(),
      };
    }

    return {
      panelSize,
      sealedCount: sealed.length,
      iAmPanelist,
      myStatus: !mine ? 'none' : mine.sealedAt ? 'sealed' : 'draft',
      // A sealed ballot is hidden from its author too, until the reveal.
      myDraftChoice:
        mine && !mine.sealedAt ? decryptBallot(this.key, Buffer.from(mine.ciphertext), sessionId, user.id) : null,
      revealed,
    };
  }

  cast(sessionId: string, choice: Choice, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        if (user.role !== 'adj') {
          throw new BlockedException('Only adjudicators can cast a vote.', { rule: 'R6', code: 'ballot.notAdjudicator' });
        }
        requireSessionRole(me, PANEL_ROLES, 'Voting');
        const existing = await tx.vote.findUnique({ where: { sessionId_panelistId: { sessionId, panelistId: user.id } } });
        if (existing?.sealedAt) {
          throw new BlockedException('Your ballot is sealed and cannot change.', { rule: 'R6', code: 'ballot.sealed' });
        }
        const ciphertext = new Uint8Array(encryptBallot(this.key, choice, sessionId, user.id));
        await tx.vote.upsert({
          where: { sessionId_panelistId: { sessionId, panelistId: user.id } },
          create: { sessionId, panelistId: user.id, ciphertext },
          update: { ciphertext },
        });
        return session;
      },
      // Audit records that a ballot changed, never what it says.
      (session) => ({ entity: 'ballot', action: 'ballot.drafted', matterId: session.matterId, sessionId, actorId: user.id }),
    );
  }

  seal(sessionId: string, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        if (user.role !== 'adj') {
          throw new BlockedException('Only adjudicators can cast a vote.', { rule: 'R6', code: 'ballot.notAdjudicator' });
        }
        requireSessionRole(me, PANEL_ROLES, 'Voting');
        const vote = await tx.vote.findUnique({ where: { sessionId_panelistId: { sessionId, panelistId: user.id } } });
        if (!vote) throw new BlockedException('Cast your vote before sealing it.', { code: 'ballot.notCast' });
        if (vote.sealedAt) throw new BlockedException('Your ballot is already sealed.', { rule: 'R6', code: 'ballot.sealed' });
        await tx.vote.update({ where: { id: vote.id }, data: { sealedAt: new Date() } });
        const [panelSize, sealedCount] = await Promise.all([
          tx.participant.count({ where: { sessionId, sessionRole: { in: PANEL_ROLES } } }),
          tx.vote.count({ where: { sessionId, sealedAt: { not: null } } }),
        ]);
        return { session, complete: sealedCount === panelSize, sealedCount, panelSize };
      },
      ({ session, complete, sealedCount, panelSize }) => {
        const events: AuditInput[] = [
          {
            entity: 'ballot',
            action: 'ballot.sealed',
            matterId: session.matterId,
            sessionId,
            actorId: user.id,
            data: { sealedCount, panelSize },
          },
        ];
        if (complete) events.push({ entity: 'ballot', action: 'ballot.revealed', matterId: session.matterId, sessionId });
        return events;
      },
    );
  }
}
