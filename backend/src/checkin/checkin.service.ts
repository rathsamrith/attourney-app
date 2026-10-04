import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Participant, Prisma, SessionRole } from '../generated/prisma/client.js';
import { CommandRunner } from '../audit/command-runner.js';
import type { AuthUser } from '../auth/current-user.js';
import { BlockedException } from '../common/blocked.exception.js';
import { loadSessionAccess, requireSessionRole } from '../common/session-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CERTIFICATE_VALIDATOR,
  FACE_MATCH,
  type CertificateValidator,
  type FaceMatchProvider,
} from '../providers/providers.js';
import type { CheckinQueueDto, CheckinStatusDto, IdentityResultDto, QueueEntryDto } from './checkin.dto.js';

/** Data dictionary, identity_checks: max 3 automated attempts. */
export const MAX_AUTOMATED_ATTEMPTS = 3;
/** Story "Identity verification": face match requires 0.90 or more with liveness. */
export const FACE_MATCH_THRESHOLD = 0.9;

export function oathTextVersion(role: SessionRole) {
  return role === 'witness' ? 'witness-v1' : 'participant-v1';
}

@Injectable()
export class CheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandRunner,
    @Inject(FACE_MATCH) private readonly faceMatch: FaceMatchProvider,
    @Inject(CERTIFICATE_VALIDATOR) private readonly certificates: CertificateValidator,
  ) {}

  private automatedAttempts(participantId: string) {
    return this.prisma.identityCheck.count({ where: { participantId, method: { not: 'manual' } } });
  }

  async status(sessionId: string, user: AuthUser): Promise<CheckinStatusDto> {
    const { me } = await loadSessionAccess(this.prisma, sessionId, user);
    const [attemptsUsed, oaths] = await Promise.all([
      this.automatedAttempts(me.id),
      this.prisma.oath.count({ where: { participantId: me.id } }),
    ]);
    return {
      participantId: me.id,
      verification: me.verification,
      attemptsUsed,
      maxAttempts: MAX_AUTOMATED_ATTEMPTS,
      oathTextVersion: oathTextVersion(me.sessionRole),
      oathAffirmed: oaths > 0,
      admitted: me.sworn,
      presence: me.presence,
    };
  }

  /** Story "Identity verification" (R1). */
  async verifyIdentity(
    sessionId: string,
    method: 'biometric' | 'certificate',
    evidence: string,
    user: AuthUser,
  ): Promise<IdentityResultDto> {
    const { session, me } = await loadSessionAccess(this.prisma, sessionId, user);
    if (me.verification === 'verified') {
      throw new BlockedException('Your identity is already verified.', { code: 'checkin.alreadyVerified' });
    }
    const used = await this.automatedAttempts(me.id);
    if (used >= MAX_AUTOMATED_ATTEMPTS) {
      throw new BlockedException('All automated attempts are used. The record officer can verify you on camera.', {
        rule: 'R1',
        code: 'checkin.attemptsExhausted',
      });
    }

    // Call the provider outside the transaction; it may be slow.
    let passed: boolean;
    let score: number | null = null;
    let evidenceRef: string;
    if (method === 'biometric') {
      const r = await this.faceMatch.match({ participantId: me.id, selfie: evidence });
      passed = r.score >= FACE_MATCH_THRESHOLD && r.liveness;
      score = r.score;
      evidenceRef = r.evidenceRef;
    } else {
      const r = await this.certificates.validate(evidence);
      passed = r.trusted && r.ocsp === 'good';
      evidenceRef = r.evidenceRef;
    }

    const attemptNo = used + 1;
    await this.commands.run(
      async (tx) => {
        await tx.identityCheck.create({
          data: { participantId: me.id, method, result: passed ? 'pass' : 'fail', score, attemptNo, evidenceRef },
        });
        await tx.participant.update({ where: { id: me.id }, data: { verification: passed ? 'verified' : 'failed' } });
      },
      () => ({
        entity: 'participant',
        entityId: me.id,
        action: passed ? 'identity.passed' : 'identity.failed',
        matterId: session.matterId,
        sessionId,
        actorId: user.id,
        data: { method, attemptNo, ...(score !== null && { score }) },
      }),
    );
    return { passed, attemptNo, attemptsLeft: MAX_AUTOMATED_ATTEMPTS - attemptNo, score };
  }

  /** Story "Manual verification": only the record officer can clear a failed state (R1). */
  manualVerify(participantId: string, documentChecked: string, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const target = await tx.participant.findUnique({ where: { id: participantId } });
        if (!target) throw new NotFoundException('Participant not found.');
        const { session, me } = await loadSessionAccess(tx, target.sessionId, user);
        requireSessionRole(me, ['officer'], 'Manual verification');
        if (target.verification !== 'failed') {
          throw new BlockedException('Manual verification is only for participants whose automated check failed.', {
            code: 'checkin.manualNotNeeded',
          });
        }
        const attempts = await tx.identityCheck.count({ where: { participantId } });
        await tx.identityCheck.create({
          data: {
            participantId,
            method: 'manual',
            result: 'pass',
            attemptNo: attempts + 1,
            evidenceRef: documentChecked,
            verifiedById: user.id,
          },
        });
        await tx.participant.update({ where: { id: participantId }, data: { verification: 'verified' } });
        return session;
      },
      (session) => ({
        entity: 'participant',
        entityId: participantId,
        action: 'identity.manual_override',
        matterId: session.matterId,
        sessionId: session.id,
        actorId: user.id,
        data: { documentChecked },
      }),
    );
  }

  /** Story "Oath and admission": affirming is refused unless identity is verified (R1). */
  affirmOath(sessionId: string, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        if (me.verification !== 'verified') {
          throw new BlockedException('Identity verification has not passed, so the oath cannot be taken.', {
            rule: 'R1',
            code: 'checkin.notVerified',
          });
        }
        if (await tx.oath.count({ where: { participantId: me.id } })) {
          throw new BlockedException('You have already taken the oath.', { code: 'checkin.alreadySworn' });
        }
        const officer = await tx.participant.findFirst({ where: { sessionId, sessionRole: 'officer' } });
        await tx.oath.create({
          data: {
            participantId: me.id,
            oathTextVersion: oathTextVersion(me.sessionRole),
            administeredById: officer?.userId ?? user.id,
          },
        });
        // The record officer has no one to admit them, so affirming admits them directly.
        if (me.sessionRole === 'officer') await this.admitInTx(tx, me);
        return { session, me };
      },
      ({ session, me }) => [
        {
          entity: 'participant',
          entityId: me.id,
          action: 'oath.affirmed',
          matterId: session.matterId,
          sessionId,
          actorId: user.id,
          data: { oathTextVersion: oathTextVersion(me.sessionRole) },
        },
        ...(me.sessionRole === 'officer'
          ? [{ entity: 'participant', entityId: me.id, action: 'participant.admitted', matterId: session.matterId, sessionId, actorId: user.id }]
          : []),
      ],
    );
  }

  private async admitInTx(tx: Prisma.TransactionClient, p: Participant) {
    await tx.presenceEvent.create({ data: { participantId: p.id, state: 'present' } });
    await tx.participant.update({ where: { id: p.id }, data: { sworn: true, presence: 'present' } });
  }

  /** Story "Oath and admission": the record officer admits a sworn participant; sworn time starts (R2). */
  admit(participantId: string, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const target = await tx.participant.findUnique({ where: { id: participantId } });
        if (!target) throw new NotFoundException('Participant not found.');
        const { session, me } = await loadSessionAccess(tx, target.sessionId, user);
        requireSessionRole(me, ['officer'], 'Admission');
        if (session.recordState === 'closed') {
          throw new BlockedException('This session is closed. Closing cannot be undone.', { code: 'recordState.closed' });
        }
        if (target.sworn) throw new BlockedException('Already admitted.', { code: 'checkin.alreadyAdmitted' });
        if (target.verification !== 'verified') {
          throw new BlockedException('Identity verification has not passed, so this participant cannot be sworn in.', {
            rule: 'R1',
            code: 'checkin.notVerified',
          });
        }
        if (!(await tx.oath.count({ where: { participantId } }))) {
          throw new BlockedException('This participant has not taken the oath yet.', { code: 'checkin.noOath' });
        }
        await this.admitInTx(tx, target);
        return session;
      },
      (session) => ({
        entity: 'participant',
        entityId: participantId,
        action: 'participant.admitted',
        matterId: session.matterId,
        sessionId: session.id,
        actorId: user.id,
      }),
    );
  }

  /** The record officer's lists: manual verification and admission. */
  async queue(sessionId: string, user: AuthUser): Promise<CheckinQueueDto> {
    const { me } = await loadSessionAccess(this.prisma, sessionId, user);
    requireSessionRole(me, ['officer'], 'The check-in queue');
    const rows = await this.prisma.participant.findMany({
      where: { sessionId, sworn: false },
      include: { user: true, _count: { select: { oaths: true, identityChecks: { where: { method: { not: 'manual' } } } } } },
      orderBy: { sessionRole: 'asc' },
    });
    const entry = (p: (typeof rows)[number]): QueueEntryDto => ({
      participantId: p.id,
      name: p.user.name,
      sessionRole: p.sessionRole,
      side: p.user.side,
      verification: p.verification,
      attemptsUsed: p._count.identityChecks,
      oathAffirmed: p._count.oaths > 0,
    });
    return {
      manualVerification: rows.filter((p) => p.verification === 'failed').map(entry),
      awaitingAdmission: rows.filter((p) => p.verification === 'verified' && p._count.oaths > 0).map(entry),
      inProgress: rows
        .filter((p) => p.verification === 'pending' || (p.verification === 'verified' && p._count.oaths === 0))
        .map(entry),
    };
  }
}
