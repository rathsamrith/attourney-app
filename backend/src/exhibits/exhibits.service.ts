import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Exhibit, Prisma, Side } from '../generated/prisma/client.js';
import { CommandRunner } from '../audit/command-runner.js';
import type { AuthUser } from '../auth/current-user.js';
import { BlockedException } from '../common/blocked.exception.js';
import { loadSessionAccess, requireSessionRole } from '../common/session-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FILE_STORAGE, type FileStorage } from '../providers/providers.js';
import type { ExhibitDto, SessionPublicationDto } from './exhibits.dto.js';

/**
 * The R7 projection. Every exhibit read goes through this filter, so a tagged exhibit
 * never leaves the server for anyone but its owning side (tribunal included).
 */
export function visibleTo(side: Side): Prisma.ExhibitWhereInput {
  return { OR: [{ side }, { status: { not: 'tagged' } }] };
}

/** Rough page count for PDFs; falls back to 1 for other files. */
export function countPdfPages(data: Buffer): number {
  const matches = data.toString('latin1').match(/\/Type\s*\/Page(?!s)/g);
  return Math.max(1, matches?.length ?? 0);
}

const MAX_BYTES = 50 * 1024 * 1024;

@Injectable()
export class ExhibitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandRunner,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  private toDto(e: Exhibit, user: AuthUser): ExhibitDto {
    return {
      id: e.id,
      label: e.label,
      title: e.title,
      pages: e.pages,
      side: e.side,
      status: e.status,
      offeredAt: e.offeredAt?.toISOString() ?? null,
      ruledAt: e.ruledAt?.toISOString() ?? null,
      mine: e.side === user.side,
    };
  }

  /** Exhibits of the session's matter that this user may see. */
  async list(sessionId: string, user: AuthUser): Promise<ExhibitDto[]> {
    const { session } = await loadSessionAccess(this.prisma, sessionId, user);
    const rows = await this.prisma.exhibit.findMany({
      where: { matterId: session.matterId, ...visibleTo(user.side) },
      orderBy: [{ side: 'asc' }, { label: 'asc' }],
    });
    return rows.map((e) => this.toDto(e, user));
  }

  /** Loads an exhibit through the projection; invisible ones are indistinguishable from missing. */
  private async loadVisible(db: Prisma.TransactionClient | PrismaService, exhibitId: string, user: AuthUser) {
    const exhibit = await db.exhibit.findFirst({ where: { id: exhibitId, ...visibleTo(user.side) } });
    if (!exhibit) throw new NotFoundException('Exhibit not found.');
    // Must also be a participant in some session of the matter.
    const participant = await db.participant.findFirst({
      where: { userId: user.id, session: { matterId: exhibit.matterId } },
    });
    if (!participant) throw new NotFoundException('Exhibit not found.');
    return exhibit;
  }

  async file(exhibitId: string, user: AuthUser) {
    const exhibit = await this.loadVisible(this.prisma, exhibitId, user);
    return { exhibit, data: await this.storage.get(exhibit.fileRef) };
  }

  /** Story "Tag privately": upload and tag; visible to the owning side only (R7). */
  async tag(sessionId: string, title: string, file: Express.Multer.File | undefined, user: AuthUser) {
    if (!file?.buffer?.length) throw new BlockedException('Choose a file to upload.', { code: 'exhibit.noFile' });
    if (file.size > MAX_BYTES) throw new BlockedException('Exhibits can be at most 50 MB.', { code: 'exhibit.tooLarge' });
    const { session, me } = await loadSessionAccess(this.prisma, sessionId, user);
    requireSessionRole(me, ['counsel'], 'Tagging exhibits');
    if (user.side !== 'P' && user.side !== 'D') throw new NotFoundException('Session not found.');

    const id = randomUUID();
    const fileRef = await this.storage.put(`exhibits/${session.matterId}/${id}`, file.buffer);
    return this.commands.run(
      (tx) =>
        tx.exhibit.create({
          data: {
            id,
            matterId: session.matterId,
            // Private label until offered: no count or gap in official labels reveals it (R7).
            label: `${user.side}-T-${id.slice(0, 6)}`,
            title,
            pages: countPdfPages(file.buffer),
            side: user.side as Side,
            fileRef,
          },
        }),
      (e) => ({
        entity: 'exhibit',
        entityId: e.id,
        action: 'exhibit.tagged',
        matterId: e.matterId,
        sessionId,
        actorId: user.id,
        visibilitySide: e.side,
      }),
    );
  }

  /** Story "Offer exhibit": irreversible disclosure to all parties; assigns the official label. */
  offer(exhibitId: string, sessionId: string, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        requireSessionRole(me, ['counsel'], 'Offering exhibits');
        const exhibit = await this.loadVisible(tx, exhibitId, user);
        if (exhibit.matterId !== session.matterId || exhibit.side !== user.side) {
          throw new NotFoundException('Exhibit not found.');
        }
        if (exhibit.status !== 'tagged') {
          throw new BlockedException('This exhibit has already been offered.', { code: 'exhibit.alreadyOffered' });
        }
        // Next official number among this side's disclosed exhibits.
        const disclosed = await tx.exhibit.findMany({
          where: { matterId: exhibit.matterId, side: exhibit.side, status: { not: 'tagged' } },
          select: { label: true },
        });
        const next =
          disclosed.reduce((max, e) => Math.max(max, Number(/^[PD]-(\d+)$/.exec(e.label)?.[1] ?? 0)), 0) + 1;
        return tx.exhibit.update({
          where: { id: exhibitId },
          data: { status: 'offered', offeredAt: new Date(), label: `${exhibit.side}-${String(next).padStart(3, '0')}` },
        });
      },
      (e) => ({
        entity: 'exhibit',
        entityId: e.id,
        action: 'exhibit.offered',
        matterId: e.matterId,
        sessionId,
        actorId: user.id,
        data: { label: e.label },
      }),
    );
  }

  /** Story "Admit or exclude": presiding adjudicator, offered exhibits only. */
  rule(exhibitId: string, sessionId: string, ruling: 'admitted' | 'excluded', user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        requireSessionRole(me, ['presiding'], 'Ruling on exhibits');
        const exhibit = await this.loadVisible(tx, exhibitId, user);
        if (exhibit.matterId !== session.matterId) throw new NotFoundException('Exhibit not found.');
        if (exhibit.status !== 'offered') {
          throw new BlockedException('Only offered exhibits can be ruled on.', { code: 'exhibit.notOffered' });
        }
        return tx.exhibit.update({
          where: { id: exhibitId },
          data: { status: ruling, ruledById: user.id, ruledAt: new Date() },
        });
      },
      (e) => ({
        entity: 'exhibit',
        entityId: e.id,
        action: `exhibit.${ruling}`,
        matterId: e.matterId,
        sessionId,
        actorId: user.id,
        data: { label: e.label },
      }),
    );
  }

  /** Story "Publish exhibit": admitted only, one at a time; replaces whatever is on screen. */
  publish(exhibitId: string, sessionId: string, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        requireSessionRole(me, ['counsel'], 'Publishing exhibits');
        const exhibit = await this.loadVisible(tx, exhibitId, user);
        if (exhibit.matterId !== session.matterId) throw new NotFoundException('Exhibit not found.');
        if (exhibit.status !== 'admitted') {
          throw new BlockedException('Only admitted exhibits can be published.', { code: 'exhibit.notAdmitted' });
        }
        if (session.recordState === 'closed') {
          throw new BlockedException('This session is closed. Closing cannot be undone.', { code: 'recordState.closed' });
        }
        await tx.exhibitPublication.updateMany({ where: { sessionId, endedAt: null }, data: { endedAt: new Date() } });
        await tx.exhibitPublication.create({ data: { exhibitId, sessionId, publishedById: user.id } });
        return exhibit;
      },
      (e) => ({
        entity: 'exhibit',
        entityId: e.id,
        action: 'exhibit.published',
        matterId: e.matterId,
        sessionId,
        actorId: user.id,
        data: { label: e.label },
      }),
    );
  }

  unpublish(sessionId: string, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        requireSessionRole(me, ['counsel', 'presiding', 'officer'], 'Ending a publication');
        const { count } = await tx.exhibitPublication.updateMany({
          where: { sessionId, endedAt: null },
          data: { endedAt: new Date() },
        });
        if (!count) throw new BlockedException('No exhibit is on screen.', { code: 'exhibit.nothingPublished' });
        return session;
      },
      (session) => ({
        entity: 'session',
        entityId: session.id,
        action: 'exhibit.unpublished',
        matterId: session.matterId,
        sessionId,
        actorId: user.id,
      }),
    );
  }

  async current(sessionId: string, user: AuthUser): Promise<SessionPublicationDto> {
    await loadSessionAccess(this.prisma, sessionId, user);
    const pub = await this.prisma.exhibitPublication.findFirst({
      where: { sessionId, endedAt: null },
      include: { exhibit: true, publishedBy: true },
    });
    return {
      current: pub && {
        publicationId: pub.id,
        exhibitId: pub.exhibitId,
        label: pub.exhibit.label,
        title: pub.exhibit.title,
        pages: pub.exhibit.pages,
        publishedByName: pub.publishedBy.name,
        startedAt: pub.startedAt.toISOString(),
      },
    };
  }
}
