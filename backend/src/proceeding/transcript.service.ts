import { Injectable, NotFoundException } from '@nestjs/common';
import type { LineKind } from '../generated/prisma/client.js';
import { CommandRunner } from '../audit/command-runner.js';
import type { AuthUser } from '../auth/current-user.js';
import { BlockedException } from '../common/blocked.exception.js';
import { loadSessionAccess, requireSessionRole } from '../common/session-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TranscriptLineDto } from './proceeding.dto.js';

/**
 * Story "Live transcript". Lines come from the court reporter (or the record officer)
 * and, later, an ASR pipeline posting through the same method. Corrections before the
 * session closes overwrite the line and keep the previous text in the audit trail;
 * after closing, changes go through errata.
 */
@Injectable()
export class TranscriptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandRunner,
  ) {}

  async list(sessionId: string, user: AuthUser): Promise<TranscriptLineDto[]> {
    await loadSessionAccess(this.prisma, sessionId, user);
    const lines = await this.prisma.transcriptLine.findMany({
      where: { sessionId },
      include: { speaker: { include: { user: true } } },
      orderBy: { seq: 'asc' },
    });
    return lines.map((l) => ({
      id: l.id,
      seq: l.seq,
      speakerName: l.speaker?.user.name ?? null,
      speakerRole: l.speaker?.sessionRole ?? null,
      kind: l.kind,
      text: l.text,
      at: l.at.toISOString(),
    }));
  }

  add(sessionId: string, input: { speakerId?: string; kind: LineKind; text: string }, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        requireSessionRole(me, ['reporter', 'officer'], 'Writing the transcript');
        if (session.recordState !== 'open' && input.kind !== 'procedural') {
          throw new BlockedException('Testimony is only transcribed while on the record.', { code: 'transcript.offRecord' });
        }
        if (session.recordState === 'closed') {
          throw new BlockedException('This session is closed. Changes now go through errata.', { code: 'transcript.closed' });
        }
        if (input.speakerId && !(await tx.participant.count({ where: { id: input.speakerId, sessionId } }))) {
          throw new NotFoundException('Speaker is not a participant in this session.');
        }
        const last = await tx.transcriptLine.findFirst({ where: { sessionId }, orderBy: { seq: 'desc' }, select: { seq: true } });
        return tx.transcriptLine.create({
          data: { sessionId, seq: (last?.seq ?? 0) + 1, speakerId: input.speakerId, kind: input.kind, text: input.text },
        });
      },
      (line) => ({
        entity: 'transcript_line',
        entityId: line.id,
        action: 'transcript.line_added',
        sessionId,
        actorId: user.id,
        data: { seq: line.seq },
      }),
    );
  }

  correct(lineId: string, text: string, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const line = await tx.transcriptLine.findUnique({ where: { id: lineId } });
        if (!line) throw new NotFoundException('Transcript line not found.');
        const { session, me } = await loadSessionAccess(tx, line.sessionId, user);
        requireSessionRole(me, ['reporter', 'officer'], 'Correcting the transcript');
        if (session.recordState === 'closed') {
          throw new BlockedException('This session is closed. Changes now go through errata.', { code: 'transcript.closed' });
        }
        await tx.transcriptLine.update({ where: { id: lineId }, data: { text } });
        return { line, session };
      },
      ({ line, session }) => ({
        entity: 'transcript_line',
        entityId: line.id,
        action: 'transcript.line_corrected',
        matterId: session.matterId,
        sessionId: session.id,
        actorId: user.id,
        // The audit chain is the version history (story: corrections are versioned before the seal).
        data: { seq: line.seq, before: line.text, after: text },
      }),
    );
  }
}
