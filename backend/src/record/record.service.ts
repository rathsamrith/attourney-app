import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { strToU8, zipSync } from 'fflate';
import type { Prisma } from '../generated/prisma/client.js';
import { CommandRunner } from '../audit/command-runner.js';
import type { AuthUser } from '../auth/current-user.js';
import { BlockedException } from '../common/blocked.exception.js';
import { loadSessionAccess, requireSessionRole } from '../common/session-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  FILE_STORAGE,
  SIGNER,
  TIMESTAMP_AUTHORITY,
  type FileStorage,
  type Signer,
  type TimestampAuthority,
} from '../providers/providers.js';
import { canonicalTranscript, sha256Hex } from './canonical.js';
import type { RecordStatusDto } from './record.dto.js';

type Db = Prisma.TransactionClient | PrismaService;

/** Epic E5: errata, hash lock and certified export. */
@Injectable()
export class RecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandRunner,
    @Inject(SIGNER) private readonly signer: Signer,
    @Inject(TIMESTAMP_AUTHORITY) private readonly tsa: TimestampAuthority,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async status(sessionId: string, user: AuthUser): Promise<RecordStatusDto> {
    const { session } = await loadSessionAccess(this.prisma, sessionId, user);
    const seal = await this.prisma.transcriptSeal.findUnique({
      where: { sessionId },
      include: { lockedBy: true, exports: { include: { exportedBy: true }, orderBy: { exportedAt: 'desc' } } },
    });
    const errata = await this.prisma.erratum.findMany({
      where: { sessionId },
      include: { transcriptLine: true, filedBy: true, decidedBy: true },
    });
    return {
      sessionClosed: session.recordState === 'closed',
      seal: seal && {
        errataDeadline: seal.errataDeadline.toISOString(),
        errataClosedAt: seal.errataClosedAt?.toISOString() ?? null,
        errataWindowOpen: !seal.errataClosedAt,
        digestSha256: seal.digestSha256,
        signature: seal.signature ? Buffer.from(seal.signature).toString('base64') : null,
        lockedAt: seal.lockedAt?.toISOString() ?? null,
        lockedByName: seal.lockedBy?.name ?? null,
      },
      errata: errata
        .sort((a, b) => a.transcriptLine.seq - b.transcriptLine.seq)
        .map((e) => ({
          id: e.id,
          lineSeq: e.transcriptLine.seq,
          original: e.original,
          corrected: e.corrected,
          kind: e.kind,
          status: e.status,
          filedByName: e.filedBy.name,
          decidedByName: e.decidedBy?.name ?? null,
        })),
      exports: (seal?.exports ?? []).map((x) => ({
        id: x.id,
        manifestSha256: x.manifestSha256,
        exportedByName: x.exportedBy.name,
        exportedAt: x.exportedAt.toISOString(),
      })),
    };
  }

  private async openWindow(db: Db, sessionId: string) {
    const seal = await db.transcriptSeal.findUnique({ where: { sessionId } });
    if (!seal) {
      throw new BlockedException('Errata open once the session is closed.', { code: 'errata.notClosed' });
    }
    if (seal.errataClosedAt) {
      throw new BlockedException('The errata window is closed.', { code: 'errata.windowClosed' });
    }
    return seal;
  }

  /** Participants file corrections while the errata window is open. */
  fileErratum(sessionId: string, input: { transcriptLineId: string; corrected: string; kind: 'transcription' | 'substantive' }, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        requireSessionRole(me, ['witness', 'counsel', 'reporter', 'officer'], 'Filing errata');
        await this.openWindow(tx, sessionId);
        const line = await tx.transcriptLine.findFirst({ where: { id: input.transcriptLineId, sessionId } });
        if (!line) throw new NotFoundException('Transcript line not found in this session.');
        const e = await tx.erratum.create({
          data: { sessionId, transcriptLineId: line.id, original: line.text, corrected: input.corrected, filedById: user.id, kind: input.kind },
        });
        return { e, session, seq: line.seq };
      },
      ({ e, session, seq }) => ({
        entity: 'erratum',
        entityId: e.id,
        action: 'erratum.filed',
        matterId: session.matterId,
        sessionId,
        actorId: user.id,
        data: { seq, kind: e.kind },
      }),
    );
  }

  /** Story "Decide errata": the record officer accepts or rejects each correction. */
  decideErratum(erratumId: string, status: 'accepted' | 'rejected', user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const e = await tx.erratum.findUnique({ where: { id: erratumId } });
        if (!e) throw new NotFoundException('Erratum not found.');
        const { session, me } = await loadSessionAccess(tx, e.sessionId, user);
        requireSessionRole(me, ['officer'], 'Deciding errata');
        await this.openWindow(tx, e.sessionId);
        if (e.status !== 'pending') throw new BlockedException('This erratum has already been decided.', { code: 'errata.alreadyDecided' });
        if (status === 'accepted') {
          const other = await tx.erratum.count({
            where: { transcriptLineId: e.transcriptLineId, status: 'accepted', id: { not: e.id } },
          });
          if (other) {
            throw new BlockedException('Another correction to this line is already accepted.', { code: 'errata.lineAlreadyCorrected' });
          }
        }
        await tx.erratum.update({ where: { id: erratumId }, data: { status, decidedById: user.id } });
        return session;
      },
      (session) => ({
        entity: 'erratum',
        entityId: erratumId,
        action: `erratum.${status}`,
        matterId: session.matterId,
        sessionId: session.id,
        actorId: user.id,
      }),
    );
  }

  /** Story "Close errata window": early close is blocked while any erratum is undecided. */
  closeWindow(sessionId: string, user: AuthUser | null) {
    return this.commands.run(
      async (tx) => {
        // user is null when the deadline job closes the window.
        let session;
        if (user) {
          const access = await loadSessionAccess(tx, sessionId, user);
          requireSessionRole(access.me, ['officer'], 'Closing the errata window');
          session = access.session;
        } else {
          session = await tx.session.findUniqueOrThrow({ where: { id: sessionId } });
        }
        const seal = await this.openWindow(tx, sessionId);
        const deadlinePassed = seal.errataDeadline.getTime() <= Date.now();
        if (!deadlinePassed && (await tx.erratum.count({ where: { sessionId, status: 'pending' } }))) {
          throw new BlockedException('Decide every erratum before closing the window early.', { rule: 'R4', code: 'errata.undecided' });
        }
        await tx.transcriptSeal.update({ where: { id: seal.id }, data: { errataClosedAt: new Date() } });
        return { session, deadlinePassed };
      },
      ({ session, deadlinePassed }) => ({
        entity: 'transcript_seal',
        action: 'errata.window_closed',
        matterId: session.matterId,
        sessionId,
        actorId: user?.id ?? null,
        data: { reason: user ? 'officer' : 'deadline', deadlinePassed },
      }),
    );
  }

  /** Recomputes the transcript digest from the database (used by the lock and by verification). */
  async computeDigest(db: Db, sessionId: string) {
    const [lines, accepted] = await Promise.all([
      db.transcriptLine.findMany({ where: { sessionId } }),
      db.erratum.findMany({ where: { sessionId, status: 'accepted' }, include: { transcriptLine: true } }),
    ]);
    const canonical = canonicalTranscript(
      lines,
      accepted.map((e) => ({ transcriptLineSeq: e.transcriptLine.seq, corrected: e.corrected })),
    );
    return { canonical, digest: sha256Hex(canonical), lines };
  }

  /** Story "Lock transcript" (R4): SHA-256 digest, HSM signature and RFC 3161 timestamp. */
  lock(sessionId: string, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        requireSessionRole(me, ['officer'], 'Locking the transcript');
        const seal = await tx.transcriptSeal.findUnique({ where: { sessionId } });
        if (!seal) throw new BlockedException('The session must be closed first.', { code: 'errata.notClosed' });
        if (!seal.errataClosedAt) {
          throw new BlockedException('The transcript cannot be locked while the errata window is open.', { rule: 'R4', code: 'seal.windowOpen' });
        }
        if (seal.lockedAt) throw new BlockedException('The transcript is already locked.', { code: 'seal.alreadyLocked' });
        const { digest } = await this.computeDigest(tx, sessionId);
        const signature = await this.signer.sign(digest);
        const tsaToken = await this.tsa.timestamp(digest);
        await tx.transcriptSeal.update({
          where: { id: seal.id },
          data: { digestSha256: digest, signature: new Uint8Array(signature), tsaToken: new Uint8Array(tsaToken), lockedById: user.id, lockedAt: new Date() },
        });
        return { session, digest };
      },
      ({ session, digest }) => ({
        entity: 'transcript_seal',
        action: 'seal.locked',
        matterId: session.matterId,
        sessionId,
        actorId: user.id,
        data: { digestSha256: digest },
      }),
    );
  }

  /** Story "Export chain of custody" (R5). */
  async export(sessionId: string, user: AuthUser) {
    const { session, me } = await loadSessionAccess(this.prisma, sessionId, user);
    requireSessionRole(me, ['officer'], 'Certified export');
    const seal = await this.prisma.transcriptSeal.findUnique({ where: { sessionId } });
    if (!seal?.lockedAt || !seal.digestSha256) {
      throw new BlockedException('The transcript must be locked before a certified export.', { rule: 'R5', code: 'export.notLocked' });
    }

    const matter = await this.prisma.matter.findUniqueOrThrow({ where: { id: session.matterId } });
    const { canonical, lines } = await this.computeDigest(this.prisma, sessionId);
    const speakers = await this.prisma.participant.findMany({ where: { sessionId }, include: { user: true } });
    const nameOf = (id: string | null) => speakers.find((s) => s.id === id)?.user.name ?? '';
    const errata = await this.prisma.erratum.findMany({ where: { sessionId }, include: { transcriptLine: true } });
    const custody = await this.prisma.auditEvent.findMany({
      where: { sessionId, visibilitySide: null },
      orderBy: { seq: 'asc' },
      include: { actor: true },
    });

    const readable = [
      `${matter.caption}`,
      `${matter.docketNo} · day ${session.dayNo}`,
      `Transcript digest (SHA-256): ${seal.digestSha256}`,
      '',
      ...[...lines]
        .sort((a, b) => a.seq - b.seq)
        .map((l) => {
          const fix = errata.find((e) => e.transcriptLineId === l.id && e.status === 'accepted');
          return `${String(l.seq).padStart(4)}  ${l.kind.toUpperCase().padEnd(10)} ${nameOf(l.speakerId).padEnd(24)} ${fix?.corrected ?? l.text}`;
        }),
    ].join('\n');
    const csv = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const errataCsv = [
      'line,kind,status,original,corrected',
      ...errata.map((e) => [e.transcriptLine.seq, e.kind, e.status, csv(e.original), csv(e.corrected)].join(',')),
    ].join('\n');
    const custodyLog = JSON.stringify(
      custody.map((e) => ({ seq: e.seq.toString(), at: e.at.toISOString(), action: e.action, actor: e.actor?.name ?? null, prevHash: e.prevHash, hash: e.hash })),
      null,
      2,
    );

    const files: Record<string, Uint8Array> = {
      'transcript.canonical.jsonl': strToU8(canonical),
      'transcript.txt': strToU8(readable),
      'errata.csv': strToU8(errataCsv),
      'custody-log.json': strToU8(custodyLog),
    };
    const manifest = {
      matter: matter.docketNo,
      sessionId,
      dayNo: session.dayNo,
      transcriptDigestSha256: seal.digestSha256,
      signatureBase64: seal.signature ? Buffer.from(seal.signature).toString('base64') : null,
      timestampTokenBase64: seal.tsaToken ? Buffer.from(seal.tsaToken).toString('base64') : null,
      files: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, sha256Hex(Buffer.from(data))])),
      exportedAt: new Date().toISOString(),
      exportedBy: user.name,
    };
    const manifestBytes = strToU8(JSON.stringify(manifest, null, 2));
    const zip = Buffer.from(zipSync({ ...files, 'manifest.json': manifestBytes }));
    const manifestSha256 = sha256Hex(Buffer.from(manifestBytes));
    const fileRef = await this.storage.put(`exports/${sessionId}/${manifestSha256}.zip`, zip);

    return this.commands.run(
      (tx) => tx.certifiedExport.create({ data: { sealId: seal.id, fileRef, manifestSha256, exportedById: user.id } }),
      (x) => ({
        entity: 'certified_export',
        entityId: x.id,
        action: 'export.created',
        matterId: session.matterId,
        sessionId,
        actorId: user.id,
        data: { manifestSha256 },
      }),
    );
  }

  async exportFile(exportId: string, user: AuthUser) {
    const x = await this.prisma.certifiedExport.findUnique({ where: { id: exportId }, include: { seal: true } });
    if (!x) throw new NotFoundException('Export not found.');
    await loadSessionAccess(this.prisma, x.seal.sessionId, user);
    return { name: `attest-certified-${x.manifestSha256.slice(0, 12)}.zip`, data: await this.storage.get(x.fileRef) };
  }

  /** Verifies the stored seal against the current database contents. */
  async verify(sessionId: string) {
    const seal = await this.prisma.transcriptSeal.findUniqueOrThrow({ where: { sessionId } });
    const { digest } = await this.computeDigest(this.prisma, sessionId);
    return {
      digestMatches: digest === seal.digestSha256,
      signatureValid: !!seal.signature && (await this.signer.verify(digest, Buffer.from(seal.signature))),
    };
  }
}
